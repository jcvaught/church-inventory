// COH-007 — the archiver's eligibility predicate, as pure logic.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { archiveCutoffISO, isUsableCompletedAt, evaluateArchiveCandidate, ARCHIVE_AFTER_DAYS } =
  require('../lib/archiveEligibility.js');

const NOW = new Date('2026-09-06T00:00:00.000Z');
const CUTOFF = archiveCutoffISO(NOW);
const task = (over = {}) => ({ type: 'task', status: 'Complete', archived: false, ...over });
const verdict = (over) => evaluateArchiveCandidate(task(over), CUTOFF);

test('the cutoff is exactly six weeks back', () => {
  assert.equal(ARCHIVE_AFTER_DAYS, 42);
  assert.equal(CUTOFF, '2026-07-26T00:00:00.000Z');
});

test('exactly 42 days is not eligible; the next representable instant is', () => {
  // The contract says MORE than six weeks. An off-by-one here archives a task a
  // day early, out from under someone who is still looking at it.
  assert.equal(verdict({ completedAt: CUTOFF }).eligible, false);
  assert.equal(verdict({ completedAt: CUTOFF }).reason, 'too-recent');
  assert.equal(verdict({ completedAt: '2026-07-25T23:59:59.999Z' }).eligible, true);
  assert.equal(verdict({ completedAt: '2026-07-26T00:00:00.001Z' }).eligible, false);
});

test('only completed, unarchived tasks qualify', () => {
  const old = '2026-01-01T00:00:00.000Z';
  assert.equal(verdict({ completedAt: old }).eligible, true);
  assert.equal(verdict({ completedAt: old, status: 'In Progress' }).reason, 'not-complete');
  assert.equal(verdict({ completedAt: old, status: 'Cancelled' }).reason, 'not-complete');
  assert.equal(verdict({ completedAt: old, archived: true }).reason, 'already-archived');
  assert.equal(verdict({ completedAt: old, type: 'maintenance' }).reason, 'not-a-task');
  assert.equal(evaluateArchiveCandidate(null, CUTOFF).reason, 'missing');
  assert.equal(evaluateArchiveCandidate(undefined, CUTOFF).reason, 'missing');
});

test('a completion stamp is only usable if it is what this app writes', () => {
  assert.equal(isUsableCompletedAt('2026-01-01T00:00:00.000Z'), true);
  assert.equal(isUsableCompletedAt('2026-01-01T00:00:00Z'), true);
  for (const bad of [null, undefined, '', '!', 'not-an-iso-date', '2026-01-05',
                     '2026-01-01T00:00:00+00:00', 0, 1767225600000,
                     { seconds: 1767225600 }, new Date('2026-01-01')]) {
    assert.equal(isUsableCompletedAt(bad), false, String(bad));
  }
});

test('an unusable completion date is skipped, never inferred from other stamps', () => {
  // The task has a very old createdAt and updatedAt. Guessing from either would
  // archive a task whose completion was never properly recorded.
  const stamps = { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-02-01T00:00:00.000Z' };
  for (const completedAt of [null, undefined, '!', '2026-01-05', 1767225600000]) {
    const v = verdict({ ...stamps, completedAt });
    assert.equal(v.eligible, false, String(completedAt));
    assert.equal(v.reason, 'malformed-completed-at', String(completedAt));
  }
});

test('a future completion date is never eligible', () => {
  assert.equal(verdict({ completedAt: '2027-01-01T00:00:00.000Z' }).reason, 'too-recent');
});

test('calendar-impossible ISO-looking completion dates are malformed', () => {
  // Codex, review M1. Date.parse normalizes overflow instead of rejecting it,
  // so the shape regex alone would let Feb 30 through as a valid completion.
  for (const value of [
    '2026-02-30T00:00:00.000Z',
    '2025-02-29T00:00:00.000Z',
    '2026-04-31T23:59:59.999Z',
    '2026-13-01T00:00:00.000Z',
    '2026-00-10T00:00:00.000Z',
  ]) {
    assert.equal(isUsableCompletedAt(value), false, value);
    assert.deepEqual(evaluateArchiveCandidate(task({ completedAt: value }), CUTOFF), {
      eligible: false,
      reason: 'malformed-completed-at',
    });
  }
});

test('real leap days are still usable', () => {
  // The guard must reject overflow without rejecting valid calendars.
  assert.equal(isUsableCompletedAt('2024-02-29T00:00:00.000Z'), true);
  assert.equal(isUsableCompletedAt('2026-12-31T23:59:59.999Z'), true);
});
