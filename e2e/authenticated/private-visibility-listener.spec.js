// @ts-check
import { test, expect } from '@playwright/test';
import { db, churchId, uids } from '../admin-helpers.js';
import { clientDb, signInAsClient, signOutClient } from '../client-helpers.js';
import { collection, getDocs, getDoc, doc as docRef, query, where } from 'firebase/firestore';

// Firestore read rules on `workItems` gate `visibility:'private'` to its
// creator. `src/useFirestore.js` subscribes to the WHOLE collection with no
// `where` clause. This characterises what production actually enforces on a
// LIST versus a GET — the rules emulator cannot answer it (fails open on list).
test.describe('workItems private visibility — get vs list', () => {
  const PROBE_ID = `task_ZZE2EPROBE${Date.now()}`;
  const probe = () => db().doc(`churches/${churchId()}/workItems/${PROBE_ID}`);

  test.afterAll(async () => {
    await probe().delete().catch(() => {});
    await signOutClient();
  });

  test('characterise private-task enforcement for a non-creator', async () => {
    const u = await uids();
    await probe().set({
      type: 'task', createdBy: u.memberA, visibility: 'private',
      name: '[E2E] private visibility probe', status: 'Backlog',
      taskNumber: 'TSK-PROBE', createdAt: new Date().toISOString(),
    });
    await signInAsClient('member-b');
    const base = `churches/${churchId()}/workItems`;

    // 1. Direct get of the private doc.
    let getResult;
    try {
      const s = await getDoc(docRef(clientDb, `${base}/${PROBE_ID}`));
      getResult = s.exists() ? 'ALLOWED' : 'allowed-but-missing';
    } catch (e) { getResult = `DENIED (${e.code})`; }

    // 2. Unfiltered list — what the app actually does.
    let listResult, leaked = false;
    try {
      const s = await getDocs(collection(clientDb, base));
      leaked = s.docs.some(d => d.id === PROBE_ID);
      listResult = `ALLOWED (${s.size} docs, probe ${leaked ? 'INCLUDED' : 'excluded'})`;
    } catch (e) { listResult = `DENIED (${e.code})`; }

    // 3. Targeted list for private docs only.
    let filteredResult;
    try {
      const s = await getDocs(query(collection(clientDb, base), where('visibility', '==', 'private')));
      filteredResult = `ALLOWED (${s.size} docs)`;
    } catch (e) { filteredResult = `DENIED (${e.code})`; }

    // 4. Control — cross-tenant list must still be denied.
    let crossTenant;
    try {
      const s = await getDocs(collection(clientDb, 'churches/some-other-church/workItems'));
      crossTenant = `ALLOWED (${s.size} docs)  <-- TENANT BREACH`;
    } catch (e) { crossTenant = `DENIED (${e.code})`; }

    console.log('\n=== production enforcement, member-b vs member-a private task ===');
    console.log(`  1 direct get         : ${getResult}`);
    console.log(`  2 unfiltered list    : ${listResult}`);
    console.log(`  3 where visibility== : ${filteredResult}`);
    console.log(`  4 cross-tenant list  : ${crossTenant}`);
    console.log(leaked
      ? '\n  FINDING: private tasks leak to any member via an unfiltered list query.'
      : '\n  Private tasks are not returned by an unfiltered list.');

    expect(crossTenant).toContain('DENIED');
  });
});
