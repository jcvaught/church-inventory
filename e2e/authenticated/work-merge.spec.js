// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { e2eTitle, acceptConfirm, purgeWorkItemsArtifacts } from '../admin-helpers.js';

// Tasks + Maintenance UI merge (rescoped Phase 4): a user who can use BOTH
// categories sees ONE "Work" card that opens a board with a Tasks/Maintenance
// toggle, and the two separate hub cards are gone. The e2e-admin tenant is
// grandfathered (all hubs active) + admin role, so it gets the merged card.
// Scoping note: single-category users keep their own card and never reach the
// toggle — that path is asserted by the access rules, not driven here.
//
// Engine merge (§4): the two board engines are now ONE parameterized component
// (WorkBoard). These tests also pin the category-specific detail surfaces so a
// future refactor can't silently leak task-only fields into maintenance.
test.describe('Work merge — unified Tasks/Maintenance board', () => {
  test.afterEach(async () => { await purgeWorkItemsArtifacts(); });

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

  test('maintenance detail renders vendor/cost/contractor surfaces, not the task-only ones', async ({ page }) => {
    const name = e2eTitle(`WM maint ${Date.now()}`);
    await openHubs(page);
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('tab', { name: /Maintenance/ }).click();

    // Create a ticket through the merged board's maintenance "+ New Ticket".
    await page.getByRole('button', { name: /^\+ new ticket$/i }).first().click();
    await page.getByPlaceholder(/Short descriptive name/).fill(name);
    await page.getByRole('button', { name: /^Create Ticket$/ }).click();

    // Open its card → the unified detail modal in maintenance mode.
    await page.getByRole('button', { name }).first().click();

    // Maintenance-only surfaces present…
    await expect(page.getByText('Linked Equipment', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Estimated Cost ($)').first()).toBeVisible();
    await expect(page.getByText('Contractor Work').first()).toBeVisible();
    // …and the task-only ones absent (scoping invariant for the merged engine).
    await expect(page.getByText('Visibility', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^→ Job$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^→ Ticket$/ })).toHaveCount(0);

    // Clean up the ticket we created.
    await page.getByRole('button', { name: /^Delete$/ }).click();
    await acceptConfirm(page, 'Delete');
  });
});
