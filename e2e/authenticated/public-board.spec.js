// @ts-check
import { test, expect } from '@playwright/test';
import { purgeE2EArtifacts, createJob, seedSignup, seedWaitlistEntry, uids, daysFromNowStr, e2eTitle, churchId } from '../admin-helpers.js';

// §9 of docs/TEST-JOBS-HUB-2026-05-07.md — Public job board.
// Critical regression check for the 2026-05-06 PII-leak fix: the public
// board renders via the getPublicJobs CF, which returns only display fields
// + signupCount — the roster lives in signups/waitlist subcollections the CF
// never reads. Direct unauthenticated Firestore reads are blocked by
// firestore.rules (no `allow get/list` for anonymous on jobListings or its
// roster subcollections).

test.describe('§9 Public job board', () => {
  test.afterAll(async () => { await purgeE2EArtifacts(); });

  test('Public page shows open job count without leaking signup names', async ({ browser }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Public Open Job'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 3,
      pay: 20,
      location: 'Front lawn',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Seed signups + waitlist with PII-bearing names
    await seedSignup(job.docId, { uid: u.memberA, name: 'PrivateMemberA' });
    await seedWaitlistEntry(job.docId, { uid: u.memberB, name: 'PrivateMemberB' });

    // Open the share URL in a completely fresh context — no auth
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const shareUrl = `https://churchopshub.com/?jobs=${churchId()}&cn=${encodeURIComponent('Fairfax Church of Christ')}&cc=FXCC`;
    await page.goto(shareUrl);

    // Wait for the job board (anonymous) to render
    await page.locator('text=' + job.title).first().waitFor({ timeout: 20_000 });

    // Spot count visible (sanitized "X spots filled" count, no individual names).
    // The test seeds 1 signup above, so signupCount=1 and the rendered text is "1/3".
    await expect(page.locator('text=/1\\s*\\/\\s*3 spots filled/i').first()).toBeVisible();
    await expect(page.locator(`text=${job.title}`).first()).toBeVisible();
    await expect(page.locator('text=$20').first()).toBeVisible();

    // CRITICAL: signup name and waitlist name MUST NOT appear anywhere
    await expect(page.locator('text=PrivateMemberA')).toHaveCount(0);
    await expect(page.locator('text=PrivateMemberB')).toHaveCount(0);

    await ctx.close();
  });

  test('Public page hides cancelled and completed jobs', async ({ browser }) => {
    const u = await uids();
    const openJob = await createJob({
      title: e2eTitle('Public Visible'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const cancelledJob = await createJob({
      title: e2eTitle('Public Cancelled'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      status: 'cancelled',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const completedJob = await createJob({
      title: e2eTitle('Public Completed'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      status: 'completed',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const shareUrl = `https://churchopshub.com/?jobs=${churchId()}&cn=${encodeURIComponent('Fairfax Church of Christ')}&cc=FXCC`;
    await page.goto(shareUrl);

    await page.locator('text=' + openJob.title).first().waitFor({ timeout: 20_000 });
    await expect(page.locator('text=' + openJob.title).first()).toBeVisible();
    await expect(page.locator('text=' + cancelledJob.title)).toHaveCount(0);
    await expect(page.locator('text=' + completedJob.title)).toHaveCount(0);

    await ctx.close();
  });
});
