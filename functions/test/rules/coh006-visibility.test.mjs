// COH-006 gate 4 — the restrictive work-item rules.
//
// Written to the actor-split assertions in
// docs/COH-006-GATE4-PLAN-2026-09-03.md (Codex). Split by actor rather than
// compressed into broad positive cases, because a single "an authorized user can
// read" test passes just as happily when the rule authorizes everyone.
//
// CAVEAT, and it is the reason production probes still exist: the emulator fails
// OPEN on list queries. A passing list here is rule-regression coverage, not
// proof of production containment.
//
// Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8');
const CHURCH = 'church-A';
const OTHER = 'church-B';
const P = (sub) => `churches/${CHURCH}/${sub}`;

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
  await seed('users/creator',   { churchId: CHURCH, role: 'user', name: 'Creator', active: true });
  await seed('users/recipient', { churchId: CHURCH, role: 'user', name: 'Recipient', active: true });
  await seed('users/assignee',  { churchId: CHURCH, role: 'user', name: 'Assignee', active: true });
  await seed('users/teamMember', { churchId: CHURCH, role: 'user', name: 'Member', active: true });
  await seed('users/third',     { churchId: CHURCH, role: 'user', name: 'Third', active: true });
  await seed('users/boss',      { churchId: CHURCH, role: 'admin', name: 'Admin no access', active: true });
  await seed('users/inactive',  { churchId: CHURCH, role: 'user', name: 'Inactive', active: false });
  await seed('users/outsider',  { churchId: OTHER,  role: 'admin', name: 'Outsider', active: true });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), path), data); });
}
const task = (over = {}) => ({
  type: 'task', name: 't', status: 'Backlog', taskNumber: 'TSK-001',
  createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'creator',
  assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], ...over,
});
const put = (id, data) => seed(P(`workItems/${id}`), data);
const read = (uid, id) => getDoc(doc(as(uid), P(`workItems/${id}`)));

// ── Final read rule ─────────────────────────────────────────────────────────

test('read: maintenance and team tasks are readable by any active member', async () => {
  await put('mnt_1', { type: 'maintenance', title: 'Boiler' });
  await put('task_team', task({ visibility: 'team' }));
  await assertSucceeds(read('teamMember', 'mnt_1'));
  await assertSucceeds(read('teamMember', 'task_team'));
});

test('read: the creator sees their own private and shared tasks', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await put('task_s', task({ visibility: 'shared' }));
  await assertSucceeds(read('creator', 'task_p'));
  await assertSucceeds(read('creator', 'task_s'));
});

test('read: an assignee sees a task at ANY visibility', async () => {
  await put('task_p', task({ visibility: 'private', assigneeUids: ['assignee'] }));
  await put('task_s', task({ visibility: 'shared', assigneeUids: ['assignee'] }));
  await assertSucceeds(read('assignee', 'task_p'));
  await assertSucceeds(read('assignee', 'task_s'));
});

test('read: a recipient sees a SHARED task', async () => {
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'] }));
  await assertSucceeds(read('recipient', 'task_s'));
});

test('read: an unlisted member is denied private and shared tasks', async () => {
  // The heart of it. Before gate 4 the shared case succeeded for every member,
  // which is what left 80 of 90 live tasks exposed.
  await put('task_p', task({ visibility: 'private' }));
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'] }));
  await assertFails(read('teamMember', 'task_p'));
  await assertFails(read('teamMember', 'task_s'));
});

test('read: an admin with no relationship to the task is denied — no admin override', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'] }));
  await assertFails(read('boss', 'task_p'));
  await assertFails(read('boss', 'task_s'));
});

test('read: inactive and cross-tenant actors are denied every positive arm', async () => {
  await put('task_team', task({ visibility: 'team' }));
  await put('task_a', task({ visibility: 'private', assigneeUids: ['inactive', 'outsider'] }));
  await assertFails(read('inactive', 'task_team'));
  await assertFails(read('inactive', 'task_a'));
  await assertFails(read('outsider', 'task_team'));
  await assertFails(read('outsider', 'task_a'));
});

