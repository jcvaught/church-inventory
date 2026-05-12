// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createAnnouncement, getAnnouncement, uids, daysFromNowStr, e2eTitle } from '../admin-helpers.js';

// §8 of docs/TEST-JOBS-HUB-2026-05-07.md — Announcements.
// Visibility logic lives in JobsPage visibleAnnouncements useMemo:
//   const ann = (jobAnnouncements || []).filter(a => !a.expiresAt || a.expiresAt >= todayStr);
//   ...sort pinned first, then by createdAt desc.
// Verifies the client filter (past expiry hidden) and pinned ordering.

test.describe('§8 Announcements', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  async function navigateToAnnouncements(page) {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.getByRole('button', { name: /announcements/i }).first().click();
  }

  test('Member sees pinned announcement at the top', async ({ memberAPage }) => {
    const u = await uids();
    const unique = Date.now();
    // Older non-pinned, then newer pinned — pinned should sort first
    await createAnnouncement({
      title: e2eTitle(`Regular ${unique}`),
      body: 'Regular announcement body',
      pinned: false,
      expiresAt: daysFromNowStr(14),
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Brief gap so createdAt distinguishes them
    await new Promise(r => setTimeout(r, 50));
    const pinned = await createAnnouncement({
      title: e2eTitle(`Pinned ${unique}`),
      body: 'Pinned announcement body',
      pinned: true,
      expiresAt: daysFromNowStr(14),
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await navigateToAnnouncements(memberAPage);

    // Both visible
    await expect(memberAPage.locator(`text=Pinned ${unique}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(memberAPage.locator(`text=Regular ${unique}`).first()).toBeVisible();

    // Pinned title should appear before Regular in the DOM order.
    const order = await memberAPage.evaluate((ids) => {
      const all = Array.from(document.body.querySelectorAll('*'));
      const positions = ids.map(t => all.findIndex(el => el.textContent === t));
      return positions;
    }, [`[E2E] Pinned ${unique}`, `[E2E] Regular ${unique}`]);
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[1]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
  });

  test('Expired announcement is hidden from members', async ({ memberAPage }) => {
    const u = await uids();
    const unique = Date.now();
    await createAnnouncement({
      title: e2eTitle(`Expired ${unique}`),
      body: 'This expired yesterday',
      pinned: false,
      expiresAt: daysFromNowStr(-1),  // yesterday
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await createAnnouncement({
      title: e2eTitle(`Active ${unique}`),
      body: 'This is current',
      pinned: false,
      expiresAt: daysFromNowStr(14),
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await navigateToAnnouncements(memberAPage);

    await expect(memberAPage.locator(`text=Active ${unique}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(memberAPage.locator(`text=Expired ${unique}`)).toHaveCount(0);
  });

  test('Admin can edit announcement body via UI', async ({ page }) => {
    const u = await uids();
    const unique = Date.now();
    const ann = await createAnnouncement({
      title: e2eTitle(`Edit Target ${unique}`),
      body: 'Original body text',
      pinned: false,
      expiresAt: daysFromNowStr(14),
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await navigateToAnnouncements(page);
    await page.locator(`text=Edit Target ${unique}`).first().waitFor({ timeout: 10_000 });

    // Admin sees Edit button on their announcement
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
    await editBtn.click();

    // Edit modal: change body, save
    const modal = page.getByRole('dialog');
    const textarea = modal.locator('textarea').first();
    await textarea.fill('Updated body text via E2E');
    await modal.getByRole('button', { name: /^save( changes)?$/i }).first().click();

    await expect.poll(async () => (await getAnnouncement(ann._docId))?.body, { timeout: 10_000 }).toBe('Updated body text via E2E');
  });
});
