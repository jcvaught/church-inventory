// stripeWebhook handler tests — the money ingress. Covers signature gating,
// the three subscription lifecycle events, churchId/church-existence guards,
// legacy-hub vs flat-`pro` plan resolution, and idempotent re-delivery.
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

const PRO_MONTHLY = 'price_1TiekxF12bDL8YA7j1uH1X1i';
const LEGACY_TASKS = 'price_1TM9kcF12bDL8YA7m3otofk2';
const PRO_HUBS = ['maintenance', 'insights', 'coordination', 'accountability', 'tasks', 'people_access', 'jobs'];

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
    data: { object: { metadata: { churchId }, status, items: { data: [{ price: { id: priceId } }] } } },
  };
}
// A stripe.subscriptions.retrieve() result with a given price.
const stripeSub = (priceId) => ({ id: 'sub_1', items: { data: [{ price: { id: priceId } }] } });

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

test('checkout.session.completed (pro_monthly) → writes active pro subscription', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'free', maxUsers: 10 });
  installStripeStub({ subscription: stripeSub(PRO_MONTHLY) });

  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);

  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'active');
  assert.equal(sub.plan, 'pro');
  assert.equal(sub.maxUsers, 9999);
  assert.deepEqual(sub.hubs, PRO_HUBS);
  assert.deepEqual(sub.freeHubsSelected, PRO_HUBS);
  assert.equal(sub.stripeCustomerId, 'cus_1');
  assert.equal(sub.stripeSubscriptionId, 'sub_1');
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

test('checkout.session.completed (legacy single hub) → arrayUnion that hub', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'free', hubs: ['insights'] });
  installStripeStub({ subscription: stripeSub(LEGACY_TASKS) });
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(completedEvent(churchId)), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'active');
  assert.deepEqual([...sub.hubs].sort(), ['insights', 'tasks']);
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

test('customer.subscription.updated → mirrors Stripe status onto the doc', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'pro', status: 'active' });
  installStripeStub({});                     // updated path makes no Stripe API call
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.updated', churchId, { status: 'past_due' })), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'past_due');
  assert.equal(sub.plan, 'pro');             // plan untouched on a status mirror
});

test('customer.subscription.deleted (pro) → resets church to free', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'pro', maxUsers: 9999, hubs: PRO_HUBS, freeHubsSelected: PRO_HUBS, status: 'active' });
  installStripeStub({});                     // deleted reads the price off the event, no retrieve()
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.deleted', churchId, { priceId: PRO_MONTHLY })), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'canceled');
  assert.equal(sub.plan, 'free');
  assert.equal(sub.maxUsers, 10);
  assert.deepEqual(sub.hubs, []);
  assert.deepEqual(sub.freeHubsSelected, []);
});

test('customer.subscription.deleted (legacy hub) → arrayRemove that hub', async () => {
  const churchId = newChurchId();
  await seedChurch(churchId, { plan: 'free', hubs: ['insights', 'tasks'], status: 'active' });
  installStripeStub({});
  const res = mockRes();
  await funcs.stripeWebhook(signedWebhookReq(subEvent('customer.subscription.deleted', churchId, { priceId: LEGACY_TASKS })), res);
  assert.equal(res.statusCode, 200);
  const sub = await subDoc(churchId);
  assert.equal(sub.status, 'canceled');
  assert.deepEqual(sub.hubs, ['insights']);  // tasks removed, insights kept
});