test('read: a stale recipient on a PRIVATE task is denied', async () => {
  await put('task_stale', task({ visibility: 'private', sharedWithUids: ['recipient'] }));
  await assertFails(read('recipient', 'task_stale'));
});

test('read: malformed map/string projections grant nobody', async () => {
  // `in` also tests map keys, so without the list guards these would grant.
  await put('task_m1', task({ visibility: 'private', assigneeUids: { assignee: true } }));
  await put('task_m2', task({ visibility: 'shared', sharedWithUids: { recipient: true } }));
  await put('task_m3', task({ visibility: 'shared', sharedWithUids: 'recipient' }));
  await assertFails(read('assignee', 'task_m1'));
  await assertFails(read('recipient', 'task_m2'));
  await assertFails(read('recipient', 'task_m3'));
});

test('read: a legacy task with no visibility field is no longer readable — the arm is gone', async () => {
  // Removed only because production verification showed zero such documents.
  await put('task_legacy', { type: 'task', createdBy: 'creator', name: 'legacy' });
  await assertFails(read('teamMember', 'task_legacy'));
  await assertSucceeds(read('creator', 'task_legacy'));
});

// ── Update rule: pre-state authorization ────────────────────────────────────

const tryGrant = (uid, id, field, value) => updateDoc(doc(as(uid), P(`workItems/${id}`)), { [field]: value });

test('update: an outsider to the task cannot self-grant via either projection', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'] }));
  for (const id of ['task_p', 'task_s']) {
    await assertFails(tryGrant('teamMember', id, 'assigneeUids', ['teamMember']));
    await assertFails(tryGrant('teamMember', id, 'sharedWithUids', ['teamMember']));
  }
});

test('update: an admin without access cannot self-grant or grant a third party', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await assertFails(tryGrant('boss', 'task_p', 'assigneeUids', ['boss']));
  await assertFails(tryGrant('boss', 'task_p', 'sharedWithUids', ['third']));
});

test('update: a malformed pre-state projection cannot bootstrap authorization', async () => {
  await put('task_m', task({ visibility: 'private', assigneeUids: { teamMember: true } }));
  await assertFails(tryGrant('teamMember', 'task_m', 'assigneeUids', ['teamMember']));
});

// ── Update rule: authorized widening, projections not pinned ────────────────

test('update: the creator may widen sharing without touching the object array', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await assertSucceeds(tryGrant('creator', 'task_p', 'sharedWithUids', ['third']));
});

test('update: a recipient may add an assignee; an assignee may add a recipient', async () => {
  // DEC-2026-012: anyone already authorized may widen. Deliberately divergent
  // from assignees/sharedWith, which are display only.
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'] }));
  await assertSucceeds(tryGrant('recipient', 'task_s', 'assigneeUids', ['third']));
  await put('task_p', task({ visibility: 'private', assigneeUids: ['assignee'] }));
  await assertSucceeds(tryGrant('assignee', 'task_p', 'sharedWithUids', ['third']));
});

test('update: an ordinary member may widen a team task', async () => {
  await put('task_team', task({ visibility: 'team' }));
  await assertSucceeds(tryGrant('teamMember', 'task_team', 'sharedWithUids', ['third']));
  await assertSucceeds(tryGrant('teamMember', 'task_team', 'assigneeUids', ['third']));
});

test('update: a granted uid can then read only where that projection has meaning', async () => {
  await put('task_p', task({ visibility: 'private', assigneeUids: ['assignee'] }));
  await env.withSecurityRulesDisabled(async (e) => {
    await updateDoc(doc(e.firestore(), P('workItems/task_p')), { sharedWithUids: ['third'] });
  });
  // Sharing has no effect while the task is private; assignment would.
  await assertFails(read('third', 'task_p'));
  await env.withSecurityRulesDisabled(async (e) => {
    await updateDoc(doc(e.firestore(), P('workItems/task_p')), { assigneeUids: ['assignee', 'third'] });
  });
  await assertSucceeds(read('third', 'task_p'));
});

