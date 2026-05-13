#!/usr/bin/env node
// Migrate legacy jobListings.scheduledTime free-text values to canonical HH:MM.
//
// Background: until 2026-05-12, the Job Hub used a free-text input for time,
// so docs have values like "2:00 PM", "2pm", "14:00", "evening", "TBD", etc.
// As of H-5, the input is <input type="time"> which produces canonical
// 24-hour HH:MM. This script normalizes the historical mix in place where it
// can parse a real time, and leaves unparseable values alone (they'll keep
// rendering via the legacy-pass-through path in formatTimeForDisplay).
//
// Usage:
//   node scripts/migrate-job-times.cjs             # dry-run; prints report
//   node scripts/migrate-job-times.cjs --execute   # actually writes

const admin = require('firebase-admin');
const path = require('path');

const key = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

const DRY_RUN = !process.argv.includes('--execute');

function parseTimeToHHMM(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] || '').toLowerCase();
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (min < 0 || min > 59) return null;
  if (ampm === 'pm' && h < 12) h += 12;
  else if (ampm === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

async function main() {
  console.log(DRY_RUN ? '[DRY RUN] Listing changes only. Re-run with --execute to write.\n' : '[EXECUTE] Writing changes to Firestore.\n');

  // jobListings live under churches/{churchId}/jobListings/{jobId}
  const churchesSnap = await db.collection('churches').get();
  let totalScanned = 0;
  let totalAlreadyCanonical = 0;
  let totalConverted = 0;
  let totalUnparseable = 0;
  let totalEmpty = 0;
  const unparseableSamples = new Set();
  const conversions = [];

  for (const churchDoc of churchesSnap.docs) {
    const jobsSnap = await db.collection(`churches/${churchDoc.id}/jobListings`).get();
    for (const jobDoc of jobsSnap.docs) {
      totalScanned += 1;
      const data = jobDoc.data();
      const original = data.scheduledTime;
      if (!original) { totalEmpty += 1; continue; }
      if (/^\d{2}:\d{2}$/.test(original)) { totalAlreadyCanonical += 1; continue; }
      const parsed = parseTimeToHHMM(original);
      if (!parsed) {
        totalUnparseable += 1;
        if (unparseableSamples.size < 20) unparseableSamples.add(original);
        continue;
      }
      totalConverted += 1;
      conversions.push({ churchId: churchDoc.id, jobId: jobDoc.id, from: original, to: parsed });
      if (!DRY_RUN) {
        await jobDoc.ref.update({ scheduledTime: parsed });
      }
    }
  }

  console.log(`Churches scanned:       ${churchesSnap.size}`);
  console.log(`Jobs scanned:           ${totalScanned}`);
  console.log(`  empty (no value):     ${totalEmpty}`);
  console.log(`  already canonical:    ${totalAlreadyCanonical}`);
  console.log(`  converted to HH:MM:   ${totalConverted}`);
  console.log(`  left unchanged:       ${totalUnparseable}`);
  if (conversions.length) {
    console.log(`\nFirst ${Math.min(15, conversions.length)} conversions:`);
    for (const c of conversions.slice(0, 15)) {
      console.log(`  ${c.churchId.slice(0, 8)}…/${c.jobId.slice(0, 8)}…   "${c.from}"  →  "${c.to}"`);
    }
  }
  if (unparseableSamples.size) {
    console.log(`\nUnparseable samples (left as-is):`);
    for (const s of unparseableSamples) console.log(`  "${s}"`);
  }

  if (DRY_RUN && totalConverted > 0) {
    console.log(`\nRe-run with --execute to apply.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
