// @ts-check
import { test, expect } from '../firebase-fixtures.js';
import { purgeE2EArtifacts, createJob, getJobSignups, createAccessPerson, createAccessRecord, uids, daysFromNowStr, e2eTitle } from '../admin-helpers.js';

// §5 of docs/TEST-JOBS-HUB-2026-05-07.md — Compliance + waiver gates.
// Compliance is now enforced server-side in the jobSignUp Cloud Function
// (audit H2): a member who isn't access-eligible — no linked accessPeople
// record, no valid record for a required type, or an expired one — gets a
// single unified error surfaced via the flash banner:
//   "This job requires a valid <type> on file. Ask an admin to add yours
//    under People Access."
// The waiver still triggers a client-side window.confirm before the CF call;
// decline → no signup, accept → signup with acknowledgedWaiverAt.

test.describe('§5 Compliance + waiver gates', () => {
  test.afterEach(async () => { await purgeE2EArtifacts(); });

  async function navigateToJob(page, jobTitle) {
    await page.goto('/');
    await page.getByRole('button', { name: /^hubs$/i }).first().click();
    await page.locator('text=Job Hub').first().click();
    await page.locator('text=' + jobTitle).first().click();
  }

  test('Blocks signup when member has no linked accessPeople record', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Childcare — No Link'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 3,
      requiredAccessTypes: ['background_check'],
      requiresWaiver: true,
      waiverText: 'I agree to follow childcare safety policies.',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });

    await navigateToJob(memberAPage, job.title);
    // The waiver confirm fires client-side BEFORE the server-side compliance
    // check — accept it so the flow reaches the jobSignUp CF, which is what
    // rejects the ineligible member.
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^sign up$/i }).click();

    // Expect the flash banner with the server-side compliance error
    await expect(memberAPage.locator('text=Ask an admin to add yours')).toBeVisible({ timeout: 10_000 });

    // Verify Firestore: no signup recorded
    expect(await getJobSignups(job.docId)).toHaveLength(0);
  });

  test('Blocks signup when linked accessPeople has no valid Background Check', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Childcare — No Record'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 3,
      requiredAccessTypes: ['background_check'],
      requiresWaiver: false,
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    // Link Member A to an accessPeople doc, but DON'T create a record
    await createAccessPerson({ name: e2eTitle('Member A Person'), userId: u.memberA });

    await navigateToJob(memberAPage, job.title);
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^sign up$/i }).click();

    await expect(memberAPage.locator('text=Ask an admin to add yours')).toBeVisible({ timeout: 10_000 });
    expect(await getJobSignups(job.docId)).toHaveLength(0);
  });

  test('Blocks signup when Background Check record is expired', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Childcare — Expired'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 3,
      requiredAccessTypes: ['background_check'],
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const person = await createAccessPerson({ name: e2eTitle('Member A Person'), userId: u.memberA });
    // Expired yesterday
    await createAccessRecord({ personId: person._docId, type: 'background_check', expiryDate: daysFromNowStr(-1) });

    await navigateToJob(memberAPage, job.title);
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^sign up$/i }).click();

    await expect(memberAPage.locator('text=Ask an admin to add yours')).toBeVisible({ timeout: 10_000 });
    expect(await getJobSignups(job.docId)).toHaveLength(0);
  });

  test('Declining the waiver does not sign up', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Childcare — Decline Waiver'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 3,
      requiredAccessTypes: ['background_check'],
      requiresWaiver: true,
      waiverText: 'I agree to follow childcare safety policies.',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const person = await createAccessPerson({ name: e2eTitle('Member A Person'), userId: u.memberA });
    await createAccessRecord({ personId: person._docId, type: 'background_check', expiryDate: daysFromNowStr(180) });

    await navigateToJob(memberAPage, job.title);
    // Dismiss the waiver confirm
    memberAPage.once('dialog', dialog => dialog.dismiss().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^sign up$/i }).click();

    // Give the page a moment in case it tries to fire signUpForJob anyway
    await memberAPage.waitForTimeout(1500);
    expect(await getJobSignups(job.docId)).toHaveLength(0);
  });

  test('Accepting waiver with valid Background Check signs up + captures acknowledgedWaiverAt', async ({ memberAPage }) => {
    const u = await uids();
    const job = await createJob({
      title: e2eTitle('Childcare — Happy Path'),
      scheduledDate: daysFromNowStr(5),
      spotsTotal: 3,
      requiredAccessTypes: ['background_check'],
      requiresWaiver: true,
      waiverText: 'I agree to follow childcare safety policies.',
      createdBy: u.admin, createdByName: 'E2E Admin',
    });
    const person = await createAccessPerson({ name: e2eTitle('Member A Person'), userId: u.memberA });
    await createAccessRecord({ personId: person._docId, type: 'background_check', expiryDate: daysFromNowStr(180) });

    await navigateToJob(memberAPage, job.title);
    memberAPage.once('dialog', dialog => dialog.accept().catch(() => {}));
    await memberAPage.getByRole('dialog').getByRole('button', { name: /^sign up$/i }).click();

    await expect.poll(async () => (await getJobSignups(job.docId)).length, { timeout: 15_000 }).toBe(1);
    const final = await getJobSignups(job.docId);
    expect(final[0].uid).toBe(u.memberA);
    expect(final[0].acknowledgedWaiverAt).toBeTruthy();
  });
});
