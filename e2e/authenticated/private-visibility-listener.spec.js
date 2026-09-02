// @ts-check
// COH-006 permanent regression — the constrained work-item queries.
//
// This replaces the characterization test that proved the DEC-2026-009 leak. That
// one asserted the desired end state against the OLD unconstrained listener and
// failed by design; it is obsolete now that the listener is gone. What has to be
// protected from regression is the new query set: that each of the five queries
// returns exactly what its rule arm authorizes, and nothing else.
//
// Design notes that are not arbitrary:
//   - Exact sorted ID equality. "contains the expected id" would pass while an
//     unauthorized document rode along, which is the entire failure mode.
//   - Server-forced reads and fromCache === false. A cache hit proves nothing
//     about what the rules allow.
//   - LISTENERS RUN BEFORE the server reads. In this SDK a getDocsFromServer
//     call poisons subsequent onSnapshot listeners on the same Firestore
//     instance: the listener gets one cached callback and the stream never
//     establishes. Measured on 2026-09-02. Reordering is not cosmetic.
//   - A listener timeout FAILS. It must never read as "no leak observed".
import { test, expect } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, collection, doc, query, where, getDocFromServer, getDocsFromServer, onSnapshot,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, churchId, uids } from '../admin-helpers.js';

const CFG = {
  apiKey: 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y', authDomain: 'churchopshub.com',
  projectId: 'church-inventory-9615c', storageBucket: 'church-inventory-9615c.firebasestorage.app',
  messagingSenderId: '178475375356', appId: '1:178475375356:web:617a1674049e6508429579',
};
const RUN = Date.now().toString(36);
const ID = (s) => `task_ZZCOH006REG_${RUN}_${s}`;
const sortIds = (a) => [...a].sort();

test.describe('COH-006 — constrained work-item queries', () => {
  /** @type {Record<string, any>} */
  let U;

  test.beforeAll(async () => {
    U = await uids();
    expect(U.memberA, 'member A uid').toBeTruthy();
    expect(U.memberB, 'member B uid').toBeTruthy();
    expect(U.memberA, 'uids are distinct').not.toBe(U.memberB);

    const base = (over) => ({
      type: 'task', name: '[E2E] COH-006 regression', status: 'Backlog', taskNumber: 'TSK-REG',
      createdAt: new Date().toISOString(), assignees: [], sharedWith: [],
      assigneeUids: [], sharedWithUids: [], ...over,
    });
    const b = { uid: U.memberB, name: 'B' };
    const batch = db().batch();
    const put = (suffix, data) => batch.set(db().doc(`churches/${churchId()}/workItems/${ID(suffix)}`), data);
    put('team', base({ visibility: 'team', createdBy: U.memberA }));
    put('private-a', base({ visibility: 'private', createdBy: U.memberA }));
    put('assigned-b', base({ visibility: 'private', createdBy: U.memberA, assignees: [b], assigneeUids: [U.memberB] }));
    put('shared-b', base({ visibility: 'shared', createdBy: U.memberA, sharedWith: [b], sharedWithUids: [U.memberB] }));
    // A private task still carrying B as a recipient — the shape that proves the
    // shared query needs its visibility clause as well as the array-contains.
    put('stale-b', base({ visibility: 'private', createdBy: U.memberA, sharedWith: [b], sharedWithUids: [U.memberB] }));
    await batch.commit();
  });

  test.afterAll(async () => {
    const batch = db().batch();
    for (const s of ['team', 'private-a', 'assigned-b', 'shared-b', 'stale-b']) {
      batch.delete(db().doc(`churches/${churchId()}/workItems/${ID(s)}`));
    }
    await batch.commit();
  });

  test('each constrained query returns exactly what its rule arm authorizes', async () => {
    const app = initializeApp(CFG, `coh006-reg-${RUN}`);
    const auth = getAuth(app);
    const fdb = getFirestore(app);
    try {
      const cred = await signInWithEmailAndPassword(auth, 'e2e-member-b@churchopshub.com', 'E2eTestPass123!');
      expect(cred.user.uid, 'signed in as member B').toBe(U.memberB);

      const ref = collection(fdb, `churches/${churchId()}/workItems`);
      const uid = U.memberB;
      const Q = {
        team: [query(ref, where('visibility', '==', 'team')), ['team']],
        own: [query(ref, where('createdBy', '==', uid)), []],
        assigned: [query(ref, where('assigneeUids', 'array-contains', uid)), ['assigned-b']],
        shared: [query(ref, where('visibility', '==', 'shared'), where('sharedWithUids', 'array-contains', uid)), ['shared-b']],
      };

      // Listeners first — see the header note.
      for (const [name, [q, want]] of Object.entries(Q)) {
        const got = await new Promise((resolve, reject) => {
          let un = () => {};
          const t = setTimeout(() => { un(); reject(new Error(`${name}: listener timed out — a timeout is a failure, not "no leak"`)); }, 15000);
          un = onSnapshot(q,
            (snap) => {
              if (snap.metadata.fromCache) return;
              clearTimeout(t); un();
              resolve(snap.docs.map((d) => d.id));
            },
            (err) => { clearTimeout(t); un(); reject(new Error(`${name}: listener error ${err.code}`)); });
        });
        // Only this run's fixtures are asserted; the tenant may hold other data.
        const mine = got.filter((docId) => docId.includes(`ZZCOH006REG_${RUN}_`));
        expect(sortIds(mine), `${name}: listener exact set`).toEqual(sortIds(want.map(ID)));
      }

      for (const [name, [q, want]] of Object.entries(Q)) {
        const snap = await getDocsFromServer(q);
        expect(snap.metadata.fromCache, `${name}: server-backed`).toBe(false);
        const mine = snap.docs.map((d) => d.id).filter((docId) => docId.includes(`ZZCOH006REG_${RUN}_`));
        expect(sortIds(mine), `${name}: server read exact set`).toEqual(sortIds(want.map(ID)));
      }

      // Direct-read controls: the query results above must not be the only
      // evidence, or a rules change that widened `get` would go unnoticed.
      const read = async (suffix) => {
        try { const s = await getDocFromServer(doc(fdb, `churches/${churchId()}/workItems/${ID(suffix)}`)); return s.exists() ? 'ALLOWED' : 'missing'; }
        catch (e) { return e.code; }
      };
      expect(await read('private-a'), "B cannot read A's private task").toBe('permission-denied');
      expect(await read('assigned-b'), 'B can read a private task assigned to B').toBe('ALLOWED');
      expect(await read('stale-b'), 'B cannot read a PRIVATE task that merely names B as a stale recipient').toBe('permission-denied');
    } finally {
      await signOut(auth).catch(() => {});
      await deleteApp(app).catch(() => {});
    }
  });
});
