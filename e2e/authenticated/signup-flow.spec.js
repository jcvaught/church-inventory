// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJobSignups, seedSignup, uids, daysFromNowStr, e2eTitle } from '../admin-helpers.js';

// §3 of docs/TEST-JOBS-HUB-2026-05-07.md — Member signup happy path.
// Roster lives in the signups subcollection (audit H1, 2026-05-22): seed via
// seedSignup(), assert via getJobSignups().
//
// Covers:
//   - Member sees the Job Board and opens a job detail
//   - Sign Up writes a signups/{uid} doc with the right shape
//   - Double sign-up is blocked (UI shows "Withdraw" instead of "Sign Up")
//   - Withdraw via UI removes the signup doc

test.describe('§3 Member signup happy path', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  async function openJobDetail(page, jobTitle) {
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + jobTitle).first().click();
  }

  test('Member can sign up for a no-compliance, no-waiver job', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Happy Path Signup'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await openJobDetail(memberAPage, job.title);
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^sign up$/i }).click();

    // Poll the signups subcollection for the signup landing
    await expect.poll(async () => (await getJobSignups(job.docId)).length, { timeout: 15_000 }).toBe(1);

    const signups = await getJobSignups(job.docId);
    expect(signups[0].uid).toBe(u.memberA);
    expect(signups[0].signedUpAt).toBeTruthy();
    expect(signups[0].name).toBeTruthy();
  });

  test('Once signed up, the dialog shows Withdraw instead of Sign Up', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Double Signup Block'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Pre-seed Member A as signed up
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });

    await openJobDetail(memberAPage, job.title);
    // The "Sign Up" button should no longer be visible to Member A;
    // a "Withdraw" button should be there instead.
    const dialog = memberAPage.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /^withdraw$/i })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: /^sign up$/i })).toHaveCount(0);
  });

  test('Member can withdraw their own signup', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Self Withdraw'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });

    await openJobDetail(memberAPage, job.title);
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^withdraw$/i }).click();

    await expect.poll(async () => (await getJobSignups(job.docId)).length, { timeout: 15_000 }).toBe(0);
  });
});
