/**
 * One-time backfill (2026-06-12): standardize stored phone numbers.
 *
 * The app now formats phone numbers as (555) 555-5555 on entry and display
 * (src/utils/phone.js → formatPhone), but records saved before that change
 * still hold raw digits. This rewrites the stored value to the same canonical
 * format so storage matches what the UI now writes.
 *
 * Scope — the phone fields the app collects from users:
 *   - accessPeople.phone   (People Access Hub contacts)
 *   - vendors.phone        (Maintenance Hub vendors)
 *   - publicRequests.phone (public item-request submissions)
 *
 * Deliberately NOT touched:
 *   - users.phone          → E.164 (+15551234567); Twilio requires this exact
 *                            shape to send SMS. Re-formatting would break texts.
 *   - shepherdPeople.phones[] → read-only Planning Center cache (CF-write-only,
 *                            client writes are rules-blocked anyway).
 *
 * Uses collectionGroup queries so it covers every church tenant at once.
 * Idempotent: a value already in canonical form is skipped.
 *
 *   node scripts/backfill-phone-format.cjs            # DRY RUN (no writes)
 *   node scripts/backfill-phone-format.cjs --commit   # actually write
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

const COMMIT = process.argv.includes('--commit');

// Mirror of src/utils/phone.js formatPhone — keep in sync.
function formatPhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)} x${d.slice(10)}`;
}

async function backfillGroup(group) {
  const snap = await db.collectionGroup(group).get();
  let changed = 0, already = 0, blank = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snap.docs) {
    const raw = doc.data().phone;
    if (!raw) { blank++; continue; }
    const formatted = formatPhone(raw);
    if (!formatted) { blank++; continue; }      // unparseable → leave as-is
    if (formatted === raw) { already++; continue; }

    console.log(`  ${group}/${doc.ref.path}\n      "${raw}" → "${formatted}"`);
    changed++;
    if (COMMIT) {
      batch.update(doc.ref, { phone: formatted });
      if (++pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }
  if (COMMIT && pending > 0) await batch.commit();

  console.log(`${group}: ${snap.size} docs · ${changed} ${COMMIT ? 'updated' : 'to update'} · ${already} already canonical · ${blank} blank/unparseable\n`);
  return changed;
}

(async () => {
  console.log(COMMIT ? '=== COMMIT MODE — writing changes ===\n' : '=== DRY RUN — no writes (pass --commit to apply) ===\n');
  let total = 0;
  for (const group of ['accessPeople', 'vendors', 'publicRequests']) {
    total += await backfillGroup(group);
  }
  console.log(`Total ${COMMIT ? 'updated' : 'that would be updated'}: ${total}`);
  process.exit(0);
})().catch((e) => {
  console.error('backfill-phone-format failed:', e);
  process.exit(1);
});
