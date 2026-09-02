// @ts-check
// COH-006 gate 3 — deployed-UI smoke.
//
// The SDK-level regression (private-visibility-listener.spec.js) proves the five
// constrained queries return exactly the right documents. This proves the shipped
// bundle wires them up in a real browser for a real signed-in member.
//
// The load-bearing assertion is the ABSENCE of the incomplete-data banner. Gate 3
// publishes EMPTY task arrays and raises that banner whenever any work-item
// listener fails terminally — a missing index, a denied query. So a signed-in
// session with no banner is end-to-end evidence that all five listeners
// established and the store reached `complete`.
//
// Scope limit, stated rather than papered over: the e2e-test-church subscription
// has no hubs enabled (`hubs: []`), so the Tasks board itself does not render in
// this tenant and is not exercised here. The listeners run for any signed-in
// member regardless of hub access, and the banner is rendered app-wide in
// App.jsx, so listener health IS covered. Board rendering against real task data
// is covered by the production probe and the SDK regression instead.
import { test, expect } from '../firebase-fixtures.js';

test.describe('COH-006 gate 3 — deployed UI', () => {
  for (const [label, fixture] of [['member A', 'memberAPage'], ['admin', 'page']]) {
    test(`${label}: no work-item listener fails in the shipped bundle`, async ({ memberAPage, page }) => {
      const target = fixture === 'memberAPage' ? memberAPage : page;
      await target.goto('/');
      const close = target.getByRole('button', { name: /^×$|^close$/i }).first();
      if (await close.count() > 0) await close.click().catch(() => {});
      // The dashboard renders only after the store's single readiness gate
      // resolves, which requires every work-item listener to have reported.
      await target.getByRole('heading', { name: /dashboard/i }).first().waitFor({ timeout: 30_000 });

      await expect(target.getByText('Tasks and maintenance could not be fully loaded')).toHaveCount(0);
      await expect(target.getByText('This board is not showing your')).toHaveCount(0);
    });
  }
});
