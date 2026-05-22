/**
 * One-time migration for the Jobs Hub roster refactor (audit H1, 2026-05-22).
 *
 * Moves each jobListings doc's signups[] / waitlist[] arrays into protected
 * per-uid subcollections (jobListings/{id}/signups/{uid}, .../waitlist/{uid})
 * and writes the server-maintained signupCount / waitlistCount integers.
 *
 * TWO PHASES so the cutover can roll back:
 *   node scripts/migrate-job-signups.cjs            → Phase 1: backfill
 *       (creates subcollection docs + counters; leaves the legacy arrays in
 *        place — purely additive, safe to run before the new code deploys)
 *   node scripts/migrate-job-signups.cjs --finalize → Phase 2: cleanup
 *       (deletes the legacy signups[]/waitlist[] arrays — run only AFTER the
 *        new code is deployed and verified)
 *
 * Both phases are idempotent. Against the Firebase emulator, set
 * FIRESTORE_EMULATOR_HOST=localhost:8080 first.
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const FINALIZE = process.argv.includes('--finalize');

async function main() {
  const snap = await db.collectionGroup('jobListings').get();
  console.log(`Found ${snap.size} jobListings docs across all churches.`);
  let migrated = 0, finalized = 0, skipped = 0;

  for (const jobDoc of snap.docs) {
    const data = jobDoc.data();

    if (FINALIZE) {
      // Phase 2 — drop the legacy arrays.
      if (data.signups === undefined && data.waitlist === undefined) { skipped++; continue; }
      await jobDoc.ref.update({
        signups: FieldValue.delete(),
        waitlist: FieldValue.delete(),
      });
      finalized++;
      continue;
    }

    // Phase 1 — backfill subcollections + counters.
    // Skip docs already on the new model (no legacy arrays at all) so a
    // re-run, or a signup that lands in the deploy→backfill window, never
    // clobbers a server-maintained counter back to 0.
    if (data.signups === undefined && data.waitlist === undefined) { skipped++; continue; }
    const signups = Array.isArray(data.signups) ? data.signups : [];
    const waitlist = Array.isArray(data.waitlist) ? data.waitlist : [];
    const batch = db.batch();
    for (const s of signups) {
      if (!s || !s.uid) continue;
      batch.set(jobDoc.ref.collection('signups').doc(s.uid), s);
    }
    for (const w of waitlist) {
      if (!w || !w.uid) continue;
      batch.set(jobDoc.ref.collection('waitlist').doc(w.uid), w);
    }
    batch.update(jobDoc.ref, {
      signupCount: signups.filter(s => s && s.uid).length,
      waitlistCount: waitlist.filter(w => w && w.uid).length,
    });
    await batch.commit();
    migrated++;
  }

  if (FINALIZE) {
    console.log(`Phase 2 done — legacy arrays removed from ${finalized} docs (${skipped} already clean).`);
  } else {
    console.log(`Phase 1 done — backfilled ${migrated} jobs into signups/waitlist subcollections + counters (${skipped} already on the new model).`);
    console.log('Verify the app, then run with --finalize to drop the legacy arrays.');
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
