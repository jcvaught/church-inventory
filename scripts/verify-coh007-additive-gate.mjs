// COH-007 additive gate — production probes.
//
// The gate's own acceptance step, and it exists because a green
// `firebase deploy` is not evidence. Two standing hazards on this repository:
// a COLLECTION composite whose field list matches an existing COLLECTION_GROUP
// index is created silently as nothing (five weeks of a missing production
// index in 2026-05), and rules must be redeployed after any index deploy.
//
// Runs as a REAL CLIENT — the Node client SDK, signed in as an ordinary member
// of the dedicated e2e-test-church tenant — so rules and indexes are both
// exercised exactly as a browser would exercise them. The Admin SDK would
// bypass the rules and prove nothing about them.
//
// What it asserts, in order:
//   1. Each of the four archived arms is ADMITTED and returns an authorized
//      (empty) result rather than failed-precondition or permission-denied.
//   2. The same four arms bounded by a completedAt window are admitted — the
//      longer index set.
//   3. The archiver's COLLECTION_GROUP eligibility query is admitted.
//   4. A shaped active task with `completedAt` ABSENT is still returned by the
//      active board arms (A10: this is the population the longer index would
//      silently drop), and is excluded from the bounded archive query.
//   5. An unbackfilled LEGACY task — neither archive field, which is every task
//      in production today — and its comments remain fully usable.
//   6. The transitional freeze holds: no client can archive, corrupt, or forge.
//
// Read-only against real churches. Writes only into e2e-test-church, and
// removes what it wrote.
//
// Run: node scripts/verify-coh007-additive-gate.mjs
import {
  clientDb, clientAuth, signInAsClient, signOutClient, doc, collection, addDoc, updateDoc, getDoc,
} from '../e2e/client-helpers.js';
import {
  query, where, orderBy, limit, getDocs, setDoc, deleteDoc, collectionGroup,
} from 'firebase/firestore';

const CHURCH = 'e2e-test-church';
const P = (sub) => `churches/${CHURCH}/${sub}`;
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function admits(name, q) {
  try {
    const snap = await getDocs(q);
    record(name, true, `admitted, ${snap.size} doc(s)`);
    return snap;
  } catch (err) {
    // A newly created composite reports failed-precondition while it BUILDS,
    // which is indistinguishable from a missing one by error code alone — the
    // message is the only thing that separates them, and mistaking the first
    // for the second is how a healthy deploy gets rolled back.
    const building = /currently building/i.test(err?.message || '');
    record(name, false, building ? 'INDEX STILL BUILDING — re-run' : `${err?.code || err?.message}`);
    return null;
  }
}
async function denies(name, fn) {
  try { await fn(); record(name, false, 'the write SUCCEEDED and must not have'); }
  catch (err) {
    const ok = err?.code === 'permission-denied';
    record(name, ok, ok ? 'permission-denied' : `wrong error: ${err?.code || err?.message}`);
  }
}
async function succeeds(name, fn) {
  try { await fn(); record(name, true); }
  catch (err) { record(name, false, `${err?.code || err?.message}`); }
}

const workRef = collection(clientDb, P('workItems'));
const NOW = new Date();
const since = new Date(NOW); since.setMonth(since.getMonth() - 12);
const SINCE = `${since.toISOString().slice(0, 10)}T00:00:00.000Z`;

