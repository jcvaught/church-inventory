// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJob, getJobSignups, seedSignup, setNotifications, uids, daysFromNowStr, e2eTitle } from '../admin-helpers.js';

// §10 of docs/TEST-JOBS-HUB-2026-05-07.md — Notifications spot-check.
//
// Two things being verified at the side-effect layer:
//   A) The church-wide notifications toggle gates the email path for
//      admin_removal and cancellation events. (sendJobPosterNotification stamps
//      lastPosterNotifiedByActors[actorUid] inside the F-fix-15 transaction
//      BEFORE the SendGrid send, so the field is a precise proxy for whether
//      the CF reached the email path.)
//   B) Withdrawal events never reach the email path regardless of the notif
//      toggle. (Email send for `event === 'withdrawal'` was permanently
//      disabled 2026-05-13 to trim SendGrid volume; the in-app activityLog
//      entry is the only channel.)
//
// Roster lives in the signups subcollection (audit H1, 2026-05-22): seed via
// seedSignup(), assert via getJobSignups(). The lastPosterNotifiedByActors
// stamp remains a parent-doc field, read via getJob().

test.describe('§10 Notifications gate', () => {
  test.beforeAll(async () => { await setNotifications(true); });
  test.afterEach(async () => { await purgeE2EArtifacts(); });
  test.afterAll(async () => { await setNotifications(true); });

  test('Notifications OFF: admin removal does not invoke poster notification', async ({ page }) => {
    await setNotifications(false);
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Notif-OFF Remove ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + job.title).first().click();
    page.once('dialog', dialog => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: /Remove Member A Test/ }).click();

    // Wait for the admin-remove transaction to commit
    await expect.poll(async () => (await getJobSignups(job.docId)).length, { timeout: 15_000 }).toBe(0);

    // Give the CF call ~6s to attempt — should bail before the F-15 stamp
    await page.waitForTimeout(6_000);
    const final = await getJob(job.docId);
    expect(final.lastPosterNotifiedByActors, 'CF should NOT have stamped (notif OFF)').toBeFalsy();
  });

  test('Notifications ON: admin removal invokes poster notification', async ({ page }) => {
    await setNotifications(true);
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Notif-ON Remove ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      // Important: poster ≠ actor so the self-skip path doesn't fire.
      createdBy: u.memberB, createdByName: 'E2E Member B',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + job.title).first().click();
    page.once('dialog', dialog => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: /Remove Member A Test/ }).click();

    // The F-fix-15 transaction stamps lastPosterNotifiedByActors[adminUid]
    // BEFORE the SendGrid call, so we don't wait for email delivery.
    await expect.poll(async () => {
      const j = await getJob(job.docId);
      return j.lastPosterNotifiedByActors?.[u.admin];
    }, { timeout: 30_000 }).toBeTruthy();
  });

  test('Withdrawal never invokes poster notification (regression guard for 2026-05-13 email trim)', async ({ memberAPage }) => {
    await setNotifications(true);
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Withdraw-Silent ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });

    await memberAPage.goto('/');
    await memberAPage.getByRole('button', { name: /^hubs$/i }).first().click();
    await memberAPage.locator('text=Job Hub').first().click();
    await memberAPage.getByRole('button').filter({ hasText: job.title }).first().click();
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^withdraw$/i }).click();

    await expect.poll(async () => (await getJobSignups(job.docId)).length, { timeout: 15_000 }).toBe(0);

    // Wait long enough for the CF to have processed if it were going to —
    // then assert the stamp is still absent (withdrawal path is permanently
    // disabled).
    await memberAPage.waitForTimeout(8_000);
    const final = await getJob(job.docId);
    expect(
      final.lastPosterNotifiedByActors,
      'Withdrawal email is permanently disabled (2026-05-13); the stamp should never appear'
    ).toBeFalsy();
  });
});
