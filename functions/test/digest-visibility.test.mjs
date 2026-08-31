// COH-006 C-1 — the weekly attention digest runs on the Admin SDK, which bypasses
// Firestore rules, and its task names reach every admin by email and the Claude
// API. These pin the two halves of the fix: what may enter a digest, and when a
// digest cached under an older policy stops being reusable.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import serverAttention from '../lib/attention.js';

const { digestVisibleTasks, isDigestCacheUsable, DIGEST_POLICY_VERSION, buildDigestSignals } = serverAttention;

const TODAY = '2026-06-17';
const OVERDUE = '2026-06-01';
const task = (name, visibility) => ({
  _docId: name, type: 'task', name, status: 'Backlog', dueDate: OVERDUE, ...(visibility ? { visibility } : {}),
});

test('digestVisibleTasks keeps team and legacy-unset tasks, drops private and shared', () => {
  const kept = digestVisibleTasks([
    task('team-task', 'team'), task('legacy-task'), task('private-task', 'private'), task('shared-task', 'shared'),
  ]).map(t => t.name);
  assert.deepEqual(kept, ['team-task', 'legacy-task']);
});

test('digestVisibleTasks tolerates missing and malformed input', () => {
  assert.deepEqual(digestVisibleTasks(undefined), []);
  assert.deepEqual(digestVisibleTasks(null), []);
  assert.deepEqual(digestVisibleTasks([null, undefined]), []);
});

test('a private task changes neither the digest counts nor its examples', () => {
  const has = () => true;
  const signals = (tasks) => buildDigestSignals({ taskData: digestVisibleTasks(tasks), has }, TODAY);
  const withPrivate = signals([task('team-task', 'team'), task('secret', 'private')]);
  const without = signals([task('team-task', 'team')]);
  assert.deepEqual(withPrivate, without);
  assert.equal(withPrivate.tasks.overdue, 1);
  // And the name never appears anywhere in the payload sent to Claude.
  assert.equal(JSON.stringify(withPrivate).includes('secret'), false);
});

test('a cache from this week under the current policy is reusable', () => {
  assert.equal(isDigestCacheUsable({ weekKey: '2026-W25', policyVersion: DIGEST_POLICY_VERSION }, '2026-W25'), true);
});

test('a cache built under the old policy is rebuilt even in the same week', () => {
  // The pre-COH-006 shape: no policyVersion at all. It may name a private task,
  // so it must miss rather than be served for the rest of the ISO week.
  assert.equal(isDigestCacheUsable({ weekKey: '2026-W25' }, '2026-W25'), false);
  assert.equal(isDigestCacheUsable({ weekKey: '2026-W25', policyVersion: DIGEST_POLICY_VERSION - 1 }, '2026-W25'), false);
});

test('a cache from a previous week is still rebuilt, and a missing cache is not usable', () => {
  assert.equal(isDigestCacheUsable({ weekKey: '2026-W24', policyVersion: DIGEST_POLICY_VERSION }, '2026-W25'), false);
  assert.equal(isDigestCacheUsable(null, '2026-W25'), false);
  assert.equal(isDigestCacheUsable(undefined, '2026-W25'), false);
});
