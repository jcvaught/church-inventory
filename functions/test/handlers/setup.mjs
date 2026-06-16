// Shared harness for Cloud Functions *handler* integration tests (as opposed to
// the pure-logic test:unit glob and the rules-only test:rules glob). These run
// the real exported handlers from index.js against the Firebase Emulator Suite,
// with a mock callable/HTTP request and external HTTP stubbed at the boundary.
//
// Run via:  npm run test:handlers   (boots firestore+auth emulators)
//
// Conventions (mirrors Court Climber's functions suite — see the portfolio
// TESTING-IMPROVEMENT-PLAN):
//   • node --test (this repo's existing runner) — NOT vitest. The `.run(req)`
//     invocation used below is a property of the firebase-functions wrapper,
//     so the test runner is irrelevant.
//   • One shared emulator; each test seeds a UNIQUE churchId so files can run
//     without a global Firestore wipe between them.
//   • External HTTP mocked at its boundary: Brevo/Twilio/PCO/Claude all go
//     through `global.fetch` (stub that); Stripe uses its own https client and
//     a lazy `require('stripe')` inside each handler, so it is stubbed via the
//     require cache (installStripeStub) — keeping REAL signature crypto.
import Module from 'node:module';
import { getFirestore } from 'firebase-admin/firestore';

const require = Module.createRequire(import.meta.url);

// ── Env: must be set BEFORE index.js is imported ───────────────────────────
// emulators:exec sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST /
// GCLOUD_PROJECT; we backfill a project id and the secrets the handlers read
// via defineSecret().value() (which resolves from process.env at runtime).
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-coh-functions';
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_dummy';

export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// index.js calls initializeApp() at module load; importing it wires the default
// admin app to the emulator. Returns the exported functions + a db handle.
let _funcs = null;
export async function loadFunctions() {
  if (!_funcs) _funcs = await import('../../index.js');
  return _funcs;
}
export function db() {
  return getFirestore();
}

// ── Mock callable request (onCall handlers: invoke via fn.run(request)) ─────
export function mockCallable(uid, data = {}, extra = {}) {
  return {
    auth: uid ? { uid, token: { email: `${uid}@test.com`, ...(extra.token || {}) } } : null,
    data,
    rawRequest: { headers: {} },
    ...extra,
  };
}

// ── Mock Express req/res (onRequest handlers: invoke via fn(req, res)) ──────
export function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    finished: false,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; this.finished = true; return this; },
    sendStatus(c) { this.statusCode = c; this.body = String(c); this.finished = true; return this; },
    json(o) { this.body = o; this.finished = true; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    end(b) { if (b !== undefined) this.body = b; this.finished = true; return this; },
  };
}

// ── Stripe stub (real .webhooks crypto + stubbed resource methods) ─────────
const STRIPE_PATH = require.resolve('stripe');
const RealStripe = require('stripe');
const realStripeInstance = RealStripe('sk_test_signing_only');

// Build a signed webhook request body the way Stripe's CLI/library would, so
// the handler's stripe.webhooks.constructEvent() performs a REAL verification.
export function signedWebhookReq(eventObj, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(eventObj);
  const sig = realStripeInstance.webhooks.generateTestHeaderString({ payload, secret });
  return {
    method: 'POST',
    headers: { 'stripe-signature': sig, 'user-agent': 'Stripe/1.0', 'content-type': 'application/json' },
    rawBody: Buffer.from(payload),
    body: eventObj,
    ip: '127.0.0.1',
  };
}

// Replace require('stripe') for the duration of a test so the handler's lazy
// `require('stripe')(key)` returns real signature verification but stubbed API
// calls. `opts.subscription` is returned by subscriptions.retrieve(); pass a
// function to assert on the id or vary the result.
export function installStripeStub(opts = {}) {
  const factory = (_key) => ({
    webhooks: realStripeInstance.webhooks,
    subscriptions: {
      retrieve: async (id) => {
        if (typeof opts.subscription === 'function') return opts.subscription(id);
        if (!opts.subscription) throw new Error('installStripeStub: no subscription configured');
        return opts.subscription;
      },
    },
    checkout: { sessions: { create: async (p) => { opts.onCheckout?.(p); return { url: opts.checkoutUrl || 'https://stripe.test/checkout/cs_test_1' }; } } },
    billingPortal: { sessions: { create: async (p) => { opts.onPortal?.(p); return { url: opts.portalUrl || 'https://stripe.test/portal' }; } } },
  });
  require.cache[STRIPE_PATH] = { id: STRIPE_PATH, filename: STRIPE_PATH, loaded: true, exports: factory };
}
export function restoreStripe() {
  require.cache[STRIPE_PATH] = { id: STRIPE_PATH, filename: STRIPE_PATH, loaded: true, exports: RealStripe };
}

// ── global.fetch stub (Brevo/Twilio/PCO/Claude all route through fetch) ────
// Returns a controller: calls[] records every request; route by URL substring.
export function installFetchStub(router = () => ({ ok: true, status: 200, json: {} })) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options = {}) => {
    const u = typeof url === 'string' ? url : url?.url || String(url);
    calls.push({ url: u, options });
    const r = (typeof router === 'function' ? router(u, options) : router) || {};
    const status = r.status || (r.ok === false ? 500 : 200);
    return {
      ok: r.ok !== undefined ? r.ok : status < 400,
      status,
      json: async () => r.json || {},
      text: async () => (typeof r.text === 'string' ? r.text : JSON.stringify(r.json || {})),
    };
  };
  return { calls, restore() { global.fetch = original; } };
}

// Delete a church + its config subcollection between tests that reuse an id.
export async function purgeChurch(churchId) {
  await getFirestore().recursiveDelete(getFirestore().doc(`churches/${churchId}`));
}
