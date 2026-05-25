// @ts-check
// Per-spec setup/teardown helpers using firebase-admin.
// Lets E2E specs seed jobs, assert Firestore state, and clean up without
// driving the UI for every operation.

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!admin.apps.length) {
  const key = require(pathResolve(__dirname, '..', 'scripts', 'serviceAccountKey.json'));
  admin.initializeApp({ credential: admin.credential.cert(key) });
}

// Dedicated test tenant — see docs/E2E-ISOLATION-PLAN-2026-05-25.md Layer 1.
// All E2E data lives here; real customer churches stay untouched.
// Guard against a future hardcode accidentally pointing at a real church.
const CHURCH_ID = 'e2e-test-church';
if (!CHURCH_ID.startsWith('e2e-')) {
  throw new Error(`E2E suite refuses to run against non-e2e-prefixed churchId: ${CHURCH_ID}`);
}

export function db() { return admin.firestore(); }
export function churchId() { return CHURCH_ID; }

// Test marker so we can identify and clean up E2E artifacts in prod data.
export const E2E_PREFIX = '[E2E]';
export function e2eTitle(label) { return `${E2E_PREFIX} ${label}`; }

// Wipe any leftover E2E jobs + announcements + access records from prior runs.
//
// Uses firestore.recursiveDelete() instead of a flat batch so the per-uid
// subcollections under jobListings (signups/, waitlist/, and any future
// children like comments/) get cleaned up too — the 2026-05-22 Jobs Hub H1
// refactor moved the roster into protected subcollections, and Firestore
// has no cascade-delete, so a parent-only batch left orphans that polluted
// later waitlist specs. See docs/E2E-ISOLATION-PLAN-2026-05-25.md.
//
// recursiveDelete is destructive — every ref passed here MUST come from an
// [E2E]-prefixed query result so a stray ref can't take out real data.
export async function purgeE2EArtifacts() {
  const f = db();
  const jobsSnap = await f.collection(`churches/${CHURCH_ID}/jobListings`).where('title', '>=', E2E_PREFIX).where('title', '<', E2E_PREFIX + '~').get();
  const annSnap = await f.collection(`churches/${CHURCH_ID}/jobAnnouncements`).where('title', '>=', E2E_PREFIX).where('title', '<', E2E_PREFIX + '~').get();
  const apSnap = await f.collection(`churches/${CHURCH_ID}/accessPeople`).where('name', '>=', E2E_PREFIX).where('name', '<', E2E_PREFIX + '~').get();
  const e2eAPIds = apSnap.docs.map(d => d.id);
  const arSnap = e2eAPIds.length
    ? await f.collection(`churches/${CHURCH_ID}/accessRecords`).where('personId', 'in', e2eAPIds.slice(0, 30)).get()
    : { docs: [], size: 0 };
  for (const doc of jobsSnap.docs) await f.recursiveDelete(doc.ref);
  for (const doc of annSnap.docs) await f.recursiveDelete(doc.ref);
  for (const doc of apSnap.docs) await f.recursiveDelete(doc.ref);
  for (const doc of arSnap.docs) await f.recursiveDelete(doc.ref);
  return { jobs: jobsSnap.size, announcements: annSnap.size, accessPeople: apSnap.size, accessRecords: arSnap.size };
}

// Create an accessPeople doc; optionally linked to a user uid.
// Create a jobAnnouncement doc; the [E2E] title prefix lets the purge helper find it.
export async function createAnnouncement({ title, body, pinned = false, expiresAt = null, createdBy, createdByName }) {
  const now = new Date().toISOString();
  const ref = await db().collection(`churches/${CHURCH_ID}/jobAnnouncements`).add({
    title, body: body || '', pinned, expiresAt,
    createdBy, createdByName,
    createdAt: now, updatedAt: now,
  });
  return { _docId: ref.id, title };
}

export async function getAnnouncement(docId) {
  const snap = await db().doc(`churches/${CHURCH_ID}/jobAnnouncements/${docId}`).get();
  return snap.exists ? { _docId: docId, ...snap.data() } : null;
}

