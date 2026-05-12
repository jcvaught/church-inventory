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

const CHURCH_ID = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';

export function db() { return admin.firestore(); }
export function churchId() { return CHURCH_ID; }

// Test marker so we can identify and clean up E2E artifacts in prod data.
export const E2E_PREFIX = '[E2E]';
export function e2eTitle(label) { return `${E2E_PREFIX} ${label}`; }

// Wipe any leftover E2E jobs + announcements + access records from prior runs.
export async function purgeE2EArtifacts() {
  const f = db();
  const jobsSnap = await f.collection(`churches/${CHURCH_ID}/jobListings`).where('title', '>=', E2E_PREFIX).where('title', '<', E2E_PREFIX + '~').get();
  const annSnap = await f.collection(`churches/${CHURCH_ID}/jobAnnouncements`).where('title', '>=', E2E_PREFIX).where('title', '<', E2E_PREFIX + '~').get();
  const apSnap = await f.collection(`churches/${CHURCH_ID}/accessPeople`).where('name', '>=', E2E_PREFIX).where('name', '<', E2E_PREFIX + '~').get();
  const e2eAPIds = apSnap.docs.map(d => d.id);
  const arSnap = e2eAPIds.length
    ? await f.collection(`churches/${CHURCH_ID}/accessRecords`).where('personId', 'in', e2eAPIds.slice(0, 30)).get()
    : { docs: [], size: 0 };
  const batch = f.batch();
  jobsSnap.docs.forEach(d => batch.delete(d.ref));
  annSnap.docs.forEach(d => batch.delete(d.ref));
  apSnap.docs.forEach(d => batch.delete(d.ref));
  arSnap.docs.forEach(d => batch.delete(d.ref));
  if (jobsSnap.size + annSnap.size + apSnap.size + arSnap.size > 0) await batch.commit();
  return { jobs: jobsSnap.size, announcements: annSnap.size, accessPeople: apSnap.size, accessRecords: arSnap.size };
}

// Create an accessPeople doc; optionally linked to a user uid.
export async function createAccessPerson({ name, userId = null }) {
  const ref = await db().collection(`churches/${CHURCH_ID}/accessPeople`).add({
    name, userId, ministry: null, notes: null,
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
      signups: [], waitlist: [], attendance: [],
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

export async function setNotifications(enabled) {
  await db().doc(`churches/${CHURCH_ID}/config/notifications`).set({ enabled }, { merge: true });
}

// Resolve known E2E account uids (memoized).
let _uidCache = null;
export async function uids() {
  if (_uidCache) return _uidCache;
  const targets = {
    admin:   'e2e-admin@churchopshub.com',
    memberA: 'jcvaught@gmail.com',
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
