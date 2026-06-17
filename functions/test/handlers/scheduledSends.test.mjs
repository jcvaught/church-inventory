// COH P1 — sendJobReminders scheduled-send tests (emulator-backed).
// Previously untestable: the handler gates on the church's LOCAL 8am via
// localPartsFor(new Date()) with no injection point. functions/index.js now
// routes localPartsFor + utcYmdOffset through an injectable clock (test hooks
// _setClock/_resetClock), so we can pin "now" to a church's local 8am and
// assert deterministic recipient selection + the per-channel idempotency stamp.
//
// Run via:  npm run test:handlers
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, installFetchStub } from './setup.mjs';

// emailConfigured() reads this at call time; set before any send.
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

let funcs;
before(async () => { funcs = await loadFunctions(); });
after(() => { funcs._resetClock(); });

// A timestamp that is 08:00 in UTC — paired with a church whose configured
// timeZone is 'UTC', this makes localPartsFor(...).hour === 8 deterministically
// (DST-proof, unlike picking a Central wall-clock instant).
const AT_8AM_UTC = new Date('2026-06-17T08:00:00Z');
const AT_10AM_UTC = new Date('2026-06-17T10:00:00Z');
const TODAY = '2026-06-17';

let fetchStub;
beforeEach(() => { fetchStub = installFetchStub(); });
afterEach(() => { fetchStub.restore(); funcs._resetClock(); });

const brevoCalls = () => fetchStub.calls.filter((c) => /brevo|smtp\/email/.test(c.url));

// Seed an open job today + one signed-up member at a UTC-timezone church with
// the Jobs Hub active. Returns the job ref path.
async function seedJob(churchId, { scheduledDate = TODAY, signupUid = 'volA' } = {}) {
  const d = db();
  await d.doc(`churches/${churchId}/config/settings`).set({ timeZone: 'UTC' });
  await d.doc(`churches/${churchId}/config/subscription`).set({ grandfathered: true });
  await d.doc(`users/${signupUid}`).set({
    email: `${signupUid}@test.com`, name: 'Vol A', churchId, role: 'user', active: true,
  });
  const jobRef = d.doc(`churches/${churchId}/jobListings/job1`);
  await jobRef.set({ title: 'Set up chairs', status: 'open', scheduledDate, spotsTotal: 3, signupCount: 1 });
  await jobRef.collection('signups').doc(signupUid).set({ uid: signupUid, name: 'Vol A' });
  return jobRef;
}

test('emails a signed-up volunteer at the church-local 8am + stamps the job', async () => {
  const churchId = 'sched-A-church';
  const jobRef = await seedJob(churchId);
  funcs._setClock(() => AT_8AM_UTC);

  await funcs.sendJobReminders.run();

  assert.equal(brevoCalls().length, 1, 'one reminder email sent');
  const job = (await jobRef.get()).data();
  assert.equal(job.lastReminderSentDate, TODAY, 'job stamped with church-local today');
});

test('is idempotent — a second run at the same time sends nothing', async () => {
  const churchId = 'sched-B-church';
  await seedJob(churchId);
  funcs._setClock(() => AT_8AM_UTC);

  await funcs.sendJobReminders.run(); // first run stamps
  const after1 = brevoCalls().length;
  await funcs.sendJobReminders.run(); // second run: already email-stamped today
  assert.equal(brevoCalls().length, after1, 'no additional email on the second run');
});

test('does NOT send when the church is not at its local 8am', async () => {
  const churchId = 'sched-C-church';
  const jobRef = await seedJob(churchId);
  funcs._setClock(() => AT_10AM_UTC); // 10am local → hour gate fails

  await funcs.sendJobReminders.run();

  assert.equal(brevoCalls().length, 0, 'no email outside the 8am window');
  const job = (await jobRef.get()).data();
  assert.equal(job.lastReminderSentDate, undefined, 'job left unstamped');
});

test('does NOT send for a job scheduled on a different day', async () => {
  const churchId = 'sched-D-church';
  await seedJob(churchId, { scheduledDate: '2026-06-18' }); // tomorrow
  funcs._setClock(() => AT_8AM_UTC);

  await funcs.sendJobReminders.run();

  assert.equal(brevoCalls().length, 0, 'no email for a non-today job');
});