export async function createAccessPerson({ name, userId = null }) {
  const ref = await db().collection(`churches/${CHURCH_ID}/accessPeople`).add({
    name, userId, ministry: null, notes: null, active: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  return { _docId: ref.id, name, userId };
}

// Create an accessRecords doc for a given accessPeople _docId.
export async function createAccessRecord({ personId, type, expiryDate = null, notes = null }) {
  const ref = await db().collection(`churches/${CHURCH_ID}/accessRecords`).add({
    personId, type, expiryDate, notes,
    createdAt: new Date().toISOString(),
  });
  return { _docId: ref.id, personId, type, expiryDate };
}

// Create a job atomically (mirrors the addJobListing transaction).
export async function createJob({ title, scheduledDate, scheduledTime = '', location = '', spotsTotal = 1, pay = null, requiredAccessTypes = [], requiresWaiver = false, waiverText = '', jobLead = null, createdBy, createdByName, status = 'open' }) {
  const f = db();
  const configRef = f.doc(`churches/${CHURCH_ID}/config/main`);
  const jobRef = f.collection(`churches/${CHURCH_ID}/jobListings`).doc();
  const now = new Date().toISOString();
  await f.runTransaction(async (t) => {
    const configSnap = await t.get(configRef);
    const maxNum = (configSnap.data()?.maxJobNumber || 0) + 1;
    const jobNumber = 'JOB-' + String(maxNum).padStart(3, '0');
    t.set(configRef, { maxJobNumber: maxNum }, { merge: true });
    t.set(jobRef, {
      title, description: '', scheduledDate, scheduledTime, location,
      spotsTotal, pay, status, jobLead,
      requiresWaiver, waiverText, requiredAccessTypes,
      // Roster lives in signups/waitlist subcollections (audit H1) — the
      // parent carries server-maintained counters only.
      signupCount: 0, waitlistCount: 0,
      createdBy, createdByName, createdAt: now, updatedAt: now,
      jobNumber,
    });
  });
  const snap = await jobRef.get();
  return { docId: jobRef.id, ...snap.data() };
}

export async function getJob(docId) {
  const snap = await db().doc(`churches/${CHURCH_ID}/jobListings/${docId}`).get();
  return snap.exists ? { docId, ...snap.data() } : null;
}

export async function deleteJob(docId) {
  await db().doc(`churches/${CHURCH_ID}/jobListings/${docId}`).delete();
}

// ── Job roster subcollection helpers (audit H1, 2026-05-22) ──
// The signups/waitlist roster lives in per-uid subcollections; tests seed and
// read it through these helpers instead of the legacy parent-doc arrays.
export async function seedSignup(jobDocId, { uid, name = 'E2E User', attended, acknowledgedWaiverAt } = {}) {
  const entry = { uid, name, signedUpAt: new Date().toISOString() };
  if (attended !== undefined) entry.attended = attended;
  if (acknowledgedWaiverAt) entry.acknowledgedWaiverAt = acknowledgedWaiverAt;
  await db().doc(`churches/${CHURCH_ID}/jobListings/${jobDocId}/signups/${uid}`).set(entry);
  await db().doc(`churches/${CHURCH_ID}/jobListings/${jobDocId}`).update({
    signupCount: admin.firestore.FieldValue.increment(1),
  });
}
export async function seedWaitlistEntry(jobDocId, { uid, name = 'E2E User', acknowledgedWaiverAt } = {}) {
  const entry = { uid, name, addedAt: new Date().toISOString() };
  if (acknowledgedWaiverAt) entry.acknowledgedWaiverAt = acknowledgedWaiverAt;
  await db().doc(`churches/${CHURCH_ID}/jobListings/${jobDocId}/waitlist/${uid}`).set(entry);
  await db().doc(`churches/${CHURCH_ID}/jobListings/${jobDocId}`).update({
    waitlistCount: admin.firestore.FieldValue.increment(1),
  });
}
export async function getJobSignups(jobDocId) {
  const snap = await db().collection(`churches/${CHURCH_ID}/jobListings/${jobDocId}/signups`).get();
  return snap.docs.map(d => d.data());
}
export async function getJobWaitlist(jobDocId) {
  const snap = await db().collection(`churches/${CHURCH_ID}/jobListings/${jobDocId}/waitlist`).get();
  return snap.docs.map(d => d.data());
}

export async function setNotifications(enabled) {
  await db().doc(`churches/${CHURCH_ID}/config/notifications`).set({ enabled }, { merge: true });
}

// Resolve known E2E account uids (memoized).
let _uidCache = null;
export async function uids() {
  if (_uidCache) return _uidCache;
  const targets = {
    admin:   'e2e-admin@churchopshub.com',
    memberA: 'e2e-member-a@churchopshub.com',
    memberB: 'e2e-member-b@churchopshub.com',
  };
  const out = {};
  for (const [k, email] of Object.entries(targets)) {
    try { out[k] = (await admin.auth().getUserByEmail(email)).uid; }
    catch { out[k] = null; }
  }
  _uidCache = out;
  return out;
}

// Click the primary CTA inside the active ConfirmDialog modal (Phase 2,
// 2026-05-25). Pass the exact confirmLabel the call site uses
// (e.g. 'Remove', 'Withdraw', 'Delete series', 'Copy link'). Caller is
// responsible for triggering the dialog first. Replaces the old
// `page.once('dialog', d => d.accept())` pattern, which is for *native*
// browser dialogs and silently no-ops against React modals.
//
// Uses .last() because ConfirmDialog often opens on top of an existing
// content modal (e.g. job detail → Withdraw → confirm), so the topmost
// dialog in DOM-insertion order is the one the test wants to confirm.
export async function acceptConfirm(page, label) {
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  await dialog.getByRole('button', { name: new RegExp('^' + label + '$', 'i') }).click();
}

// Same pattern, but clicks the Cancel button. Use for tests that want to
// verify the dialog appeared but back out instead of confirming.
export async function dismissConfirm(page, label = 'Cancel') {
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  await dialog.getByRole('button', { name: new RegExp('^' + label + '$', 'i') }).click();
}

export function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
export function daysFromNowStr(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
