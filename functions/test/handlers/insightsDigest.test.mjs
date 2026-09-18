// COH-012 Part B — sendWeeklyInsightsDigest reads BOTH activityLog timestamp
// lanes (emulator-backed).
//
// activityLog.timestamp is an ISO STRING on historical rows and a Firestore
// TIMESTAMP on rows since 812f15e. Firestore orders by type before value, so
// the digest's old single `where('timestamp','>=',<string>)` saw the string
// lane only (measured on FXCC: 173 of 213 rows). This file seeds one row of
// EACH type inside the 90-day window and one of each outside it, and asserts
// the digest counts exactly the two in-window rows. A test that seeds only
// one lane passes against the old code and proves nothing (plan Part B §2).
//
// Run via:  npm run test:handlers
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { loadFunctions, db, installFetchStub } from './setup.mjs';

process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

let funcs;
before(async () => { funcs = await loadFunctions(); });
after(() => { funcs._resetClock(); });

// 2026-06-15 is a Monday; 08:00Z at a UTC-timezone church satisfies the
// church-local Monday-8am gate deterministically (same trick as scheduledSends).
const MONDAY_8AM_UTC = new Date('2026-06-15T08:00:00Z');
// since90 = 2026-03-17. In-window and out-of-window instants, one per lane.
const IN_WINDOW_A = '2026-05-01T12:00:00.000Z';
const IN_WINDOW_B = '2026-06-01T12:00:00.000Z';
const OUT_WINDOW_A = '2025-01-01T12:00:00.000Z';
const OUT_WINDOW_B = '2025-06-01T12:00:00.000Z';

let fetchStub;
beforeEach(() => { fetchStub = installFetchStub(); });
afterEach(() => { fetchStub.restore(); funcs._resetClock(); });

// The emulator is shared across this file's tests (and the other handler
// files), so earlier churches keep qualifying on later runs — scope every
// assertion to THIS church's admin.
const brevoCalls = (churchId) => fetchStub.calls
  .filter((c) => /brevo|smtp\/email/.test(c.url))
  .filter((c) => JSON.stringify(JSON.parse(c.options.body).to).includes(`${churchId}-admin@test.com`));
const sentHtml = (c) => JSON.parse(c.options.body).htmlContent;

// A digest-enabled, grandfathered, UTC church with one admin and one item.
async function seedChurch(churchId) {
  const d = db();
  await d.doc(`churches/${churchId}`).set({ churchName: 'Lanes Church' });
  await d.doc(`churches/${churchId}/config/settings`).set({ timeZone: 'UTC', insightsDigestEnabled: true });
  await d.doc(`churches/${churchId}/config/subscription`).set({ grandfathered: true, plan: 'all_in', status: 'active' });
  await d.doc(`users/${churchId}-admin`).set({ email: `${churchId}-admin@test.com`, name: 'Admin', churchId, role: 'admin', active: true });
  await d.doc(`churches/${churchId}/items/i1`).set({ itemId: 'i1', description: 'Projector', status: 'Available' });
}

async function seedCheckout(churchId, docId, timestamp) {
  await db().doc(`churches/${churchId}/activityLog/${docId}`).set({ action: 'check_out', itemId: 'i1', userId: 'u1', timestamp });
}

test('counts a string-timestamped AND a Timestamp-timestamped checkout in the window; ignores both lanes outside it', async () => {
  const churchId = 'lanes-A-church';
  await seedChurch(churchId);
  await seedCheckout(churchId, 'legacy-in', IN_WINDOW_A);                                    // string lane, in window
  await seedCheckout(churchId, 'current-in', Timestamp.fromDate(new Date(IN_WINDOW_B)));      // Timestamp lane, in window
  await seedCheckout(churchId, 'legacy-out', OUT_WINDOW_A);                                   // string lane, too old
  await seedCheckout(churchId, 'current-out', Timestamp.fromDate(new Date(OUT_WINDOW_B)));    // Timestamp lane, too old
  funcs._setClock(() => MONDAY_8AM_UTC);

  await funcs.sendWeeklyInsightsDigest.run();

  const calls = brevoCalls(churchId);
  assert.equal(calls.length, 1, 'one digest email to the one admin');
  const html = sentHtml(calls[0]);
  assert.match(html, /Projector — <strong>2 checkouts<\/strong>/, 'both in-window lanes counted, neither out-of-window row');
});

test('a Timestamp-only window still produces a digest (the lane the old query never saw)', async () => {
  const churchId = 'lanes-B-church';
  await seedChurch(churchId);
  await seedCheckout(churchId, 'current-in', Timestamp.fromDate(new Date(IN_WINDOW_B)));
  await seedCheckout(churchId, 'legacy-out', OUT_WINDOW_A);
  funcs._setClock(() => MONDAY_8AM_UTC);

  await funcs.sendWeeklyInsightsDigest.run();

  const calls = brevoCalls(churchId);
  assert.equal(calls.length, 1, 'digest sent from the Timestamp lane alone');
  assert.match(sentHtml(calls[0]), /Projector — <strong>1 checkout<\/strong>/);
});

test('the string lane does not leak Timestamp rows from outside the window', async () => {
  // The string lane has NO upper bound (a mixed-type `< Timestamp(0)` bound
  // matched nothing in production — 0 rows on FXCC 2026-09-18). What keeps
  // Timestamp rows out of it is Firestore's type-scoped inequality, measured
  // in production and in the emulator alike. This pins that assumption: if it
  // ever stops holding, a year-old Timestamp row would be counted here.
  const churchId = 'lanes-C-church';
  await seedChurch(churchId);
  await seedCheckout(churchId, 'legacy-in', IN_WINDOW_A);
  await seedCheckout(churchId, 'current-out', Timestamp.fromDate(new Date(OUT_WINDOW_B)));
  funcs._setClock(() => MONDAY_8AM_UTC);

  await funcs.sendWeeklyInsightsDigest.run();

  const calls = brevoCalls(churchId);
  assert.equal(calls.length, 1);
  assert.match(sentHtml(calls[0]), /Projector — <strong>1 checkout<\/strong>/, 'only the in-window string row');
});
