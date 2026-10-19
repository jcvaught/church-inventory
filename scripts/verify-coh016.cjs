/**
 * COH-016 production verification (plan §9) — the MCP tools against the LIVE
 * Firestore REST API and the LIVE rules, as throwaway users in e2e-test-church.
 *
 *   COH_SA_KEY=/path/to/serviceAccountKey.json node scripts/verify-coh016.cjs
 *
 * Drives functions/lib/mcp/tools.js directly (the same code the `mcp` endpoint
 * runs after its key/rate/pre-checks, which have their own handler tests), with
 * real ID tokens minted for each user. What only production can prove: the
 * REST encoding, updateMask + updateTime preconditions, the REQUEST_TIME
 * transform, transactions, and that the rules accept exactly what they should.
 *
 * Users: an admin (can bump config/main, so can create), member A and member B
 * (role user). Everything created is deleted in `finally`.
 */
const path = require('path');
const admin = require('firebase-admin');
const key = require(process.env.COH_SA_KEY || path.join(__dirname, 'serviceAccountKey.json'));

const { createTools, ToolError } = require('../functions/lib/mcp/tools');
const { createFirestoreRest } = require('../functions/lib/firestoreRest');
const { createTokenProvider } = require('../functions/lib/mcp/actAsUser');
const schemas = require('../functions/lib/mcp/schemas');
const { calculateNextDue } = require('../functions/lib/recurrence');

const E2E = 'e2e-test-church';
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const auth = admin.auth();

const results = [];
const check = (label, ok, detail = '') => { results.push({ label, ok: !!ok, detail }); };
async function outcome(fn) {
  try { return { ok: true, value: await fn() }; }
  catch (err) { return { ok: false, err, msg: err instanceof ToolError ? `ToolError: ${err.message}` : `${err.name}: ${err.message}` }; }
}

