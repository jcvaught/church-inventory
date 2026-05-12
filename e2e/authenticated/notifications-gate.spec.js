// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJob, setNotifications, uids, daysFromNowStr, e2eTitle, db, churchId } from '../admin-helpers.js';

// §10 of docs/TEST-JOBS-HUB-2026-05-07.md — Notifications spot-check.
// Verifies the church-wide notifications toggle gates outbound emails.
// We assert this at the side-effect layer rather than reading inboxes:
// when sendJobPosterNotification fires successfully it writes
// lastPosterNotifiedByActors[actorUid] inside the F-fix-15 transaction.
// If the notif gate stops the CF early (F-14 / F-fix-16), that field
// is NEVER touched. So the field's presence/absence after a withdrawal
// is a precise proxy for whether the email send was gated.

test.describe('§10 Notifications gate', () => {
  test.beforeAll(async () => { await setNotifications(true); });
  test.afterEach(async () => { await purgeE2EArtifacts(); });
  test.afterAll(async () => { await setNotifications(true); });

  test('Notifications OFF: withdrawal does not invoke poster notification', async ({ memberAPage }) => {
    await setNotifications(false);
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Notif-OFF ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const now = new Date().toISOString();
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      signups: [{ uid: u.memberA, name: 'Member A Test', signedUpAt: now }],
      updatedAt: now,
    });

    // Member A withdraws via UI
    await memberAPage.goto('/');
    await memberAPage.getByRole('button', { name: /^hubs$/i }).first().click();
    await memberAPage.locator('text=Job Hub').first().click();
    await memberAPage.getByRole('button').filter({ hasText: job.title }).first().click();
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^withdraw$/i }).click();

    // Wait for the withdrawal transaction to commit
    await expect.poll(async () => (await getJob(job.docId)).signups.length, { timeout: 15_000 }).toBe(0);

    // Give the CF call ~6s to attempt — it should bail before the F-15 stamp
    await memberAPage.waitForTimeout(6_000);
    const final = await getJob(job.docId);
    expect(final.lastPosterNotifiedByActors, 'CF should NOT have stamped (notif OFF)').toBeFalsy();
  });

  test('Notifications ON: withdrawal invokes poster notification', async ({ memberAPage }) => {
    await setNotifications(true);
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Notif-ON ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const now = new Date().toISOString();
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      signups: [{ uid: u.memberA, name: 'Member A Test', signedUpAt: now }],
      updatedAt: now,
    });

    await memberAPage.goto('/');
    await memberAPage.getByRole('button', { name: /^hubs$/i }).first().click();
    await memberAPage.locator('text=Job Hub').first().click();
    await memberAPage.getByRole('button').filter({ hasText: job.title }).first().click();
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^withdraw$/i }).click();

    // The F-15 transaction stamps lastPosterNotifiedByActors[memberA] BEFORE
    // the SendGrid call, so we don't have to wait for email delivery.
    await expect.poll(async () => {
      const j = await getJob(job.docId);
      return j.lastPosterNotifiedByActors?.[u.memberA];
    }, { timeout: 30_000 }).toBeTruthy();
  });
});
