// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, deleteJob, uids, tomorrowStr, e2eTitle } from '../admin-helpers.js';

test.describe('Sanity — auth + admin SDK harness', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  test('Admin browser loads the app signed in', async ({ page }) => {
    await page.goto('/');
    // After auth, no password field should be visible.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('Member A browser loads the app signed in', async ({ memberAPage }) => {
    await memberAPage.goto('/');
    await expect(memberAPage.locator('input[type="password"]')).toHaveCount(0);
  });

  test('Admin SDK creates and reads back an E2E job', async () => {
    const u = await uids();
    expect(u.admin).toBeTruthy();
    const job = await createJob({
      title: e2eTitle('Sanity Job'),
      scheduledDate: tomorrowStr(),
      spotsTotal: 1,
      createdBy: u.admin,
      createdByName: 'E2E Admin',
    });
    expect(job.docId).toBeTruthy();
    expect(job.jobNumber).toMatch(/^JOB-\d{3,}$/);
    await deleteJob(job.docId);
  });
});