// ── Update rule: result shape and immutability ──────────────────────────────

test('update: both projections must remain lists', async () => {
  await put('task_p', task({ visibility: 'private' }));
  for (const bad of [{ assigneeUids: { third: true } }, { assigneeUids: 'third' }, { assigneeUids: null },
                     { sharedWithUids: { third: true } }, { sharedWithUids: 'third' }, { sharedWithUids: null }]) {
    await assertFails(updateDoc(doc(as('creator'), P('workItems/task_p')), bad));
  }
});

test('update: type, createdBy, taskNumber and createdAt are each pinned', async () => {
  await put('task_p', task({ visibility: 'private' }));
  const one = (patch) => assertFails(updateDoc(doc(as('creator'), P('workItems/task_p')), patch));
  await one({ type: 'maintenance' });
  await one({ createdBy: 'teamMember' });
  await one({ taskNumber: 'TSK-999' });
  await one({ createdAt: '2020-01-01T00:00:00.000Z' });
});

test('update: resulting visibility must be one of the three normalised values', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await assertFails(updateDoc(doc(as('creator'), P('workItems/task_p')), { visibility: 'secret' }));
  await assertFails(updateDoc(doc(as('creator'), P('workItems/task_p')), { visibility: '' }));
  await assertSucceeds(updateDoc(doc(as('creator'), P('workItems/task_p')), { visibility: 'team' }));
});

test('update: only the creator (or an admin who can already see it) changes visibility', async () => {
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'], assigneeUids: ['assignee'] }));
  await assertFails(updateDoc(doc(as('recipient'), P('workItems/task_s')), { visibility: 'team' }));
  await assertFails(updateDoc(doc(as('assignee'), P('workItems/task_s')), { visibility: 'team' }));
  await assertSucceeds(updateDoc(doc(as('creator'), P('workItems/task_s')), { visibility: 'team' }));
});

test('update: an admin who cannot see the task cannot change its visibility either', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await assertFails(updateDoc(doc(as('boss'), P('workItems/task_p')), { visibility: 'team' }));
});

test('update: maintenance keeps its any-member workflow and needs no projections', async () => {
  await put('mnt_1', { type: 'maintenance', title: 'Boiler', status: 'Open' });
  await assertSucceeds(updateDoc(doc(as('teamMember'), P('workItems/mnt_1')), { status: 'Done' }));
});

// ── Comments: gated on the parent ───────────────────────────────────────────

const comment = (uid, itemId, id = 'c1') => getDoc(doc(as(uid), P(`workItems/${itemId}/comments/${id}`)));
const listComments = (uid, itemId) => getDocs(collection(as(uid), P(`workItems/${itemId}/comments`)));
const addComment = (uid, itemId, id = 'new') =>
  setDoc(doc(as(uid), P(`workItems/${itemId}/comments/${id}`)), { text: 'hi', authorId: uid });
async function seedComment(itemId, authorId, id = 'c1') {
  await seed(P(`workItems/${itemId}/comments/${id}`), { text: 'existing', authorId });
}

test('comments: readable and writable under maintenance and team tasks', async () => {
  await put('mnt_1', { type: 'maintenance', title: 'Boiler' });
  await put('task_team', task({ visibility: 'team' }));
  await seedComment('mnt_1', 'creator');
  await seedComment('task_team', 'creator');
  await assertSucceeds(comment('teamMember', 'mnt_1'));
  await assertSucceeds(comment('teamMember', 'task_team'));
  await assertSucceeds(addComment('teamMember', 'task_team'));
});

test('comments: creator, assignee and recipient reach the discussion', async () => {
  await put('task_p', task({ visibility: 'private', assigneeUids: ['assignee'] }));
  await put('task_s', task({ visibility: 'shared', sharedWithUids: ['recipient'] }));
  await seedComment('task_p', 'creator');
  await seedComment('task_s', 'creator');
  await assertSucceeds(comment('creator', 'task_p'));
  await assertSucceeds(comment('assignee', 'task_p'));
  await assertSucceeds(comment('recipient', 'task_s'));
  await assertSucceeds(addComment('assignee', 'task_p'));
});

