// COH-016 — the MCP tools against an in-memory fake of the Firestore REST client.
// Pins the WRITE SHAPES (what lands in Firestore) and the pre-checks; the rules
// themselves are covered by the rules/handler suites and the prod verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { taskQueryArms as clientArms } from '../../src/utils/workQueries.js';

const require = Module.createRequire(import.meta.url);
const R = require('../lib/firestoreRest.js');
const { createTools, taskQueryArms, ToolError } = require('../lib/mcp/tools.js');
const { checkActor } = require('../lib/mcp/preflight.js');
const { calculateNextDue } = require('../lib/recurrence.js');

const UID = 'u1';
const CH = 'church1';
const WI = `churches/${CH}/workItems`;

// ── fake REST ────────────────────────────────────────────────────────────────
function fakeRest() {
  const store = new Map(); // path -> { data, updateTime }
  let clock = 0;
  const commits = [];
  const f = {
    store, commits, failWhen: null, loseReplyWhen: null,
    seed(path, data) { store.set(path, { data: structuredClone(data), updateTime: `T${++clock}` }); },
    async getDoc(_t, path) {
      const e = store.get(path);
      return e ? { id: path.split('/').pop(), path, updateTime: e.updateTime, data: structuredClone(e.data) } : null;
    },
    // Production refuses REST transactions for end-user tokens (403, measured
    // 2026-10-15), so the tools must never start one.
    async beginTransaction() { throw new R.RestError('permission', 403, 'no transactions for end users'); },
    async commit(_t, writes) {
      commits.push(writes);
      if (f.failWhen && f.failWhen(writes)) throw new R.RestError('permission', 403, 'x');
      for (const w of writes) {
        const path = w.update.name.split('/documents/')[1];
        const cur = store.get(path);
        if (w.currentDocument?.exists === false && cur) throw new R.RestError('conflict', 409, 'exists');
        if (w.currentDocument?.exists === true && !cur) throw new R.RestError('not_found', 404, '');
        if (w.currentDocument?.updateTime && cur?.updateTime !== w.currentDocument.updateTime) throw new R.RestError('conflict', 400, 'stale');
        const incoming = R.decodeFields(w.update.fields);
        let data;
        if (w.updateMask) {
          data = { ...(cur ? cur.data : {}) };
          for (const k of w.updateMask.fieldPaths) { if (k in incoming) data[k] = incoming[k]; else delete data[k]; }
        } else data = incoming;
        for (const t of w.updateTransforms || []) data[t.fieldPath] = 'SERVER_TIME';
        store.set(path, { data, updateTime: `T${++clock}` });
      }
      // The commit landed but the caller never hears back (network drop).
      if (f.loseReplyWhen && f.loseReplyWhen(writes)) { f.loseReplyWhen = null; throw new Error('socket hang up'); }
      return {};
    },
    async createDocument(_t, collectionPath, data) {
      const id = 'cmt' + (++clock);
      const path = `${collectionPath}/${id}`;
      store.set(path, { data: R.decodeFields(R.encodeFields(data)), updateTime: `T${++clock}` });
      return { id, path };
    },
    async runQuery(_t, parent, q) {
      const coll = q.from[0].collectionId;
      const fl = q.where ? (q.where.compositeFilter ? q.where.compositeFilter.filters : [q.where]) : [];
      const rows = [];
      for (const [path, e] of store) {
        const m = path.match(new RegExp(`^${parent ? parent.replace(/[()]/g, '\\$&') + '/' : ''}${coll}/([^/]+)$`));
        if (!m) continue;
        const ok = fl.every(({ fieldFilter: ff }) => {
          const v = e.data[ff.field.fieldPath]; const want = R.fromValue(ff.value);
          return ff.op === 'EQUAL' ? v === want : Array.isArray(v) && v.includes(want);
        });
        if (ok) rows.push({ id: m[1], path, updateTime: e.updateTime, data: structuredClone(e.data) });
      }
      return q.limit ? rows.slice(0, q.limit) : rows;
    },
  };
  return f;
}

const baseTask = (over = {}) => ({
  type: 'task', taskNumber: 'TSK-001', name: 'Existing', description: '', status: 'Backlog', priority: 'Medium',
  dueDate: '2026-10-20', recurrence: null, tags: [], checklist: [], assignees: [{ uid: UID, name: 'John' }],
  assigneeUids: [UID], visibility: 'private', sharedWith: [], sharedWithUids: [], createdBy: UID, createdByName: 'John',
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', completedAt: null,
  archived: false, archivedAt: null, photos: [], ...over,
});

