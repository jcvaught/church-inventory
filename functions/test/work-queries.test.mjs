// COH-007 — the shared task query arms and the two merges.
//
// The arms are asserted as data because the property that matters is that the
// active board and the archive reader ask the SAME four questions. A drifted arm
// throws no error; it just hands a different set of tasks to a different screen.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskQueryArms, mergeArchiveArms, mergeInsightTasks } from '../../src/utils/workQueries.js';

const ME = 'uid-me';
const keys = (arms) => arms.map(a => a.key);

test('the four authorization arms are exactly the deployed COH-006 set', () => {
  assert.deepEqual(keys(taskQueryArms({ uid: ME })), ['team', 'own', 'assigned', 'shared']);
  // Signed out, only the church-wide arm survives — matching useFirestore, which
  // omits the three uid-bound listeners when there is no profile yet.
  assert.deepEqual(keys(taskQueryArms({})), ['team']);
});

test('the shared arm keeps BOTH constraints', () => {
  // sharedWithUids alone also matches a PRIVATE task carrying a stale recipient,
  // which the rules do not authorize (gate-1 review H-1). Dropping the
  // visibility half is the regression this pins.
  const shared = taskQueryArms({ uid: ME }).find(a => a.key === 'shared');
  assert.deepEqual(shared.filters, [
    ['visibility', '==', 'shared'],
    ['sharedWithUids', 'array-contains', ME],
  ]);
});

test('archived: null leaves the discriminator off — the additive gate keeps the board unchanged', () => {
  for (const arm of taskQueryArms({ uid: ME })) {
    assert.equal(arm.filters.some(([f]) => f === 'archived'), false, arm.key);
    assert.equal(arm.order, undefined);
    assert.equal(arm.limit, undefined);
  }
});

test('archived: false and true produce the same arms with one value changed', () => {
  const active = taskQueryArms({ uid: ME, archived: false });
  const archive = taskQueryArms({ uid: ME, archived: true });
  assert.deepEqual(keys(active), keys(archive));
  active.forEach((a, i) => {
    const b = archive[i];
    assert.deepEqual(a.filters.slice(0, -1), b.filters.slice(0, -1));
    assert.deepEqual(a.filters.at(-1), ['archived', '==', false]);
    assert.deepEqual(b.filters.at(-1), ['archived', '==', true]);
  });
});

test('a bounded read carries the window, the ordering and the cap on every arm', () => {
  const arms = taskQueryArms({ uid: ME, archived: true, since: '2025-09-06T00:00:00.000Z', max: 500 });
  for (const arm of arms) {
    assert.deepEqual(arm.filters.at(-1), ['completedAt', '>=', '2025-09-06T00:00:00.000Z']);
    assert.deepEqual(arm.order, ['completedAt', 'desc']);
    assert.equal(arm.limit, 500);
  }
});

test('no arm is ever built for maintenance', () => {
  // A1: maintenance documents carry no `archived` field, and an equality filter
  // on a missing field matches nothing — a constrained maintenance arm empties
  // the maintenance board for every church.
  const all = [taskQueryArms({ uid: ME }), taskQueryArms({ uid: ME, archived: true })].flat();
  assert.equal(all.some(a => a.key === 'maintenance'), false);
  assert.equal(all.some(a => a.filters.some(([f]) => f === 'type')), false);
});

// ── merges ──────────────────────────────────────────────────────────────────

const arch = (id, over = {}) => ({ _docId: id, type: 'task', completedAt: '2026-07-01T00:00:00.000Z', ...over });
const armMap = (...items) => new Map(items.map(i => [`task_${i._docId}`, i]));

test('a task returned by three arms appears once', () => {
  const t = arch('x');
  const merged = mergeArchiveArms(new Map([
    ['team', armMap(t)], ['own', armMap(t)], ['assigned', armMap(t)], ['shared', new Map()],
  ]));
  assert.deepEqual(merged.map(m => m._docId), ['x']);
});

test('archive merge retains every document an authorized arm returned', () => {
  // Codex, review H2. The archive applies no second authorization filter: a task
  // whose presentation array is stale is still returned by the canonical query,
  // and re-deciding access on the client could only subtract it.
  const stale = arch('x', { visibility: 'private', createdBy: 'creator', assigneeUids: ['assignee'], assignees: [] });
  const merged = mergeArchiveArms(new Map([['assigned', armMap(stale)]]));
  assert.deepEqual(merged.map(m => m._docId), ['x']);
});

test('archive merge drops non-tasks and sorts newest completion first', () => {
  const merged = mergeArchiveArms(new Map([['team', armMap(
    arch('old', { completedAt: '2026-01-01T00:00:00.000Z' }),
    arch('new', { completedAt: '2026-08-01T00:00:00.000Z' }),
    arch('ticket', { type: 'maintenance' }),
    arch('untyped', { type: undefined }),
  )]]));
  assert.deepEqual(merged.map(m => m._docId), ['new', 'old']);
});

test('insight merge: live active data always wins the collision', () => {
  // A20/N4. A task reopened after the one-shot archive read settles is in both
  // sets; if the frozen archived copy won, its old Complete/completedAt would
  // keep counting after the live task is back in Backlog.
  const archived = { _docId: 'x', status: 'Complete', completedAt: '2026-07-01T00:00:00.000Z', archived: true };
  const live = { _docId: 'x', status: 'Backlog', completedAt: null, archived: false };
  const merged = mergeInsightTasks([live], [archived]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'Backlog');
  assert.equal(merged[0].completedAt, null);
});

test('insight merge unions without duplicating, and tolerates an empty archive', () => {
  const a = { _docId: 'a' }, b = { _docId: 'b' };
  assert.deepEqual(mergeInsightTasks([a], [b]).map(t => t._docId).sort(), ['a', 'b']);
  assert.deepEqual(mergeInsightTasks([a], []).map(t => t._docId), ['a']);
  assert.deepEqual(mergeInsightTasks([a], null).map(t => t._docId), ['a']);
  assert.deepEqual(mergeInsightTasks([], [b]).map(t => t._docId), ['b']);
});
