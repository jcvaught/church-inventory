// Jobs Hub roster transaction correctness — jobSignUp / jobWithdraw /
// promoteFromWaitlist. These are the audit-hardened (H1/H2/M3/L5) server-side
// writes that own capacity, compliance, waiver, and waitlist-promotion
// invariants. The transactions run for real against the emulator; email/SMS
// side-channels stay dark (no BREVO_API_KEY / no Twilio env) so we assert pure
// data outcomes. deliverNotification still writes in-app notification docs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, mockCallable } from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let n = 0;
function ids() {
  const churchId = `jr-church-${Date.now()}-${n++}`;
  return { churchId, jobDocId: 'job1' };
}
async function seedChurch(churchId, { grandfathered = true } = {}) {
  await db().doc(`churches/${churchId}`).set({ name: 'JR Test', code: 'JR1' });
  await db().doc(`churches/${churchId}/config/subscription`).set(
    grandfathered ? { grandfathered: true } : { plan: 'pro' });
}
async function seedUser(churchId, uid, { role = 'user', name = uid, active = true, allowedHubs } = {}) {
  const u = { churchId, role, name, active, email: `${uid}@test.com` };
  if (allowedHubs !== undefined) u.allowedHubs = allowedHubs;
  await db().doc(`users/${uid}`).set(u);
}
async function seedJob(churchId, jobDocId, overrides = {}) {
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}`).set({
    title: 'Setup crew', status: 'open', spotsTotal: 1, signupCount: 0, waitlistCount: 0,
    scheduledDate: '2030-01-01', ...overrides,
  });
}
const jobData = (churchId, jobDocId) => db().doc(`churches/${churchId}/jobListings/${jobDocId}`).get().then(s => s.data());
const signupExists = (c, j, uid) => db().doc(`churches/${c}/jobListings/${j}/signups/${uid}`).get().then(s => s.exists);
const signupData = (c, j, uid) => db().doc(`churches/${c}/jobListings/${j}/signups/${uid}`).get().then(s => s.data());
const waitlistExists = (c, j, uid) => db().doc(`churches/${c}/jobListings/${j}/waitlist/${uid}`).get().then(s => s.exists);
const call = (fn, uid, data) => funcs[fn].run(mockCallable(uid, data));

// ── jobSignUp ───────────────────────────────────────────────────────────────
test('jobSignUp: unauthenticated → unauthenticated', async () => {
  await assert.rejects(() => call('jobSignUp', null, { churchId: 'c', jobDocId: 'j' }),
    (e) => e.code === 'unauthenticated');
});

test('jobSignUp: not a member of the church → permission-denied', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId);
  await seedUser('otherChurch-user', 'u-outsider', {});
  await db().doc('users/u-outsider').update({ churchId: 'some-other-church' });
  await assert.rejects(() => call('jobSignUp', 'u-outsider', { churchId, jobDocId }),
    (e) => e.code === 'permission-denied');
});

test('jobSignUp: no Jobs Hub access for the user → permission-denied', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId);
  await seedUser(churchId, 'u-nohub', { allowedHubs: ['tasks'] });   // jobs not listed
  await assert.rejects(() => call('jobSignUp', 'u-nohub', { churchId, jobDocId }),
    (e) => e.code === 'permission-denied');
});

test('jobSignUp: church does not have the Jobs Hub active → failed-precondition', async () => {
  const { churchId, jobDocId } = ids();
  await db().doc(`churches/${churchId}`).set({ name: 'X' });
  await db().doc(`churches/${churchId}/config/subscription`).set({ plan: 'free', hubs: [] });
  await seedJob(churchId, jobDocId);
  await seedUser(churchId, 'u1', { role: 'admin' });   // admin → effectiveHasHub true, so we hit the sub gate
  await assert.rejects(() => call('jobSignUp', 'u1', { churchId, jobDocId }),
    (e) => e.code === 'failed-precondition');
});

test('jobSignUp: open spot → success, signupCount incremented, signup doc written', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 2 });
  await seedUser(churchId, 'u1', { name: 'Alice' });
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId });
  assert.deepEqual(res, { success: true });
  assert.equal((await jobData(churchId, jobDocId)).signupCount, 1);
  assert.equal((await signupData(churchId, jobDocId, 'u1')).name, 'Alice');
});

test('jobSignUp: double sign-up → already-signed-up, count unchanged', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 2 });
  await seedUser(churchId, 'u1');
  await call('jobSignUp', 'u1', { churchId, jobDocId });
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId });
  assert.equal(res.code, 'already-signed-up');
  assert.equal((await jobData(churchId, jobDocId)).signupCount, 1);
});

test('jobSignUp: full job → waitlisted, waitlistCount incremented', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 1, signupCount: 1 });
  await seedUser(churchId, 'u2');
  const res = await call('jobSignUp', 'u2', { churchId, jobDocId });
  assert.deepEqual(res, { wasWaitlisted: true });
  assert.equal((await jobData(churchId, jobDocId)).waitlistCount, 1);
  assert.equal(await waitlistExists(churchId, jobDocId, 'u2'), true);
});

test('jobSignUp: closed job → job-not-open', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { status: 'completed' });
  await seedUser(churchId, 'u1');
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId });
  assert.equal(res.code, 'job-not-open');
});

test('jobSignUp: waiver required but not accepted → waiver-required', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { requiresWaiver: true });
  await seedUser(churchId, 'u1');
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId });
  assert.equal(res.code, 'waiver-required');
});

test('jobSignUp: waiver accepted → success, acknowledgedWaiverAt stamped', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { requiresWaiver: true });
  await seedUser(churchId, 'u1');
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId, waiverAccepted: true });
  assert.deepEqual(res, { success: true });
  assert.ok((await signupData(churchId, jobDocId, 'u1')).acknowledgedWaiverAt);
});

test('jobSignUp: compliance — required access type with no record → compliance-missing', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { requiredAccessTypes: ['background_check'] });
  await seedUser(churchId, 'u1');
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId });
  assert.equal(res.code, 'compliance-missing');
  assert.equal((await jobData(churchId, jobDocId)).signupCount, 0);
});

test('jobSignUp: compliance — valid unexpired record → success', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { requiredAccessTypes: ['background_check'] });
  await seedUser(churchId, 'u1');
  await db().doc(`churches/${churchId}/accessPeople/p1`).set({ userId: 'u1', name: 'Alice' });
  await db().doc(`churches/${churchId}/accessRecords/r1`).set({ personId: 'p1', type: 'background_check', expiryDate: '2099-01-01' });
  const res = await call('jobSignUp', 'u1', { churchId, jobDocId });
  assert.deepEqual(res, { success: true });
});

// ── jobWithdraw ───────────────────────────────────────────────────────────
test('jobWithdraw: signed-up member withdraws self → count decremented', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 2, signupCount: 1 });
  await seedUser(churchId, 'u1');
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}/signups/u1`).set({ uid: 'u1', name: 'A', signedUpAt: 'x' });
  const res = await call('jobWithdraw', 'u1', { churchId, jobDocId });
  assert.deepEqual(res, { wasSignedUp: true, wasOnWaitlist: false });
  assert.equal((await jobData(churchId, jobDocId)).signupCount, 0);
  assert.equal(await signupExists(churchId, jobDocId, 'u1'), false);
});

