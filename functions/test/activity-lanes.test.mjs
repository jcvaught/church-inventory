// COH-012 Part B — activityLog timestamp lanes: parity + pinned semantics.
//
//   1. PARITY — functions/lib/activity-lanes.js (CJS twin) ≡ src/lib/activity-lanes.js
//      for every export across the fixture matrix.
//   2. PINNED — the lane bounds and merge semantics that both the client
//      (loadActivityLogSince) and the server (sendWeeklyInsightsDigest) rely on.
//      The end-to-end proof that the SERVER now reads both lanes is the
//      emulator test functions/test/handlers/insightsDigest.test.mjs.
//
// Pure — node --test, no emulator. A minimal Timestamp stand-in models the one
// contract the helper uses (fromMillis / fromDate / toDate); the real classes
// (browser + admin SDK) both satisfy it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as client from '../../src/lib/activity-lanes.js';
import server from '../lib/activity-lanes.js'; // CJS twin (default import = module.exports)

class FakeTimestamp {
  constructor(millis) { this.millis = millis; }
  static fromMillis(ms) { return new FakeTimestamp(ms); }
  static fromDate(d) { return new FakeTimestamp(d.getTime()); }
  toDate() { return new Date(this.millis); }
  toMillis() { return this.millis; }
}
const ts = (iso) => FakeTimestamp.fromDate(new Date(iso));

const SINCE_ISO = '2026-06-18T00:00:00.000Z';
const SINCE_YMD = '2026-06-18'; // what the server digest passes (ymdAddDays output)

// One string row and one Timestamp row inside the window, one of each outside,
// plus the malformed shapes a real audit log can carry.
const LEGACY_IN = { action: 'check_out', itemId: 'i1', timestamp: '2026-07-01T12:00:00.000Z' };
const LEGACY_OUT = { action: 'check_out', itemId: 'i1', timestamp: '2026-01-01T12:00:00.000Z' };
const CURRENT_IN = { action: 'check_out', itemId: 'i1', timestamp: ts('2026-08-01T12:00:00.000Z') };
const CURRENT_OUT = { action: 'check_out', itemId: 'i1', timestamp: ts('2025-12-01T12:00:00.000Z') };
const NO_TS = { action: 'check_out', itemId: 'i2' };
const DATE_TS = { action: 'use_supply', itemId: 's1', timestamp: new Date('2026-07-15T00:00:00.000Z') };
const JUNK_TS = { action: 'use_supply', itemId: 's1', timestamp: 42 };

const MERGE_FIXTURES = {
  empty: [[], []],
  legacyOnly: [[LEGACY_IN], []],
  currentOnly: [[], [CURRENT_IN]],
  both: [[LEGACY_IN], [CURRENT_IN]],
  bothUnsorted: [[LEGACY_IN, LEGACY_OUT], [CURRENT_IN, CURRENT_OUT]],
  odd: [[NO_TS, DATE_TS], [JUNK_TS, CURRENT_IN]],
  threeLanes: [[LEGACY_IN], [CURRENT_IN], [DATE_TS]],
};
const TS_FIXTURES = { str: SINCE_ISO, ymd: SINCE_YMD, ts: ts(SINCE_ISO), date: new Date(SINCE_ISO), nil: null, undef: undefined, num: 42, badDate: new Date('nope') };

// ── 1. PARITY ────────────────────────────────────────────────────────────────

test('PARITY — activityLaneBounds agrees', () => {
  for (const since of [SINCE_ISO, SINCE_YMD, '2026-09-17T08:00:00Z']) {
    assert.deepEqual(server.activityLaneBounds(since, FakeTimestamp), client.activityLaneBounds(since, FakeTimestamp), since);
  }
  for (const bad of ['', 'not-a-date', null, undefined, 42]) {
    assert.throws(() => server.activityLaneBounds(bad, FakeTimestamp), TypeError, `server rejects ${bad}`);
    assert.throws(() => client.activityLaneBounds(bad, FakeTimestamp), TypeError, `client rejects ${bad}`);
  }
});

test('PARITY — activityTimestampISO agrees', () => {
  for (const [name, raw] of Object.entries(TS_FIXTURES)) {
    assert.equal(server.activityTimestampISO(raw), client.activityTimestampISO(raw), name);
  }
});

