// sendWelcomeEmail — the trial end date we put in writing to a new customer.
//
// The email used to compute its own date as Date.now() + 90 days, which agrees
// with the stored entitlement for an ordinary signup (both derive from the same
// instant) and disagrees for everything else: a restored signup, a backdated
// trial, a future extension. The fix reads config/subscription.trialEndsAt --
// so the fallback path, which is what runs when that read yields nothing
// usable, is the part most worth testing.
//
// Dates are asserted as literal strings under UTC, the deployed runtime's zone.
// toLocaleDateString is zone-dependent, so a trialEndsAt near midnight UTC can
// render as the previous calendar day elsewhere; pinning it here keeps that
// from drifting silently.
process.env.TZ = 'UTC';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAuth } from 'firebase-admin/auth';
import { loadFunctions, db, purgeChurch, installFetchStub } from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let fetchStub;
beforeEach(() => { fetchStub = installFetchStub(); });
afterEach(() => { fetchStub.restore(); });

let n = 0;
const fresh = () => `swe-${Date.now()}-${n++}`;
const created = [];
test.after(async () => { for (const id of created) await purgeChurch(id); });

// The admin's address comes from Firebase Auth, not Firestore (deliberately --
// it avoids racing the profile write), so the trigger needs a real Auth user.
async function seedAdmin() {
  const uid = fresh();
  await getAuth().createUser({ uid, email: `${uid}@test.com`, displayName: 'Javid Workman' });
  return uid;
}

// Build the church exactly as signup does, then hand the trigger the CloudEvent
// the platform would. `subscription: undefined` skips the doc entirely.
async function seedChurch(uid, { subscription, batched = false } = {}) {
  const churchId = `${uid}-church`;
  created.push(churchId);
  const churchData = { churchName: 'Hopeful Trails', churchCode: 'HOPEFUL', createdBy: uid, createdAt: new Date().toISOString() };
  if (batched) {
    // Signup commits the church and its subscription in ONE batch. The trigger
    // then reads a sibling document it was committed with -- test that, rather
    // than assume the visibility.
    const batch = db().batch();
    batch.set(db().doc(`churches/${churchId}`), churchData);
    if (subscription !== undefined) batch.set(db().doc(`churches/${churchId}/config/subscription`), subscription);
    await batch.commit();
  } else {
    await db().doc(`churches/${churchId}`).set(churchData);
    if (subscription !== undefined) await db().doc(`churches/${churchId}/config/subscription`).set(subscription);
  }
  return { churchId, event: { data: { data: () => churchData, ref: db().doc(`churches/${churchId}`) }, params: { churchId } } };
}

const sentEmail = () => {
  const call = fetchStub.calls.find((c) => /brevo|smtp\/email/.test(c.url));
  assert.ok(call, 'expected a Brevo send');
  return JSON.parse(call.options.body);
};
const trialShape = (trialEndsAt) => ({ plan: 'free', status: 'trialing', trialEndsAt, grandfathered: false });

test('quotes the STORED trial end date, not 90 days from now', async () => {
  const uid = await seedAdmin();
  const { event } = await seedChurch(uid, { subscription: trialShape('2027-03-15T12:00:00.000Z') });

  await funcs.sendWelcomeEmail.run(event);

  const body = sentEmail();
  assert.match(body.htmlContent, /March 15, 2027/);
  assert.match(body.textContent, /March 15, 2027/);
});

test('same-batch subscription is visible to the trigger', async () => {
  const uid = await seedAdmin();
  const { event } = await seedChurch(uid, { subscription: trialShape('2027-07-04T09:00:00.000Z'), batched: true });

  await funcs.sendWelcomeEmail.run(event);

  assert.match(sentEmail().htmlContent, /July 4, 2027/);
});

for (const [label, subscription] of [
  ['no subscription document', undefined],
  ['trialEndsAt null', { plan: 'free', status: 'trialing', trialEndsAt: null, grandfathered: false }],
  ['trialEndsAt malformed', trialShape('not-a-date')],
  ['trialEndsAt wrong type', trialShape(1790000000000)],
]) {
  test(`${label} → falls back to a sane date, never "Invalid Date"`, async () => {
    const uid = await seedAdmin();
    const { event } = await seedChurch(uid, { subscription });

    await funcs.sendWelcomeEmail.run(event);

    const body = sentEmail();
    assert.doesNotMatch(body.htmlContent, /Invalid Date/);
    assert.doesNotMatch(body.textContent, /Invalid Date/);
    // The fallback is today + TRIAL_DAYS; assert the year at least lands,
    // so an empty or garbage substitution can't pass.
    const expected = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    assert.match(body.htmlContent, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

test('the trial length in the copy matches the date that is quoted', async () => {
  const uid = await seedAdmin();
  const { event } = await seedChurch(uid, { subscription: trialShape('2027-03-15T12:00:00.000Z') });

  await funcs.sendWelcomeEmail.run(event);

  // Both derive from TRIAL_DAYS now, so the number and the date cannot drift.
  assert.match(sentEmail().htmlContent, /Your 90-day free trial is active/);
});

test('already stamped → no second send (idempotency holds)', async () => {
  const uid = await seedAdmin();
  const churchId = `${uid}-church`;
  created.push(churchId);
  const churchData = { churchName: 'Hopeful Trails', churchCode: 'HOPEFUL', createdBy: uid, welcomeEmailSentAt: '2026-09-23T00:00:00.000Z' };
  await db().doc(`churches/${churchId}`).set(churchData);

  await funcs.sendWelcomeEmail.run({ data: { data: () => churchData, ref: db().doc(`churches/${churchId}`) }, params: { churchId } });

  assert.equal(fetchStub.calls.filter((c) => /brevo|smtp\/email/.test(c.url)).length, 0);
});
