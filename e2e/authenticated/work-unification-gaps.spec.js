// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import {
  listCollection, getWorkItem, e2eTitle,
  purgeWorkItemsArtifacts, purgeE2EArtifacts, acceptConfirm, db, churchId,
} from '../admin-helpers.js';

// Work-unification — the coverage the main work-unification.spec.js leaves out:
// the unified-path COMMENTS round-trip, the cross-collection LINK-FIELD nulling,
// and the → convert flows that create those links. All three exercise the
// bare-id ↔ `task_`/`mnt_` prefix routing on the `workItems` collection.
//
// Part C (2026-06-23) made `workItems` the only path, so these run
// unconditionally. (NB: the → Ticket convert exercised here is slated for
// removal in the Tasks+Maintenance UI merge — update this spec then.)
test.describe('Work-unification — unified-path comments, links, converts', () => {
  test.afterEach(async () => {
    await purgeWorkItemsArtifacts();   // tasks/maintenanceTickets/workItems by [E2E] name (recursive → comments too)
    await purgeE2EArtifacts();         // jobListings by [E2E] title (the → Job convert target)
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const openTasksHub = async (page) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.getByText('Tasks Hub').first().click();
  };
  const openMaintenanceHub = async (page) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.getByText('Maintenance Hub').first().click();
  };
  // Card aria-label is `${number}: ${name}` (TaskCard/TicketCard role="button"),
  // so the unique [E2E] name is a substring match.
  const openCard = (page, name) => page.getByRole('button', { name }).first().click();

  // A workItems doc's comments subcollection, read straight from Firestore.
  const commentsOf = async (workItemDocId) => {
    const snap = await db().collection(`churches/${churchId()}/workItems/${workItemDocId}/comments`).get();
    return snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  };
  const findWork = async (predicate) => (await listCollection('workItems')).find(predicate);

  const createTaskViaUI = async (page, name) => {
    await openTasksHub(page);
    await page.getByRole('button', { name: /^\+ new task$/i }).click();
    await page.getByPlaceholder('Short descriptive name...').fill(name);
    await page.getByRole('button', { name: /^create task$/i }).click();
    await expect.poll(async () => !!(await findWork((w) => w.name === name)), { timeout: 15_000 }).toBe(true);
    return findWork((w) => w.name === name); // _docId is the prefixed id (task_<bare>)
  };

  // ── A + B: comments land under workItems/{prefixed}/comments, not legacy ────
  test('unified comments: task + ticket comments write to workItems subcollections', async ({ page }) => {
    // Task comment
    const taskName = e2eTitle(`WU comment task ${Date.now()}`);
    const task = await createTaskViaUI(page, taskName);
    expect(task._docId.startsWith('task_')).toBe(true);
    await openTasksHub(page);
    await openCard(page, taskName);
    const taskComment = `task comment ${Date.now()}`;
    await page.getByPlaceholder(/Add a comment/).fill(taskComment);
    await page.getByRole('button', { name: /^Post$/ }).click();
    await expect.poll(async () => (await commentsOf(task._docId)).some((c) => c.text === taskComment), { timeout: 15_000 }).toBe(true);

    // Ticket comment
    const ticketName = e2eTitle(`WU comment ticket ${Date.now()}`);
    await openMaintenanceHub(page);
    await page.getByRole('button', { name: /^\+ new ticket$/i }).click();
    await page.getByPlaceholder('Short descriptive name...').fill(ticketName);
    await page.getByRole('button', { name: /^create ticket$/i }).click();
    await expect.poll(async () => !!(await findWork((w) => w.name === ticketName && w.type === 'maintenance')), { timeout: 15_000 }).toBe(true);
    const ticket = await findWork((w) => w.name === ticketName);
    expect(ticket._docId.startsWith('mnt_')).toBe(true);
    await openMaintenanceHub(page);
    await openCard(page, ticketName);
    const ticketComment = `ticket comment ${Date.now()}`;
    await page.getByPlaceholder(/Add a comment/).fill(ticketComment);
    await page.getByRole('button', { name: /^Post$/ }).click();
    await expect.poll(async () => (await commentsOf(ticket._docId)).some((c) => c.text === ticketComment), { timeout: 15_000 }).toBe(true);
  });

  // ── C + cross-collection nulling: → Ticket convert, then delete the task ────
  test('→ Ticket convert links both workItems docs; deleting the task nulls the ticket backref', async ({ page }) => {
    const taskName = e2eTitle(`WU link ${Date.now()}`);
    const task = await createTaskViaUI(page, taskName);
    const bareTask = task._docId.replace(/^task_/, '');

    await openTasksHub(page);
    await openCard(page, taskName);
    await page.getByRole('button', { name: /^→ Ticket$/ }).click();
    await page.getByRole('button', { name: /^Create Ticket$/ }).click();

    // Task now carries a bare linkedTicketDocId; the ticket twin lives at
    // workItems/mnt_<bare> with the reverse backref (also bare).
    await expect.poll(async () => !!(await findWork((w) => w._docId === task._docId))?.linkedTicketDocId, { timeout: 15_000 }).toBe(true);
    const linkedTask = await findWork((w) => w._docId === task._docId);
    const bareTicket = linkedTask.linkedTicketDocId;
    const ticket = await getWorkItem(`mnt_${bareTicket}`);
    expect(ticket, 'converted ticket exists in workItems').toBeTruthy();
    expect(ticket.type).toBe('maintenance');
    expect(ticket.linkedTaskDocId).toBe(bareTask);

    // Deleting the task must null the ticket's backref (deleteTask → ticketDocRef).
    await openTasksHub(page);
    await openCard(page, taskName);
    await page.getByRole('button', { name: /^Delete$/ }).click();
    await acceptConfirm(page, 'Delete');
    await expect.poll(async () => {
      const tk = await getWorkItem(`mnt_${bareTicket}`);
      return tk && (tk.linkedTaskDocId === null || tk.linkedTaskDocId === undefined);
    }, { timeout: 15_000 }).toBe(true);
  });

  // ── D: → Job convert links across the workItems ↔ jobListings boundary ──────
  test('→ Job convert links the workItems task to a jobListings job by bare id', async ({ page }) => {
    const taskName = e2eTitle(`WU job-link ${Date.now()}`);
    const task = await createTaskViaUI(page, taskName);
    const bareTask = task._docId.replace(/^task_/, '');

    await openTasksHub(page);
    await openCard(page, taskName);
    await page.getByRole('button', { name: /^→ Job$/ }).click();
    const jobTitle = e2eTitle(`WU job ${Date.now()}`);
    await page.getByPlaceholder(/Job title/).fill(jobTitle);
    await page.getByRole('button', { name: /^Create Job$/ }).click();

    // jobListings is NOT migrated (stays its own collection): this proves the
    // bare-id link survives across the workItems ↔ jobListings boundary.
    await expect.poll(async () => !!(await findWork((w) => w._docId === task._docId))?.linkedJobDocId, { timeout: 15_000 }).toBe(true);
    const linkedTask = await findWork((w) => w._docId === task._docId);
    const job = (await listCollection('jobListings')).find((j) => j._docId === linkedTask.linkedJobDocId);
    expect(job, 'linked job exists in jobListings').toBeTruthy();
    expect(job.linkedTaskDocId).toBe(bareTask);
  });
});
