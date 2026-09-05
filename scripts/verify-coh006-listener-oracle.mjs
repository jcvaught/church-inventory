// COH-006 — listener instrumentation regression.
//
// Proves the probe's listener oracle observes SERVER CONFIRMATION rather than a
// document change. Codex post-deploy review M-1 (2026-09-05): with
// includeMetadataChanges off — the SDK default — a backend confirmation that
// alters only sync metadata raises no second callback, so a listener over a
// query whose exact result set is already cached looks identical to a listener
// that never reached the server. verify-coh006-gate3.mjs previously mistook the
// second for the first.
//
// Deliberately uses ONE fixture that both `team` and `own` return, so the cache
// is warm and only metadata can confirm. `admin-private` is excluded on purpose:
// this case must pass because metadata events are observable, not because a new
// document forced a data event.
//
// Read-only against production apart from its own single prefixed fixture,
// removed in the finally block.
import admin from 'firebase-admin';
import { createRequire } from 'module';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, collection, query, where, onSnapshot, getDocsFromServer,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const require = createRequire(import.meta.url);
const KEY = require('./serviceAccountKey.json');
if (KEY.project_id !== 'church-inventory-9615c') {
  console.error(`✋ key targets ${KEY.project_id}`); process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(KEY) });
const adb = admin.firestore();

const CHURCH = 'e2e-test-church';
if (!CHURCH.startsWith('e2e-')) { console.error('✋ non-e2e tenant'); process.exit(1); }
const RUN = Date.now().toString(36);
const ID = `task_ZZORACLE_${RUN}`;
const CFG = {
  apiKey: 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y', authDomain: 'churchopshub.com',
  projectId: 'church-inventory-9615c', storageBucket: 'church-inventory-9615c.firebasestorage.app',
  messagingSenderId: '178475375356', appId: '1:178475375356:web:617a1674049e6508429579',
};
const PASSWORD = process.env.E2E_MEMBER_PASSWORD || 'E2eTestPass123!';

let failures = 0;
const check = (c, m) => (c ? console.log(`  ✓ ${m}`) : (failures++, console.log(`  ✗ ${m}`)));
const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// The oracle under test: an exact server-backed snapshot, metadata events ON.
const awaitServer = (q, ms = 15000) => new Promise((resolve) => {
  let un = () => {};
  let cacheCallbacks = 0;
  const t = setTimeout(() => { un(); resolve({ state: 'timeout', cacheCallbacks }); }, ms);
  un = onSnapshot(q, { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache) { cacheCallbacks++; return; }
      clearTimeout(t); un();
      resolve({ state: 'server', ids: snap.docs.map((d) => d.id), cacheCallbacks });
    },
    (err) => { clearTimeout(t); un(); resolve({ state: 'error', code: err.code, cacheCallbacks }); });
});

async function main() {
  console.log(`\n=== COH-006 listener oracle regression — run ${RUN} ===\n`);
  const ADMIN = (await admin.auth().getUserByEmail('e2e-admin@churchopshub.com')).uid;
  const existing = await adb.collection(`churches/${CHURCH}/workItems`).where('type', '==', 'task').count().get();
  check(existing.data().count === 0, `precondition: ${CHURCH} has zero tasks (found ${existing.data().count})`);
  if (failures) throw new Error('preconditions failed');

  // One task, created by ADMIN, visibility team: `team` and `own` both return it.
  await adb.doc(`churches/${CHURCH}/workItems/${ID}`).set({
    type: 'task', name: '[E2E] oracle', status: 'Backlog', taskNumber: 'TSK-ORACLE',
    createdAt: new Date().toISOString(), createdBy: ADMIN, visibility: 'team',
    assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
  });

  const app = initializeApp(CFG, `oracle-${RUN}`);
  const auth = getAuth(app);
  try {
    await signInWithEmailAndPassword(auth, 'e2e-admin@churchopshub.com', PASSWORD);
    const fdb = getFirestore(app);
    const ref = collection(fdb, `churches/${CHURCH}/workItems`);
    const teamQ = query(ref, where('visibility', '==', 'team'));
    const ownQ = query(ref, where('createdBy', '==', ADMIN));

    // 2. Warm the cache with the exact set via the `team` listener.
    const warm = await awaitServer(teamQ);
    check(warm.state === 'server' && eq(warm.ids, [ID]),
      `team listener server-backed with the exact fixture (${warm.state})`);

    // 3. `own` returns the identical set, so only metadata can confirm it.
    const afterWarm = await awaitServer(ownQ);
    check(afterWarm.state === 'server' && eq(afterWarm.ids ?? [], [ID]),
      `own listener server-backed though its exact set was already cached (${afterWarm.state})`
      + (afterWarm.state === 'server' ? ` after ${afterWarm.cacheCallbacks} cache callback(s)` : ''));

    // 4-5. Same again after an explicit one-shot server read.
    const one = await getDocsFromServer(ownQ);
    check(!one.metadata.fromCache && eq(one.docs.map((d) => d.id), [ID]),
      'own one-shot getDocsFromServer is server-backed and exact');
    const afterOneShot = await awaitServer(ownQ);
    check(afterOneShot.state === 'server' && eq(afterOneShot.ids ?? [], [ID]),
      `own listener STILL server-backed after a one-shot read (${afterOneShot.state})`
      + (afterOneShot.state === 'server' ? ` after ${afterOneShot.cacheCallbacks} cache callback(s)` : ''));
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app).catch(() => {});
    await adb.doc(`churches/${CHURCH}/workItems/${ID}`).delete();
    const left = await adb.collection(`churches/${CHURCH}/workItems`).count().get();
    check(left.data().count === 0, `cleanup: ${CHURCH} is empty again (${left.data().count} remain)`);
  }
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? '✅ ORACLE REGRESSION PASSED' : `❌ FAILED — ${failures} assertion(s)`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => { console.error('\n✋ aborted:', e.message, '\n'); process.exit(1); });
