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
import { clientDb, signInAsClient, signOutClient } from '../e2e/client-helpers.js';
import {
  collection, doc, query, where, onSnapshot, getDocsFromServer, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';

const require = createRequire(import.meta.url);
const PROJECT_ID = 'church-inventory-9615c';
const CHURCH = 'e2e-test-church';
const P = (sub) => `churches/${CHURCH}/${sub}`;
// Every fixture shares one run-scoped prefix, so exact-id assertions can be
// scoped to this run and a real church's data can never make one pass or fail
// by accident.
const PREFIX = `task_coh007rg_${Date.now()}_`;

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

// A single, LONG-LIVED subscription to one arm, resolving only on SERVER-BACKED
// snapshots (review H1).
//
// Two things the first version got wrong, both of which let a departure
// assertion pass while broken — which is precisely the class of failure the
// COH-006 listener oracle exists to prevent, cited in this file's header and
// then not followed:
//
//   1. It unsubscribed as soon as the fixture appeared and opened a NEW listener
//      to observe the absence. That proves two query states at two moments; it
//      does not prove that an ALREADY-LIVE board listener publishes the removal,
//      which is the whole claim of the cutover and the rollout's acceptance
//      condition. One subscription must span the write.
//   2. It accepted any snapshot. Enabling `includeMetadataChanges` does not make
//      a callback server-backed — it makes cache callbacks visible too. An
//      absence predicate can therefore resolve against an initially empty CACHED
//      view before the server has even answered the query. Only
//      `metadata.fromCache === false` is evidence.
function watchArm(q, id, timeoutMs = 25000) {
  const waiters = [];
  let lastServerIds = null;
  let failure = null;
  const un = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    if (snap.metadata.fromCache) return;      // cache is not evidence
    lastServerIds = snap.docs.map((d) => d.id);
    for (const wake of waiters.splice(0)) wake();
  }, (err) => {
    failure = err;
    for (const wake of waiters.splice(0)) wake();
  });
  const until = async (present) => {
    const deadline = Date.now() + timeoutMs;
    while (!failure && !(lastServerIds && lastServerIds.includes(id) === present)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${present ? 'presence' : 'departure'}`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('listener timeout')), remaining);
        waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    }
    if (failure) throw failure;
  };
  return { until, close: un };
}

// Exact-id assertion against a SERVER read, scoped to this run's fixtures so a
// real church's data cannot make a check pass or fail by accident.
async function serverIds(q, prefix) {
  const snap = await getDocsFromServer(q);
  return snap.docs.map((d) => d.id).filter((x) => x.startsWith(prefix)).sort();
}

const baseTask = (over = {}) => ({
  type: 'task', name: 'COH-007 reader-gate probe', status: 'Complete',
  taskNumber: 'TSK-RGATE', createdByName: 'probe',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  completedAt: '2026-01-01T00:00:00.000Z',
  assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
  archived: false, archivedAt: null, ...over,
});

// The four deployed active arms, for whichever member is signed in.
const activeArms = (workRef, uid) => ({
  team:     query(workRef, where('visibility', '==', 'team'), where('archived', '==', false)),
  own:      query(workRef, where('createdBy', '==', uid), where('archived', '==', false)),
  assigned: query(workRef, where('assigneeUids', 'array-contains', uid), where('archived', '==', false)),
  shared:   query(workRef, where('visibility', '==', 'shared'),
                  where('sharedWithUids', 'array-contains', uid), where('archived', '==', false)),
});

async function main() {
  const workRef = collection(clientDb, P('workItems'));
  // Both uids are needed to shape the fixtures, so collect them before seeding.
  const uidB = await signInAsClient('member-b');
  const uidA = await signInAsClient('member-a');
  console.log(`Signed in to ${CHURCH}: member-a ${uidA}, member-b ${uidB}\n`);

  const IDS = {
    team:     `${PREFIX}team`,
    own:      `${PREFIX}own`,
    assigned: `${PREFIX}assigned`,
    shared:   `${PREFIX}shared`,
    privNeg:  `${PREFIX}privneg`,
    stale:    `${PREFIX}stale`,
    legacy:   `${PREFIX}legacy`,
  };
  const all = Object.values(IDS);

  try {
    // Seeded past the rules on purpose: some of these shapes exist precisely to
    // prove a client CANNOT reach them.
    await Promise.all([
      adminDb.doc(P(`workItems/${IDS.team}`)).set(baseTask({ visibility: 'team', createdBy: uidB })),
      adminDb.doc(P(`workItems/${IDS.own}`)).set(baseTask({ visibility: 'private', createdBy: uidA })),
      adminDb.doc(P(`workItems/${IDS.assigned}`)).set(baseTask({ visibility: 'private', createdBy: uidB, assigneeUids: [uidA] })),
      adminDb.doc(P(`workItems/${IDS.shared}`)).set(baseTask({ visibility: 'shared', createdBy: uidB, sharedWithUids: [uidA] })),
      adminDb.doc(P(`workItems/${IDS.privNeg}`)).set(baseTask({ visibility: 'private', createdBy: uidB })),
      // The gate-1 H-1 shape: a stale recipient left on a PRIVATE task. The
      // shared arm constrains visibility precisely so this never authorizes.
      adminDb.doc(P(`workItems/${IDS.stale}`)).set(baseTask({ visibility: 'private', createdBy: uidB, sharedWithUids: [uidA] })),
    ]);
    record('seed the two-account fixture set', true, `${all.length - 1} document(s)`);

    // ── rollout step 5's matrix, as SERVER reads ──
    console.log('\nActive arms, member-a — exact ids from a server read:');
    const armsA = activeArms(workRef, uidA);
    const expectedA = {
      team: [IDS.team], own: [IDS.own], assigned: [IDS.assigned], shared: [IDS.shared],
    };
    for (const [name, q] of Object.entries(armsA)) {
      const got = await serverIds(q, PREFIX);
      record(`member-a ${name} arm returns exactly its fixture`,
        JSON.stringify(got) === JSON.stringify(expectedA[name].sort()), got.join(', ') || '(none)');
    }
    const unionA = new Set((await Promise.all(Object.values(armsA).map((q) => serverIds(q, PREFIX)))).flat());
    record('member-a never sees the private non-creator task', !unionA.has(IDS.privNeg));
    record('member-a never sees the stale-recipient private task', !unionA.has(IDS.stale));

    // ── the live departure oracle: ONE subscription, spanning the write ──
    console.log('\nThe cutover claim, on a single live server-backed listener:');
    const watch = watchArm(armsA.team, IDS.team);
    try {
      await watch.until(true);
      record('an already-live active listener holds the task (server-backed)', true);
      await adminDb.doc(P(`workItems/${IDS.team}`)).update({
        archived: true,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: new Date().toISOString(),
      });
      record('archive it exactly as the scheduled worker will', true);
      await watch.until(false);
      record('THAT SAME listener publishes the removal', true);
    } catch (err) {
      record('the live departure oracle', false, err?.message || String(err));
    } finally {
      watch.close();
    }

    const archivedTeam = query(workRef, where('visibility', '==', 'team'), where('archived', '==', true));
    const inArchive = await serverIds(archivedTeam, PREFIX);
    record('a SERVER read of the archived arm returns it', inArchive.includes(IDS.team), inArchive.join(', '));

    // ── reopen, as a client, through the rules allowlist ──
    console.log('\nReopen brings it back:');
    const back = watchArm(armsA.team, IDS.team);
    try {
      await back.until(false);
      await updateDoc(doc(clientDb, P(`workItems/${IDS.team}`)), {
        archived: false, archivedAt: null, status: 'Backlog', completedAt: null,
        updatedAt: new Date().toISOString(),
      });
      record('reopen is permitted for an authorized member', true);
      await back.until(true);
      record('the live listener publishes its return', true);
    } catch (err) {
      record('reopen and return', false, err?.message || String(err));
    } finally {
      back.close();
    }
    record('and it has left the archived arm',
      !(await serverIds(archivedTeam, PREFIX)).includes(IDS.team));

    // ── the same matrix from the second account ──
    console.log('\nActive arms, member-b — the negatives:');
    await signInAsClient('member-b');
    const armsB = activeArms(workRef, uidB);
    const expectedB = {
      team: [IDS.team],
      // b created every fixture except `own`, so its own arm is the rest.
      own: [IDS.assigned, IDS.privNeg, IDS.shared, IDS.stale, IDS.team].sort(),
      assigned: [], shared: [],
    };
    for (const [name, q] of Object.entries(armsB)) {
      const got = await serverIds(q, PREFIX);
      record(`member-b ${name} arm returns exactly its fixture set`,
        JSON.stringify(got) === JSON.stringify(expectedB[name]), got.join(', ') || '(none)');
    }
    const unionB = new Set((await Promise.all(Object.values(armsB).map((q) => serverIds(q, PREFIX)))).flat());
    record('member-b never sees the task only member-a created', !unionB.has(IDS.own));

    // ── the cutover sentinel, in production ──
    console.log('\nThe cutover sentinel, against the deployed final rules:');
    await signInAsClient('member-a');
    await adminDb.doc(P(`workItems/${IDS.legacy}`)).set((() => {
      const t = baseTask({ visibility: 'team', createdBy: uidA });
      delete t.archived; delete t.archivedAt;
      return t;
    })());
    try {
      await updateDoc(doc(clientDb, P(`workItems/${IDS.legacy}`)), { name: 'edited', updatedAt: 'now' });
      record('an unbackfilled task is REFUSED under the final rules', false, 'the edit succeeded');
    } catch (err) {
      record('an unbackfilled task is REFUSED under the final rules',
        err?.code === 'permission-denied', err?.code || err?.message);
    }
    try {
      const t = baseTask({ visibility: 'team', createdBy: uidA });
      delete t.archived; delete t.archivedAt;
      await setDoc(doc(clientDb, P(`workItems/${PREFIX}staleCreate`)), t);
      record('a stale client cannot create without the pair', false, 'the create succeeded');
    } catch (err) {
      record('a stale client cannot create without the pair',
        err?.code === 'permission-denied', err?.code || err?.message);
    }
    // Unwritable is NOT hidden — the claim needs its own assertion (review L2).
    try {
      const snap = await getDoc(doc(clientDb, P(`workItems/${IDS.legacy}`)));
      record('an unbackfilled task remains READABLE', snap.exists());
    } catch (err) {
      record('an unbackfilled task remains READABLE', false, err?.code || err?.message);
    }
    record('but is absent from the board — the reason it must not exist',
      !(await serverIds(armsA.team, PREFIX)).includes(IDS.legacy));
  } finally {
    // Cleanup must FAIL LOUDLY (confirmation L3). An earlier version swallowed
    // every delete error and then recorded success unconditionally, so a
    // transient Admin SDK failure would leave probe documents in a real project
    // while the script printed "removed every probe fixture" and exited zero.
    // Every path is still attempted — one failure must not strand the rest.
    console.log('\nCleanup:');
    const undeleted = [];
    for (const id of [...all, `${PREFIX}staleCreate`]) {
      try {
        await adminDb.doc(P(`workItems/${id}`)).delete();
      } catch (err) {
        undeleted.push(`${id} (${err?.code || err?.message})`);
      }
    }
    record('removed every probe fixture', undeleted.length === 0,
      undeleted.length ? `LEFT BEHIND: ${undeleted.join(', ')}` : `${all.length + 1} path(s)`);
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