function setup({ canCreate = true, profile } = {}) {
  const rest = fakeRest();
  const errors = [];
  const ctx = {
    rest, token: 'tok', uid: UID, churchId: CH,
    profile: profile || { name: 'John Vaught', churchId: CH, role: 'admin' },
    canCreate, now: () => new Date('2026-10-15T12:00:00.000Z'), calculateNextDue,
    captureError: (e, tags) => errors.push([e, tags]),
  };
  return { rest, errors, tools: createTools(ctx) };
}

test('list_tasks arms are identical to the board’s (client parity)', () => {
  const server = taskQueryArms({ uid: UID }).map((a) => ({ key: a.key, filters: a.filters, limit: a.limit }));
  const client = clientArms({ uid: UID, archived: false, max: 1000 }).map((a) => ({ key: a.key, filters: a.filters, limit: a.limit }));
  assert.deepEqual(server, client);
});

test('create_task numbers from config/main and writes the addTask shape', async () => {
  const { rest, tools } = setup();
  rest.seed(`churches/${CH}/config/main`, { maxTaskNumber: 6 });
  const r = await tools.create_task({ name: ' Order paper ', priority: 'High', checklist: [{ text: 'call', done: false }] });
  assert.equal(r.taskNumber, 'TSK-007');
  const cfg = (await rest.getDoc('t', `churches/${CH}/config/main`)).data;
  assert.equal(cfg.maxTaskNumber, 7);
  // The rules admit a plain member's bump only when it names the new task.
  assert.equal(cfg.lastTaskDocId, `task_${r.id}`);
  const cfgWrite = rest.commits.flat().find(w => w.update?.name?.endsWith('config/main'));
  assert.deepEqual([...cfgWrite.updateMask.fieldPaths].sort(), ['lastTaskDocId', 'maxTaskNumber']);

  const t = (await rest.getDoc('t', `${WI}/task_${r.id}`)).data;
  assert.equal(t.type, 'task');
  assert.equal(t.name, 'Order paper');
  assert.equal(t.priority, 'High');
  assert.equal(t.status, 'Backlog');
  assert.equal(t.createdBy, UID);
  assert.equal(t.createdByName, 'John Vaught');
  assert.deepEqual(t.assignees, [{ uid: UID, name: 'John Vaught' }]);
  assert.deepEqual(t.assigneeUids, [UID]);
  assert.equal(t.visibility, 'private', 'default when the profile has no taskDefaultVisibility');
  assert.deepEqual(t.sharedWith, []);
  assert.deepEqual(t.sharedWithUids, []);
  assert.equal(t.archived, false);
  assert.equal(t.archivedAt, null);
  assert.equal(t.completedAt, null);
  assert.equal(t.dueDate, null);
  assert.equal(t.checklist[0].text, 'call');
  assert.equal(t.checklist[0].done, false);
  assert.ok(t.checklist[0].id, 'checklist items carry an id like the board writes');
  assert.equal(t.createdAt, '2026-10-15T12:00:00.000Z');
  assert.match(r.id, /^[A-Za-z0-9]{20}$/);

  const logs = [...rest.store].filter(([p]) => p.startsWith(`churches/${CH}/activityLog/`));
  assert.equal(logs.length, 1);
  const log = logs[0][1].data;
  assert.equal(log.action, 'add_task');
  assert.equal(log.itemId, 'TSK-007');
  assert.equal(log.performedBy, UID);
  assert.equal(log.performedByName, 'John Vaught');
  assert.equal(log.timestamp, 'SERVER_TIME', 'timestamp comes from the REQUEST_TIME transform');
  assert.equal(log.details.via, 'chatgpt');
  assert.equal(log.details.name, undefined, 'a private task’s name is not logged');
});

test('create_task honours the profile’s own task defaults (not reassignment)', async () => {
  const { rest, tools } = setup({ profile: { name: 'J', churchId: CH, taskDefaultVisibility: 'shared', taskDefaultSharedWith: [{ uid: 'u2', name: 'Bob' }] } });
  const r = await tools.create_task({ name: 'x' });
  const t = (await rest.getDoc('t', `${WI}/task_${r.id}`)).data;
  assert.equal(t.visibility, 'shared');
  assert.deepEqual(t.sharedWithUids, ['u2']);
  assert.deepEqual(t.assigneeUids, [UID]);
});

