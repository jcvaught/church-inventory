// COH-006 gate 3 — merging the five constrained workItems listeners.
// The property under test is removal, not addition: a task that drops out of its
// last qualifying listener must leave the store. An accumulating merge would keep
// it, re-creating the leak on the client after the rules had closed it.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkSources } from '../../src/utils/workMerge.js';

const task = (id, over = {}) => [id, { _docId: id, type: 'task', name: id, createdAt: '2026-01-01', ...over }];
const maint = (id) => [id, { _docId: id, type: 'maintenance', name: id, createdAt: '2026-01-01' }];
const sources = (obj) => new Map(Object.entries(obj).map(([k, entries]) => [k, new Map(entries)]));

test('merges the sources and splits by type', () => {
  const { tasks, maintenance } = mergeWorkSources(sources({
    maintenance: [maint('mnt_1')],
    team: [task('task_a')],
    own: [task('task_b')],
  }));
  assert.deepEqual(tasks.map(t => t._docId), ['task_a', 'task_b']);
  assert.deepEqual(maintenance.map(m => m._docId), ['mnt_1']);
});

test('a task matched by several listeners appears once', () => {
  const { tasks } = mergeWorkSources(sources({
    own: [task('task_a')], assigned: [task('task_a')], team: [task('task_a')],
  }));
  assert.equal(tasks.length, 1);
});

test('a task leaves the store when its last source stops returning it', () => {
  // Shared with me, then unshared: the shared listener re-reports without it.
  const before = mergeWorkSources(sources({ team: [], shared: [task('task_x')] }));
  assert.deepEqual(before.tasks.map(t => t._docId), ['task_x']);
  const after = mergeWorkSources(sources({ team: [], shared: [] }));
  assert.deepEqual(after.tasks, []);
});

test('a task stays while ANY source still returns it', () => {
  // Unassigned from me, but I created it — still mine to see.
  const after = mergeWorkSources(sources({ own: [task('task_x')], assigned: [] }));
  assert.deepEqual(after.tasks.map(t => t._docId), ['task_x']);
});

test('sorts newest first within each type', () => {
  const { tasks } = mergeWorkSources(sources({
    team: [task('old', { createdAt: '2026-01-01' }), task('new', { createdAt: '2026-06-01' })],
  }));
  assert.deepEqual(tasks.map(t => t._docId), ['new', 'old']);
});

test('no sources yields empty arrays rather than throwing', () => {
  const { tasks, maintenance } = mergeWorkSources(new Map());
  assert.deepEqual(tasks, []);
  assert.deepEqual(maintenance, []);
});

// ── createWorkStore — Codex's gate-3 H-1 fixtures, run ───────────────────────
// A Firestore listener error callback is terminal. The bug these pin: counting
// it as an initial snapshot lets loading finish and presents a task list that is
// silently missing whatever that source alone delivers.
import { createWorkStore } from '../../src/utils/workMerge.js';

const KEYS = ['maintenance', 'team', 'own', 'assigned', 'shared'];
const docs = (...entries) => new Map(entries);

test('a terminal query error does not count as an initial snapshot', () => {
  const store = createWorkStore(KEYS);
  for (const k of ['maintenance', 'team', 'own', 'assigned']) store.snapshot(k, new Map());
  store.fail('shared', 'failed-precondition');

  const state = store.read();
  assert.equal(state.complete, false, 'must not be marked successfully ready');
  assert.ok(state.error, 'a blocking error must be exposed');
  assert.deepEqual(state.error.sources, ['shared']);
  assert.equal(state.error.code, 'failed-precondition');
  // The spinner still ends — a dead listener must not hang the app — but the
  // empty list is explicitly not a complete result.
  assert.equal(state.settled, true);
  assert.deepEqual(state.tasks, []);
});

test('a source that fails after delivering stops presenting its documents', () => {
  const store = createWorkStore(KEYS);
  for (const k of ['maintenance', 'team', 'own', 'assigned']) store.snapshot(k, new Map());
  store.snapshot('shared', docs(task('task_shared')));
  assert.deepEqual(store.read().tasks.map(t => t._docId), ['task_shared']);

  store.fail('shared', 'permission-denied');
  const state = store.read();
  assert.equal(state.complete, false);
  assert.deepEqual(state.tasks, [], 'stale documents from a dead listener must not persist');
  assert.equal(state.error.code, 'permission-denied');
});

test('all five delivering makes the store complete and error-free', () => {
  const store = createWorkStore(KEYS);
  for (const k of KEYS) store.snapshot(k, new Map());
  store.snapshot('team', docs(task('task_t')));
  const state = store.read();
  assert.equal(state.complete, true);
  assert.equal(state.settled, true);
  assert.equal(state.error, null);
  assert.deepEqual(state.tasks.map(t => t._docId), ['task_t']);
});

test('a source is neither settled nor complete before it reports', () => {
  const store = createWorkStore(KEYS);
  for (const k of ['maintenance', 'team', 'own', 'assigned']) store.snapshot(k, new Map());
  const state = store.read();
  assert.equal(state.settled, false, 'the spinner must not end while a source is still silent');
  assert.equal(state.complete, false);
});

test('a failed source that later recovers clears the error', () => {
  const store = createWorkStore(KEYS);
  for (const k of KEYS) store.snapshot(k, new Map());
  store.fail('shared', 'unavailable');
  assert.ok(store.read().error);
  store.snapshot('shared', docs(task('task_s')));
  const state = store.read();
  assert.equal(state.error, null);
  assert.equal(state.complete, true);
});