test('jobWithdraw: freeing a spot promotes the waitlist head inline', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 1, signupCount: 1, waitlistCount: 1 });
  await seedUser(churchId, 'u1', { name: 'Held' });
  await seedUser(churchId, 'u2', { name: 'Waiter' });
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}/signups/u1`).set({ uid: 'u1', name: 'Held', signedUpAt: '2030-01-01T00:00:00Z' });
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}/waitlist/u2`).set({ uid: 'u2', name: 'Waiter', addedAt: '2030-01-01T00:00:00Z' });

  const res = await call('jobWithdraw', 'u1', { churchId, jobDocId });
  assert.equal(res.wasSignedUp, true);

  const job = await jobData(churchId, jobDocId);
  assert.equal(job.signupCount, 1);     // u1 out (-1), u2 promoted (+1)
  assert.equal(job.waitlistCount, 0);
  assert.equal(await signupExists(churchId, jobDocId, 'u2'), true);
  assert.equal(await waitlistExists(churchId, jobDocId, 'u2'), false);
});

test('jobWithdraw: non-admin cannot remove another member → permission-denied', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { signupCount: 1 });
  await seedUser(churchId, 'u1', { role: 'user' });
  await seedUser(churchId, 'victim', { role: 'user' });
  await assert.rejects(() => call('jobWithdraw', 'u1', { churchId, jobDocId, uid: 'victim' }),
    (e) => e.code === 'permission-denied');
});

test('jobWithdraw: admin removes another member → allowed', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 2, signupCount: 1 });
  await seedUser(churchId, 'boss', { role: 'admin' });
  await seedUser(churchId, 'member', { role: 'user' });
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}/signups/member`).set({ uid: 'member', name: 'M', signedUpAt: 'x' });
  const res = await call('jobWithdraw', 'boss', { churchId, jobDocId, uid: 'member' });
  assert.equal(res.wasSignedUp, true);
  assert.equal(await signupExists(churchId, jobDocId, 'member'), false);
});

// ── promoteFromWaitlist ─────────────────────────────────────────────────────
test('promoteFromWaitlist: non-admin caller → permission-denied', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedUser(churchId, 'u1', { role: 'user' });
  await assert.rejects(() => call('promoteFromWaitlist', 'u1', { churchId, jobDocId }),
    (e) => e.code === 'permission-denied');
});

test('promoteFromWaitlist: admin with an open spot promotes the oldest waitlister', async () => {
  const { churchId, jobDocId } = ids();
  await seedChurch(churchId);
  await seedJob(churchId, jobDocId, { spotsTotal: 2, signupCount: 1, waitlistCount: 2 });
  await seedUser(churchId, 'admin1', { role: 'admin' });
  await seedUser(churchId, 'early', { name: 'Early' });
  await seedUser(churchId, 'late', { name: 'Late' });
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}/waitlist/early`).set({ uid: 'early', name: 'Early', addedAt: '2030-01-01T08:00:00Z' });
  await db().doc(`churches/${churchId}/jobListings/${jobDocId}/waitlist/late`).set({ uid: 'late', name: 'Late', addedAt: '2030-01-02T08:00:00Z' });

  const res = await call('promoteFromWaitlist', 'admin1', { churchId, jobDocId });
  assert.equal(res.promoted, true);
  assert.equal(res.promotedName, 'Early');                  // oldest addedAt wins
  assert.equal(await signupExists(churchId, jobDocId, 'early'), true);
  assert.equal(await waitlistExists(churchId, jobDocId, 'early'), false);
  assert.equal(await waitlistExists(churchId, jobDocId, 'late'), true);
});