test('the counter bump carries a precondition on the version read; a concurrent bump retries', async () => {
  const { rest, tools } = setup();
  rest.seed(`churches/${CH}/config/main`, { maxTaskNumber: 7 });
  let raced = false;
  const realGet = rest.getDoc.bind(rest);
  rest.getDoc = async (t, path) => {
    const d = await realGet(t, path);
    if (!raced && path.endsWith('config/main')) { raced = true; rest.seed(`churches/${CH}/config/main`, { maxTaskNumber: 8 }); }
    return d;
  };
  const r = await tools.create_task({ name: 'Raced' });
  assert.equal(r.taskNumber, 'TSK-009', 'the stale read lost the precondition and re-read');
  const cfgWrites = rest.commits.flat().filter((w) => w.update.name.endsWith('config/main'));
  assert.ok(cfgWrites.every((w) => w.currentDocument && w.currentDocument.updateTime));
});

test('create_task is refused for a lapsed church and writes nothing', async () => {
  const { rest, tools } = setup({ canCreate: false });
  await assert.rejects(() => tools.create_task({ name: 'x' }), ToolError);
  assert.equal(rest.commits.length, 0);
});

test('update_task writes exactly the changed fields (mask) with an updateTime precondition', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_abc`, baseTask());
  const before = rest.store.get(`${WI}/task_abc`).updateTime;
  const r = await tools.update_task({ id: 'abc', priority: 'High', dueDate: '2026-11-01' });
  assert.deepEqual(r.updated.sort(), ['dueDate', 'priority']);
  const w = rest.commits[0][0];
  assert.deepEqual(w.updateMask.fieldPaths.sort(), ['dueDate', 'priority', 'updatedAt']);
  assert.deepEqual(w.currentDocument, { updateTime: before });
  const t = (await rest.getDoc('t', `${WI}/task_abc`)).data;
  assert.equal(t.priority, 'High');
  assert.equal(t.dueDate, '2026-11-01');
  assert.deepEqual(t.assignees, [{ uid: UID, name: 'John' }], 'assignees untouched');
  assert.equal(t.visibility, 'private');
  const log = [...rest.store].find(([p]) => p.includes('/activityLog/'))[1].data;
  assert.equal(log.action, 'update_task');
  assert.equal(log.itemId, 'TSK-001');
});

test('update_task: Complete sets completedAt, logs complete_task; reopening clears it', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_abc`, baseTask());
  await tools.update_task({ id: 'abc', status: 'Complete' });
  let t = (await rest.getDoc('t', `${WI}/task_abc`)).data;
  assert.equal(t.status, 'Complete');
  assert.equal(t.completedAt, '2026-10-15T12:00:00.000Z');
  const actions = () => [...rest.store].filter(([p]) => p.includes('/activityLog/')).map(([, v]) => v.data.action);
  assert.ok(actions().includes('complete_task'));
  await tools.update_task({ id: 'abc', status: 'In Progress' });
  t = (await rest.getDoc('t', `${WI}/task_abc`)).data;
  assert.equal(t.completedAt, null);
});

test('update_task / get_task / add_comment refuse non-tasks and missing docs', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/mnt_zzz`, { ...baseTask(), type: 'maintenance' });
  rest.seed(`${WI}/task_forged`, { ...baseTask(), type: 'maintenance' });
  for (const id of ['zzz', 'forged', 'nope']) {
    await assert.rejects(() => tools.update_task({ id, status: 'Complete' }), /not found/i);
    await assert.rejects(() => tools.get_task({ id }), /not found/i);
    await assert.rejects(() => tools.add_comment({ id, text: 'hi' }), /not found/i);
  }
  assert.equal(rest.commits.length, 0);
});

test('update_task with nothing to change is an error, not an empty write', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_abc`, baseTask());
  await assert.rejects(() => tools.update_task({ id: 'abc' }), /nothing to update/i);
  await assert.rejects(() => tools.update_task({ id: 'abc', status: 'Backlog' }), /nothing to update/i);
});

