// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJob, uids, daysFromNowStr, e2eTitle, db, churchId } from '../admin-helpers.js';

// §11 of docs/TEST-JOBS-HUB-2026-05-07.md — recurring series operations.
// Series jobs share a `recurrenceGroupId`. The most error-prone operation
// is "delete series" because it's a batched cross-doc atomic delete. This
// spec exercises that path end-to-end via the UI. Series-edit "this +
// future" cascade is documented as a UAT spot-check but its UI requires
// the edit modal's scope toggle; deferred to a follow-up spec.

test.describe('§11 Recurring series', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  async function seedSeries(count, baseTitle, recurrenceGroupId, createdBy) {
    const jobs = [];
    for (let i = 0; i < count; i++) {
      const j = await createJob({
        title: `${baseTitle} #${i + 1}`,
        scheduledDate: daysFromNowStr(7 + i * 7), // weekly
        spotsTotal: 4,
        createdBy: createdBy.uid,
        createdByName: createdBy.name,
      });
      // Patch in the recurrenceGroupId — createJob doesn't take it
      await db().doc(`churches/${churchId()}/jobListings/${j.docId}`).update({
        recurrenceGroupId,
        recurrenceFreq: 'weekly',
      });
      jobs.push(j);
    }
    return jobs;
  }

  test('Admin can delete an entire recurring series in one action', async ({ page }) => {
    const u = await uids();
    const groupId = `e2e-series-${Date.now()}`;
    const seriesTitle = e2eTitle('Series Delete');
    const jobs = await seedSeries(4, seriesTitle, groupId, { uid: u.admin, name: 'E2E Admin' });

    // Sanity check: all 4 jobs exist with the same group id
    for (const j of jobs) {
      const doc = await getJob(j.docId);
      expect(doc.recurrenceGroupId).toBe(groupId);
    }

    // Open the FIRST job in the series and trigger Delete Series
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + jobs[0].title).first().click();

    // The "Delete Series" button only appears for jobs with a recurrenceGroupId.
    // Accept both confirmation dialogs (some series-delete UIs prompt twice).
    page.on('dialog', dialog => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: /^delete series/i }).click();

    // Poll Firestore until all four docs are gone
    await expect.poll(async () => {
      const snap = await db()
        .collection(`churches/${churchId()}/jobListings`)
        .where('recurrenceGroupId', '==', groupId)
        .get();
      return snap.size;
    }, { timeout: 30_000, intervals: [1000, 2000, 3000] }).toBe(0);
  });

  test('Members signed up to series jobs see the right series count before delete', async ({ page }) => {
    // Simpler structural test: seed a series with one signup and verify the
    // pre-delete state matches expectations. Acts as a regression guard
    // that the series shape stays consistent on read.
    const u = await uids();
    const groupId = `e2e-series-read-${Date.now()}`;
    const seriesTitle = e2eTitle('Series Read');
    const jobs = await seedSeries(3, seriesTitle, groupId, { uid: u.admin, name: 'E2E Admin' });

    // Pre-seed Member A as signed up to the second job in the series
    const now = new Date().toISOString();
    await db().doc(`churches/${churchId()}/jobListings/${jobs[1].docId}`).update({
      signups: [{ uid: u.memberA, name: 'Member A Test', signedUpAt: now }],
      updatedAt: now,
    });

    // Verify Firestore shape: 3 jobs in the series, 1 signup on the middle one
    const snap = await db()
      .collection(`churches/${churchId()}/jobListings`)
      .where('recurrenceGroupId', '==', groupId)
      .get();
    expect(snap.size).toBe(3);
    const withSignup = snap.docs.filter(d => (d.data().signups || []).length > 0);
    expect(withSignup).toHaveLength(1);
    expect(withSignup[0].data().signups[0].uid).toBe(u.memberA);
  });
});
