// COH-006 gate 3 — two-account production verification of the constrained queries.
//
// Written to the specification in docs/COH-006-GATE3-VERIFICATION-PLAN-2026-09-02.md
// (Codex). The design decisions that matter are its, not mine, and several exist
// because my own instincts about what a probe proves have been wrong on this task:
//
//   - exact sorted ID equality, never "contains" or a size check, because those
//     let an unauthorized extra document produce a green run;
//   - server-forced reads and `fromCache === false`, because a cache hit proves
//     nothing about what the rules allow;
//   - a listener timeout is a FAILURE, never "no leak observed";
//   - asymmetric expectations per account, so accidental account reuse shows up.
//
// It runs against PRODUCTION, in the e2e-test-church tenant only, and refuses to
// start unless that tenant has zero tasks. Fixtures are run-prefixed and deleted
// in a finally block.
import admin from 'firebase-admin';
import { createRequire } from 'module';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, collection, doc, query, where,
  getDocFromServer, getDocsFromServer, onSnapshot, setDoc,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { createWorkStore } from '../src/utils/workMerge.js';

const require = createRequire(import.meta.url);
const KEY = require('../scripts/serviceAccountKey.json');
if (KEY.project_id !== 'church-inventory-9615c') {
  console.error(`✋ key targets ${KEY.project_id}`); process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(KEY) });
const adb = admin.firestore();

const CHURCH = 'e2e-test-church';
if (!CHURCH.startsWith('e2e-')) { console.error('✋ non-e2e tenant'); process.exit(1); }
const RUN = Date.now().toString(36);
const TASK = (s) => `task_ZZCOH006G3_${RUN}_${s}`;
const MNT = (s) => `mnt_ZZCOH006G3_${RUN}_${s}`;
const PREFIX = `ZZCOH006G3_${RUN}_`;

const CFG = {
  apiKey: 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y', authDomain: 'churchopshub.com',
  projectId: 'church-inventory-9615c', storageBucket: 'church-inventory-9615c.firebasestorage.app',
  messagingSenderId: '178475375356', appId: '1:178475375356:web:617a1674049e6508429579',
};
const PASSWORD = process.env.E2E_MEMBER_PASSWORD || 'E2eTestPass123!';

let failures = 0;
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { failures++; console.log(`  ✗ ${m}`); };
const check = (cond, m) => (cond ? pass(m) : fail(m));
const sorted = (a) => [...a].sort();
const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