test('PARITY — mergeActivityLanes agrees', () => {
  for (const [name, lanes] of Object.entries(MERGE_FIXTURES)) {
    for (const maxEntries of [undefined, 1, 2, 1000]) {
      const opts = maxEntries === undefined ? undefined : { maxEntries };
      assert.deepEqual(server.mergeActivityLanes(lanes, opts), client.mergeActivityLanes(lanes, opts), `${name} max=${maxEntries}`);
    }
  }
});

// ── 2. PINNED semantics ──────────────────────────────────────────────────────

test('bounds: each lane is ONE lower bound of its own type — no upper bound, ever', () => {
  // A `< Timestamp(0)` upper bound on the string lane returned 0 rows in
  // production (FXCC 2026-09-18) — a mixed-type range matches nothing. And
  // type-scoping already keeps Timestamp rows out of the string lane.
  const b = client.activityLaneBounds(SINCE_ISO, FakeTimestamp);
  assert.deepEqual(Object.keys(b).sort(), ['current', 'legacy']);
  assert.deepEqual(Object.keys(b.legacy), ['gte'], 'string lane has ONLY a lower bound');
  assert.deepEqual(Object.keys(b.current), ['gte'], 'Timestamp lane has ONLY a lower bound');
  assert.equal(b.legacy.gte, SINCE_ISO, 'string lane lower bound is the raw string');
  assert.ok(b.current.gte instanceof FakeTimestamp, 'Timestamp lane lower bound is a Timestamp');
  assert.equal(b.current.gte.toMillis(), new Date(SINCE_ISO).getTime());
});

test('bounds: a bare YYYY-MM-DD (the server digest input) maps to UTC midnight', () => {
  const b = client.activityLaneBounds(SINCE_YMD, FakeTimestamp);
  assert.equal(b.legacy.gte, SINCE_YMD);
  assert.equal(b.current.gte.toMillis(), Date.UTC(2026, 5, 18));
  // And the string lane comparison the bound implies is sound: a full ISO
  // instant on that day sorts at-or-after the bare date.
  assert.ok('2026-06-18T05:00:00.000Z' >= SINCE_YMD);
  assert.ok('2026-06-17T23:59:59.000Z' < SINCE_YMD);
});

test('normalise: strings pass through, Timestamps and Dates convert, junk is null', () => {
  assert.equal(client.activityTimestampISO(SINCE_ISO), SINCE_ISO);
  assert.equal(client.activityTimestampISO(ts(SINCE_ISO)), SINCE_ISO);
  assert.equal(client.activityTimestampISO(new Date(SINCE_ISO)), SINCE_ISO);
  assert.equal(client.activityTimestampISO(null), null);
  assert.equal(client.activityTimestampISO(undefined), null);
  assert.equal(client.activityTimestampISO(42), null);
  assert.equal(client.activityTimestampISO(new Date('nope')), null);
});

test('merge: both lanes survive, output is oldest→newest with ISO timestamps, other fields intact', () => {
  const out = client.mergeActivityLanes([[LEGACY_IN, LEGACY_OUT], [CURRENT_IN, CURRENT_OUT]]);
  assert.deepEqual(out.map(r => r.timestamp), [
    '2025-12-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z',
  ]);
  assert.ok(out.every(r => typeof r.timestamp === 'string'), 'every timestamp is a string after merge');
  assert.ok(out.every(r => r.action === 'check_out' && r.itemId === 'i1'), 'payload fields untouched');
  assert.equal(CURRENT_IN.timestamp instanceof FakeTimestamp, true, 'input rows are not mutated');
});

test('merge: maxEntries caps AFTER sorting, keeping the oldest', () => {
  const out = client.mergeActivityLanes([[LEGACY_IN], [CURRENT_IN, CURRENT_OUT]], { maxEntries: 2 });
  assert.deepEqual(out.map(r => r.timestamp), ['2025-12-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z']);
});

test('merge: a row with no usable timestamp is kept (sorted first), never dropped', () => {
  const out = client.mergeActivityLanes([[NO_TS, JUNK_TS], [CURRENT_IN]]);
  assert.equal(out.length, 3);
  assert.equal(out[0].timestamp, null);
  assert.equal(out[1].timestamp, null);
  assert.equal(out[2].timestamp, '2026-08-01T12:00:00.000Z');
});
