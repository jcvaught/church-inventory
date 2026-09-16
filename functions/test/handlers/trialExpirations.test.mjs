// COH-012 A.3 — processTrialExpirations tests (emulator-backed).
//
// This function had NO tests while it emailed real strangers and mutated their
// subscription documents. It shipped a claim that was never true ("your two
// most-used hubs stay free" — it actually returned the alphabetically-first two
// on an all-zero count) for months, and nothing would have caught it.
//
// These tests pin the A.3 behavior: the trial flips out of `trialing` exactly
// once, both emails are model-neutral, and NOTHING names a price or a hub —
// because the flat plan's Stripe prices do not exist yet.
//
// Run via:  npm run test:handlers
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAuth } from 'firebase-admin/auth';
import { loadFunctions, db, installFetchStub } from './setup.mjs';

process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let fetchStub;
beforeEach(() => { fetchStub = installFetchStub(); });
afterEach(() => { fetchStub.restore(); });

const brevoCalls = () => fetchStub.calls.filter((c) => /brevo|smtp\/email/.test(c.url));
const bodyOf = (call) => {
  const b = typeof call.options?.body === 'string' ? JSON.parse(call.options.body) : call.options?.body;
  return `${b?.subject || ''}\n${b?.htmlContent || ''}\n${b?.textContent || ''}`;
};

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

// A church whose creator resolves to an admin email. getAuth().getUser is real
// against the auth emulator, so seed the user there via the same path the other
// handler tests use.
async function seedTrialChurch(churchId, { trialEndsAt, extra = {} } = {}) {
  const d = db();
  // The handler resolves the recipient via getAuth().getUser(church.createdBy),
  // so the Auth record must exist or the send is skipped silently — which is
  // exactly how the first run of these tests failed.
  const uid = `${churchId}-uid`;
  await getAuth().createUser({ uid, email: `${uid}@test.com`, displayName: 'Pat Admin' })
    .catch((e) => { if (e.code !== 'auth/uid-already-exists') throw e; });
  await d.doc(`churches/${churchId}`).set({ name: 'Trial Church', createdBy: uid });
  await d.doc(`churches/${churchId}/config/subscription`).set({
    plan: 'free',
    status: 'trialing',
    grandfathered: false,
    hubs: [],
    trialStartedAt: daysFromNow(-90),
    trialEndsAt,
    freeHubsSelected: null,
    ...extra,
  });
  return d.doc(`churches/${churchId}/config/subscription`);
}

test('an expired trial flips out of trialing and is stamped', async () => {
  const churchId = 'trial-expired-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });

  await funcs.processTrialExpirations.run();

  const sub = (await subRef.get()).data();
  assert.notEqual(sub.status, 'trialing', 'no longer trialing');
  assert.ok(sub.trialExpiredAt, 'stamped with when the trial was processed');
});

test('the auto-selection is gone — freeHubsSelected is never written', async () => {
  const churchId = 'trial-nohubs-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });

  await funcs.processTrialExpirations.run();

  const sub = (await subRef.get()).data();
  assert.equal(sub.freeHubsSelected, null, 'left null — no hubs are granted at expiry');
  assert.deepEqual(sub.hubs, [], 'no hubs array written either');
});

test('the expiry email names no hub and no price', async () => {
  const churchId = 'trial-email-church';
  await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });

  await funcs.processTrialExpirations.run();

  const calls = brevoCalls();
  assert.equal(calls.length, 1, 'exactly one expiry email');
  const body = bodyOf(calls[0]);
  // The claim that was never true.
  assert.ok(!/most-used/i.test(body), 'no "most-used hubs" claim');
  assert.ok(!/free forever/i.test(body), 'nothing promised free forever');
  // A.3 deploys functions only; checkout still charges the OLD prices, so the
  // email must not advertise a product that cannot be purchased.
  assert.ok(!/\$\d/.test(body), 'no price named');
  // What it must say.
  assert.ok(/nothing was deleted/i.test(body), 'reassures that data is intact');
});

test('a trial that has NOT expired is left alone', async () => {
  const churchId = 'trial-active-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(30) });

  await funcs.processTrialExpirations.run();

  assert.equal((await subRef.get()).data().status, 'trialing', 'still trialing');
  assert.equal(brevoCalls().length, 0, 'no expiry email');
});

test('is idempotent — a second run sends nothing and rewrites nothing', async () => {
  const churchId = 'trial-idempotent-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });

  await funcs.processTrialExpirations.run();
  const firstStamp = (await subRef.get()).data().trialExpiredAt;
  fetchStub.restore();
  fetchStub = installFetchStub();

  await funcs.processTrialExpirations.run();

  assert.equal(brevoCalls().length, 0, 'no second email');
  assert.equal((await subRef.get()).data().trialExpiredAt, firstStamp, 'stamp unchanged');
});

test('the 7-day warning names no hub and no price, and stamps once', async () => {
  const churchId = 'trial-warn-church';
  // The warning pass matches on the trial ending exactly 7 days from now.
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(7) });

  await funcs.processTrialExpirations.run();

  const calls = brevoCalls();
  assert.equal(calls.length, 1, 'exactly one warning email');
  const body = bodyOf(calls[0]);
  assert.ok(/7 days/i.test(body), 'is the 7-day warning');
  assert.ok(!/most-used/i.test(body), 'no "most-used hubs" claim');
  assert.ok(!/\$\d/.test(body), 'no price named');
  assert.ok((await subRef.get()).data().trialWarningEmailSentAt, 'stamped');
});

test('a church already warned is not warned again', async () => {
  const churchId = 'trial-warned-church';
  await seedTrialChurch(churchId, {
    trialEndsAt: daysFromNow(7),
    extra: { trialWarningEmailSentAt: daysFromNow(-1) },
  });

  await funcs.processTrialExpirations.run();

  assert.equal(brevoCalls().length, 0, 'no duplicate warning');
});