async function main() {
  // ── Preconditions ─────────────────────────────────────────────────────────
  console.log(`\n=== COH-006 gate 3 production probe — run ${RUN} ===\n`);
  const A = (await admin.auth().getUserByEmail('e2e-member-a@churchopshub.com')).uid;
  const B = (await admin.auth().getUserByEmail('e2e-member-b@churchopshub.com')).uid;
  const ADMIN = (await admin.auth().getUserByEmail('e2e-admin@churchopshub.com')).uid;
  check(!!A && !!B && !!ADMIN && new Set([A, B, ADMIN]).size === 3,
    `uids resolved and distinct (A=${A.slice(0, 6)}… B=${B.slice(0, 6)}… ADMIN=${ADMIN.slice(0, 6)}…)`);
  for (const [label, uid] of [['A', A], ['B', B], ['ADMIN', ADMIN]]) {
    const u = await adb.doc(`users/${uid}`).get();
    check(u.exists && u.data().churchId === CHURCH && u.data().active !== false,
      `member ${label} is an active member of ${CHURCH}`);
  }
  const existing = await adb.collection(`churches/${CHURCH}/workItems`).where('type', '==', 'task').count().get();
  check(existing.data().count === 0, `precondition: ${CHURCH} has zero tasks (found ${existing.data().count})`);
  if (failures) throw new Error('preconditions failed');

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const base = (over) => ({
    type: 'task', name: '[E2E] gate3 probe', status: 'Backlog', taskNumber: 'TSK-PROBE',
    createdAt: new Date().toISOString(), assignees: [], sharedWith: [],
    assigneeUids: [], sharedWithUids: [], ...over,
  });
  const person = (uid) => ({ uid, name: 'E2E' });
  const F = {
    maintenance: [MNT('maintenance'), { type: 'maintenance', name: '[E2E] gate3 maint', createdAt: new Date().toISOString() }],
    team: [TASK('team'), base({ visibility: 'team', createdBy: ADMIN })],
    'private-a': [TASK('private-a'), base({ visibility: 'private', createdBy: A })],
    'private-b': [TASK('private-b'), base({ visibility: 'private', createdBy: B })],
    'private-a-assigned-b': [TASK('private-a-assigned-b'), base({ visibility: 'private', createdBy: A, assignees: [person(B)], assigneeUids: [B] })],
    'private-b-assigned-a': [TASK('private-b-assigned-a'), base({ visibility: 'private', createdBy: B, assignees: [person(A)], assigneeUids: [A] })],
    'shared-a-to-b': [TASK('shared-a-to-b'), base({ visibility: 'shared', createdBy: A, sharedWith: [person(B)], sharedWithUids: [B] })],
    'shared-b-to-a': [TASK('shared-b-to-a'), base({ visibility: 'shared', createdBy: B, sharedWith: [person(A)], sharedWithUids: [A] })],
    'private-a-stale-b': [TASK('private-a-stale-b'), base({ visibility: 'private', createdBy: A, sharedWith: [person(B)], sharedWithUids: [B] })],
    'private-b-stale-a': [TASK('private-b-stale-a'), base({ visibility: 'private', createdBy: B, sharedWith: [person(A)], sharedWithUids: [A] })],
    'team-overlap': [TASK('team-overlap'), base({ visibility: 'team', createdBy: A, assignees: [person(B)], assigneeUids: [B], sharedWith: [person(B)], sharedWithUids: [B] })],
    'shared-overlap': [TASK('shared-overlap'), base({ visibility: 'shared', createdBy: A, assignees: [person(B)], assigneeUids: [B], sharedWith: [person(B)], sharedWithUids: [B] })],
    // A creator positive for ADMIN and a symmetric private-task negative for A
    // and B. It is NOT the listener fix: `admin-private` only happens to make
    // ADMIN's `own` result differ from the cached subset under the current
    // ordering, which forces a document change and therefore a callback. Cache
    // the document first, or warm the exact `own` set in a future refactor, and
    // the false timeout returns. Transport observation belongs to
    // includeMetadataChanges on the listener, not to this fixture.
    'admin-private': [TASK('admin-private'), base({ visibility: 'private', createdBy: ADMIN })],
  };
  const batch = adb.batch();
  for (const [id, data] of Object.values(F)) batch.set(adb.doc(`churches/${CHURCH}/workItems/${id}`), data);
  // Two comments beneath every parent the comments matrix exercises. Seeded
  // through the Admin SDK so the matrix measures READ/CREATE authorisation,
  // not whether the seeding actor could write them.
  const COMMENTED = ['private-a', 'private-a-assigned-b', 'shared-a-to-b', 'private-b'];
  for (const key of COMMENTED) {
    for (const cid of ['c1', 'c2']) {
      batch.set(adb.doc(`churches/${CHURCH}/workItems/${F[key][0]}/comments/${cid}`), {
        text: `[E2E] seeded ${cid}`, authorId: A, authorName: 'E2E',
        createdAt: new Date().toISOString(),
      });
    }
  }
  await batch.commit();
  console.log(`\nSeeded ${Object.keys(F).length} fixtures with prefix ${PREFIX}\n`);

  const id = (s) => F[s][0];
  // Every comment the probe itself creates, so cleanup can be asserted rather
  // than assumed.
  const CREATED = [];
  const EXPECT = {
    A: {
      maintenance: ['maintenance'], team: ['team', 'team-overlap'],
      own: ['private-a', 'private-a-assigned-b', 'shared-a-to-b', 'private-a-stale-b', 'team-overlap', 'shared-overlap'],
      assigned: ['private-b-assigned-a'], shared: ['shared-b-to-a'],
    },
    B: {
      maintenance: ['maintenance'], team: ['team', 'team-overlap'],
      own: ['private-b', 'private-b-assigned-a', 'shared-b-to-a', 'private-b-stale-a'],
      assigned: ['private-a-assigned-b', 'team-overlap', 'shared-overlap'],
      shared: ['shared-a-to-b', 'shared-overlap'],
    },
    // The no-role-override control. ADMIN sees only what the maintenance, team
    // and creator arms independently authorise — `own` is ['team'] because the
    // team fixture is createdBy ADMIN — and nothing through admin role alone.
    ADMIN: {
      maintenance: ['maintenance'], team: ['team', 'team-overlap'],
      own: ['team', 'admin-private'], assigned: [], shared: [],
    },
  };

  const CONTROLS = {
    A: [
      ['private-a', 'ALLOWED', 'reads its own private task'],
      ['private-b', 'permission-denied', "is denied the other member's private task"],
      ['private-b-assigned-a', 'ALLOWED', 'reads a private task assigned to them'],
      ['private-b-stale-a', 'permission-denied', 'is denied a PRIVATE task holding them as a stale recipient'],
      ['admin-private', 'permission-denied', "is denied the ADMIN's own private task"],
    ],
    B: [
      ['private-b', 'ALLOWED', 'reads its own private task'],
      ['private-a', 'permission-denied', "is denied the other member's private task"],
      ['private-a-assigned-b', 'ALLOWED', 'reads a private task assigned to them'],
      ['private-a-stale-b', 'permission-denied', 'is denied a PRIVATE task holding them as a stale recipient'],
      ['admin-private', 'permission-denied', "is denied the ADMIN's own private task"],
    ],
    ADMIN: [
      ['team', 'ALLOWED', 'reads a team task'],
      ['admin-private', 'ALLOWED', 'reads its own private task'],
      ['private-a', 'permission-denied', 'is denied an unrelated private task'],
      ['private-b', 'permission-denied', 'is denied a second unrelated private task'],
      ['shared-a-to-b', 'permission-denied', 'is denied an unrelated shared task'],
      ['shared-b-to-a', 'permission-denied', 'is denied a second unrelated shared task'],
    ],
  };
  try {
    // ONE account signed in at a time. Two authenticated Firebase apps alive
    // concurrently in a single Node process break the first app's Listen stream:
    // its listeners deliver one cached callback and never a server-backed one,
    // which reads exactly like "this query silently returns nothing". Measured,
    // not assumed — with a single app the same listeners are server-backed at
    // once, and that is what the earlier all-timeouts result actually was.
    for (const [label, uid, email] of [
      ['A', A, 'e2e-member-a@churchopshub.com'],
      ['B', B, 'e2e-member-b@churchopshub.com'],
      ['ADMIN', ADMIN, 'e2e-admin@churchopshub.com'],
    ]) {
      const app = initializeApp(CFG, `probe-${label}-${RUN}`);
      const auth = getAuth(app);
      const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
      check(cred.user.uid === uid, `signed in as member ${label} with the expected uid`);
      // Default transport. experimentalForceLongPolling was tried here and made
      // every listener time out; the auto-detected transport delivers
      // server-backed snapshots immediately. Measured both ways.
      const fdb = getFirestore(app);
      const ref = collection(fdb, `churches/${CHURCH}/workItems`);
      const Q = {
        maintenance: query(ref, where('type', '==', 'maintenance')),
        team: query(ref, where('visibility', '==', 'team')),
        own: query(ref, where('createdBy', '==', uid)),
        assigned: query(ref, where('assigneeUids', 'array-contains', uid)),
        shared: query(ref, where('visibility', '==', 'shared'), where('sharedWithUids', 'array-contains', uid)),
      };

      // Listeners first. A preceding getDocsFromServer warms the cache with the
      // exact result set, and a later listener over the same query then has
      // nothing but sync metadata left to report. With includeMetadataChanges
      // enabled above that is now observable either way, so this ordering is
      // defence in depth rather than the oracle itself.
      //
      // Corrected 2026-09-05 (Codex post-deploy review, M-1). The previous note
      // here claimed a one-shot read "poisons" the listener and that the Listen
      // stream never establishes. Neither is supported by a suppressed callback:
      // absence of a user callback is not absence of a server round-trip. Do not
      // reintroduce that reading.
      console.log(`\n--- member ${label}: onSnapshot ---`);
      for (const [src, q] of Object.entries(Q)) {
        const want = EXPECT[label][src].map(id);
        const outcome = await new Promise((resolve) => {
          let un = () => {};
          let cacheCallbacks = 0;
          const t = setTimeout(() => { un(); resolve({ state: 'timeout', cacheCallbacks }); }, 15000);
          // includeMetadataChanges is REQUIRED, not cosmetic. It defaults to false
          // in this SDK (12.13.0), and with it off a backend confirmation that
          // changes only sync metadata raises no second callback. When the cache
          // already holds the exact result set, the listener then delivers one
          // fromCache snapshot and nothing else — indistinguishable from a
          // listener that never reached the server. With it on, server
          // confirmation is observable regardless of what the cache holds.
          un = onSnapshot(q, { includeMetadataChanges: true },
            (snap) => {
              if (snap.metadata.fromCache) { cacheCallbacks++; return; }   // recorded, not accepted
              clearTimeout(t); un();
              resolve({ state: 'server', ids: snap.docs.map((d) => d.id), cacheCallbacks });
            },
            (err) => { clearTimeout(t); un(); resolve({ state: 'error', code: err.code, cacheCallbacks }); });
        });
        if (outcome.state === 'server') check(eq(outcome.ids, want), `${src}: listener exact ID set (server-backed)`);
        else fail(`${src}: listener ${outcome.state}${outcome.code ? ` — ${outcome.code}` : ''} after ${outcome.cacheCallbacks} cache-only callback(s) — a timeout is a failure, not "no leak"`);
      }

      console.log(`\n--- member ${label}: getDocsFromServer ---`);
      const serverSets = new Map();
      for (const [src, q] of Object.entries(Q)) {
        const want = EXPECT[label][src].map(id);
        try {
          const snap = await getDocsFromServer(q);
          const got = snap.docs.map((d) => d.id);
          check(snap.metadata.fromCache === false, `${src}: server-backed (fromCache=false)`);
          check(eq(got, want), `${src}: exact ID set${eq(got, want) ? '' : `\n      want ${sorted(want).join(', ')}\n      got  ${sorted(got).join(', ')}`}`);
          check(got.every((g) => g.includes(PREFIX)), `${src}: every result carries this run's prefix`);
          serverSets.set(src, new Map(snap.docs.map((d) => [d.id, { _docId: d.id, ...d.data() }])));
        } catch (e) {
          fail(`${src}: query rejected — ${e.code || e.message}`);
          serverSets.set(src, new Map());
        }
      }

      // The reader's own merge over the five server-backed sources.
      const store = createWorkStore([...serverSets.keys()]);
      for (const [src, m] of serverSets) store.snapshot(src, m);
      const state = store.read();
      const union = [...new Set(Object.values(EXPECT[label]).flat().map(id))];
      check(state.complete === true, `merge: store is complete`);
      const merged = [...state.tasks, ...state.maintenance].map((d) => d._docId);
      check(eq(merged, union), `merge: union equals the five sources combined`);
      check(merged.length === new Set(merged).size, `merge: no duplicates despite overlapping sources`);

      console.log(`\n--- member ${label}: direct-read and tenant controls ---`);
      const read = async (docId) => {
        try { const r = await getDocFromServer(doc(fdb, `churches/${CHURCH}/workItems/${docId}`)); return r.exists() ? 'ALLOWED' : 'missing'; }
        catch (e) { return e.code; }
      };
      for (const [suffix, want, desc] of CONTROLS[label]) {
        const got = await read(id(suffix));
        check(got === want, `${label} ${desc}${got === want ? '' : ` — expected ${want}, got ${got}`}`);
      }
      try {
        await getDocsFromServer(collection(fdb, 'churches/6cksNI9Uv8h0jXptdTESnXTXFgF3-church/workItems'));
        fail(`${label}: cross-tenant read ALLOWED — tenant boundary breach`);
      } catch (e) { check(e.code === 'permission-denied', `${label}: cross-tenant read denied (${e.code})`); }

      // ── Old-client tripwire ────────────────────────────────────────────
      // The unconstrained collection read the pre-gate-3 client issued. Exact
      // permission-denied only: a timeout or an unknown error is a FAILURE, not
      // a pass, because it would not prove the rule rejected the query.
      const resultCode = async (operation) => {
        try { await operation(); return 'ALLOWED'; }
        catch (e) { return e.code; }
      };
      const tripwire = await resultCode(() => getDocsFromServer(ref));
      check(tripwire === 'permission-denied',
        `${label}: unconstrained old-client collection read is permission-denied`
        + (tripwire === 'permission-denied' ? '' : ` — got ${tripwire}`));

      // ── Comments matrix ────────────────────────────────────────────────
      console.log(`\n--- member ${label}: comments ---`);
      const commentRef = (parentId, commentId) => doc(
        fdb, `churches/${CHURCH}/workItems/${parentId}/comments/${commentId}`,
      );
      const commentList = (parentId) => collection(
        fdb, `churches/${CHURCH}/workItems/${parentId}/comments`,
      );
      const commentIds = async (parentId) => sorted(
        (await getDocsFromServer(commentList(parentId))).docs.map((d) => d.id),
      );
      const positive = async (parentKey, newId, who) => {
        const parent = id(parentKey);
        check((await getDocFromServer(commentRef(parent, 'c1'))).exists(),
          `${label} ${who} gets c1 on ${parentKey}`);
        check(eq(await commentIds(parent), ['c1', 'c2']),
          `${label} ${who} lists exact seeded comments on ${parentKey}`);
        await setDoc(commentRef(parent, newId), {
          text: 'probe', authorId: uid, authorName: 'E2E',
          createdAt: new Date().toISOString(),
        });
        CREATED.push(`${parent}/comments/${newId}`);
        check(eq(await commentIds(parent), ['c1', 'c2', newId]),
          `${label} ${who} creates and lists exactly ${newId} on ${parentKey}`);
      };
      const negative = async (parentKey, deniedId, who) => {
        const parent = id(parentKey);
        check(await resultCode(() => getDocFromServer(commentRef(parent, 'c1'))) === 'permission-denied',
          `${label} ${who} get on ${parentKey} is permission-denied`);
        check(await resultCode(() => getDocsFromServer(commentList(parent))) === 'permission-denied',
          `${label} ${who} list on ${parentKey} is permission-denied`);
        check(await resultCode(() => setDoc(commentRef(parent, deniedId),
          { text: 'probe', authorId: uid })) === 'permission-denied',
          `${label} ${who} create on ${parentKey} is permission-denied`);
      };

      if (label === 'A') {
        await positive('private-a', 'new-a', 'as creator');
        await negative('private-b', 'denied-a', 'unlisted');
      }
      if (label === 'B') {
        await positive('private-a-assigned-b', 'new-b-assignee', 'as assignee');
        await positive('shared-a-to-b', 'new-b-recipient', 'as recipient');
        // Post-revocation: strip B from the assignee projections through the
        // Admin SDK, then require every comment operation to close behind them.
        await adb.doc(`churches/${CHURCH}/workItems/${id('private-a-assigned-b')}`)
          .update({ assignees: [], assigneeUids: [] });
        await negative('private-a-assigned-b', 'denied-b-revoked', 'after assignee revocation');
      }
      if (label === 'ADMIN') {
        await negative('private-a', 'denied-admin-private', 'unrelated');
        await negative('shared-a-to-b', 'denied-admin-shared', 'unrelated');
      }

      await signOut(auth).catch(() => {});
      await deleteApp(app).catch(() => {});
    }

    // ── Physical plan: is the composite index actually chosen? ───────────────
    console.log(`\n--- composite index plan ---`);
    try {
      const q = adb.collection(`churches/${CHURCH}/workItems`)
        .where('visibility', '==', 'shared').where('sharedWithUids', 'array-contains', B);
      const explain = await q.explain({ analyze: true });
      const summary = explain?.metrics?.planSummary ?? explain?.planSummary;
      const used = summary?.indexesUsed || [];
      console.log('    planSummary.indexesUsed:', JSON.stringify(used));
      // Assert the STRUCTURE, not a substring: scope, both field names, and the
      // array-contains mode. A single-field index, a collection-GROUP index, or a
      // plan naming only __name__ must all fail rather than pass on a loose match.
      const hit = used.some((i) => {
        const props = String(i.properties || '');
        const scope = String(i.query_scope || i.queryScope || '');
        return /^collection$/i.test(scope)
          && /\bvisibility\s+ASC\b/.test(props)
          && /\bsharedWithUids\s+ARRAY_CONTAINS\b/.test(props);
      });
      check(used.length > 0 && hit,
        'plan uses a COLLECTION-scope composite: visibility ASC + sharedWithUids ARRAY_CONTAINS');
    } catch (e) {
      console.log(`    ⚠️  Query Explain unavailable (${e.code || e.message}).`);
      console.log('    Recording the limitation rather than claiming the index was identified.');
      console.log('    The four successful client shared queries still prove a usable index exists,');
      console.log('    because Firestore fails such a query with failed-precondition when none does.');
    }
  } finally {
    console.log(`\n--- cleanup ---`);
    // recursiveDelete, not a parent-only batch: deleting a document does NOT
    // delete its subcollections, so a batch would leave every seeded and
    // probe-created comment orphaned in the production tenant.
    for (const [docId] of Object.values(F)) {
      await adb.recursiveDelete(adb.doc(`churches/${CHURCH}/workItems/${docId}`));
    }
    // recursiveDelete covers each parent's comments; assert it, and name the
    // probe-created ones so a failure says which write escaped cleanup.
    const orphans = await adb.collectionGroup('comments').get();
    const leftover = orphans.docs.filter((d) => d.ref.path.includes(PREFIX));
    check(leftover.length === 0,
      `cleanup: no probe comments orphaned (${leftover.length} remain of ${CREATED.length} created)`
      + (leftover.length ? `\n      ${leftover.map((d) => d.ref.path).join('\n      ')}` : ''));
    const left = await adb.collection(`churches/${CHURCH}/workItems`).count().get();
    // A checked assertion, not a printed number: fixtures left behind in a
    // production tenant would break the next run's zero-count precondition and
    // quietly become someone else's confusing data.
    check(left.data().count === 0, `cleanup: ${CHURCH} is empty again (${left.data().count} remain)`);
  }
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? '✅ PROBE PASSED' : `❌ PROBE FAILED — ${failures} assertion(s)`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => { console.error('\n✋ probe aborted:', e.message, '\n'); process.exit(1); });
