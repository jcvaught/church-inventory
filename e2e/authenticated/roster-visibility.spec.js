// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJob, uids, daysFromNowStr, e2eTitle, db, churchId } from '../admin-helpers.js';

// §7 of docs/TEST-JOBS-HUB-2026-05-07.md — Roster visibility.
// settings.jobsRosterVisibility takes one of three values:
//   'admin'   — only admin/manager sees signup names
//   'signups' — members who are signed up see names (default)
//   'all'     — every church member sees names
// JobsPage canSeeRoster derives from this; admin/manager always see roster.

async function setRosterVisibility(val) {
  await db().doc(`churches/${churchId()}/config/settings`).set({ jobsRosterVisibility: val }, { merge: true });
}

test.describe('§7 Roster visibility', () => {
  test.beforeAll(async () => { await setRosterVisibility('signups'); }); // start at default
  test.afterEach(async () => { await purgeE2EArtifacts(); });
  test.afterAll(async () => { await setRosterVisibility('signups'); }); // restore default

  async function memberOpenJob(page, title) {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.getByRole('button').filter({ hasText: title }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10_000 });
  }

  test('Admin always sees roster regardless of setting', async ({ page }) => {
    await setRosterVisibility('admin');
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Admin Sees ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const now = new Date().toISOString();
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      signups: [{ uid: u.memberA, name: 'PublicMemberA', signedUpAt: now }],
      updatedAt: now,
    });

    await memberOpenJob(page, job.title);
    const modal = page.getByRole('dialog');
    await expect(modal.locator('text=PublicMemberA')).toBeVisible({ timeout: 5_000 });
  });

  test('rosterVisibility=admin hides signup names from regular members', async ({ memberAPage }) => {
    await setRosterVisibility('admin');
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Hidden ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const now = new Date().toISOString();
    // Seed Member B signed up; verify Member A (signed up to nothing) can't see B's name
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      signups: [{ uid: u.memberB, name: 'HiddenMemberB', signedUpAt: now }],
      updatedAt: now,
    });

    await memberOpenJob(memberAPage, job.title);
    const modal = memberAPage.getByRole('dialog');
    // Modal opens but signup name should NOT be visible
    await expect(modal.locator('text=HiddenMemberB')).toHaveCount(0);
  });

  test('rosterVisibility=signups: signed-up member sees roster', async ({ memberAPage }) => {
    await setRosterVisibility('signups');
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`Signups ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const now = new Date().toISOString();
    // Member A IS in signups → should see B's name (both are in roster)
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      signups: [
        { uid: u.memberA, name: 'Member A Test', signedUpAt: now },
        { uid: u.memberB, name: 'VisibleMemberB', signedUpAt: now },
      ],
      updatedAt: now,
    });

    await memberOpenJob(memberAPage, job.title);
    const modal = memberAPage.getByRole('dialog');
    await expect(modal.locator('text=VisibleMemberB')).toBeVisible({ timeout: 5_000 });
  });

  test('rosterVisibility=all: any member sees roster even when not signed up', async ({ memberAPage }) => {
    await setRosterVisibility('all');
    const u = await uids();
    const job = await createJob({
      title: e2eTitle(`AllVisible ${Date.now()}`),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const now = new Date().toISOString();
    // Member A NOT in signups; should still see B's name
    await db().doc(`churches/${churchId()}/jobListings/${job.docId}`).update({
      signups: [{ uid: u.memberB, name: 'AllVisibleMemberB', signedUpAt: now }],
      updatedAt: now,
    });

    await memberOpenJob(memberAPage, job.title);
    const modal = memberAPage.getByRole('dialog');
    await expect(modal.locator('text=AllVisibleMemberB')).toBeVisible({ timeout: 5_000 });
  });
});
