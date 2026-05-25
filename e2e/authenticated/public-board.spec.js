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

  // Skipped 2026-05-25: getPublicJobs has a per-instance 60s in-process cache
  // (functions/index.js:333 — perf M-1, 2026-05-23). Cloud Run spawns
  // multiple Function instances; each has its own cache that's populated by
  // the first request landing on that instance. When this test creates jobs
  // and immediately hits the public URL, the request can be routed to a
  // *different* instance whose cache was warmed minutes earlier by a previous
  // test's data — so the freshly-created `[E2E] Public Visible` job is
  // invisible until that other instance's cache also expires. 70s isn't
  // enough; even 5 min is racy. The product behavior is correct (the cache
  // is doing its job); it's the test that needs a cache-bust mechanism (e.g.
  // a `_bust` query param on the CF or an admin-only endpoint to clear the
  // Map). Tracked as a follow-up in
  // docs/E2E-ISOLATION-PLAN-2026-05-25.md "Findings".
  test.skip('Public page hides cancelled and completed jobs', async ({ browser }) => {
    test.setTimeout(120_000);
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
    // Church display name + code are cosmetic in the URL; the actual lookup
    // uses churchId(). Hardcoding generic values to keep this test tenant-
    // agnostic.
    const shareUrl = `https://churchopshub.com/?jobs=${churchId()}&cn=${encodeURIComponent('Test Church')}&cc=TST`;
    await page.goto(shareUrl);

    // The getPublicJobs Cloud Function has a per-instance 60s in-process
    // cache (perf M-1, 2026-05-23). When a freshly-created job is the first
    // request to a warm cache instance, it can wait up to 60s before
    // appearing on the public board. Bumped the wait to cover that worst
    // case. See docs/E2E-ISOLATION-PLAN-2026-05-25.md "Findings".
    await page.locator('text=' + openJob.title).first().waitFor({ timeout: 70_000 });
    await expect(page.locator('text=' + openJob.title).first()).toBeVisible();
    await expect(page.locator('text=' + cancelledJob.title)).toHaveCount(0);
    await expect(page.locator('text=' + completedJob.title)).toHaveCount(0);

    await ctx.close();
  });
});
