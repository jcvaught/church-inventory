// COH-007 — the shared task query arms and the two merges.
//
// The arms are asserted as data because the property that matters is that the
// active board and the archive reader ask the SAME four questions. A drifted arm
// throws no error; it just hands a different set of tasks to a different screen.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  taskQueryArms, mergeArchiveArms, mergeInsightTasks, insightHistoryStale,
  createInsightHistoryLoad, contributesToHistory,
} from '../../src/utils/workQueries.js';

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

// ── the forward race (review H2) ────────────────────────────────────────────

test('a task archiving after the read cannot vanish under a complete as-of label', () => {
  // Codex, review H2. Live-wins closes the reopen direction; this is the other
  // one. `x` was active when the archive read settled; the server then archived
  // it, so the live listeners dropped it and the frozen T0 archive never gained
  // it. Either the snapshot still accounts for x, or the history must stop
  // calling itself complete — the combination of "complete" and "x absent" is
  // the failure.
  const x = { _docId: 'x', type: 'task', status: 'Complete', completedAt: '2026-08-01T00:00:00.000Z' };
  const activeIdsAtLoad = new Set(['x']);

  assert.equal(insightHistoryStale({ activeIdsAtLoad, activeTasks: [x], archivedTasks: [] }), false);

  const merged = mergeInsightTasks([], []);
  const stale = insightHistoryStale({ activeIdsAtLoad, activeTasks: [], archivedTasks: [] });
  assert.ok(
    stale || merged.some(t => t._docId === 'x'),
    'a complete as-of snapshot must retain x, otherwise the history must invalidate',
  );
  assert.equal(stale, true);
});

test('staleness ignores a task that merely moved from the live half to the archive half', () => {
  // The benign case: the archive read already contains it, so the join is whole
  // and refusing to present it would be a false alarm.
  const activeIdsAtLoad = new Set(['x']);
  const archivedX = { _docId: 'x', archived: true };
  assert.equal(insightHistoryStale({ activeIdsAtLoad, activeTasks: [], archivedTasks: [archivedX] }), false);
});

test('staleness is false before any history has been loaded', () => {
  assert.equal(insightHistoryStale({ activeIdsAtLoad: undefined, activeTasks: [], archivedTasks: [] }), false);
  assert.equal(insightHistoryStale({ activeIdsAtLoad: new Set(), activeTasks: [], archivedTasks: [] }), false);
});

// ── the in-flight interval (re-review H1) ───────────────────────────────────

const BOUNDARY = '2026-06-08';   // the 90-day floor for a 2026-09-06 "now"
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

test('a departure while archive reads are in flight invalidates the settled history', async () => {
  // Codex, re-review H1. Capturing the active set at SETTLEMENT is too late:
  // the arm can snapshot without x, the worker can archive x so the live
  // listeners drop it, and only then does the read settle — by which point x is
  // in neither half and was never recorded. The fixture encodes that exact
  // ordering: active [x] → archive snapshot [] → active [] → settlement.
  const x = {
    _docId: 'x', type: 'task', status: 'Complete', archived: false,
    completedAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
  };
  const archive = deferred();
  const load = createInsightHistoryLoad({ activeTasks: [x], boundaryDate: BOUNDARY });

  // The archive query has taken its snapshot without x, but has not yet settled.
  // The live side then observes the archive transition.
  load.observeActive([]);
  archive.resolve({ items: [], complete: true, failures: [], loadedAt: '2026-09-06T12:00:00.000Z' });
  const settled = load.settle(await archive.promise);

  assert.equal(settled.complete, true);
  assert.equal(
    insightHistoryStale({ activeIdsAtLoad: settled.activeIdsAtLoad, activeTasks: [], archivedTasks: [] }),
    true,
    'x left during the read and is in neither half — the history is torn',
  );
});

test('a task that appears mid-flight and then leaves is also caught', async () => {
  // The baseline is an interval, not two instants: anything seen active at any
  // point across the read has to be accounted for at settlement.
  const y = { _docId: 'y', completedAt: '2026-08-02T00:00:00.000Z' };
  const load = createInsightHistoryLoad({ activeTasks: [], boundaryDate: BOUNDARY });
  load.observeActive([y]);
  load.observeActive([]);
  const settled = load.settle({ items: [], complete: true });
  assert.equal(insightHistoryStale({ ...settled, activeTasks: [], archivedTasks: [] }), true);
});

test('a task that moved from the live half INTO the archive half is not stale', async () => {
  const z = { _docId: 'z', completedAt: '2026-07-01T00:00:00.000Z' };
  const load = createInsightHistoryLoad({ activeTasks: [z], boundaryDate: BOUNDARY });
  load.observeActive([]);
  const settled = load.settle({ items: [{ _docId: 'z', archived: true }], complete: true });
  assert.equal(insightHistoryStale({ ...settled, activeTasks: [], archivedTasks: settled.items }), false);
});

// ── watching only what the figures depend on (re-review M1) ─────────────────

test('departure of a non-contributing task does not invalidate historical figures', async () => {
  // Codex, re-review M1. An old Backlog task with no date in either window
  // changes neither figure, so warning about its departure is a false alarm —
  // and a steady drip of those teaches people to ignore the real one.
  const oldBacklog = {
    _docId: 'old', type: 'task', status: 'Backlog',
    createdAt: '2024-01-01T00:00:00.000Z', completedAt: null,
  };
  const load = createInsightHistoryLoad({ activeTasks: [oldBacklog], boundaryDate: BOUNDARY });
  load.observeActive([]);
  const settled = load.settle({ items: [], complete: true });
  assert.equal(settled.activeIdsAtLoad.size, 0);
  assert.equal(insightHistoryStale({ ...settled, activeTasks: [], archivedTasks: [] }), false);
});

test('contribution is decided by either date crossing the boundary', () => {
  const at = (over) => contributesToHistory(over, BOUNDARY);
  assert.equal(at({ completedAt: '2026-08-01T00:00:00.000Z' }), true);
  assert.equal(at({ createdAt: '2026-08-01T00:00:00.000Z', completedAt: null }), true);
  assert.equal(at({ createdAt: '2024-01-01T00:00:00.000Z', completedAt: null }), false);
  assert.equal(at({ createdAt: '2024-01-01T00:00:00.000Z', completedAt: '2024-02-01T00:00:00.000Z' }), false);
  // The boundary date itself is inside the window, matching the metrics' own
  // whole-date comparison.
  assert.equal(at({ completedAt: `${BOUNDARY}T00:00:00.000Z` }), true);
  assert.equal(at({}), false);
  assert.equal(at(null), false);
  assert.equal(contributesToHistory({ completedAt: '2026-08-01T00:00:00.000Z' }, null), false);
});
