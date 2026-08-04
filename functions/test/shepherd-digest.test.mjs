// Shepherd Hub F6 — unit tests for the pure weekly-elder-digest builder
// (functions/lib/shepherd.js buildElderDigest). Runs under `npm run test:unit`
// (node --test, no emulator) — no Firestore/PCO I/O in this module at all.
//
// Coverage: birthday/anniversary-in-window, year-wrap, the Feb-29 -> Feb-28
// non-leap clamp (a deliberate FIX over the client's known cosmetic bug — see
// firestore-adjacent F7 note in shepherd.js), never-contacted-first ordering,
// the top-3 "stalest" cap, the empty-digest computation, and the active/
// removed-from-PCO exclusion filter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildElderDigest } = require('../lib/shepherd.js');

function person(overrides = {}) {
  return {
    id: 'p1',
    name: 'Test Person',
    status: 'active',
    removedFromPco: false,
    birthdate: null,
    anniversary: null,
    ...overrides,
  };
}

const daysAgoMs = (now, n) => now.getTime() - n * 86400000;

test('buildElderDigest — birthday in the next 7 days is included', () => {
  const now = new Date(2026, 7, 10); // Aug 10, 2026
  const flock = [person({ id: 'p1', name: 'Alice', birthdate: '1990-08-15' })]; // 5 days out
  const { upcoming } = buildElderDigest({ flock, careByPersonId: {}, now });
  assert.equal(upcoming.length, 1);
  assert.deepEqual(upcoming[0], { name: 'Alice', kind: 'birthday', dateLabel: 'Aug 15', days: 5 });
});

test('buildElderDigest — anniversary in the next 7 days is included', () => {
  const now = new Date(2026, 7, 10); // Aug 10, 2026
  const flock = [person({ id: 'p1', name: 'Bob & Sue', anniversary: '2001-08-12' })]; // 2 days out
  const { upcoming } = buildElderDigest({ flock, careByPersonId: {}, now });
  assert.equal(upcoming.length, 1);
  assert.deepEqual(upcoming[0], { name: 'Bob & Sue', kind: 'anniversary', dateLabel: 'Aug 12', days: 2 });
});

test('buildElderDigest — a date outside the 7-day window is excluded', () => {
  const now = new Date(2026, 7, 10); // Aug 10, 2026
  const flock = [person({ id: 'p1', name: 'Carl', birthdate: '1990-09-01' })]; // 22 days out
  const { upcoming } = buildElderDigest({ flock, careByPersonId: {}, now });
  assert.equal(upcoming.length, 0);
});

test('buildElderDigest — year-wrap: late-Dec "now" finds an early-Jan birthday', () => {
  const now = new Date(2026, 11, 28); // Dec 28, 2026
  const flock = [person({ id: 'p1', name: 'Dana', birthdate: '1990-01-02' })]; // 5 days into next year
  const { upcoming } = buildElderDigest({ flock, careByPersonId: {}, now });
  assert.equal(upcoming.length, 1);
  assert.deepEqual(upcoming[0], { name: 'Dana', kind: 'birthday', dateLabel: 'Jan 2', days: 5 });
});

test('buildElderDigest — Feb 29 birthdate clamps to Feb 28 in a non-leap target year', () => {
  // 2026 is not a leap year (2026 % 4 !== 0).
  const now = new Date(2026, 1, 24); // Feb 24, 2026
  const flock = [person({ id: 'p1', name: 'Eve', birthdate: '1992-02-29' })];
  const { upcoming } = buildElderDigest({ flock, careByPersonId: {}, now });
  assert.equal(upcoming.length, 1);
  assert.deepEqual(upcoming[0], { name: 'Eve', kind: 'birthday', dateLabel: 'Feb 28', days: 4 });
});

test('buildElderDigest — stalest: never-contacted sorts before any actual contact date', () => {
  const now = new Date(2026, 7, 10);
  const flock = [
    person({ id: 'never', name: 'Never Contacted' }),
    person({ id: 'old', name: 'Old Contact' }),
    person({ id: 'recent', name: 'Recent Contact' }),
  ];
  const careByPersonId = {
    old: daysAgoMs(now, 10),
    recent: daysAgoMs(now, 5),
    // 'never' intentionally has no entry
  };
  const { stalest } = buildElderDigest({ flock, careByPersonId, now });
  assert.deepEqual(stalest.map(s => s.name), ['Never Contacted', 'Old Contact', 'Recent Contact']);
  assert.equal(stalest[0].lastContactLabel, 'never');
});

