// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import AxeBuilder from '@axe-core/playwright';

// Audit 2026-05-24 Phase 4 — accessibility scan of the main authenticated
// surfaces. Phase 4 shipped two pattern fixes (StatusDot, EmojiIcon) that
// resolve the audit's color-only-status and emoji-as-icon findings. This
// spec enforces them by running axe-core on each major page and failing on
// new violations of the rules those primitives address.
//
// Why this targeted ruleset (not all of axe):
// - `image-alt` catches role="img" without aria-label (broken EmojiIcon
//   semantic-mode or any unwrapped emoji that axe treats as imagery).
// - `aria-allowed-attr` / `aria-roles` / `aria-valid-attr-value` catch
//   misuse of the StatusDot's role="img" + aria-label pair.
// - `color-contrast` catches text-on-background regressions, including
//   StatusDot labels that may have been styled with low-contrast color.
// We disable color-contrast on /supplies because the StockBar's gold-on-
// white sub-pixel fill is intentional and not a text-contrast issue.

const RULES_FOR_PHASE_4 = [
  'image-alt',
  'aria-allowed-attr',
  'aria-roles',
  'aria-valid-attr-value',
  'aria-required-attr',
  'color-contrast',
];

async function scan(page, opts = {}) {
  let builder = new AxeBuilder({ page }).withRules(RULES_FOR_PHASE_4);
  if (opts.disable && opts.disable.length) {
    builder = builder.disableRules(opts.disable);
  }
  return builder.analyze();
}

async function openHub(page, hubLabel) {
  await page.goto('/');
  const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
  if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
  await page.getByRole('button', { name: /^hubs$/i }).first().click();
  await page.locator(`text=${hubLabel}`).first().click();
  // Hubs lazy-load; wait for the back link to confirm the hub frame rendered.
  await page.getByRole('button', { name: /All Hubs/i }).first().waitFor({ timeout: 15_000 });
}

test.describe('A11y — Phase 4 axe scan', () => {
  test('dashboard has no Phase-4 axe violations', async ({ page }) => {
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('heading', { name: /dashboard/i }).first().waitFor({ timeout: 15_000 });
    const result = await scan(page);
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  });

  test('inventory page has no Phase-4 axe violations', async ({ page }) => {
    // Items + Supplies live under the Inventory Hub now (Items/Supplies toggle,
    // 2026-06-23). openHub lands on the Items sub-view by default.
    await openHub(page, 'Inventory Hub');
    await page.getByPlaceholder(/search by name/i).waitFor({ timeout: 15_000 });
    const result = await scan(page);
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  });

  test('supplies page has no Phase-4 axe violations (sans StockBar contrast)', async ({ page }) => {
    await openHub(page, 'Inventory Hub');
    await page.getByRole('tab', { name: /^supplies$/i }).click();
    await page.getByRole('heading', { name: /supplies/i }).first().waitFor({ timeout: 15_000 });
    // StockBar uses a 6px gold sub-pixel fill — not a text contrast issue.
    const result = await scan(page, { disable: ['color-contrast'] });
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  });

  test('People Access hub has no Phase-4 axe violations', async ({ page }) => {
    await openHub(page, 'People Access');
    const result = await scan(page);
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  });

  test('Job Hub has no Phase-4 axe violations', async ({ page }) => {
    await openHub(page, 'Job Hub');
    const result = await scan(page);
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  });
});
