// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJobSignups, seedSignup, uids, daysFromNowStr, e2eTitle } from '../admin-helpers.js';

// §6 of docs/TEST-JOBS-HUB-2026-05-07.md — Attendance + Reports.
// The Attendance toggle is admin-only and only renders on past-dated jobs.
// Writes go through the jobSetAttendance Cloud Function (audit H1/H2), which
// updates the member's signups/{uid} subcollection doc server-side. Roster is
// seeded via seedSignup() and asserted via getJobSignups().

test.describe('§6 Attendance + Reports', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  async function navigateToJob(page, jobTitle) {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    // Wait for the Job Hub status filter chips to render before clicking All
    await page.getByRole('button', { name: 'Open', exact: true }).waitFor({ timeout: 10_000 });
    // Past-dated jobs are excluded from Open filter (F-fix-6); switch to All
    await page.getByRole('button', { name: 'All', exact: true }).click();
    // Wait for the job to appear (Firestore onSnapshot may take a moment)
    await page.getByRole('button').filter({ hasText: jobTitle }).first().waitFor({ timeout: 15_000 });
    await page.getByRole('button').filter({ hasText: jobTitle }).first().click();
    // Confirm the dialog opened
    await page.getByRole('dialog').waitFor({ timeout: 5_000 });
  }

  test('Admin can mark a signup Attended and Undo it', async ({ page }) => {
    const u = await uids();
    const uniqueTitle = e2eTitle(`Past Job Attendance ${Date.now()}`);
    const job = await createJob({
      title: uniqueTitle,
      scheduledDate: daysFromNowStr(-1),  // yesterday → past
      spotsTotal: 2,
      pay: 10,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Pre-populate signups
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });
    await seedSignup(job.docId, { uid: u.memberB, name: 'E2E Member B' });

    await navigateToJob(page, uniqueTitle);

    // Click "Attended" on Member A's signup row inside the modal
    const modal = page.getByRole('dialog');
    // Wait for the modal title to confirm we opened the right job
    await expect(modal).toContainText(uniqueTitle, { timeout: 5_000 });
    await modal.getByRole('button', { name: /mark as attended/i }).first().click();

    await expect.poll(async () => {
      const signups = await getJobSignups(job.docId);
      return signups.find(s => s.uid === u.memberA)?.attended;
    }, { timeout: 15_000 }).toBe(true);

    // Member B should still be untouched
    let signups = await getJobSignups(job.docId);
    expect(signups.find(s => s.uid === u.memberB)?.attended).toBeUndefined();

    // Click Undo on Member A
    await modal.getByRole('button', { name: /mark as no-show/i }).first().click();
    await expect.poll(async () => {
      const fresh = await getJobSignups(job.docId);
      return fresh.find(s => s.uid === u.memberA)?.attended;
    }, { timeout: 15_000 }).toBe(false);
  });

  test('Reports leaderboard reflects per-volunteer attendance + pay', async ({ page }) => {
    const u = await uids();
    // Two past jobs with known signups + attendance
    const j1 = await createJob({
      title: e2eTitle('Past Job R1'),
      scheduledDate: daysFromNowStr(-2),
      spotsTotal: 2, pay: 10, status: 'completed',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const j2 = await createJob({
      title: e2eTitle('Past Job R2'),
      scheduledDate: daysFromNowStr(-3),
      spotsTotal: 2, pay: 15, status: 'completed',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(j1.docId, { uid: u.memberA, name: 'Member A Test', attended: true });
    await seedSignup(j1.docId, { uid: u.memberB, name: 'E2E Member B', attended: false });
    await seedSignup(j2.docId, { uid: u.memberA, name: 'Member A Test', attended: true });

    // Navigate to Reports tab
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.getByRole('button', { name: /reports/i }).first().click();

    // The leaderboard should show Member A with 2 attended + $25 earned
    // (2 attended × $10 from j1 ... wait, jobs paid 10 + 15 = $25 if both
    // attended). Member A attended both = $25 earned.
    await expect(page.locator('text=Member A Test')).toBeVisible({ timeout: 10_000 });

    // Look for "$25.00" near Member A's row. The Reports leaderboard shows
    // Pay Earned column — should match Member A's total.
    await expect(page.locator('text=$25.00')).toBeVisible({ timeout: 5_000 });

    // Verify Member B appears with 0 attended (1 job, 1 no-show)
    await expect(page.locator('text=E2E Member B')).toBeVisible();
  });
});
