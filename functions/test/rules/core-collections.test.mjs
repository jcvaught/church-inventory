// Firestore rules tests for the CORE (non-Shepherd) collections — the
// multi-tenant membership/role model that every hub rides on. Complements
// shepherd-rules.test.mjs (which covers only the Shepherd Hub). Locks in:
// member/admin/manager gradations, cross-tenant isolation, the activityLog
// immutability guarantee, task private-visibility, the workItems maintenance-
// vs-task create split, Jobs Hub roster read-gating + CF-only writes, the
// no-self-escalation user rules, and the webhook-only subscription doc.
//
// Run against the Firestore emulator:  npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8');
const PROJECT = 'demo-shepherd-rules';
const CHURCH = 'church-A';
const OTHER = 'church-B';
const P = (sub) => `churches/${CHURCH}/${sub}`;

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// Members are defined by a users/{uid} doc (churchId + role); the rules read it
// via userData(). Seed those (+ any parent docs) bypassing rules, then build a
// context per role.
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), path), data); });
}
async function seedMembers() {
  // active:true matches real user docs — the self-update rule reads .active
  // directly (errors on a missing field), so it must be present.
  await seed('users/adminA', { churchId: CHURCH, role: 'admin', name: 'Admin A', active: true });
  await seed('users/mgrA', { churchId: CHURCH, role: 'manager', name: 'Mgr A', active: true });
  await seed('users/memberA', { churchId: CHURCH, role: 'user', name: 'Member A', active: true });
  await seed('users/memberB', { churchId: CHURCH, role: 'user', name: 'Member B', active: true });
  await seed('users/outsider', { churchId: OTHER, role: 'admin', name: 'Outsider', active: true });
}

// ── Items — members read+update; admins/managers create/delete ───────────────
test('items: member can read + update, but not create or delete', async () => {
  await seedMembers();
  await seed(P('items/i1'), { name: 'Projector', status: 'Available' });
  await assertSucceeds(getDoc(doc(ctx('memberA'), P('items/i1'))));
  await assertSucceeds(updateDoc(doc(ctx('memberA'), P('items/i1')), { status: 'Checked Out' }));
  await assertFails(setDoc(doc(ctx('memberA'), P('items/i2')), { name: 'New' }));
  await assertFails(deleteDoc(doc(ctx('memberA'), P('items/i1'))));
});
test('items: admin and manager can create/delete', async () => {
  await seedMembers();
  await assertSucceeds(setDoc(doc(ctx('adminA'), P('items/i2')), { name: 'A' }));
  await assertSucceeds(setDoc(doc(ctx('mgrA'), P('items/i3')), { name: 'M' }));
  await assertSucceeds(deleteDoc(doc(ctx('adminA'), P('items/i2'))));
});
test('items: a member of another church is denied (tenant isolation)', async () => {
  await seedMembers();
  await seed(P('items/i1'), { name: 'Projector' });
  await assertFails(getDoc(doc(ctx('outsider'), P('items/i1'))));
  await assertFails(getDoc(doc(anon(), P('items/i1'))));
});

// ── Activity log — members create; nobody can modify (immutable audit) ───────
test('activityLog: member creates, but updates/deletes are denied for everyone', async () => {
  await seedMembers();
  await assertSucceeds(setDoc(doc(ctx('memberA'), P('activityLog/a1')), { action: 'checkout', itemId: 'i1' }));
  await seed(P('activityLog/a2'), { action: 'x', itemId: 'i2' });
  await assertFails(updateDoc(doc(ctx('adminA'), P('activityLog/a2')), { action: 'tampered' }));
  await assertFails(deleteDoc(doc(ctx('adminA'), P('activityLog/a2'))));
});

// ── Tasks — private tasks readable only by their creator ─────────────────────
test('tasks: a private task is readable only by its creator', async () => {
  await seedMembers();
  await seed(P('tasks/t1'), { createdBy: 'memberA', visibility: 'private', title: 'secret' });
  await assertSucceeds(getDoc(doc(ctx('memberA'), P('tasks/t1'))));
  await assertFails(getDoc(doc(ctx('memberB'), P('tasks/t1'))));
});
test('tasks: a team task is readable by any member', async () => {
  await seedMembers();
  await seed(P('tasks/t2'), { createdBy: 'memberA', visibility: 'team', title: 'shared' });
  await assertSucceeds(getDoc(doc(ctx('memberB'), P('tasks/t2'))));
});
test('tasks: create pins createdBy to the caller (no impersonation)', async () => {
  await seedMembers();
  await assertSucceeds(setDoc(doc(ctx('memberA'), P('tasks/t3')), { createdBy: 'memberA', visibility: 'team' }));
  await assertFails(setDoc(doc(ctx('memberA'), P('tasks/t4')), { createdBy: 'memberB', visibility: 'team' }));
});

