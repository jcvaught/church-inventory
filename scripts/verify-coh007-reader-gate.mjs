// COH-007 reader gate — production verification.
//
// The cutover's claim is that an archived task LEAVES the always-live listeners
// at the query layer, and that an authorized user can still find it in the
// archive and bring it back. Each half is asserted against production, as a real
// client, with the rules and indexes that are actually deployed.
//
// The listener assertions use `{ includeMetadataChanges: true }`. Without it —
// the SDK default — a backend confirmation that alters only sync metadata raises
// no second callback, so a warm cache and a dead listener are indistinguishable
// and a departure assertion can pass while broken (plan A8, COH-006 post-deploy
// review M-1). `scripts/verify-coh006-listener-oracle.mjs` is the regression
// that pins that property; this script depends on it.
//
// Writes only its own prefixed fixtures into the dedicated e2e-test-church
// tenant, and removes them in the finally block. Real churches are untouched.
//
// Run: node scripts/verify-coh007-reader-gate.mjs
import admin from 'firebase-admin';
import { createRequire } from 'module';
import {
  clientDb, clientAuth, signInAsClient, signOutClient,
} from '../e2e/client-helpers.js';
import {
  collection, doc, query, where, onSnapshot, getDocsFromServer, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';

const require = createRequire(import.meta.url);
const PROJECT_ID = 'church-inventory-9615c';
const CHURCH = 'e2e-test-church';
const P = (sub) => `churches/${CHURCH}/${sub}`;
const STAMP = Date.now();
const ACTIVE_ID = `task_coh007rg_active_${STAMP}`;
const LEGACY_ID = `task_coh007rg_legacy_${STAMP}`;

const key = require('./serviceAccountKey.json');
if (key.project_id !== PROJECT_ID) {
  console.error(`✋ serviceAccountKey.json targets ${key.project_id}, expected ${PROJECT_ID}.`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(key) });
const adminDb = admin.firestore();

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Watch one arm and resolve when `predicate(ids)` holds, or time out. Metadata
// events are ON, so a server confirmation that changes no document still wakes
// this — which is the whole point.
function waitForArm(q, predicate, label, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok, detail) => { if (done) return; done = true; try { un(); } catch { /* already gone */ } resolve({ ok, detail }); };
    const timer = setTimeout(() => finish(false, `timed out after ${timeoutMs}ms`), timeoutMs);
    const un = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const ids = snap.docs.map((d) => d.id);
      if (predicate(ids, snap)) { clearTimeout(timer); finish(true, `${label}: ${ids.length} doc(s)`); }
    }, (err) => { clearTimeout(timer); finish(false, err?.code || err?.message); });
  });
}

const baseTask = (over = {}) => ({
  type: 'task', name: 'COH-007 reader-gate probe', status: 'Complete',
  taskNumber: 'TSK-RGATE', visibility: 'team', createdByName: 'probe',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  completedAt: '2026-01-01T00:00:00.000Z',
  assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], ...over,
});

async function main() {
  const uid = await signInAsClient('member-a');
  console.log(`Signed in to ${CHURCH} as member-a (${uid})\n`);
  const workRef = collection(clientDb, P('workItems'));
  // Exactly the deployed active team arm.
  const activeTeam = query(workRef, where('visibility', '==', 'team'), where('archived', '==', false));
  const archivedTeam = query(workRef, where('visibility', '==', 'team'), where('archived', '==', true));

  try {
    console.log('The cutover claim — an archived task leaves the live listener:');
    await setDoc(doc(clientDb, P(`workItems/${ACTIVE_ID}`)),
      baseTask({ createdBy: uid, archived: false, archivedAt: null }));
    record('create a shaped active task', true);

    let r = await waitForArm(activeTeam, (ids) => ids.includes(ACTIVE_ID), 'present');
    record('the active team listener delivers it', r.ok, r.detail);

    // Archive it exactly as the scheduled worker will — Admin SDK, two fields.
    await adminDb.doc(P(`workItems/${ACTIVE_ID}`)).update({
      archived: true,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });
    record('archive it the way the scheduled worker will', true);

    r = await waitForArm(activeTeam, (ids) => !ids.includes(ACTIVE_ID), 'departed');
    record('it LEAVES the active listener (metadata events on)', r.ok, r.detail);

    r = await waitForArm(archivedTeam, (ids) => ids.includes(ACTIVE_ID), 'present');
    record('and appears in the archived arm', r.ok, r.detail);

    // Server read, not cache: an empty cached result is not evidence.
    const server = await getDocsFromServer(archivedTeam);
    record('a SERVER read of the archived arm returns it',
      server.docs.some((d) => d.id === ACTIVE_ID), `${server.size} doc(s)`);

    console.log('\nReopen brings it back, as a client, through the rules allowlist:');
    await updateDoc(doc(clientDb, P(`workItems/${ACTIVE_ID}`)), {
      archived: false, archivedAt: null, status: 'Backlog', completedAt: null,
      updatedAt: new Date().toISOString(),
    });
    record('reopen is permitted', true);
    r = await waitForArm(activeTeam, (ids) => ids.includes(ACTIVE_ID), 'returned');
    record('it returns to the active listener', r.ok, r.detail);
    r = await waitForArm(archivedTeam, (ids) => !ids.includes(ACTIVE_ID), 'gone');
    record('and leaves the archived arm', r.ok, r.detail);

    console.log('\nThe cutover sentinel, in production:');
    // Seeded past the rules, because the final ruleset is exactly what forbids
    // a client from creating this shape.
    await adminDb.doc(P(`workItems/${LEGACY_ID}`)).set(baseTask({ createdBy: uid }));
    try {
      await updateDoc(doc(clientDb, P(`workItems/${LEGACY_ID}`)), { name: 'edited', updatedAt: 'now' });
      record('an unbackfilled task is REFUSED under the final rules', false, 'the edit succeeded');
    } catch (err) {
      record('an unbackfilled task is REFUSED under the final rules',
        err?.code === 'permission-denied', err?.code || err?.message);
    }
    try {
      await setDoc(doc(clientDb, P(`workItems/task_coh007rg_stale_${STAMP}`)), baseTask({ createdBy: uid }));
      record('a stale client cannot create without the pair', false, 'the create succeeded');
    } catch (err) {
      record('a stale client cannot create without the pair',
        err?.code === 'permission-denied', err?.code || err?.message);
    }
    // It must still be READABLE — unwritable is not the same as hidden.
    r = await waitForArm(activeTeam, (ids) => !ids.includes(LEGACY_ID), 'absent from the board');
    record('an unbackfilled task is absent from the board — the reason it must not exist', r.ok, r.detail);
  } finally {
    console.log('\nCleanup:');
    for (const id of [ACTIVE_ID, LEGACY_ID, `task_coh007rg_stale_${STAMP}`]) {
      try {
        await adminDb.doc(P(`workItems/${id}`)).delete();
        record(`removed ${id}`, true);
      } catch (err) { record(`removed ${id}`, false, err?.code || err?.message); }
    }
    await signOutClient();
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('COH-007 reader gate: production verification PASS.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