test('completing a recurring task creates exactly one successor, once', async () => {
  const { rest, tools } = setup();
  rest.seed(`churches/${CH}/config/main`, { maxTaskNumber: 1 });
  rest.seed(`${WI}/task_src`, baseTask({
    recurrence: 'weekly', dueDate: '2026-10-20', visibility: 'shared', sharedWith: [{ uid: 'u2', name: 'B' }], sharedWithUids: ['u2'],
    checklist: [{ id: '1', text: 'a', done: true }], notes: 'n', tags: ['t'],
  }));
  const r = await tools.update_task({ id: 'src', status: 'Complete' });
  assert.equal(r.nextRecurringTask.taskNumber, 'TSK-002');
  const src = (await rest.getDoc('t', `${WI}/task_src`)).data;
  assert.equal(src.nextRecurrenceCreatedAt, '2026-10-15T12:00:00.000Z');
  const next = (await rest.getDoc('t', `${WI}/task_${r.nextRecurringTask.id}`)).data;
  assert.equal(next.dueDate, '2026-10-27');
  assert.equal(next.recurrence, 'weekly');
  assert.equal(next.status, 'Backlog');
  assert.deepEqual(next.checklist, [{ id: '1', text: 'a', done: false }]);
  assert.deepEqual(next.photos, []);
  assert.equal(next.completedAt, null);
  assert.equal(next.visibility, 'shared');
  assert.deepEqual(next.sharedWithUids, ['u2']);
  assert.equal(next.createdBy, UID);
  assert.equal(next.nextRecurrenceCreatedAt, undefined);

  // Reopen and complete again: the marker is already there, so no second successor.
  await tools.update_task({ id: 'src', status: 'In Progress' });
  const again = await tools.update_task({ id: 'src', status: 'Complete' });
  assert.equal(again.nextRecurringTask, 'already created');
  const successors = [...rest.store].filter(([p, v]) => p.startsWith(WI) && v.data.name === 'Existing' && p !== `${WI}/task_src`);
  assert.equal(successors.length, 1);
});

const isSuccessorCommit = (writes) => writes.some((w) => w.update.name.includes('/workItems/task_') && !w.update.name.endsWith('task_src') && w.currentDocument?.exists === false);

test('a refused successor create writes neither the successor nor the marker (one atomic commit)', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_src`, baseTask({ recurrence: 'weekly' }));
  rest.failWhen = isSuccessorCommit;
  await assert.rejects(() => tools.update_task({ id: 'src', status: 'Complete' }));
  const src = (await rest.getDoc('t', `${WI}/task_src`)).data;
  assert.equal(src.status, 'Complete', 'the completion itself stays committed');
  assert.equal('nextRecurrenceCreatedAt' in src, false, 'marker was never written, so a retry can succeed');
  const marker = rest.commits.find(isSuccessorCommit).find((w) => w.update.name.endsWith('task_src'));
  assert.ok(marker, 'the marker rides in the same commit as the successor');
});

test('a lost reply after the successor committed never produces a second successor (Codex 2026-10-15)', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_src`, baseTask({ recurrence: 'weekly' }));
  rest.loseReplyWhen = isSuccessorCommit;
  await assert.rejects(() => tools.update_task({ id: 'src', status: 'Complete' }));
  assert.ok((await rest.getDoc('t', `${WI}/task_src`)).data.nextRecurrenceCreatedAt, 'marker committed with the successor');
  await tools.update_task({ id: 'src', status: 'In Progress' });
  const again = await tools.update_task({ id: 'src', status: 'Complete' });
  assert.equal(again.nextRecurringTask, 'already created');
  const successors = [...rest.store].filter(([p, v]) => p.startsWith(WI) && v.data.name === 'Existing' && p !== `${WI}/task_src`);
  assert.equal(successors.length, 1);
});

test('a lapsed church can still complete, but no successor is created', async () => {
  const { rest, tools } = setup({ canCreate: false });
  rest.seed(`${WI}/task_src`, baseTask({ recurrence: 'weekly' }));
  const r = await tools.update_task({ id: 'src', status: 'Complete' });
  assert.match(r.nextRecurringTask, /not created/);
  assert.equal((await rest.getDoc('t', `${WI}/task_src`)).data.status, 'Complete');
});