// ── Work items — maintenance is admin/manager-create; tasks are member-create ─
test('workItems: a maintenance item can only be created by admin/manager', async () => {
  await seedMembers();
  await assertFails(setDoc(doc(ctx('memberA'), P('workItems/w1')), { type: 'maintenance', title: 'Fix HVAC' }));
  await assertSucceeds(setDoc(doc(ctx('adminA'), P('workItems/w2')), { type: 'maintenance', title: 'Fix HVAC' }));
});
test('workItems: a task item is member-create with createdBy pinned', async () => {
  await seedMembers();
  await assertSucceeds(setDoc(doc(ctx('memberA'), P('workItems/w3')), { type: 'task', createdBy: 'memberA', visibility: 'team' }));
  await assertFails(setDoc(doc(ctx('memberA'), P('workItems/w4')), { type: 'task', createdBy: 'memberB', visibility: 'team' }));
});

// ── Jobs Hub — listings gated on an active subscription; roster read-gated ───
async function seedJobsChurch() {
  await seedMembers();
  await seed(P('config/subscription'), { grandfathered: true }); // jobsHubActive() true
}
test('jobListings: admin can create when the Jobs Hub is active; member cannot', async () => {
  await seedJobsChurch();
  await assertSucceeds(setDoc(doc(ctx('adminA'), P('jobListings/j1')), { title: 'Mow', spotsTotal: 3, signupCount: 0 }));
  await assertFails(setDoc(doc(ctx('memberA'), P('jobListings/j1')), { title: 'Mow' }));
});
test('jobListings: members with hub access can read listings', async () => {
  await seedJobsChurch();
  await seed(P('jobListings/j1'), { title: 'Mow', spotsTotal: 3, signupCount: 0 });
  await assertSucceeds(getDoc(doc(ctx('memberA'), P('jobListings/j1'))));
});
test('jobListings signups: a member reads only their OWN signup; roster writes are CF-only', async () => {
  await seedJobsChurch();
  await seed(P('jobListings/j1'), { title: 'Mow', spotsTotal: 3, signupCount: 1 });
  await seed(P('jobListings/j1/signups/memberA'), { uid: 'memberA', name: 'Member A' });
  await assertSucceeds(getDoc(doc(ctx('memberA'), P('jobListings/j1/signups/memberA')))); // own
  await assertFails(getDoc(doc(ctx('memberB'), P('jobListings/j1/signups/memberA'))));    // not signed up → no roster
  await assertSucceeds(getDoc(doc(ctx('adminA'), P('jobListings/j1/signups/memberA'))));  // admin always
  await assertFails(setDoc(doc(ctx('adminA'), P('jobListings/j1/signups/memberB')), { uid: 'memberB' })); // CF-only
});

// ── Users — no self-escalation; cross-tenant transplant blocked ──────────────
test('users: a member cannot escalate their own role', async () => {
  await seedMembers();
  await assertFails(updateDoc(doc(ctx('memberA'), 'users/memberA'), { role: 'admin' }));
  await assertSucceeds(updateDoc(doc(ctx('memberA'), 'users/memberA'), { name: 'Renamed' }));
});
test('users: an admin can change a same-church member role, but not transplant churchId', async () => {
  await seedMembers();
  await assertSucceeds(updateDoc(doc(ctx('adminA'), 'users/memberA'), { role: 'manager' }));
  await assertFails(updateDoc(doc(ctx('adminA'), 'users/memberA'), { churchId: OTHER }));
});
test('users: signup cannot self-assign admin for a church you did not create', async () => {
  await assertFails(setDoc(doc(ctx('newbie'), 'users/newbie'), { churchId: CHURCH, role: 'admin', name: 'N' }));
  await assertSucceeds(setDoc(doc(ctx('newbie'), 'users/newbie'), { churchId: CHURCH, role: 'user', name: 'N' }));
});

// ── Subscription — members read; client updates are webhook/Admin-SDK only ───
test('config/subscription: members read, but no client can update it', async () => {
  await seedMembers();
  await seed(P('config/subscription'), { plan: 'pro', grandfathered: false });
  await assertSucceeds(getDoc(doc(ctx('memberA'), P('config/subscription'))));
  await assertFails(updateDoc(doc(ctx('adminA'), P('config/subscription')), { plan: 'all_in' }));
});
