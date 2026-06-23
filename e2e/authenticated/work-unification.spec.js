// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import {
  listCollection, e2eTitle, purgeWorkItemsArtifacts,
} from '../admin-helpers.js';

// Work-unification — asserts the unified `workItems` read/write path.
//
// Part C (2026-06-23) made `workItems` the ONLY path: the `workItemsEnabled`
// flag and the legacy `tasks`/`maintenanceTickets` collections are gone. These
// specs now run unconditionally and prove the live app reads from / writes to
// `workItems` (split by `type`), never the deleted legacy collections (which
// `listCollection('tasks')` now returns as empty).
test.describe('Work-unification — unified workItems path', () => {
  test.afterEach(async () => { await purgeWorkItemsArtifacts(); });

  test('every workItems doc is typed; legacy collections stay empty', async () => {

    const [tasks, tickets, work] = await Promise.all([
      listCollection('tasks'), listCollection('maintenanceTickets'), listCollection('workItems'),
    ]);

    // Part C deleted the legacy collections — nothing reads or writes them now.
    expect(tasks.length, 'legacy tasks collection is empty post-Part-C').toBe(0);
    expect(tickets.length, 'legacy maintenanceTickets collection is empty post-Part-C').toBe(0);

    // Every workItems doc carries a valid discriminator (no untyped strays).
    for (const w of work) expect(['task', 'maintenance']).toContain(w.type);
  });

  test('read path: Tasks Hub board renders from workItems (task-type count)', async ({ page }) => {
    const expected = (await listCollection('workItems')).filter(w => w.type === 'task').length;

    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Tasks Hub').first().click();

    // The "N tasks" count chip is computed from the store's `tasks` array, which
    // in unified mode is derived from workItems split by type.
    await expect(page.locator(`text=/^${expected} tasks?$/`).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test('write path: a UI-created task lands in workItems (type:task), not legacy', async ({ page }) => {
    const name = e2eTitle(`WU create ${Date.now()}`);

    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Tasks Hub').first().click();
    await page.getByRole('button', { name: /^\+ new task$/i }).click();
    await page.getByPlaceholder('Short descriptive name...').fill(name);
    await page.getByRole('button', { name: /^create task$/i }).click();

    // It must appear in workItems with the task discriminator and a task_ id…
    await expect.poll(async () =>
      (await listCollection('workItems')).some(w => w.name === name),
    { timeout: 15_000 }).toBe(true);
    const created = (await listCollection('workItems')).find(w => w.name === name);
    expect(created.type).toBe('task');
    expect(created._docId.startsWith('task_')).toBe(true);

    // …and must NOT have been written to the legacy collection.
    const legacy = (await listCollection('tasks')).find(t => t.name === name);
    expect(legacy, 'new task must not be written to legacy tasks collection').toBeFalsy();
  });
});