test('buildElderDigest — stalest is capped at 3, ordered oldest/never-first', () => {
  const now = new Date(2026, 7, 10);
  const flock = [
    person({ id: 'a', name: 'A' }),                       // never
    person({ id: 'b', name: 'B' }),                       // never
    person({ id: 'c', name: 'C' }),
    person({ id: 'd', name: 'D' }),
    person({ id: 'e', name: 'E' }),
  ];
  const careByPersonId = {
    c: daysAgoMs(now, 200),
    d: daysAgoMs(now, 100),
    e: daysAgoMs(now, 1),
  };
  const { stalest } = buildElderDigest({ flock, careByPersonId, now });
  assert.equal(stalest.length, 3);
  // Two "never" (a, b) tie first (order between them is insertion-stable), then C (oldest actual).
  assert.deepEqual(stalest.map(s => s.name).sort(), ['A', 'B', 'C'].sort());
  assert.ok(stalest.every(s => s.name !== 'D' && s.name !== 'E'));
});

test('buildElderDigest — empty: nothing upcoming and nobody uncontacted-or-90d+-stale', () => {
  const now = new Date(2026, 7, 10);
  const flock = [person({ id: 'p1', name: 'Fresh Contact' })];
  const careByPersonId = { p1: daysAgoMs(now, 30) }; // recent, well under 90 days
  const digest = buildElderDigest({ flock, careByPersonId, now });
  assert.equal(digest.empty, true);
});

test('buildElderDigest — not empty when someone is 90+ days stale, even with nothing upcoming', () => {
  const now = new Date(2026, 7, 10);
  const flock = [person({ id: 'p1', name: 'Stale Contact' })];
  const careByPersonId = { p1: daysAgoMs(now, 91) };
  const digest = buildElderDigest({ flock, careByPersonId, now });
  assert.equal(digest.empty, false);
});

test('buildElderDigest — not empty when someone has never been contacted', () => {
  const now = new Date(2026, 7, 10);
  const flock = [person({ id: 'p1', name: 'Nobody Home' })];
  const digest = buildElderDigest({ flock, careByPersonId: {}, now });
  assert.equal(digest.empty, false);
});

test('buildElderDigest — not empty when something is upcoming, even if contacts are all fresh', () => {
  const now = new Date(2026, 7, 10);
  const flock = [person({ id: 'p1', name: 'Birthday Kid', birthdate: '1990-08-11' })];
  const careByPersonId = { p1: daysAgoMs(now, 1) };
  const digest = buildElderDigest({ flock, careByPersonId, now });
  assert.equal(digest.empty, false);
  assert.equal(digest.upcoming.length, 1);
});

test('buildElderDigest — empty flock yields an empty, non-crashing digest', () => {
  const now = new Date(2026, 7, 10);
  const digest = buildElderDigest({ flock: [], careByPersonId: {}, now });
  assert.deepEqual(digest, { upcoming: [], stalest: [], empty: true });
});

test('buildElderDigest — inactive and removed-from-PCO flock members are excluded entirely', () => {
  const now = new Date(2026, 7, 10);
  const flock = [
    person({ id: 'inactive', name: 'Inactive Person', status: 'inactive', birthdate: '1990-08-11' }),
    person({ id: 'removed', name: 'Removed Person', removedFromPco: true, birthdate: '1990-08-12' }),
    person({ id: 'active', name: 'Active Person', status: 'active', removedFromPco: false, birthdate: '1990-08-13' }),
  ];
  const careByPersonId = {}; // nobody contacted -> would make inactive/removed "stale" too, if not excluded
  const digest = buildElderDigest({ flock, careByPersonId, now });
  assert.deepEqual(digest.upcoming.map(u => u.name), ['Active Person']);
  assert.deepEqual(digest.stalest.map(s => s.name), ['Active Person']);
});
