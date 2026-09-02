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
  getDocFromServer, getDocsFromServer, onSnapshot,
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
  check(!!A && !!B && A !== B, `uids resolved and distinct (A=${A.slice(0, 6)}… B=${B.slice(0, 6)}…)`);
  for (const [label, uid] of [['A', A], ['B', B]]) {
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
  };
  const batch = adb.batch();
  for (const [id, data] of Object.values(F)) batch.set(adb.doc(`churches/${CHURCH}/workItems/${id}`), data);
  await batch.commit();
  console.log(`\nSeeded ${Object.keys(F).length} fixtures with prefix ${PREFIX}\n`);

  const id = (s) => F[s][0];
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
  };

  const CONTROLS = {
    A: [
      ['private-a', 'ALLOWED', 'reads its own private task'],
      ['private-b', 'permission-denied', "is denied the other member's private task"],
      ['private-b-assigned-a', 'ALLOWED', 'reads a private task assigned to them'],
      ['private-b-stale-a', 'permission-denied', 'is denied a PRIVATE task holding them as a stale recipient'],
    ],
    B: [
      ['private-b', 'ALLOWED', 'reads its own private task'],
      ['private-a', 'permission-denied', "is denied the other member's private task"],
      ['private-a-assigned-b', 'ALLOWED', 'reads a private task assigned to them'],
      ['private-a-stale-b', 'permission-denied', 'is denied a PRIVATE task holding them as a stale recipient'],
    ],
  };
  try {
    // ONE account signed in at a time. Two authenticated Firebase apps alive
    // concurrently in a single Node process break the first app's Listen stream:
    // its listeners deliver one cached callback and never a server-backed one,
    // which reads exactly like "this query silently returns nothing". Measured,
    // not assumed — with a single app the same listeners are server-backed at
    // once, and that is what the earlier all-timeouts result actually was.
    for (const [label, uid, email] of [['A', A, 'e2e-member-a@churchopshub.com'], ['B', B, 'e2e-member-b@churchopshub.com']]) {
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

      // ORDER IS LOAD-BEARING: listeners first. In this SDK a getDocsFromServer
      // call poisons subsequent onSnapshot listeners on the same Firestore
      // instance — the listener delivers one cached callback and the Listen
      // stream never establishes. Measured directly: the same listener is
      // server-backed before the reads and times out after them. Nothing to do
      // with rules or with the queries; it would simply have been reported as
      // "listener timeout" and misread as a product failure.
      console.log(`\n--- member ${label}: onSnapshot ---`);
      for (const [src, q] of Object.entries(Q)) {
        const want = EXPECT[label][src].map(id);
        const outcome = await new Promise((resolve) => {
          let un = () => {};
          let cacheCallbacks = 0;
          const t = setTimeout(() => { un(); resolve({ state: 'timeout', cacheCallbacks }); }, 15000);
          un = onSnapshot(q,
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
    const del = adb.batch();
    for (const [docId] of Object.values(F)) del.delete(adb.doc(`churches/${CHURCH}/workItems/${docId}`));
    await del.commit();
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
