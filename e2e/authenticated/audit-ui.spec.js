// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import {
  purgeE2EArtifacts, createJob, uids, daysFromNowStr, e2eTitle, db, churchId,
} from '../admin-helpers.js';

// Audit verification — UI assertions (docs/JOBS-HUB-AUDIT-VERIFICATION-PLAN.md
// Part 1). The shipped UI fixes (M9 / M13 / L9) had no test until now.

test.describe('Audit — UI', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  // ── T5 — M13: requiredAccessTypes badge renders on the job card ──
  test('T5 — M13 card shows "🔒 Background Check required" when access type set', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('M13 AccessBadge'),
      scheduledDate: daysFromNowStr(4),
      spotsTotal: 1,
      requiredAccessTypes: ['background_check'],
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();

    // The badge text is "🔒 Background Check required" (ACCESS_TYPE_LABELS +
    // " required"). Match the trailing phrase — emoji can be brittle.
    await page.locator('text=' + job.title).first().waitFor({ timeout: 15_000 });
    await expect(page.getByText(/Background Check required/).first()).toBeVisible();
  });

  // ── T6 — M13: status badge text is capitalized in the Schedule table ──
  test('T6 — M13 Schedule row renders capitalized status badge ("Open")', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('M13 ScheduleStatus'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 1,
      status: 'open',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    // Switch to the Schedule tab — the tab button label is "📋 Schedule".
    await page.getByRole('button', { name: /schedule/i }).first().click();

    // Find our row and confirm the status badge reads "Open" (capitalized) —
    // guards JobStatusBadge reuse in DesktopScheduleRow (audit M13).
    const row = page.getByRole('row').filter({ hasText: job.title });
    await row.waitFor({ timeout: 15_000 });
    await expect(row.getByText('Open', { exact: true })).toBeVisible();
  });

  // ── T7 — M9: recurring job detail groups destructive actions in a
  // "Danger zone" row, separate from Edit ──
  test('T7 — M9 recurring job detail shows Danger zone with all three delete buttons', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('M9 DangerZone'),
      scheduledDate: daysFromNowStr(6),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Mark the job as part of a recurring series — `recurrenceGroupId` is
    // what reveals the two extra destructive buttons.
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      recurrenceGroupId: `e2e-grp-${Date.now()}`,
      recurrenceFreq: 'weekly',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + job.title).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 10_000 });

    // "Danger zone" label is present and uppercase styled.
    await expect(dialog.getByText(/danger zone/i)).toBeVisible();

    // All three destructive buttons live inside the dialog.
    await expect(dialog.getByRole('button', { name: /^delete$/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /delete this \+ future/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /delete series/i })).toBeVisible();
  });

  // ── T8 — L9: recurring setup previews the actual dates ──
  test('T8 — L9 Post Job recurring series previews real dates, not just a count', async ({ page }) => {
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();

    await page.getByRole('button', { name: /\+ Post Job/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 10_000 });

    // Title (Modal autofocuses the first input, which is Title)
    await dialog.locator('input[placeholder="e.g. Reset chairs in sanctuary"]').fill(e2eTitle('L9 Preview'));

    // First date input on the form is Date (scheduledDate).
    await dialog.locator('input[type="date"]').first().fill(daysFromNowStr(7));

    // Tick "Recurring series 🔁" — match by label substring.
    await dialog.getByText(/Recurring series/i).click();

    // After ticking recurring, a second date input ("Series Ends On") appears
    // — set it 5 weeks out so a weekly series produces ~5 jobs.
    await dialog.locator('input[type="date"]').nth(1).fill(daysFromNowStr(35));

    // Preview header — count line. The text shape is
    // "This will create N jobs." (singular "job" only at N=1).
    await expect(dialog.getByText(/This will create \d+ jobs?\./)).toBeVisible();

    // Preview body — actual dates. formatJobDate emits a 3-letter month
    // abbreviation, so an assertion that one is present anywhere in the
    // recurring section proves the L9 fix.
    await expect(dialog.getByText(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/).first()).toBeVisible();

    // Don't submit — just close the modal to avoid creating a real series.
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
  });
});
