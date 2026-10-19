// A plain member (role 'user') creating a task — the config/main counter arm.
//
// addTask bumps config/main.maxTaskNumber in the same commit as the task create.
// config/main was admin/manager-only, so every member task create failed
// (measured in production 2026-10-15, in the local UI 2026-10-19). The rules now
// admit a member's bump only when it is +1 and names a task created in the SAME
// commit, by them, carrying that number. Each case below is one way around that.
//
// Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8');
const CHURCH = 'church-A';
const OTHER = 'church-B';
const P = (sub) => `churches/${CHURCH}/${sub}`;
const CONFIG = P('config/main');

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shepherd-rules',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/member',   { churchId: CHURCH, role: 'user', name: 'Member', active: true });
  await seed('users/other',    { churchId: CHURCH, role: 'user', name: 'Other', active: true });
  await seed('users/boss',     { churchId: CHURCH, role: 'admin', name: 'Admin', active: true });
  await seed('users/inactive', { churchId: CHURCH, role: 'user', name: 'Inactive', active: false });
  await seed('users/outsider', { churchId: OTHER,  role: 'user', name: 'Outsider', active: true });
  await seed(CONFIG, { churchName: 'A', churchCode: 'AAA', maxTaskNumber: 6 });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), path), data); });
}
const task = (over = {}) => ({
  type: 'task', name: 't', status: 'Backlog', taskNumber: 'TSK-007',
  createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'member', visibility: 'team',
  archived: false, archivedAt: null,
  assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], ...over,
});
// The addTask shape: set-merge of the counter + create of the task, one commit.
function createWithBump(uid, { id = 'task_new1', n = 7, taskOver = {}, cfgExtra = {}, lastTaskDocId } = {}) {
  const db = as(uid);
  const b = writeBatch(db);
  b.set(doc(db, CONFIG), { maxTaskNumber: n, lastTaskDocId: lastTaskDocId === undefined ? id : lastTaskDocId, ...cfgExtra }, { merge: true });
  b.set(doc(db, P(`workItems/${id}`)), task({ createdBy: uid, ...taskOver }));
  return b.commit();
}

test('member: create + bump by 1 naming the new task succeeds', async () => {
  await assertSucceeds(createWithBump('member'));
});

test('member: the same through runTransaction (the real addTask path) succeeds', async () => {
  const db = as('member');
  await assertSucceeds(runTransaction(db, async (t) => {
    const snap = await t.get(doc(db, CONFIG));
    const n = snap.data().maxTaskNumber + 1;
    t.set(doc(db, CONFIG), { maxTaskNumber: n, lastTaskDocId: 'task_tx1' }, { merge: true });
    t.set(doc(db, P('workItems/task_tx1')), task({ taskNumber: 'TSK-00' + n }));
  }));
});

test('member: no maxTaskNumber yet → bump to 1 with TSK-001 succeeds', async () => {
  await seed(CONFIG, { churchName: 'A', churchCode: 'AAA' });
  await assertSucceeds(createWithBump('member', { n: 1, taskOver: { taskNumber: 'TSK-001' } }));
});

test('member: three-digit+ numbers are matched exactly (TSK-100, TSK-1000)', async () => {
  await seed(CONFIG, { maxTaskNumber: 99 });
  await assertSucceeds(createWithBump('member', { id: 'task_a', n: 100, taskOver: { taskNumber: 'TSK-100' } }));
  await seed(CONFIG, { maxTaskNumber: 999 });
  await assertSucceeds(createWithBump('member', { id: 'task_b', n: 1000, taskOver: { taskNumber: 'TSK-1000' } }));
});

