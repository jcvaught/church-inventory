// @ts-check
import { test, expect } from '../firebase-fixtures.js';

// Tasks + Maintenance UI merge (rescoped Phase 4): a user who can use BOTH
// categories sees ONE "Work" card that opens a board with a Tasks/Maintenance
// toggle, and the two separate hub cards are gone. The e2e-admin tenant is
// grandfathered (all hubs active) + admin role, so it gets the merged card.
// Scoping note: single-category users keep their own card and never reach the
// toggle — that path is asserted by the access rules, not driven here.
test.describe('Work merge — unified Tasks/Maintenance board', () => {
  const openHubs = async (page) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
  };

  test('both-access user sees one Work card; separate Tasks/Maintenance cards are gone', async ({ page }) => {
    await openHubs(page);
    await expect(page.getByRole('button', { name: 'Work', exact: true })).toBeVisible();
    // The individual cards are collapsed away for a both-access user.
    await expect(page.getByRole('button', { name: 'Tasks Hub', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Maintenance Hub', exact: true })).toHaveCount(0);
  });

  test('Work board exposes a Tasks/Maintenance toggle that swaps boards', async ({ page }) => {
    await openHubs(page);
    await page.getByRole('button', { name: 'Work', exact: true }).click();

    // Toggle present.
    const tasksTab = page.getByRole('tab', { name: /Tasks/ });
    const maintTab = page.getByRole('tab', { name: /Maintenance/ });
    await expect(tasksTab).toBeVisible();
    await expect(maintTab).toBeVisible();

    // Maintenance view → the ticket-create affordance.
    await maintTab.click();
    await expect(page.getByRole('button', { name: /^\+ new ticket$/i }).first()).toBeVisible({ timeout: 15_000 });

    // Tasks view → the task-create affordance.
    await tasksTab.click();
    await expect(page.getByRole('button', { name: /^\+ new task$/i }).first()).toBeVisible({ timeout: 15_000 });
  });
});
