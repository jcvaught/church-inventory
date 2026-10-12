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

// ── Recipient fallback (Sentry JAVASCRIPT-REACT-1H, 2026-10-12) ───────────────
// The creator's Auth account can be deleted (abandoned signup). Trial emails then
// fall back to the church's active admins; with nobody to email it is a warning.
const recipientsOf = (call) => {
  const b = typeof call.options?.body === 'string' ? JSON.parse(call.options.body) : call.options?.body;
  return (b?.to || []).map((x) => x.email);
};
const emailedTo = (email) => brevoCalls().filter((c) => recipientsOf(c).includes(email));

async function deleteCreator(churchId) {
  await getAuth().deleteUser(`${churchId}-uid`);
}
async function seedUser(churchId, key, fields) {
  await db().doc(`users/${churchId}-${key}`).set({ churchId, ...fields });
}

test('creator deleted from Auth — only the active admin is emailed (trial ended)', async () => {
  const churchId = 'trial-fb-admins-church';
  await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });
  await deleteCreator(churchId);
  await seedUser(churchId, 'a1', { role: 'admin', active: true, email: 'fb-admins-active@test.com', name: 'Active Admin' });
  await seedUser(churchId, 'a2', { role: 'admin', active: false, email: 'fb-admins-inactive@test.com', name: 'Gone Admin' });
  await seedUser(churchId, 'm1', { role: 'user', active: true, email: 'fb-admins-member@test.com', name: 'Member' });

  await funcs.processTrialExpirations.run();

  assert.equal(emailedTo('fb-admins-active@test.com').length, 1, 'active admin emailed');
  assert.equal(emailedTo('fb-admins-inactive@test.com').length, 0, 'inactive admin not emailed');
  assert.equal(emailedTo('fb-admins-member@test.com').length, 0, 'non-admin not emailed');
});

test('church doc has no createdBy — the active admin is emailed', async () => {
  const churchId = 'trial-fb-nocreator-church';
  await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });
  await db().doc(`churches/${churchId}`).set({ name: 'Trial Church' });
  await seedUser(churchId, 'a1', { role: 'admin', email: 'fb-nocreator-admin@test.com', name: 'Solo Admin' });

  await funcs.processTrialExpirations.run();

  assert.equal(emailedTo('fb-nocreator-admin@test.com').length, 1, 'admin emailed');
});

test('creator deleted and no users (the 2026-10-12 case) — resolves, flips, warns, emails no one', async (t) => {
  const churchId = 'trial-fb-none-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });
  await deleteCreator(churchId);
  const warn = t.mock.method(console, 'warn');

  await funcs.processTrialExpirations.run();

  const sub = (await subRef.get()).data();
  assert.notEqual(sub.status, 'trialing', 'still flipped out of trialing');
  assert.ok(sub.trialExpiredAt, 'stamped');
  assert.equal(emailedTo(`${churchId}-uid@test.com`).length, 0, 'no email to the deleted creator');
  assert.ok(
    warn.mock.calls.some((c) => c.arguments[0] === 'processTrialExpirations: no admin to email' && c.arguments[1]?.churchId === churchId),
    'console.warn called with the no-admin message',
  );
});

test('7-day warning — creator deleted + active admin: admin warned and stamped', async () => {
  const churchId = 'trial-fb-warn-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(7) });
  await deleteCreator(churchId);
  await seedUser(churchId, 'a1', { role: 'admin', email: 'fb-warn-admin@test.com', name: 'Warn Admin' });

  await funcs.processTrialExpirations.run();

  const calls = emailedTo('fb-warn-admin@test.com');
  assert.equal(calls.length, 1, 'admin got the warning');
  assert.ok(/7 days/i.test(bodyOf(calls[0])), 'is the 7-day warning');
  assert.ok((await subRef.get()).data().trialWarningEmailSentAt, 'stamped');
});

test('7-day warning — creator deleted + no admin: nobody emailed, no stamp', async () => {
  const churchId = 'trial-fb-warn-none-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(7) });
  await deleteCreator(churchId);

  await funcs.processTrialExpirations.run();

  assert.equal(emailedTo(`${churchId}-uid@test.com`).length, 0, 'no email');
  assert.equal((await subRef.get()).data().trialWarningEmailSentAt, undefined, 'not stamped');
});

test('7-day warning — only recipient is suppressed: nothing delivered, no stamp', async () => {
  const churchId = 'trial-fb-warn-suppressed-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(7) });
  await deleteCreator(churchId);
  await seedUser(churchId, 'a1', { role: 'admin', email: 'fb-warn-suppressed@test.com', name: 'Muted Admin' });
  await db().doc(`emailSuppressions/${encodeURIComponent('fb-warn-suppressed@test.com')}`).set({ active: true });

  await funcs.processTrialExpirations.run();

  assert.equal(emailedTo('fb-warn-suppressed@test.com').length, 0, 'suppressed address not sent to');
  assert.equal((await subRef.get()).data().trialWarningEmailSentAt, undefined, 'a suppressed skip is not a send');
});

test('a non-user-not-found Auth error is reported and does not stop other churches', async (t) => {
  const badId = 'trial-fb-autherr-church';
  const okId = 'trial-fb-autherr-ok-church';
  await seedTrialChurch(badId, { trialEndsAt: daysFromNow(-1) });
  await seedTrialChurch(okId, { trialEndsAt: daysFromNow(-1) });
  const auth = getAuth();
  const realGetUser = auth.getUser.bind(auth);
  t.mock.method(Object.getPrototypeOf(auth), 'getUser', async function (uid) {
    if (uid === `${badId}-uid`) { const e = new Error('boom'); e.code = 'auth/internal-error'; throw e; }
    return realGetUser(uid);
  });
  const err = t.mock.method(console, 'error');

  await funcs.processTrialExpirations.run();

  assert.ok(
    err.mock.calls.some((c) => c.arguments[0] === 'processTrialExpirations: could not fetch admin' && c.arguments[1]?.churchId === badId),
    'reported as an error, not a warning',
  );
  assert.equal(emailedTo(`${badId}-uid@test.com`).length, 0, 'no email for the errored church');
  assert.equal(emailedTo(`${okId}-uid@test.com`).length, 1, 'the other church is still emailed');
});

test('txn backs off (a webhook moved the church on after the prefetch) — no trial-ended email', async (t) => {
  const churchId = 'trial-fb-race-church';
  const subRef = await seedTrialChurch(churchId, { trialEndsAt: daysFromNow(-1) });
  // Simulate the Stripe webhook winning the race: flip status between the
  // outer collectionGroup prefetch and the transaction's fresh read.
  const fs = db();
  const realRun = fs.runTransaction.bind(fs);
  t.mock.method(Object.getPrototypeOf(fs), 'runTransaction', async function (fn, ...rest) {
    await subRef.update({ status: 'active', plan: 'flat' });
    return realRun(fn, ...rest);
  });

  await funcs.processTrialExpirations.run();

  assert.equal(emailedTo(`${churchId}-uid@test.com`).length, 0, 'not emailed after a paid upgrade');
  assert.equal((await subRef.get()).data().trialExpiredAt, undefined, 'not stamped by the cron');
});