async function main() {
  const uid = await signInAsClient('member-a');
  console.log(`Signed in to ${CHURCH} as member-a (${uid})\n`);

  // ── 1 + 2. the archived arms, unbounded and bounded ──
  console.log('Archived arms — the four authorization shapes:');
  const arms = {
    team:     [where('visibility', '==', 'team')],
    own:      [where('createdBy', '==', uid)],
    assigned: [where('assigneeUids', 'array-contains', uid)],
    shared:   [where('visibility', '==', 'shared'), where('sharedWithUids', 'array-contains', uid)],
  };
  for (const [key, filters] of Object.entries(arms)) {
    await admits(`archive arm: ${key}`, query(workRef, ...filters, where('archived', '==', true)));
  }
  console.log('\nArchived arms bounded by a 12-month completedAt window:');
  for (const [key, filters] of Object.entries(arms)) {
    await admits(`bounded archive arm: ${key}`, query(
      workRef, ...filters, where('archived', '==', true),
      where('completedAt', '>=', SINCE), orderBy('completedAt', 'desc'), limit(500),
    ));
  }

  // ── 3. the archiver's eligibility scan ──
  console.log('\nArchiver eligibility scan (COLLECTION_GROUP):');
  // Admin-SDK query in production; probed here for the index only. A client is
  // denied the collection-group read, so failed-precondition (missing index) and
  // permission-denied are distinguishable and only the former is a failure.
  try {
    await getDocs(query(
      collectionGroup(clientDb, 'workItems'),
      where('status', '==', 'Complete'),
      where('archived', '==', false),
      where('completedAt', '<=', NOW.toISOString()),
    ));
    record('collection-group eligibility query', true, 'admitted');
  } catch (err) {
    const missingIndex = err?.code === 'failed-precondition';
    record('collection-group eligibility query', !missingIndex,
      missingIndex ? 'MISSING INDEX' : `${err?.code} (index present; rules deny a client, as expected)`);
  }

  // ── 4. a shaped active task whose completedAt is ABSENT (A10) ──
  console.log('\nA10 — a shaped active task with completedAt ABSENT:');
  const noDateId = `task_coh007probe_nodate_${Date.now()}`;
  const legacyId = `task_coh007probe_legacy_${Date.now()}`;
  const cleanup = [];
  try {
    await setDoc(doc(clientDb, P(`workItems/${noDateId}`)), {
      type: 'task', name: 'COH-007 probe — no completedAt', status: 'Backlog',
      taskNumber: 'TSK-PROBE1', visibility: 'team', createdBy: uid, createdByName: 'probe',
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
      archived: false, archivedAt: null,   // NOTE: no completedAt field at all
    });
    cleanup.push(noDateId);
    record('create a shaped active task with no completedAt', true);

    const activeTeam = await admits('active board arm still returns it (unfiltered team arm)',
      query(workRef, where('visibility', '==', 'team')));
    if (activeTeam) {
      record('  …and the no-completedAt task is present',
        activeTeam.docs.some(d => d.id === noDateId));
    }
    const boundedTeam = await admits('bounded archive query is admitted for the exclusion check', query(
      workRef, where('visibility', '==', 'team'), where('archived', '==', true),
      where('completedAt', '>=', SINCE), orderBy('completedAt', 'desc'),
    ));
    if (boundedTeam) {
      record('bounded archive query EXCLUDES it', !boundedTeam.docs.some(d => d.id === noDateId));
    }

    // ── 5. the unbackfilled legacy task — every task in production today ──
    console.log('\nA13 — an unbackfilled legacy task stays fully usable:');
    await setDoc(doc(clientDb, P(`workItems/${legacyId}`)), {
      type: 'task', name: 'COH-007 probe — legacy', status: 'Backlog',
      taskNumber: 'TSK-PROBE2', visibility: 'team', createdBy: uid, createdByName: 'probe',
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), completedAt: null,
      assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
      // neither archive field — the stale-client shape
    });
    cleanup.push(legacyId);
    record('create without the archive pair (stale client)', true);
    await succeeds('edit a legacy task', () => updateDoc(
      doc(clientDb, P(`workItems/${legacyId}`)), { name: 'edited', updatedAt: new Date().toISOString() }));
    let commentId = null;
    await succeeds('comment on a legacy task', async () => {
      const c = await addDoc(collection(clientDb, P(`workItems/${legacyId}/comments`)),
        { text: 'probe', authorId: uid, authorName: 'probe', createdAt: new Date().toISOString() });
      commentId = c.id;
    });
    await succeeds('read the comment back',
      () => getDoc(doc(clientDb, P(`workItems/${legacyId}/comments/${commentId}`))));

    // ── 6. the transitional freeze ──
    console.log('\nThe transitional freeze — what a client must NOT be able to do:');
    await denies('archive a task directly', () => updateDoc(
      doc(clientDb, P(`workItems/${noDateId}`)), { archived: true, archivedAt: new Date(), updatedAt: 'x' }));
    await denies('delete the archived flag', () => updateDoc(
      doc(clientDb, P(`workItems/${noDateId}`)), { archived: null, updatedAt: 'x' }));
    await denies('forge archivedAt on an active task', () => updateDoc(
      doc(clientDb, P(`workItems/${noDateId}`)), { archivedAt: new Date(), updatedAt: 'x' }));
    await denies('write a non-boolean discriminator', () => updateDoc(
      doc(clientDb, P(`workItems/${noDateId}`)), { archived: 'false', updatedAt: 'x' }));
    await denies('create a half-written pair', () => setDoc(
      doc(clientDb, P(`workItems/task_coh007probe_half_${Date.now()}`)), {
        type: 'task', name: 'half', status: 'Backlog', taskNumber: 'TSK-PROBE3',
        visibility: 'team', createdBy: uid, createdByName: 'probe',
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), completedAt: null,
        assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], archived: false,
      }));
    await denies('create a born-archived task', () => setDoc(
      doc(clientDb, P(`workItems/task_coh007probe_born_${Date.now()}`)), {
        type: 'task', name: 'born', status: 'Backlog', taskNumber: 'TSK-PROBE4',
        visibility: 'team', createdBy: uid, createdByName: 'probe',
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), completedAt: null,
        assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
        archived: true, archivedAt: null,
      }));
  } finally {
    console.log('\nCleanup:');
    for (const id of cleanup) {
      try {
        const cs = await getDocs(collection(clientDb, P(`workItems/${id}/comments`)));
        for (const c of cs.docs) await deleteDoc(c.ref);
        await deleteDoc(doc(clientDb, P(`workItems/${id}`)));
        record(`removed ${id}`, true);
      } catch (err) { record(`removed ${id}`, false, err?.code || err?.message); }
    }
    await signOutClient();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('COH-007 additive gate: production probes PASS.');
}

main().catch(err => { console.error(err); process.exit(1); });
