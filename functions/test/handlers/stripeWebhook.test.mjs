// stripeWebhook handler tests — the money ingress. Covers signature gating,
// the three subscription lifecycle events, churchId/church-existence guards,
// COH-012 A.4 legacy-event NORMALIZATION (every known price → the one flat
// paid state; every cancellation → the one lapsed state; nothing writes
// hubs / freeHubsSelected / maxUsers any more), and idempotent re-delivery.
//
// Signature verification is REAL (setup signs with the same secret the handler
// reads); only stripe.subscriptions.retrieve() and the API resource calls are
// stubbed (installStripeStub), since those use Stripe's https client, not fetch.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFunctions, db, mockRes, signedWebhookReq,
  installStripeStub, restoreStripe, WEBHOOK_SECRET,
} from './setup.mjs';

const FLAT_MONTHLY = 'price_1UGntiF12bDL8YA7UjdhSqFf';
const FLAT_ANNUAL = 'price_1UGntiF12bDL8YA7ldky35B4';
const LEGACY_PRO_MONTHLY = 'price_1TiekxF12bDL8YA7j1uH1X1i';
const LEGACY_TASKS = 'price_1TM9kcF12bDL8YA7m3otofk2';
const PRO_MONTHLY = FLAT_MONTHLY; // default price for the generic event helpers below
const LEGACY_FIELDS = ['hubs', 'freeHubsSelected', 'maxUsers', 'trialHubs'];
// A write from the webhook must never touch a legacy field — assert on the
// diff, not the absence, since a seeded doc may legitimately carry them.
function assertLegacyUntouched(before, after) {
  for (const f of LEGACY_FIELDS) assert.deepEqual(after[f], before[f], `webhook wrote legacy field ${f}`);
}

let funcs;
before(async () => { funcs = await loadFunctions(); });
afterEach(() => { restoreStripe(); });

// Each test uses a fresh churchId to avoid cross-test bleed on the shared emulator.
let n = 0;
const newChurchId = () => `wh-church-${Date.now()}-${n++}`;
async function seedChurch(churchId, sub = {}) {
  await db().doc(`churches/${churchId}`).set({ name: 'WH Test', code: 'WH1' });
  if (sub) await db().doc(`churches/${churchId}/config/subscription`).set(sub);
}
const subDoc = (churchId) => db().doc(`churches/${churchId}/config/subscription`).get().then((s) => s.data());

function completedEvent(churchId, { customer = 'cus_1', subscription = 'sub_1' } = {}) {
  return {
    id: `evt_${churchId}`,
    type: 'checkout.session.completed',
    data: { object: { metadata: { churchId }, customer, subscription } },
  };
}
function subEvent(type, churchId, { status = 'active', priceId = PRO_MONTHLY } = {}) {
  return {
    id: `evt_${type}_${churchId}`,
    type,
    data: { object: { metadata: { churchId }, status, ended_at: type.endsWith('deleted') ? 1789603200 : null, items: { data: [{ price: { id: priceId } }] } } },
  };
}
// A stripe.subscriptions.retrieve() result with a given price.
const stripeSub = (priceId) => ({ id: 'sub_1', created: 1789603200, items: { data: [{ price: { id: priceId } }] } });

test('missing stripe-signature header → 400, no Stripe call', async () => {
  installStripeStub({});
  const res = mockRes();
  await funcs.stripeWebhook({ method: 'POST', headers: {}, rawBody: Buffer.from('{}') }, res);
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /Missing stripe-signature/);
});

test('invalid signature → 400', async () => {
  installStripeStub({});
  const res = mockRes();
  const req = signedWebhookReq(completedEvent('x'), 'whsec_WRONG_SECRET');
  await funcs.stripeWebhook(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /Invalid webhook signature/);
});

for (const [label, priceId] of [['flat_monthly', FLAT_MONTHLY], ['flat_annual', FLAT_ANNUAL]]) {
  test(`checkout.session.completed (${label}) → the flat paid state, and a trial is exited`, async () => {
    const churchId = newChurchId();
    const before = { plan: 'free', status: 'trialing', trialEndsAt: '2026-12-01T00:00:00Z', hubs: [], trialHubs: ['jobs'], freeHubsSelected: null, maxUsers: 10 };
    await seedChurch(churchId, before);
    installStripeStub({ subscription: stripeSub(priceId) });

    const res = mockRes();
    await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);

    assert.equal(res.statusCode, 200);
    const sub = await subDoc(churchId);
    assert.equal(sub.status, 'active');
    assert.equal(sub.plan, 'flat');
    assert.equal(sub.paidAt, '2026-09-17T00:00:00.000Z'); // from subscription.created, not the clock
    assert.equal(sub.stripeCustomerId, 'cus_1');
    assert.equal(sub.stripeSubscriptionId, 'sub_1');
    assert.equal(sub.trialEndsAt, before.trialEndsAt, 'trial fields left alone');
    assertLegacyUntouched(before, sub);
  });
}

