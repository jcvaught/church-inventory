// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJob, uids, daysFromNowStr, e2eTitle, db, churchId } from '../admin-helpers.js';

// §2 of docs/TEST-JOBS-HUB-2026-05-07.md — Admin CRUD flows.
// Existing coverage in edge-cases.spec.js focuses on validation; this spec
// closes the actual happy-path: edit a job, then verify the cancel-delete
// dialog truly cancels (a Jobs Hub regression earlier caused jobs to delete
// even after dismissing the confirm).

test.describe('§2 Admin CRUD flows', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  test('Admin can edit a job\'s location; activityLog records update_job', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Location Edit'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      location: 'Old Location',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});

    // Nav to Job Hub
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();

    // Open the job detail modal, then click its Edit button. SCOPE the Edit
    // click to the detail dialog — the page has multiple Edit buttons (one
    // per Schedule row, one per announcement). The detail dialog's Edit
    // closes the detail modal and opens the edit-form modal.
    await page.locator('text=' + job.title).first().click();
    const detailDialog = page.getByRole('dialog');
    await detailDialog.getByRole('button', { name: /^edit$/i }).click();

    // Edit form modal: change Location. Two inputs in this modal have
    // "sanctuary" in their placeholder (Title: "e.g. Reset chairs in
    // sanctuary"; Location: "e.g. Sanctuary"), so we pin to the exact
    // case-sensitive Location placeholder.
    const locationInput = page.locator('input[placeholder="e.g. Sanctuary"]').first();
    await locationInput.waitFor({ state: 'visible', timeout: 10_000 });
    await locationInput.fill('Fellowship Hall');

    // Save Changes
    await page.getByRole('button', { name: /^save changes$/i }).click();

    // Verify Firestore: location updated
    await expect.poll(async () => (await getJob(job.docId)).location, { timeout: 15_000 }).toBe('Fellowship Hall');

    // Verify activityLog has an update_job entry for this job. The activityLog
    // schema is { action, itemId, performedBy, performedByName, timestamp, details }
    // (see useFirestore.logActivity) — not { kind, target }. Wrap in expect.poll
    // because logActivity fires async after updateJobListing returns; the
    // success toast can paint before the log doc lands.
    await expect.poll(async () => {
      const logsSnap = await db()
        .collection(`churches/${churchId()}/activityLog`)
        .where('action', '==', 'update_job')
        .get();
      return logsSnap.docs
        .map(d => d.data())
        .filter(d => String(d.itemId || '').includes(job.docId) || String(d.itemId || '').includes(job.jobNumber || ''))
        .length;
    }, { timeout: 15_000, message: 'activityLog should record update_job' }).toBeGreaterThan(0);
  });

  test('Cancelling the delete confirm dialog leaves the job intact', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Delete Cancel'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + job.title).first().click();

    // Dismiss the native confirm dialog when the Delete button fires it
    page.once('dialog', dialog => dialog.dismiss().catch(() => {}));
    await page.getByRole('button', { name: /^delete$/i }).first().click();

    // Give the dismiss + any subsequent code a beat to settle
    await page.waitForTimeout(2_000);

    // Job must still exist in Firestore
    const final = await getJob(job.docId);
    expect(final).toBeTruthy();
    expect(final.title).toBe(job.title);
  });
});
