// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import {
  workItemsEnabled, listCollection, e2eTitle, purgeWorkItemsArtifacts,
} from '../admin-helpers.js';

// Work-unification Phase 2 — asserts the unified `workItems` read/write path.
//
// DARK until the maintenance window: these tests are GATED on the test church's
// `config/featureFlags.workItemsEnabled` flag and SKIP while it is off (the
// current prod state), so the green suite is unaffected. After the Thursday
// window flips the test church, the same specs prove (a) the backfill produced
// a faithful mirror and (b) the live app reads from / writes to `workItems`.
// To exercise them locally, flip the flag on the e2e-test-church tenant.
test.describe('Work-unification — unified workItems path', () => {
  test.afterEach(async () => { await purgeWorkItemsArtifacts(); });

  test('backfill mirror: every legacy task/ticket has a typed workItems twin', async () => {
    test.skip(!(await workItemsEnabled()), 'workItems flag off (dark launch) — nothing to assert yet');

    const [tasks, tickets, work] = await Promise.all([
      listCollection('tasks'), listCollection('maintenanceTickets'), listCollection('workItems'),
    ]);
    const byId = new Map(work.map(w => [w._docId, w]));

    // Superset invariant (survives post-flip creates): each legacy doc maps to a
    // `task_<id>` / `mnt_<id>` workItems doc with the right type + identity field.
    for (const t of tasks) {
      const w = byId.get(`task_${t._docId}`);
      expect(w, `task ${t.taskNumber || t._docId} has a workItems twin`).toBeTruthy();
      expect(w.type).toBe('task');
      expect(w.taskNumber).toBe(t.taskNumber);
      expect(w.name).toBe(t.name);
    }
    for (const tk of tickets) {
      const w = byId.get(`mnt_${tk._docId}`);
      expect(w, `ticket ${tk.ticketNumber || tk._docId} has a workItems twin`).toBeTruthy();
      expect(w.type).toBe('maintenance');
      expect(w.ticketNumber).toBe(tk.ticketNumber);
      expect(w.name).toBe(tk.name);
    }

    // Every workItems doc carries a valid discriminator (no untyped strays).
    for (const w of work) expect(['task', 'maintenance']).toContain(w.type);
  });

  test('read path: Tasks Hub board renders from workItems (task-type count)', async ({ page }) => {
    test.skip(!(await workItemsEnabled()), 'workItems flag off (dark launch)');

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
    test.skip(!(await workItemsEnabled()), 'workItems flag off (dark launch)');

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
