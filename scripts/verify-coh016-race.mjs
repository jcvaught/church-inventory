/**
 * COH-016 production verification, part 2 (Codex delta review 2026-10-15):
 *
 *   COH_SA_KEY=/path/to/serviceAccountKey.json node scripts/verify-coh016-race.mjs
 *
 * 1. RACE — one throwaway admin in e2e-test-church creates tasks two ways AT ONCE:
 *    the web client's own path (client-SDK runTransaction, the addTask shape in
 *    src/useFirestore.js) and the MCP tool path (REST commit with updateTime
 *    preconditions). Every TSK number must be unique and the counter must end
 *    at before + total.
 * 2. MISSING config/main — an admin of a brand-new throwaway church (no
 *    config/main) creates a task: the REST `exists:false` write must be accepted
 *    by the config/main CREATE rule and yield TSK-001.
 * Everything created is deleted in `finally`.
 */
import { createRequire } from 'module';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, runTransaction } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const key = require(process.env.COH_SA_KEY || './serviceAccountKey.json');
const { createTools } = require('../functions/lib/mcp/tools');
const { createFirestoreRest } = require('../functions/lib/firestoreRest');
const { createTokenProvider } = require('../functions/lib/mcp/actAsUser');
const { calculateNextDue } = require('../functions/lib/recurrence');

const E2E = 'e2e-test-church';
const N = 6; // creates per path
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const auth = admin.auth();
const clientApp = initializeApp({
  apiKey: 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y', authDomain: 'churchopshub.com',
  projectId: 'church-inventory-9615c', appId: '1:178475375356:web:617a1674049e6508429579',
}, 'coh016-race');
const cdb = getFirestore(clientApp);
const cauth = getAuth(clientApp);

const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok: !!ok, detail });
const ts = Date.now();
const users = [];
const taskPaths = [];
let freshChurch = null;

async function mkUser(tag, churchId) {
  const email = `e2e-mcp-race-${tag}-${ts}@churchopshub.com`;
  const { uid } = await auth.createUser({ email, emailVerified: true });
  const profile = { churchId, role: 'admin', active: true, email, name: `Race ${tag}`, taskDefaultVisibility: 'private' };
  await db.doc(`users/${uid}`).set(profile);
  users.push(uid);
  return { uid, profile };
}
const toolsFor = async (u, churchId) => createTools({
  rest: createFirestoreRest(), token: await createTokenProvider({ createCustomToken: (x) => auth.createCustomToken(x) })(u.uid),
  uid: u.uid, churchId, profile: u.profile, canCreate: true, now: () => new Date(), calculateNextDue,
  captureError: (e, t) => console.warn('  (captured)', t, e.message),
});

// The client's addTask transaction (src/useFirestore.js:881-924), trimmed to the
// fields the rules check plus a recognisable name.
async function clientAddTask(uid, name, i) {
  const configRef = doc(cdb, 'churches', E2E, 'config', 'main');
  const ref = doc(cdb, 'churches', E2E, 'workItems', `task_race-c${i}-${ts}`);
  let taskNumber;
  await runTransaction(cdb, async (t) => {
    const s = await t.get(configRef);
    const maxNum = (s.data()?.maxTaskNumber || 0) + 1;
    taskNumber = 'TSK-' + String(maxNum).padStart(3, '0');
    t.set(configRef, { maxTaskNumber: maxNum }, { merge: true });
    const now = new Date().toISOString();
    t.set(ref, {
      name, type: 'task', taskNumber, createdBy: uid, createdByName: 'Race main', status: 'Backlog', priority: 'Medium',
      visibility: 'private', sharedWith: [], sharedWithUids: [], assignees: [], assigneeUids: [],
      createdAt: now, updatedAt: now, completedAt: null, archived: false, archivedAt: null,
    });
  });
  taskPaths.push(ref.path);
  return taskNumber;
}

try {
  // ── 1. race ──
  const main = await mkUser('main', E2E);
  await signInWithCustomToken(cauth, await auth.createCustomToken(main.uid));
  const T = await toolsFor(main, E2E);
  const before = (await db.doc(`churches/${E2E}/config/main`).get()).data()?.maxTaskNumber || 0;
  const jobs = [];
  for (let i = 0; i < N; i++) {
    jobs.push(clientAddTask(main.uid, `race client ${ts}`, i).then((n) => ({ via: 'client', n })));
    jobs.push(T.create_task({ name: `race mcp ${ts}` }).then((r) => { taskPaths.push(`churches/${E2E}/workItems/task_${r.id}`); return { via: 'mcp', n: r.taskNumber }; }));
  }
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const bad = settled.filter((s) => s.status === 'rejected').map((s) => s.reason && s.reason.message);
  check(`all ${2 * N} concurrent creates succeeded`, bad.length === 0, bad.join(' | '));
  const nums = ok.map((x) => x.n);
  check('every TSK number is unique', new Set(nums).size === nums.length, nums.sort().join(','));
  const after = (await db.doc(`churches/${E2E}/config/main`).get()).data()?.maxTaskNumber;
  check('counter advanced by exactly the number of creates', after === before + ok.length, `${before} → ${after}, ${ok.length} creates`);
  const stored = await db.collection(`churches/${E2E}/workItems`).where('createdBy', '==', main.uid).get();
  const storedNums = stored.docs.map((d) => d.data().taskNumber);
  check('stored tasks carry those unique numbers', stored.size === ok.length && new Set(storedNums).size === stored.size, `${stored.size} stored`);

  // ── 2. missing config/main ──
  freshChurch = `e2e-mcp-fresh-${ts}`;
  const fresh = await mkUser('fresh', freshChurch);
  check('fresh church has no config/main', !(await db.doc(`churches/${freshChurch}/config/main`).get()).exists);
  const F = await toolsFor(fresh, freshChurch);
  try {
    const r = await F.create_task({ name: 'first task' });
    check('create_task in a church with no config/main succeeds', true);
    check('it is TSK-001', r.taskNumber === 'TSK-001', r.taskNumber);
    const cfg = (await db.doc(`churches/${freshChurch}/config/main`).get()).data();
    check('config/main was created with maxTaskNumber 1', cfg && cfg.maxTaskNumber === 1, JSON.stringify(cfg));
  } catch (e) {
    check('create_task in a church with no config/main succeeds', false, e.message);
  }
} finally {
  for (const p of taskPaths) await db.recursiveDelete(db.doc(p)).catch(() => {});
  if (freshChurch) await db.recursiveDelete(db.doc(`churches/${freshChurch}`)).catch(() => {});
  for (const uid of users) {
    const logs = await db.collection(`churches/${E2E}/activityLog`).where('performedBy', '==', uid).get();
    for (const d of logs.docs) await d.ref.delete().catch(() => {});
    await db.doc(`users/${uid}`).delete().catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.label}${x.detail ? `  [${x.detail}]` : ''}`);
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed; cleanup done.`);
  process.exit(failed ? 1 : 0);
}
