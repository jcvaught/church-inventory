// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import {
  purgeE2EArtifacts, createJob, createAccessPerson, createAccessRecord,
  uids, daysFromNowStr, e2eTitle, db, churchId, dismissConfirm,
} from '../admin-helpers.js';

// UAT — Part 2 manual checklist, automated where viable.
// docs/JOBS-HUB-AUDIT-VERIFICATION-PLAN.md.
//
// What this DOES cover: M13 (time format + status tooltip), M10 (PII warning
// text + Share Board confirm), L9 (waiver Modal checkbox-gates-Agree, owner
// email-suppression tab), M8 (textLight contrast computed style), L8
// (recurring chip aria-label).
//
// What this can NOT cover (still requires a human + a real device): L7 PWA
// icon install on Android, L8 actual screen-reader speech, the M12/L1/L3
// next-run log spot-checks, and the eyeballs-on aesthetic judgment of
// contrast / mis-tappability. M6 SMS lives in `uat-sms.spec.js` (gated).

test.describe('UAT — UI automation (Part 2 subset)', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  // ── M13 — detail modal renders time in 12-hour AM/PM format ──
  test('M13 — job detail formats scheduledTime "14:30" as "2:30 PM"', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('M13 TimeFmt'),
      scheduledDate: daysFromNowStr(3),
      scheduledTime: '14:30',
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + job.title).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/2:30\s*PM/)).toBeVisible();
  });

  // ── M13 — JobStatusBadge has a meaningful title tooltip ──
  test('M13 — Schedule status badge carries title="Open — accepting signups"', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('M13 Tooltip'),
      scheduledDate: daysFromNowStr(4),
      spotsTotal: 1,
      status: 'open',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.getByRole('button', { name: /schedule/i }).first().click();

    const row = page.getByRole('row').filter({ hasText: job.title });
    await row.waitFor({ timeout: 15_000 });
    const badge = row.getByText('Open', { exact: true });
    await expect(badge).toHaveAttribute('title', /Open\s*[—-].*accepting signups/);
    await expect(badge).toHaveAttribute('aria-label', /Status:\s*Open/);
  });

  // ── M10 — Post Job modal shows the public-PII warning ──
  test('M10 — Post Job modal shows "Title, description and location are visible on the public job board" warning', async ({ page }) => {
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.getByRole('button', { name: /\+ Post Job/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Title, description and location are visible on the public job board/i)).toBeVisible();
    // Don't submit
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
  });

  // ── M10 — Share Board fires the public-warning ConfirmDialog ──
  // Phase 2 (2026-05-25) replaced window.confirm with a React ConfirmDialog,
  // so we read the warning copy out of the rendered dialog instead of
  // capturing dialog.message(). The wording also went from "PUBLIC page" to
  // "public page" inside a <strong> wrapper.
  test('M10 — Share Board click fires a confirm dialog with the public-warning text', async ({ page }) => {
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();

    await page.getByRole('button', { name: /^share board$/i }).click();

    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    const dialogText = await dialog.innerText();
    expect(dialogText).toMatch(/public page/i);
    expect(dialogText).toMatch(/minor's name or a private address/);

    // Back out — leave the clipboard untouched.
    await dismissConfirm(page, 'Cancel');
  });

  // ── L9 — waiver Modal: checkbox gates the Agree button ──
  test('L9 — waiver Modal disables "Agree & Sign Up" until the checkbox is ticked', async ({ memberAPage }) => {
    const u = await uids();
    // Member A needs a valid background check linked to their UID so the
    // *waiver* gate is what we're isolating (not the compliance check).
    const person = await createAccessPerson({ name: e2eTitle('Waiver MemberA'), userId: u.memberA });
    await createAccessRecord({
      personId: person._docId,
      type: 'background_check',
      expiryDate: daysFromNowStr(60),
    });

    const job = await createJob({
      title: e2eTitle('L9 WaiverGate'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 1,
      requiredAccessTypes: ['background_check'],
      requiresWaiver: true,
      waiverText: 'I agree to follow safety guidelines.',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await memberAPage.goto('/');
    const onboardingClose = memberAPage.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await memberAPage.getByRole('button', { name: /^hubs$/i }).first().click();
    await memberAPage.locator('text=Job Hub').first().click();
    await memberAPage.locator('text=' + job.title).first().click();

    // Click Sign Up — the waiver Modal opens (since requiresWaiver=true).
    const detail = memberAPage.getByRole('dialog');
    await detail.getByRole('button', { name: /^sign up$/i }).click();

    // The waiver Modal title is "Waiver & Consent". Match the inner dialog.
    const waiver = memberAPage.getByRole('dialog').filter({ hasText: /Waiver & Consent/i });
    await waiver.waitFor({ timeout: 10_000 });

    // Waiver text is shown.
    await expect(waiver.getByText('I agree to follow safety guidelines.')).toBeVisible();

    // Agree button starts DISABLED.
    const agree = waiver.getByRole('button', { name: /Agree.*Sign Up/i });
    await expect(agree).toBeDisabled();

    // Ticking the consent checkbox enables it.
    await waiver.getByText(/I have read and agree to the waiver above\./i).click();
    await expect(agree).toBeEnabled();

    // Cancel — no signup created.
    await waiver.getByRole('button', { name: /^cancel$/i }).click();
    await memberAPage.waitForTimeout(800);
    const signupsSnap = await db().collection(`churches/${churchId()}/jobListings/${job.docId}/signups`).get();
    expect(signupsSnap.size).toBe(0);
  });

  // ── M8 — textLight token computes to #5F6878 (rgb(95,104,120)), WCAG AA ──
  // Original audit M8 (2026-05-25) darkened #8B93A1 → #6B7280 for the white-bg
  // case. E2E Layer 1 darkened again #6B7280 → #5F6878 because the previous
  // value was 4.24:1 on B.warmGray (#F2F0EB) — just below WCAG-AA's 4.5:1.
  // New value is ~4.95:1 on warmGray, ~5.5:1 on cream/white. See
  // docs/E2E-ISOLATION-PLAN-2026-05-25.md.
  test('M8 — textLight subtitles render at rgb(95, 104, 120) (#5F6878)', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('M8 Contrast'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.getByRole('button', { name: /schedule/i }).first().click();

    // The JOB-### sub-label on each schedule row is styled with B.textLight.
    const row = page.getByRole('row').filter({ hasText: job.title });
    await row.waitFor({ timeout: 15_000 });
    const jobNumberCell = row.getByText(job.jobNumber, { exact: true });
    const color = await jobNumberCell.evaluate(el => getComputedStyle(el).color);
    expect(color).toBe('rgb(95, 104, 120)');
  });

  // ── L8 — recurring chip on JobCard has aria-label="Recurring series" ──
  test('L8 — recurring 🔁 chip exposes an accessible label', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('L8 Recurring Chip'),
      scheduledDate: daysFromNowStr(6),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      recurrenceGroupId: `e2e-l8-${Date.now()}`,
      recurrenceFreq: 'weekly',
    });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();

    // Wait for the card, then assert the recurring chip's aria-label is
    // present somewhere on the page (a card uses aria-label="Recurring series"
    // for the 🔁 emoji span).
    await page.locator('text=' + job.title).first().waitFor({ timeout: 15_000 });
    await expect(page.locator('[aria-label="Recurring series"]').first()).toBeVisible();
  });

  // ── L9 — owner email-suppression tab ──
  // Layer 1 (2026-05-25) moved the E2E suite to a dedicated tenant with
  // e2e-member-a@churchopshub.com as Member A. The owner gate at
  // src/pages/SettingsPage.jsx:130 is hardcoded to ['jcvaught@gmail.com',
  // 'jvaught@fxcc.org'] — expanding that allowlist to include an
  // @churchopshub.com address would let anyone register that email in
  // Firebase Auth and claim owner privileges in real customer churches.
  // Skipping this test instead. Re-enable by either (a) hub-flagging the
  // owner check via a Firestore field with rule-protection or (b)
  // converting L9 to a manual UAT check on the real owner account.
  test.skip('L9 — owner Email tab loads suppressions panel', async ({ memberAPage }) => {
    await memberAPage.goto('/');
    const onboardingClose = memberAPage.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});

    // Navigate to Settings — bottom nav on mobile, top tabs on desktop.
    // Both expose a button labelled "Settings".
    await memberAPage.getByRole('button', { name: /^settings$/i }).first().click();

    // Scroll to the owner panel — it's owner-only and may be deep in the page.
    const emailTab = memberAPage.getByRole('button', { name: /^email$/i });
    await emailTab.first().scrollIntoViewIfNeeded();
    await emailTab.first().click();

    // The panel heading is "Email Suppressions"; the Load button is primary.
    await expect(memberAPage.getByRole('heading', { name: /Email Suppressions/i })).toBeVisible();
    await memberAPage.getByRole('button', { name: /^load$/i }).click();

    // Either renders the suppressions list, "No suppressed addresses.", or
    // shows "Refresh" once loaded — all three signal the panel works.
    await expect(memberAPage.getByRole('button', { name: /^(refresh|loading…?)$/i })).toBeVisible({ timeout: 15_000 });
  });
});