test('add_comment writes exactly { text, authorId, authorName, createdAt }', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_abc`, baseTask());
  const r = await tools.add_comment({ id: 'abc', text: 'looks good' });
  const c = (await rest.getDoc('t', `${WI}/task_abc/comments/${r.commentId}`)).data;
  assert.deepEqual(Object.keys(c).sort(), ['authorId', 'authorName', 'createdAt', 'text']);
  assert.equal(c.authorId, UID);
  assert.equal(c.authorName, 'John Vaught');
});

test('list_tasks merges arms, drops non-tasks, hides Complete by default, strips the task_ prefix', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_a`, baseTask({ name: 'A', visibility: 'team', createdAt: '2026-10-03' }));
  rest.seed(`${WI}/task_b`, baseTask({ name: 'B', status: 'Complete', createdAt: '2026-10-02' }));
  rest.seed(`${WI}/task_c`, baseTask({ name: 'C', visibility: 'team', createdBy: 'other', assignees: [], assigneeUids: [], createdAt: '2026-10-01', dueDate: '2026-10-10' }));
  rest.seed(`${WI}/mnt_m`, { ...baseTask({ name: 'M', visibility: 'team' }), type: 'maintenance' });
  rest.seed(`${WI}/task_gone`, baseTask({ name: 'Archived', archived: true }));

  const open = await tools.list_tasks({});
  assert.deepEqual(open.tasks.map((t) => t.name), ['A', 'C']);
  assert.equal(open.tasks[0].id, 'a');
  assert.equal(open.truncated, false);

  assert.deepEqual((await tools.list_tasks({ includeComplete: true })).tasks.map((t) => t.name), ['A', 'B', 'C']);
  assert.deepEqual((await tools.list_tasks({ status: 'Complete' })).tasks.map((t) => t.name), ['B']);
  assert.deepEqual((await tools.list_tasks({ assignedToMe: true })).tasks.map((t) => t.name), ['A']);
  assert.deepEqual((await tools.list_tasks({ dueBefore: '2026-10-15' })).tasks.map((t) => t.name), ['C']);
});

test('get_task returns fields and comments but never photo data', async () => {
  const { rest, tools } = setup();
  rest.seed(`${WI}/task_abc`, baseTask({ photos: ['https://x/1.jpg'] }));
  rest.seed(`${WI}/task_abc/comments/c1`, { text: 'hi', authorId: UID, authorName: 'John', createdAt: '2026-10-02' });
  const r = await tools.get_task({ id: 'abc' });
  assert.equal(r.name, 'Existing');
  assert.equal(r.photoCount, 1);
  assert.equal(JSON.stringify(r).includes('1.jpg'), false);
  assert.deepEqual(r.comments, [{ author: 'John', text: 'hi', createdAt: '2026-10-02' }]);
});

// ── pre-checks (spec §1) ─────────────────────────────────────────────────────
test('checkActor: profile, church, hub and lapsed rules', () => {
  const deps = { subHasHub: (sub) => !!sub && Object.keys(sub).length > 0, canCreate: (sub) => !!sub && sub.status === 'active' };
  const sub = { status: 'active' };
  const prof = { active: true, churchId: CH, role: 'admin' };
  assert.deepEqual(checkActor({ profile: prof, keyChurchId: CH, sub }, deps), { ok: true, canCreate: true });
  assert.equal(checkActor({ profile: null, keyChurchId: CH, sub }, deps).status, 401);
  assert.equal(checkActor({ profile: { ...prof, active: false }, keyChurchId: CH, sub }, deps).status, 401);
  assert.equal(checkActor({ profile: { ...prof, churchId: 'other' }, keyChurchId: CH, sub }, deps).status, 401);
  assert.equal(checkActor({ profile: prof, keyChurchId: CH, sub: null }, deps).status, 403);
  assert.equal(checkActor({ profile: { ...prof, role: 'user', allowedHubs: ['jobs'] }, keyChurchId: CH, sub }, deps).status, 403);
  assert.equal(checkActor({ profile: { ...prof, role: 'user', allowedHubs: ['tasks'] }, keyChurchId: CH, sub }, deps).ok, true);
  assert.equal(checkActor({ profile: { ...prof, role: 'user', allowedHubs: null }, keyChurchId: CH, sub }, deps).ok, true);
  assert.equal(checkActor({ profile: { ...prof, role: 'user', allowedHubs: [] }, keyChurchId: CH, sub }, deps).status, 403);
  // Lapsed: still allowed in, but cannot create.
  assert.deepEqual(checkActor({ profile: prof, keyChurchId: CH, sub: { status: 'canceled' } }, deps), { ok: true, canCreate: false });
});