test('comments: an unlisted member and an admin without access are denied', async () => {
  await put('task_p', task({ visibility: 'private' }));
  await seedComment('task_p', 'creator');
  await assertFails(comment('teamMember', 'task_p'));
  await assertFails(listComments('teamMember', 'task_p'));
  await assertFails(addComment('teamMember', 'task_p'));
  await assertFails(comment('boss', 'task_p'));
  await assertFails(listComments('boss', 'task_p'));
  await assertFails(addComment('boss', 'task_p'));
});

test('comments: inactive, cross-tenant, stale recipient and malformed projections are denied', async () => {
  await put('task_p', task({ visibility: 'private', sharedWithUids: ['recipient'] }));
  await put('task_m', task({ visibility: 'shared', sharedWithUids: { recipient: true } }));
  await seedComment('task_p', 'creator');
  await seedComment('task_m', 'creator');
  await assertFails(comment('recipient', 'task_p'));   // stale: parent is private
  await assertFails(comment('recipient', 'task_m'));   // malformed map projection
  await assertFails(comment('inactive', 'task_p'));
  await assertFails(comment('outsider', 'task_p'));
});

test('comments: a missing parent denies every operation', async () => {
  await seedComment('task_ghost', 'creator');
  await assertFails(comment('creator', 'task_ghost'));
  await assertFails(addComment('creator', 'task_ghost'));
});

test('comments: authors edit their own; other authorized members cannot', async () => {
  await put('task_team', task({ visibility: 'team' }));
  await seedComment('task_team', 'teamMember');
  const ref = (uid) => doc(as(uid), P('workItems/task_team/comments/c1'));
  await assertSucceeds(updateDoc(ref('teamMember'), { text: 'edited' }));
  await assertFails(updateDoc(ref('third'), { text: 'not mine' }));
  await assertFails(deleteDoc(ref('third')));
});

test('comments: an admin moderates only where they can see the parent', async () => {
  await put('task_team', task({ visibility: 'team' }));
  await put('task_p', task({ visibility: 'private' }));
  await seedComment('task_team', 'teamMember');
  await seedComment('task_p', 'creator');
  await assertSucceeds(updateDoc(doc(as('boss'), P('workItems/task_team/comments/c1')), { text: 'moderated' }));
  await assertFails(updateDoc(doc(as('boss'), P('workItems/task_p/comments/c1')), { text: 'moderated' }));
  await assertFails(deleteDoc(doc(as('boss'), P('workItems/task_p/comments/c1'))));
});

test('comments: losing parent access removes even your own old comment', async () => {
  await put('task_p', task({ visibility: 'private', assigneeUids: ['assignee'] }));
  await seedComment('task_p', 'assignee');
  await assertSucceeds(comment('assignee', 'task_p'));
  // The creator unassigns them — their last claim on the task.
  await env.withSecurityRulesDisabled(async (e) => {
    await updateDoc(doc(e.firestore(), P('workItems/task_p')), { assigneeUids: [] });
  });
  await assertFails(comment('assignee', 'task_p'));
  await assertFails(updateDoc(doc(as('assignee'), P('workItems/task_p/comments/c1')), { text: 'edit' }));
  await assertFails(deleteDoc(doc(as('assignee'), P('workItems/task_p/comments/c1'))));
});

test('comments: a team task turned private shuts out the former ordinary member', async () => {
  await put('task_t', task({ visibility: 'team' }));
  await seedComment('task_t', 'teamMember');
  await assertSucceeds(comment('teamMember', 'task_t'));
  await env.withSecurityRulesDisabled(async (e) => {
    await updateDoc(doc(e.firestore(), P('workItems/task_t')), { visibility: 'private' });
  });
  await assertFails(comment('teamMember', 'task_t'));
  await assertFails(updateDoc(doc(as('teamMember'), P('workItems/task_t/comments/c1')), { text: 'edit' }));
});
