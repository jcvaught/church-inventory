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
