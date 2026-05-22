// @ts-check
import { test, expect } from '@playwright/test';
import { db } from '../admin-helpers.js';
import { postSignedTwilioInbound } from '../sms-helpers.js';

// M6 — recycled/family-shared phone safety: twilioInbound's START re-opt-in
// must require a pre-existing `smsConsentAt` stamp. If a new owner of a
// recycled number texts START, we must NOT silently turn on reminders for
// whoever the number used to belong to.
//
// Gated behind E2E_RUN_UAT_SMS=1 — these tests hit the LIVE twilioInbound
// Cloud Function, which writes to `smsOptOuts` (audit log) and toggles
// `users/{uid}.smsRemindersEnabled` on docs matching the phone. Cleanup
// deletes the synthetic users we create.

const RUN = process.env.E2E_RUN_UAT_SMS === '1';
test.describe(RUN ? 'UAT — M6 SMS STOP/START via twilioInbound' : 'UAT — M6 SMS (skipped; set E2E_RUN_UAT_SMS=1)', () => {
  test.skip(!RUN, 'Set E2E_RUN_UAT_SMS=1 to run — hits live twilioInbound.');

  // Synthetic phones in the unallocated +1 555 555 01xx test range (NANP
  // reserved). Two distinct numbers so the three tests don't collide.
  const OPTED_IN_PHONE = '+15555550101';
  const NEVER_PHONE    = '+15555550102';

  /** @type {string[]} */
  const createdUserDocIds = [];

  test.beforeAll(async () => {
    // Clear any leftover state from a previous failed run (idempotent).
    for (const phone of [OPTED_IN_PHONE, NEVER_PHONE]) {
      const snap = await db().collection('users').where('phone', '==', phone).get();
      for (const d of snap.docs) await d.ref.delete();
    }
  });

  test.afterAll(async () => {
    for (const id of createdUserDocIds) {
      await db().doc(`users/${id}`).delete().catch(() => {});
    }
    // Defense in depth: drop anything left on those phone numbers.
    for (const phone of [OPTED_IN_PHONE, NEVER_PHONE]) {
      const snap = await db().collection('users').where('phone', '==', phone).get();
      for (const d of snap.docs) await d.ref.delete().catch(() => {});
    }
  });

  async function seedUser({ phone, smsConsentAt, smsRemindersEnabled }) {
    const id = `e2e-uat-sms-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    const data = {
      // Mark with a recognizable email so a stray doc is debuggable.
      email: `${id}@e2e-uat.invalid`,
      name: '[E2E] UAT SMS Tester',
      phone,
      smsRemindersEnabled: !!smsRemindersEnabled,
    };
    if (smsConsentAt) data.smsConsentAt = smsConsentAt;
    await db().doc(`users/${id}`).set(data);
    createdUserDocIds.push(id);
    return id;
  }

  // ── STOP suppresses a previously opted-in user ──
  test('M6 — STOP flips smsRemindersEnabled to false on a phone with consent', async () => {
    const id = await seedUser({
      phone: OPTED_IN_PHONE,
      smsConsentAt: new Date().toISOString(),
      smsRemindersEnabled: true,
    });

    const res = await postSignedTwilioInbound({ From: OPTED_IN_PHONE, Body: 'STOP' });
    expect(res.status, `twilioInbound rejected our signed request: ${res.body}`).toBe(200);

    await expect.poll(async () => {
      const snap = await db().doc(`users/${id}`).get();
      return snap.data()?.smsRemindersEnabled;
    }, { timeout: 15_000 }).toBe(false);
  });

  // ── START re-opts a previously-consented user back in ──
  test('M6 — START flips smsRemindersEnabled back to true when smsConsentAt exists', async () => {
    // Reuse the STOP-suppressed doc — it still has smsConsentAt set.
    const snap = await db().collection('users').where('phone', '==', OPTED_IN_PHONE).get();
    expect(snap.size, 'expected the previously-suppressed test user').toBeGreaterThan(0);
    const docId = snap.docs[0].id;

    const res = await postSignedTwilioInbound({ From: OPTED_IN_PHONE, Body: 'START' });
    expect(res.status).toBe(200);

    await expect.poll(async () => {
      const snap2 = await db().doc(`users/${docId}`).get();
      return snap2.data()?.smsRemindersEnabled;
    }, { timeout: 15_000 }).toBe(true);
  });

  // ── M6 critical safety: START on a never-opted-in number must NOT
  //    enable reminders (the recycled-phone protection) ──
  test('M6 — START on a phone with NO smsConsentAt does NOT enable reminders', async () => {
    const id = await seedUser({
      phone: NEVER_PHONE,
      smsConsentAt: null, // ← the gate
      smsRemindersEnabled: false,
    });

    const res = await postSignedTwilioInbound({ From: NEVER_PHONE, Body: 'START' });
    expect(res.status).toBe(200);

    // Give the function a beat to do its thing; then assert the flag is
    // still false. Poll across a few seconds — eventual-consistency safety.
    await new Promise(r => setTimeout(r, 3000));
    const snap = await db().doc(`users/${id}`).get();
    expect(snap.data()?.smsRemindersEnabled).toBe(false);
    // smsConsentAt must NOT have been backfilled by the START.
    expect(snap.data()?.smsConsentAt).toBeFalsy();
  });
});
