/**
 * One-time backfill for Jobs Hub audit M6 (2026-05-22).
 *
 * The twilioInbound webhook now only honors a START re-opt-in for users who
 * carry an `smsConsentAt` consent record (so a recycled/family number can't
 * re-opt-in someone who never consented). Existing users who already have
 * `smsRemindersEnabled: true` consented under the old model and have no
 * `smsConsentAt` field — without this backfill, a STOP→START round-trip
 * would fail to revive them.
 *
 * This stamps `smsConsentAt` (ISO string) on every user doc that currently
 * has `smsRemindersEnabled === true` and lacks the field. Idempotent.
 *
 *   node scripts/backfill-sms-consent.cjs
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').where('smsRemindersEnabled', '==', true).get();
  console.log(`Found ${snap.size} user(s) with smsRemindersEnabled === true.`);

  let stamped = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    if (doc.data().smsConsentAt) { skipped++; continue; }
    await doc.ref.update({ smsConsentAt: new Date().toISOString() });
    stamped++;
    console.log(`  stamped smsConsentAt on users/${doc.id}`);
  }

  console.log(`Done. ${stamped} stamped, ${skipped} already had smsConsentAt.`);
  process.exit(0);
})().catch((e) => {
  console.error('backfill-sms-consent failed:', e);
  process.exit(1);
});
