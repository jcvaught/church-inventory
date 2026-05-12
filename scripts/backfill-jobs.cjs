#!/usr/bin/env node
// Backfill missing required fields on jobListings docs across all churches.
//
// Pairs with the 2026-05-12 firestore.rules update (Phase C / Data #2) which
// added 'signups' in resource.data / 'waitlist' in resource.data / 'spotsTotal'
// in resource.data guards to the member-branch of jobListings update.
//
// Without this backfill, any legacy job doc missing those fields would fail
// the rule and members couldn't sign up. Today's app code (addJobListing /
// addJobListingSeries in useFirestore.js) always initializes these fields, so
// the population on Jill's church should be 0 changes — but run anyway to
// protect against legacy churches or restored backups.
//
// Usage:
//   node scripts/backfill-jobs.cjs             # dry-run; prints report only
//   node scripts/backfill-jobs.cjs --execute   # actually writes
//
// Required: scripts/serviceAccountKey.json (already in repo for local Admin SDK).

const admin = require('firebase-admin');
const path = require('path');

const key = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

const DRY_RUN = !process.argv.includes('--execute');

// Default value emitted only when the field is *missing* on the doc.
// If a doc has the field set to null/false/0, we don't overwrite — that's data,
// not absence.
const DEFAULTS = {
  signups: [],
  waitlist: [],
  attendance: [],            // documented as separate field per data model; backfill for forward compat
  requiredAccessTypes: [],
  requiresWaiver: false,
  spotsTotal: 1,             // minimum sensible default; preserves at-least-one-spot invariant
};

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'EXECUTE'}`);
  console.log('Scanning collectionGroup("jobListings")...');

  const snap = await db.collectionGroup('jobListings').get();
  console.log(`Total jobListings docs across all churches: ${snap.size}`);

  const perChurch = {};        // churchId → { totalDocs, needsBackfill: [{docId, missing[]}] }
  let totalNeedingBackfill = 0;

  snap.forEach((doc) => {
    const churchId = doc.ref.parent.parent.id;
    if (!perChurch[churchId]) perChurch[churchId] = { totalDocs: 0, needsBackfill: [] };
    perChurch[churchId].totalDocs += 1;

    const data = doc.data();
    const missing = Object.keys(DEFAULTS).filter((k) => !(k in data));
    if (missing.length > 0) {
      perChurch[churchId].needsBackfill.push({ docId: doc.id, missing });
      totalNeedingBackfill += 1;
    }
  });

  console.log('\n=== Per-church summary ===');
  for (const [churchId, info] of Object.entries(perChurch)) {
    if (info.needsBackfill.length === 0) {
      console.log(`  ${churchId}: ${info.totalDocs} docs, all complete ✓`);
    } else {
      console.log(`  ${churchId}: ${info.totalDocs} docs, ${info.needsBackfill.length} need backfill`);
      info.needsBackfill.slice(0, 5).forEach(({ docId, missing }) => {
        console.log(`    - ${docId}: missing [${missing.join(', ')}]`);
      });
      if (info.needsBackfill.length > 5) {
        console.log(`    - ... and ${info.needsBackfill.length - 5} more`);
      }
    }
  }

  console.log(`\nTotal docs needing backfill: ${totalNeedingBackfill}`);

  if (totalNeedingBackfill === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\nDry run — no writes performed. Run with --execute to apply.');
    process.exit(0);
  }

  // EXECUTE phase. Use batched writes (500 ops per batch, Firestore limit).
  console.log('\nApplying backfill...');
  const refsToBackfill = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const patch = {};
    for (const [field, defaultValue] of Object.entries(DEFAULTS)) {
      if (!(field in data)) patch[field] = defaultValue;
    }
    if (Object.keys(patch).length > 0) refsToBackfill.push({ ref: doc.ref, patch });
  });

  let applied = 0;
  for (let i = 0; i < refsToBackfill.length; i += 450) {
    const chunk = refsToBackfill.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach(({ ref, patch }) => batch.update(ref, patch));
    await batch.commit();
    applied += chunk.length;
    console.log(`  Applied ${applied} / ${refsToBackfill.length}`);
  }
  console.log(`\nBackfill complete. ${applied} docs updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  });
