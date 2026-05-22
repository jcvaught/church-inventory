// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJobSignups, getJobWaitlist, seedSignup, seedWaitlistEntry, uids, daysFromNowStr, e2eTitle } from '../admin-helpers.js';

// §4 of docs/TEST-JOBS-HUB-2026-05-07.md — Waitlist + auto-promotion.
// Roster lives in signups/waitlist subcollections (audit H1, 2026-05-22).
// Auto-promotion now runs inline + server-side inside the jobWithdraw Cloud
// Function — both the admin-remove and member-withdraw paths trigger it.

test.describe('§4 Waitlist + auto-promotion', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  test('Admin removing a signup auto-promotes the head of the waitlist', async ({ page }) => {
    const u = await uids();

    // Seed a 1-spot job, Member A in signups, Member B in waitlist.
    const job = await createJob({
      title: e2eTitle('Waitlist Promotion'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });
    await seedWaitlistEntry(job.docId, { uid: u.memberB, name: 'E2E Member B' });

    // Sanity check seed state
    expect(await getJobSignups(job.docId)).toHaveLength(1);
    expect(await getJobWaitlist(job.docId)).toHaveLength(1);

    // Drive UI: admin opens Jobs Hub → opens this job → clicks ✕ next to Member A
    await page.goto('/');
    const onboardingClose = page.getByRole('button', { name: /^×$|^close$/i }).first();
    if (await onboardingClose.count() > 0) await onboardingClose.click().catch(() => {});

    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.getByRole('button', { name: /open ?→|^open$/i }).filter({ hasText: /jobs?/i }).first().click().catch(async () => {
      await page.locator('text=Job Hub').first().click();
    });
    await page.locator('text=' + job.title).first().click();

    page.once('dialog', dialog => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: /Remove Member A Test/ }).click();

    // jobWithdraw deletes the signup, then promotes the head of the waitlist
    // inline + server-side. Poll for the end-state: Member B promoted.
    await expect.poll(async () => {
      const [signups, waitlist] = await Promise.all([getJobSignups(job.docId), getJobWaitlist(job.docId)]);
      return { signupUids: signups.map(s => s.uid), waitlistLength: waitlist.length };
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toEqual({
      signupUids: [u.memberB],
      waitlistLength: 0,
    });

    const signups = await getJobSignups(job.docId);
    expect(signups[0].name).toBe('E2E Member B');
    expect(signups[0].signedUpAt).toBeTruthy();
  });

  test('Promotion is skipped when no waitlist exists', async ({ page }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Empty Waitlist'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 2,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });

    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + job.title).first().click();
    page.once('dialog', dialog => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: /Remove Member A Test/ }).click();

    await expect.poll(async () => (await getJobSignups(job.docId)).length, { timeout: 15_000 }).toBe(0);
    expect(await getJobWaitlist(job.docId)).toHaveLength(0);
  });

  test('Member self-withdrawal also auto-promotes the head of the waitlist', async ({ memberAPage }) => {
    // Companion to the admin-remove test. jobWithdraw promotes the waitlist
    // for both the admin-remove and member-withdraw paths.
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Member-Withdraw Promotion'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });
    await seedWaitlistEntry(job.docId, { uid: u.memberB, name: 'E2E Member B' });

    expect((await getJobSignups(job.docId))[0].uid).toBe(u.memberA);
    expect((await getJobWaitlist(job.docId))[0].uid).toBe(u.memberB);

    // Member A withdraws via their own browser session
    await memberAPage.goto('/');
    await memberAPage.getByRole('button', { name: /^hubs$/i }).first().click();
    await memberAPage.locator('text=Job Hub').first().click();
    await memberAPage.getByRole('button').filter({ hasText: job.title }).first().click();
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^withdraw$/i }).click();

    await expect.poll(async () => {
      const [signups, waitlist] = await Promise.all([getJobSignups(job.docId), getJobWaitlist(job.docId)]);
      return { signupUids: signups.map(s => s.uid), waitlistLength: waitlist.length };
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toEqual({
      signupUids: [u.memberB],
      waitlistLength: 0,
    });

    const signups = await getJobSignups(job.docId);
    expect(signups[0].name).toBe('E2E Member B');
    expect(signups[0].signedUpAt).toBeTruthy();
  });

  test('Waitlist respects the 50-entry cap (F-18)', async () => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Waitlist Cap'),
      scheduledDate: daysFromNowStr(3),
      spotsTotal: 1,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Fill the spot, then max the waitlist to 50 via the seeding helpers.
    await seedSignup(job.docId, { uid: u.memberA, name: 'Member A Test' });
    for (let i = 0; i < 50; i++) {
      await seedWaitlistEntry(job.docId, { uid: `fake-uid-${i}`, name: `Filler ${i}` });
    }
    // 50 is the documented ceiling; the jobSignUp Cloud Function rejects a
    // 51st waitlist join with a specific "waitlist is at capacity" error.
    expect(await getJobWaitlist(job.docId)).toHaveLength(50);
  });
});
