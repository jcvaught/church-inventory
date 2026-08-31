// @ts-check
import { test, expect } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, churchId, uids } from '../admin-helpers.js';

// Characterises what PRODUCTION enforces on workItems private visibility for a
// non-creator. Hardened against the confounders a reviewer raised: a dedicated
// Firebase app per account (no shared cache), server-forced reads, explicit
// fromCache assertions, distinct-UID verification, and onSnapshot — which is
// what src/useFirestore.js actually uses — alongside getDocs.
const CFG = {
  apiKey: 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y', authDomain: 'churchopshub.com',
  projectId: 'church-inventory-9615c', storageBucket: 'church-inventory-9615c.firebasestorage.app',
  messagingSenderId: '178475375356', appId: '1:178475375356:web:617a1674049e6508429579',
};

test.describe('workItems private visibility — production enforcement', () => {
  const PROBE = `task_ZZE2EPROBE${Date.now()}`;
  const probeRef = () => db().doc(`churches/${churchId()}/workItems/${PROBE}`);
  test.afterAll(async () => { await probeRef().delete().catch(() => {}); });

  test('a non-creator must not receive another member\'s private task', async () => {
    const u = await uids();
    expect(u.memberA, 'memberA uid resolved').toBeTruthy();
    expect(u.memberB, 'memberB uid resolved').toBeTruthy();
    expect(u.memberA, 'uids are distinct').not.toBe(u.memberB);

    await probeRef().set({
      type: 'task', createdBy: u.memberA, visibility: 'private',
      name: '[E2E] private visibility probe', status: 'Backlog',
      taskNumber: 'TSK-PROBE', createdAt: new Date().toISOString(),
    });

    // Dedicated app + auth instance so no cache or token is shared.
    const app = initializeApp(CFG, `probe-${Date.now()}`);
    const fdb = getFirestore(app), auth = getAuth(app);
    const cred = await signInWithEmailAndPassword(auth, 'e2e-member-b@churchopshub.com', 'E2eTestPass123!');
    expect(cred.user.uid, 'signed in as member-b').toBe(u.memberB);
    const base = `churches/${churchId()}/workItems`;
    const R = {};

    try { const s = await getDocFromServer(doc(fdb, `${base}/${PROBE}`)); R.get = s.exists() ? 'ALLOWED' : 'allowed-missing'; }
    catch (e) { R.get = `DENIED (${e.code})`; }

    let leaked = false;
    try {
      const s = await getDocsFromServer(collection(fdb, base));
      leaked = s.docs.some(d => d.id === PROBE);
      R.list = `ALLOWED — ${s.size} docs, fromCache=${s.metadata.fromCache}, probe ${leaked ? 'INCLUDED' : 'excluded'}`;
    } catch (e) { R.list = `DENIED (${e.code})`; }

    try { const s = await getDocsFromServer(query(collection(fdb, base), where('visibility', '==', 'private'))); R.filtered = `ALLOWED (${s.size})`; }
    catch (e) { R.filtered = `DENIED (${e.code})`; }

    // The real code path: onSnapshot on the unfiltered collection.
    let snapLeaked = false;
    R.listener = await new Promise((resolve) => {
      const t = setTimeout(() => { un(); resolve('TIMEOUT'); }, 15000);
      const un = onSnapshot(collection(fdb, base),
        (s) => { clearTimeout(t); snapLeaked = s.docs.some(d => d.id === PROBE); un();
                 resolve(`DELIVERED — ${s.size} docs, fromCache=${s.metadata.fromCache}, probe ${snapLeaked ? 'INCLUDED' : 'excluded'}`); },
        (e) => { clearTimeout(t); resolve(`ERROR (${e.code})`); });
    });

    try { await getDocsFromServer(collection(fdb, 'churches/some-other-church/workItems')); R.cross = 'ALLOWED  <-- TENANT BREACH'; }
    catch (e) { R.cross = `DENIED (${e.code})`; }

    await signOut(auth).catch(() => {}); await deleteApp(app).catch(() => {});

    console.log('\n=== production, member-b vs member-a private task ===');
    console.log(`  uids                 : A=${u.memberA} B=${u.memberB}`);
    for (const [k, v] of Object.entries(R)) console.log(`  ${k.padEnd(20)} : ${v}`);
    console.log(`\n  ${(leaked || snapLeaked) ? 'CONFIRMED LEAK' : 'NO LEAK — earlier result was a false positive'}\n`);

    expect(R.cross).toContain('DENIED');
    expect(snapLeaked, 'onSnapshot must not deliver another member\'s private task').toBe(false);
    expect(leaked, 'getDocsFromServer must not return another member\'s private task').toBe(false);
  });
});
