// @ts-check
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, churchId, uids } from '../admin-helpers.js';

// SMS smoke test — gated behind E2E_RUN_SMS=1 so it doesn't fire by default.
//
// Verifies the full sendJobReminders → Twilio path:
//   1. Setup: add the SMS-target uid to today's signups on a real open job
//   2. Trigger: run the Cloud Scheduler job that drives sendJobReminders
//   3. Wait for Twilio Messages API to show a fresh send to the target phone
//   4. Assert delivery (status sent/delivered/queued) or surface the specific
//      Twilio error code so future regressions don't slip past silently.
//
// A2P 10DLC campaign CYO5934 is VERIFIED (2026-05-22) and sendJobReminders
// sends via the registered Messaging Service, so the test expects a delivered
// status. error_code is still surfaced loudly so a future regression (carrier
// filtering, STOP-list 21610, etc.) fails informatively.
//
// SMS test user: e2e-member-b@churchopshub.com carries phone +1 412-266-5015
// + smsRemindersEnabled (set 2026-05-22) — it is the default target below.
//
// Run with:
//   E2E_RUN_SMS=1 \
//   E2E_SMS_JOB_NUMBER=JOB-001 \
//   E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com \
//   npm run test:e2e -- sms

const SMS_ENABLED = process.env.E2E_RUN_SMS === '1';
const TARGET_EMAIL = process.env.E2E_SMS_TARGET_EMAIL || 'e2e-member-b@churchopshub.com';
const TARGET_JOB_NUMBER = process.env.E2E_SMS_JOB_NUMBER || 'JOB-001';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTwilioCreds() {
  // functions/.env stores TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN. Parse it
  // without depending on dotenv (which isn't a devDep at the repo root).
  const envPath = pathResolve(__dirname, '..', '..', 'functions', '.env');
  const text = readFileSync(envPath, 'utf8');
  const grab = (k) => (text.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')) || [])[1]?.trim();
  return { sid: grab('TWILIO_ACCOUNT_SID'), token: grab('TWILIO_AUTH_TOKEN') };
}

async function fetchLatestTwilioMessage(toPhone) {
  const { sid, token } = loadTwilioCreds();
  if (!sid || !token) throw new Error('Twilio credentials not found in functions/.env');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?To=${encodeURIComponent(toPhone)}&PageSize=1`;
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`Twilio API ${res.status}`);
  const data = await res.json();
  return data.messages?.[0] || null;
}

test.describe('SMS smoke test (gated behind E2E_RUN_SMS=1)', () => {
  test.skip(!SMS_ENABLED, 'Set E2E_RUN_SMS=1 to enable SMS tests (sends a real SMS via Twilio)');

  test('sendJobReminders cron delivers SMS to opted-in user', async () => {
    // 1. Look up the target user (must have phone + smsRemindersEnabled in their user doc)
    const admin = await import('firebase-admin');
    const targetUser = await admin.default.auth().getUserByEmail(TARGET_EMAIL);
    const userDoc = await db().doc(`users/${targetUser.uid}`).get();
    const userData = userDoc.data();
    expect(userData.phone, `${TARGET_EMAIL} must have a phone set`).toBeTruthy();
    expect(userData.smsRemindersEnabled, `${TARGET_EMAIL} must have SMS opted in`).toBe(true);
    const targetPhone = userData.phone;

    // 2. Find the target job (must be open + scheduled for today in Central time)
    const jobsSnap = await db().collection(`churches/${churchId()}/jobListings`).where('jobNumber', '==', TARGET_JOB_NUMBER).limit(1).get();
    expect(jobsSnap.empty, `${TARGET_JOB_NUMBER} not found`).toBeFalsy();
    const jobRef = jobsSnap.docs[0].ref;
    const job = jobsSnap.docs[0].data();
    const todayCentral = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const todayStr = `${todayCentral.getFullYear()}-${String(todayCentral.getMonth()+1).padStart(2,'0')}-${String(todayCentral.getDate()).padStart(2,'0')}`;
    expect(job.scheduledDate, `${TARGET_JOB_NUMBER} must be scheduled for today (${todayStr})`).toBe(todayStr);
    expect(job.status, `${TARGET_JOB_NUMBER} must be open`).toBe('open');

    // 3. Record the latest pre-existing message to this phone (for change detection)
    const beforeMsg = await fetchLatestTwilioMessage(targetPhone);
    const beforeSid = beforeMsg?.sid;

    // 4. Add the target user to signups + clear any prior reminder stamp
    await jobRef.update({
      signups: admin.default.firestore.FieldValue.arrayUnion({
        uid: targetUser.uid,
        name: userData.name || 'SMS Test',
        signedUpAt: new Date().toISOString(),
      }),
      lastReminderSentDate: admin.default.firestore.FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });

    try {
      // 5. Trigger the cron via gcloud scheduler
      execSync(
        'gcloud scheduler jobs run firebase-schedule-sendJobReminders-us-central1 ' +
        '--location=us-central1 --project=church-inventory-9615c',
        { stdio: 'pipe' }
      );

      // 6. Poll Twilio Messages API for a NEW message to the target phone.
      let newMsg = null;
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const latest = await fetchLatestTwilioMessage(targetPhone);
        if (latest && latest.sid !== beforeSid) { newMsg = latest; break; }
        await new Promise(r => setTimeout(r, 3_000));
      }

      expect(newMsg, 'sendJobReminders did not produce a new Twilio message within 60s').toBeTruthy();
      expect(newMsg.body, 'SMS body should reference the job title').toContain(job.title);

      // 7. Status assertion. After A2P 10DLC approval + Messaging Service
      //    migration, this should be 'sent', 'queued', or 'delivered'. While
      //    A2P is still pending, the message will be 'undelivered' with
      //    error 30034 — log it loudly so the failure is informative.
      const okStatuses = ['queued', 'sent', 'delivered', 'accepted'];
      if (!okStatuses.includes(newMsg.status)) {
        console.error(`SMS not delivered: status=${newMsg.status} error_code=${newMsg.error_code} sid=${newMsg.sid}`);
      }
      expect(okStatuses, `Twilio status=${newMsg.status} error=${newMsg.error_code} — A2P 10DLC likely pending`).toContain(newMsg.status);
    } finally {
      // 8. Cleanup — remove our test signup + reminder stamp
      const fresh = await jobRef.get();
      const signups = (fresh.data().signups || []).filter(s => s.uid !== targetUser.uid);
      await jobRef.update({
        signups,
        lastReminderSentDate: admin.default.firestore.FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      });
    }
  });
});