test('member: the recurring three-write commit (source marker + bump + successor) succeeds', async () => {
  await seed(P('workItems/task_src'), task({ createdBy: 'member', taskNumber: 'TSK-003', status: 'Complete' }));
  const db = as('member');
  const b = writeBatch(db);
  b.update(doc(db, P('workItems/task_src')), { nextRecurrenceCreatedAt: '2026-10-19T00:00:00.000Z' });
  b.set(doc(db, CONFIG), { maxTaskNumber: 7, lastTaskDocId: 'task_succ' }, { merge: true });
  b.set(doc(db, P('workItems/task_succ')), task());
  await assertSucceeds(b.commit());
});

test('member: a malformed existing counter (null, string, float) fails closed', async () => {
  for (const bad of [null, '6', 6.5]) {
    await seed(CONFIG, { maxTaskNumber: bad });
    await assertFails(createWithBump('member', { id: `task_bad${String(bad).replace(/\W/g, '')}` }));
  }
});

test('member: bump alone (no task in the commit) fails', async () => {
  await assertFails(updateDoc(doc(as('member'), CONFIG), { maxTaskNumber: 7, lastTaskDocId: 'task_none' }));
});

test('member: bump by 2, or down, or to the same number fails', async () => {
  await assertFails(createWithBump('member', { n: 8, taskOver: { taskNumber: 'TSK-008' } }));
  await assertFails(createWithBump('member', { n: 1, taskOver: { taskNumber: 'TSK-001' } }));
  await assertFails(createWithBump('member', { n: 6, taskOver: { taskNumber: 'TSK-006' } }));
});

test('member: taskNumber mismatch or loose padding fails', async () => {
  await assertFails(createWithBump('member', { taskOver: { taskNumber: 'TSK-008' } }));
  await assertFails(createWithBump('member', { taskOver: { taskNumber: 'TSK-7' } }));
  await assertFails(createWithBump('member', { taskOver: { taskNumber: 'TSK-0007' } }));
});

test('member: lastTaskDocId pointing at an EXISTING task fails', async () => {
  await seed(P('workItems/task_old'), task({ createdBy: 'member', taskNumber: 'TSK-007' }));
  const db = as('member');
  await assertFails(updateDoc(doc(db, CONFIG), { maxTaskNumber: 7, lastTaskDocId: 'task_old' }));
});

test('member: a stale client (no lastTaskDocId, or null) still fails for a member', async () => {
  const db = as('member');
  const b = writeBatch(db);
  b.set(doc(db, CONFIG), { maxTaskNumber: 7 }, { merge: true });
  b.set(doc(db, P('workItems/task_old_client')), task());
  await assertFails(b.commit());
  await assertFails(createWithBump('member', { lastTaskDocId: null }));
});

test('member: lastTaskDocId naming a different doc than the one created fails', async () => {
  await assertFails(createWithBump('member', { lastTaskDocId: 'task_elsewhere' }));
});

test('member: lastTaskDocId into a subcollection or a non-task id fails', async () => {
  await assertFails(createWithBump('member', { lastTaskDocId: 'task_new1/comments/c1' }));
  await assertFails(createWithBump('member', { id: 'mnt_x', lastTaskDocId: 'mnt_x' }));
});

test('member: any other config/main field alongside the bump fails', async () => {
  await assertFails(createWithBump('member', { cfgExtra: { churchName: 'Hijacked' } }));
  await assertFails(createWithBump('member', { cfgExtra: { onboardingComplete: true } }));
  await assertFails(createWithBump('member', { cfgExtra: { maxTicketNumber: 50 } }));
});

test('member: a task created as someone else cannot carry the bump', async () => {
  // The task create rule already pins createdBy to the caller; assert the pair.
  await assertFails(createWithBump('member', { taskOver: { createdBy: 'other' } }));
});

test('inactive member and outsider fail', async () => {
  await assertFails(createWithBump('inactive'));
  await assertFails(createWithBump('outsider'));
});

test('admin: unrestricted config/main update still succeeds', async () => {
  await assertSucceeds(updateDoc(doc(as('boss'), CONFIG), { churchName: 'Renamed', maxTaskNumber: 40 }));
});

test('member: config/main delete still fails', async () => {
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(as('member'), CONFIG)));
});
