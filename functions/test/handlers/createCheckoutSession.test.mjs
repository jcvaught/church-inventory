// createCheckoutSession / createPortalSession handler tests — the checkout
// ingress that mints Stripe sessions. Covers auth + admin gating, price
// configuration, redirect-origin allow-listing, and existing-customer reuse.
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFunctions, db, mockCallable, installStripeStub, restoreStripe,
} from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });
afterEach(() => { restoreStripe(); });

let n = 0;
const uid = () => `cs-user-${Date.now()}-${n++}`;
async function seedUser(userId, churchId, { role = 'admin' } = {}) {
  await db().doc(`users/${userId}`).set({ role, churchId, email: `${userId}@test.com` });
}
async function seedSub(churchId, data) {
  await db().doc(`churches/${churchId}/config/subscription`).set(data);
}

test('unauthenticated → unauthenticated', async () => {
  await assert.rejects(
    () => funcs.createCheckoutSession.run(mockCallable(null, { item: 'pro_monthly' })),
    (e) => e.code === 'unauthenticated',
  );
});

test('unconfigured price item → failed-precondition', async () => {
  const u = uid();
  await seedUser(u, `${u}-church`);
  installStripeStub({});
  await assert.rejects(
    () => funcs.createCheckoutSession.run(mockCallable(u, { item: 'no_such_item' })),
    (e) => e.code === 'failed-precondition',
  );
});

test('missing user profile → not-found', async () => {
  installStripeStub({});
  await assert.rejects(
    () => funcs.createCheckoutSession.run(mockCallable('ghost-user', { item: 'pro_monthly' })),
    (e) => e.code === 'not-found',
  );
});

test('non-admin caller → permission-denied (C-02 billing gate)', async () => {
  const u = uid();
  await seedUser(u, `${u}-church`, { role: 'user' });
  installStripeStub({});
  await assert.rejects(
    () => funcs.createCheckoutSession.run(mockCallable(u, { item: 'pro_monthly' })),
    (e) => e.code === 'permission-denied',
  );
});

test('admin happy path → returns checkout url with correct price + churchId metadata', async () => {
  const u = uid();
  const churchId = `${u}-church`;
  await seedUser(u, churchId, { role: 'admin' });
  let captured;
  installStripeStub({ checkoutUrl: 'https://stripe.test/checkout/cs_ok', onCheckout: (p) => { captured = p; } });

  const out = await funcs.createCheckoutSession.run(mockCallable(u, {
    item: 'pro_monthly',
    successUrl: 'https://churchopshub.com/?paid=1',
    cancelUrl: 'https://churchopshub.com/?cancel=1',
  }));

  assert.equal(out.url, 'https://stripe.test/checkout/cs_ok');
  assert.equal(captured.mode, 'subscription');
  assert.equal(captured.line_items[0].price, 'price_1TiekxF12bDL8YA7j1uH1X1i');
  assert.equal(captured.metadata.churchId, churchId);
  assert.equal(captured.subscription_data.metadata.churchId, churchId);
  assert.equal(captured.success_url, 'https://churchopshub.com/?paid=1');
});

test('disallowed redirect origin is replaced with the canonical site URL', async () => {
  const u = uid();
  await seedUser(u, `${u}-church`, { role: 'admin' });
  let captured;
  installStripeStub({ onCheckout: (p) => { captured = p; } });
  await funcs.createCheckoutSession.run(mockCallable(u, {
    item: 'pro_annual',
    successUrl: 'https://evil.example.com/steal',
    cancelUrl: 'https://churchopshub.com/ok',
  }));
  assert.equal(captured.success_url, 'https://churchopshub.com');     // sanitized
  assert.equal(captured.cancel_url, 'https://churchopshub.com/ok');   // allowed, kept
});

test('existing stripeCustomerId is reused on the new session', async () => {
  const u = uid();
  const churchId = `${u}-church`;
  await seedUser(u, churchId, { role: 'admin' });
  await seedSub(churchId, { stripeCustomerId: 'cus_existing_42', plan: 'free' });
  let captured;
  installStripeStub({ onCheckout: (p) => { captured = p; } });
  await funcs.createCheckoutSession.run(mockCallable(u, { item: 'pro_monthly' }));
  assert.equal(captured.customer, 'cus_existing_42');
});

// ── createPortalSession ────────────────────────────────────────────────────
test('createPortalSession: non-admin → permission-denied', async () => {
  const u = uid();
  await seedUser(u, `${u}-church`, { role: 'manager' });
  installStripeStub({});
  await assert.rejects(
    () => funcs.createPortalSession.run(mockCallable(u, { returnUrl: 'https://churchopshub.com' })),
    (e) => e.code === 'permission-denied',
  );
});

test('createPortalSession: no billing account → failed-precondition', async () => {
  const u = uid();
  const churchId = `${u}-church`;
  await seedUser(u, churchId, { role: 'admin' });
  await seedSub(churchId, { plan: 'free' });               // no stripeCustomerId
  installStripeStub({});
  await assert.rejects(
    () => funcs.createPortalSession.run(mockCallable(u, { returnUrl: 'https://churchopshub.com' })),
    (e) => e.code === 'failed-precondition',
  );
});

test('createPortalSession: admin with customer → returns portal url', async () => {
  const u = uid();
  const churchId = `${u}-church`;
  await seedUser(u, churchId, { role: 'admin' });
  await seedSub(churchId, { stripeCustomerId: 'cus_portal_7', plan: 'pro' });
  let captured;
  installStripeStub({ portalUrl: 'https://stripe.test/portal/ok', onPortal: (p) => { captured = p; } });
  const out = await funcs.createPortalSession.run(mockCallable(u, { returnUrl: 'https://churchopshub.com/back' }));
  assert.equal(out.url, 'https://stripe.test/portal/ok');
  assert.equal(captured.customer, 'cus_portal_7');
  assert.equal(captured.return_url, 'https://churchopshub.com/back');
});