(async () => {
  const ts = Date.now();
  const people = {
    adm: { name: 'MCP Probe Admin', role: 'admin' },
    a:   { name: 'MCP Probe A', role: 'user' },
    b:   { name: 'MCP Probe B', role: 'user' },
  };
  const createdTaskIds = new Set();
  const seeded = [];
  const rest = createFirestoreRest();
  const getIdToken = createTokenProvider({ createCustomToken: (uid) => auth.createCustomToken(uid) });

  try {
    for (const [k, p] of Object.entries(people)) {
      // e2e…@churchopshub.com: sendEmailSafe skips these, so notifyAdminsOfNewMember sends nothing real.
      p.email = `e2e-mcp-probe-${k}-${ts}@churchopshub.com`;
      ({ uid: p.uid } = await auth.createUser({ email: p.email, emailVerified: true }));
      p.profile = { churchId: E2E, role: p.role, active: true, email: p.email, name: p.name, taskDefaultVisibility: 'private' };
      await db.doc(`users/${p.uid}`).set(p.profile);
    }
    const toolsFor = async (p) => createTools({
      rest, token: await getIdToken(p.uid), uid: p.uid, churchId: E2E, profile: p.profile,
      canCreate: true, now: () => new Date(), calculateNextDue,
      captureError: (err, tags) => console.warn('  (captured)', tags, err.message),
    });
    const T = { adm: await toolsFor(people.adm), a: await toolsFor(people.a), b: await toolsFor(people.b) };

    // Seed (Admin SDK, setup only): B's private task; a task the admin CREATED but is not assigned to.
    const seed = async (bare, data) => {
      const p = `churches/${E2E}/workItems/task_${bare}`;
      await db.doc(p).set({
        type: 'task', status: 'Backlog', priority: 'Medium', taskNumber: `TSK-P${ts % 1000}`,
        createdAt: new Date().toISOString(), archived: false, archivedAt: null,
        assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], ...data,
      });
      seeded.push(p);
    };
    const bPrivate = `mcp-probe-bpriv-${ts}`;
    const admUnassigned = `mcp-probe-own-${ts}`;
    await seed(bPrivate, { name: 'B private', visibility: 'private', createdBy: people.b.uid, createdByName: people.b.name });
    await seed(admUnassigned, { name: 'Admin own unassigned', visibility: 'private', createdBy: people.adm.uid, createdByName: people.adm.name });

    // 1. create_task as admin → next TSK number, app shape.
    const before = (await db.doc(`churches/${E2E}/config/main`).get()).data()?.maxTaskNumber || 0;
    const c = await outcome(() => T.adm.create_task(schemas.createTaskSchema.parse({ name: `MCP probe ${ts}`, dueDate: '2026-11-02', checklist: [{ text: 'one', done: false }] })));
    check('admin create_task succeeds', c.ok, c.msg);
    if (c.ok) {
      createdTaskIds.add(c.value.id);
      const doc = (await db.doc(`churches/${E2E}/workItems/task_${c.value.id}`).get()).data();
      check('taskNumber is the next number', c.value.taskNumber === 'TSK-' + String(before + 1).padStart(3, '0'), `${c.value.taskNumber} after ${before}`);
      check('created doc has the app shape', doc && doc.type === 'task' && doc.archived === false && doc.archivedAt === null
        && doc.createdBy === people.adm.uid && doc.visibility === 'private' && JSON.stringify(doc.assigneeUids) === JSON.stringify([people.adm.uid]),
        JSON.stringify({ vis: doc?.visibility, assigneeUids: doc?.assigneeUids }));
    }

    // 2. list_tasks includes the own-but-unassigned task; excludes B's private task.
    const l = await outcome(() => T.adm.list_tasks(schemas.listTasksSchema.parse({})));
    check('admin list_tasks succeeds (all four arms have indexes)', l.ok, l.msg);
    if (l.ok) {
      const ids = l.value.tasks.map((t) => t.id);
      check('list includes a task I created but am not assigned to', ids.includes(admUnassigned));
      check("list excludes B's private task", !ids.includes(bPrivate));
    }

    // 3. B's private task is out of reach for the admin and for A.
    for (const [who, t] of [['admin', T.adm], ['A', T.a]]) {
      const g = await outcome(() => t.get_task({ id: bPrivate }));
      check(`${who} cannot get B's private task`, !g.ok, g.msg);
      const u = await outcome(() => t.update_task({ id: bPrivate, status: 'Complete' }));
      check(`${who} cannot update B's private task`, !u.ok, u.msg);
      const cm = await outcome(() => t.add_comment({ id: bPrivate, text: 'x' }));
      check(`${who} cannot comment on B's private task`, !cm.ok, cm.msg);
    }
    const stillB = (await db.doc(`churches/${E2E}/workItems/task_${bPrivate}`).get()).data();
    check("B's private task is unchanged", stillB.status === 'Backlog' && !stillB.completedAt);

    // 4. Schema refusals (what the MCP layer runs before any tool).
    const bad = [
      ['bad status', () => schemas.updateTaskSchema.parse({ id: 'x', status: 'Open' })],
      ['assignees field', () => schemas.updateTaskSchema.parse({ id: 'x', assignees: [] })],
      ['visibility field', () => schemas.updateTaskSchema.parse({ id: 'x', visibility: 'team' })],
      ['createdBy on create', () => schemas.createTaskSchema.parse({ name: 'n', createdBy: 'z' })],
    ];
    for (const [label, fn] of bad) { const r = await outcome(fn); check(`schema rejects ${label}`, !r.ok, r.msg); }

    // 5. update_task + comment + activity log, on the admin's task.
    if (c.ok) {
      const u = await outcome(() => T.adm.update_task(schemas.updateTaskSchema.parse({ id: c.value.id, status: 'In Progress', notes: 'from probe' })));
      check('admin update_task succeeds (updateMask + updateTime precondition)', u.ok, u.msg);
      const doc = (await db.doc(`churches/${E2E}/workItems/task_${c.value.id}`).get()).data();
      check('only the allowed fields changed', doc.status === 'In Progress' && doc.notes === 'from probe' && doc.createdBy === people.adm.uid && doc.taskNumber === c.value.taskNumber);
      const cm = await outcome(() => T.adm.add_comment(schemas.addCommentSchema.parse({ id: c.value.id, text: 'probe comment' })));
      check('add_comment succeeds', cm.ok, cm.msg);
      const cs = await db.collection(`churches/${E2E}/workItems/task_${c.value.id}/comments`).get();
      check('comment author is the key owner', cs.size === 1 && cs.docs[0].data().authorId === people.adm.uid && cs.docs[0].data().authorName === people.adm.name);
      const logs = await db.collection(`churches/${E2E}/activityLog`).where('performedBy', '==', people.adm.uid).get();
      const via = logs.docs.map((d) => d.data()).filter((d) => d.details && d.details.via === 'chatgpt');
      check('activity log written with via:chatgpt and a server timestamp', via.length >= 2 && via.every((d) => d.timestamp && typeof d.timestamp.toDate === 'function'), `${via.length} rows`);
    }

    // 6. Recurring task: two Completes at once → exactly one successor.
    const r = await outcome(() => T.adm.create_task(schemas.createTaskSchema.parse({ name: `MCP recurring ${ts}`, dueDate: '2026-11-02', recurrence: 'weekly' })));
    check('admin creates a recurring task', r.ok, r.msg);
    if (r.ok) {
      createdTaskIds.add(r.value.id);
      const [x, y] = await Promise.all([
        outcome(() => T.adm.update_task({ id: r.value.id, status: 'Complete' })),
        outcome(() => T.adm.update_task({ id: r.value.id, status: 'Complete' })),
      ]);
      for (const o of [x, y]) if (o.ok && o.value.nextRecurringTask && o.value.nextRecurringTask.id) createdTaskIds.add(o.value.nextRecurringTask.id);
      check('at least one parallel Complete succeeded', x.ok || y.ok, `${x.msg || 'ok'} | ${y.msg || 'ok'}`);
      const succ = await db.collection(`churches/${E2E}/workItems`).where('name', '==', `MCP recurring ${ts}`).get();
      for (const d of succ.docs) createdTaskIds.add(d.id.replace(/^task_/, ''));
      const open = succ.docs.filter((d) => d.data().status !== 'Complete');
      check('exactly one successor exists', open.length === 1, `${succ.size} docs with that name`);
      if (open.length === 1) check('successor is due one week later', open[0].data().dueDate === '2026-11-09', open[0].data().dueDate);
    }

    // 7. A role-user member can create a task (DENIED when measured 2026-10-15; the
    // config/main member-bump rule fixed it 2026-10-19 — firestore.rules).
    const ac = await outcome(() => T.a.create_task(schemas.createTaskSchema.parse({ name: `MCP member create ${ts}` })));
    if (ac.ok) createdTaskIds.add(ac.value.id);
    check('member-A (role user) create_task allowed', ac.ok, ac.msg || '');
  } finally {
    for (const id of createdTaskIds) await db.recursiveDelete(db.doc(`churches/${E2E}/workItems/task_${id}`)).catch(() => {});
    for (const p of seeded) await db.recursiveDelete(db.doc(p)).catch(() => {});
    for (const p of Object.values(people)) {
      if (!p.uid) continue;
      const logs = await db.collection(`churches/${E2E}/activityLog`).where('performedBy', '==', p.uid).get();
      for (const d of logs.docs) await d.ref.delete().catch(() => {});
      await db.doc(`users/${p.uid}`).delete().catch(() => {});
      await auth.deleteUser(p.uid).catch(() => {});
    }
    const failed = results.filter((x) => !x.ok);
    for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.label}${x.detail ? `  [${x.detail}]` : ''}`);
    console.log(`\n${results.length - failed.length}/${results.length} passed; cleanup done.`);
    process.exitCode = failed.length ? 1 : 0;
  }
})().catch((e) => { console.error(e); process.exitCode = 2; });
