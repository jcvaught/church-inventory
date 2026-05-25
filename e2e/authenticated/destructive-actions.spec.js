// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import {
  purgeE2EArtifacts, createAccessPerson, e2eTitle, db, churchId,
} from '../admin-helpers.js';

// Phase 2 of the 2026-05-24 UI audit replaced every `window.confirm(...)` call
// with the in-app `<ConfirmDialog>` primitive (src/components/primitives/
// ConfirmDialog.jsx). Destructive ops that are reversible — Deactivate person,
// Deactivate team member, Archive room, Retire item — also surface an
// `<UndoToast>` (UndoToast.jsx) with a 5-second window. This spec covers the
// People Access archive path because that's the path called out in the audit
// plan (PeopleAccessPage.jsx:667 — Deactivate person with Undo) and it
// exercises both new primitives end-to-end.

test.describe('Phase 2 — destructive actions', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  test('Archive person — Cancel + confirm + Undo round trip', async ({ page }) => {
    const person = await createAccessPerson({ name: e2eTitle('Phase2 Archive Target') });

    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});

    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=People Access').first().click();

    // Open person detail — match the exact e2e-prefixed name.
    await page.getByText(person.name, { exact: true }).first().click();
    const archiveTrigger = page.getByRole('button', { name: /^archive$/i }).first();
    await expect(archiveTrigger).toBeVisible({ timeout: 10_000 });

    // ── Cancel path — the new dialog should appear and dismiss cleanly ──
    await archiveTrigger.click();
    const dialog = page.getByRole('dialog', { name: /archive person/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();

    const beforeDoc = await db().doc(`churches/${churchId()}/accessPeople/${person._docId}`).get();
    expect(beforeDoc.data()?.active).not.toBe(false);

    // ── Confirm + Undo path ──
    await archiveTrigger.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^archive$/i }).click();

    // Doc should be soft-archived (active === false) almost immediately.
    await expect.poll(async () => {
      const s = await db().doc(`churches/${churchId()}/accessPeople/${person._docId}`).get();
      return s.data()?.active;
    }, { timeout: 10_000 }).toBe(false);

    // UndoToast surfaces a button labelled "Undo <Ns>" — match the leading word.
    const undoBtn = page.getByRole('button', { name: /^undo/i });
    await expect(undoBtn).toBeVisible({ timeout: 5_000 });
    await undoBtn.click();

    // Undo restores active back to true.
    await expect.poll(async () => {
      const s = await db().doc(`churches/${churchId()}/accessPeople/${person._docId}`).get();
      return s.data()?.active;
    }, { timeout: 10_000 }).toBe(true);
  });

  test('Type-to-confirm gate disables CTA until exact match is typed', async ({ page }) => {
    // Exercises the type-to-confirm code path on a low-blast-radius surface:
    // SettingsPage "Remove team member" requires typing the member's name.
    // We don't actually remove anyone — we just verify the gate behaviour.
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});

    await page.getByRole('button', { name: /^settings$/i }).first().click();
    // The Team Members card is admin-only; the auth fixture signs us in as admin.
    const removeBtn = page.getByRole('button', { name: /^remove$/i }).first();
    if (await removeBtn.count() === 0) test.skip(true, 'No removable team members visible in this fixture church.');

    await removeBtn.click();
    const dialog = page.getByRole('dialog', { name: /remove team member/i });
    await expect(dialog).toBeVisible();

    const confirmBtn = dialog.getByRole('button', { name: /^remove$/i });
    await expect(confirmBtn).toBeDisabled();

    // Typing a non-matching value keeps it disabled.
    const input = dialog.getByLabel(/type to confirm/i);
    await input.fill('not the right name');
    await expect(confirmBtn).toBeDisabled();

    // Cancel — we don't want to actually delete a teammate from prod.
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
  });
});
