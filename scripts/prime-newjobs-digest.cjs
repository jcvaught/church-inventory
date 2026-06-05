/**
 * One-time priming for the new-shift SMS digest (sendNewJobsDigest).
 *
 * Run ONCE at the deploy of the new-jobs digest feature, BEFORE anyone can opt
 * in. It stamps every currently-open, upcoming job with `newJobsDigestSent: true`
 * so the existing backlog is never announced. After this runs, the scheduled
 * digest only ever announces jobs posted AFTER priming — no first-run blast,
 * regardless of when the first volunteer opts in.
 *
 * Idempotent: re-running only stamps jobs that aren't already stamped.
 *
 *   node scripts/prime-newjobs-digest.cjs
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

function todayCentral() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

(async () => {
  const today = todayCentral();
  const snap = await db.collectionGroup('jobListings')
    .where('status', '==', 'open')
    .where('scheduledDate', '>=', today)
    .get();

  console.log(`Found ${snap.size} open, upcoming job(s) (scheduledDate >= ${today}).`);

  let stamped = 0, already = 0;
  // Batch in chunks of 400 (Firestore batch cap is 500).
  let batch = db.batch();
  let inBatch = 0;
  for (const doc of snap.docs) {
    if (doc.data().newJobsDigestSent) { already++; continue; }
    batch.update(doc.ref, { newJobsDigestSent: true });
    stamped++; inBatch++;
    if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
  }
  if (inBatch > 0) await batch.commit();

  console.log(`Stamped ${stamped} job(s) as already-announced; ${already} were already stamped.`);
  console.log('Priming complete. The digest will now only announce jobs posted from here forward.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