test('checkout.session.completed (LEGACY pro_monthly) → normalized to the same flat paid state', async () => {
  const churchId = newChurchId();
  const before = { plan: 'free', maxUsers: 10, hubs: [] };
  await seedChurch(churchId, before);
  installStripeStub({ subscription: stripeSub(LEGACY_PRO_MONTHLY) });
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'active');
  assert.equal(sub.plan, 'flat');
  assertLegacyUntouched(before, sub);
});

test('checkout.session.completed with NO churchId metadata → 200, no write', async () => {
  installStripeStub({ subscription: stripeSub(PRO_MONTHLY) });
  const res = mockRes();
  const ev = completedEvent('ignored');
  delete ev.data.object.metadata.churchId;
  await funcs.stripeWebhook(signedWebhookReq(ev), res);
  assert.equal(res.statusCode, 200);
});

test('checkout.session.completed for a church that no longer exists → 200, no write', async () => {
  const churchId = newChurchId();           // never seeded
  installStripeStub({ subscription: stripeSub(PRO_MONTHLY) });
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);
  assert.equal(res.statusCode, 200);
  const snap = await db().doc(`churches/${churchId}/config/subscription`).get();
  assert.equal(snap.exists, false);
});

test('checkout.session.completed with an unknown price → 200, no subscription write', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'free' });
  installStripeStub({ subscription: stripeSub('price_UNKNOWN_999') });
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.plan, 'free');           // untouched
  assert.equal(sub.status, undefined);
});

test('checkout.session.completed (LEGACY single hub) → flat paid state, hubs[] NOT touched', async () => {
  const churchId = newChurchId();
  const before = { plan: 'free', hubs: ['insights'] };
  await seedChurch(churchId, before);
  installStripeStub({ subscription: stripeSub(LEGACY_TASKS) });
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'active');
  assert.equal(sub.plan, 'flat');
  assert.deepEqual(sub.hubs, ['insights']);  // no arrayUnion — the field is dead
});

test('re-delivering the SAME completed event is idempotent (same final doc)', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'free', maxUsers: 10 });
  installStripeStub({ subscription: stripeSub(PRO_MONTHLY) });

  const r1 = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), r1);
  const after1 = await subDoc(churchId);

  const r2 = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), r2);
  const after2 = await subDoc(churchId);

  assert.equal(r1.statusCode, 200);
  assert.equal(r2.statusCode, 200);
  assert.deepEqual(after2, after1);         // duplicate delivery → no drift
});

test('customer.subscription.updated → mirrors Stripe status onto the doc (past_due keeps plan flat)', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'flat', status: 'active' });
  installStripeStub({});                     // updated path makes no Stripe API call
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.updated', churchId, { status: 'past_due' })), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'past_due');
  assert.equal(sub.plan, 'flat');
});

test('customer.subscription.updated on a LEGACY pro doc → status mirrored AND plan normalized to flat', async () => {
  const churchId = newChurchId();
  const before = { plan: 'pro', status: 'active', hubs: ['jobs'], freeHubsSelected: ['jobs'], maxUsers: 9999 };
  await seedChurch(churchId, before);
  installStripeStub({});
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.updated', churchId, { status: 'active', priceId: LEGACY_PRO_MONTHLY })), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.plan, 'flat');
  assert.equal(sub.status, 'active');
  assertLegacyUntouched(before, sub);
});

test('customer.subscription.updated with an UNKNOWN price → status mirrored, plan left alone', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'flat', status: 'active' });
  installStripeStub({});
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.updated', churchId, { status: 'unpaid', priceId: 'price_unknown' })), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'unpaid');
  assert.equal(sub.plan, 'flat');
});

for (const [label, priceId] of [['flat', FLAT_MONTHLY], ['LEGACY pro', LEGACY_PRO_MONTHLY], ['LEGACY single hub', LEGACY_TASKS], ['unknown price', 'price_unknown']]) {
  test(`customer.subscription.deleted (${label}) → the one lapsed-by-cancellation state; customer id kept`, async () => {
    const churchId = newChurchId();
    const before = { plan: 'flat', status: 'active', stripeCustomerId: 'cus_keep', hubs: ['insights', 'tasks'], freeHubsSelected: ['tasks'], maxUsers: 9999 };
    await seedChurch(churchId, before);
    installStripeStub({});                   // deleted reads the price off the event, no retrieve()
    const res = mockRes();
    await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.deleted', churchId, { priceId })), res);
    assert.equal(res.statusCode, 200);
    const sub = await subDoc(churchId);
    assert.equal(sub.status, 'canceled');
    assert.equal(sub.plan, 'free');
    assert.equal(sub.canceledAt, '2026-09-17T00:00:00.000Z'); // from ended_at, not the clock
    assert.equal(sub.stripeCustomerId, 'cus_keep');
    assertLegacyUntouched(before, sub);      // no arrayRemove, no hubs: [], no maxUsers: 10
  });
}
