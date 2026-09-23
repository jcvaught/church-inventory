/**
 * Backlog #3 (DEC-2026-024) — one-time backfill of config/shepherdAccess.
 *
 * From this change on, the Shepherd Hub's rules and callables admit an elder
 * only if their email is on churches/{FXCC}/config/shepherdAccess, which the
 * saveShepherdRoster callable writes together with the roster. This script
 * derives that doc ONCE from the roster already in production, so the rules
 * deploy does not lock out the elders who are signed up today.
 *
 *   node scripts/backfill-shepherd-access.cjs          # dry run: print what it would write
 *   node scripts/backfill-shepherd-access.cjs --apply  # write it
 *
 * Refuses to act if the roster doc is missing or fails validateRoster (no
 * DEFAULT_ROSTER fallback — the access path fails closed), or if an access doc
 * already exists (the callable owns it from then on). Rollback = delete the
 * access doc, which denies every elder until it is rewritten.
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');
const { validateRoster, accessEmails } = require('../functions/lib/roster');

const FXCC = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

(async () => {
  console.log(`project ${key.project_id} · ${APPLY ? 'APPLY' : 'dry run'}`);
  const rosterSnap = await db.doc(`churches/${FXCC}/config/shepherdRoster`).get();
  if (!rosterSnap.exists) throw new Error('config/shepherdRoster does not exist — refusing (no default fallback).');
  const roster = rosterSnap.data();
  const invalid = validateRoster(roster);
  if (invalid) throw new Error(`roster fails validation: ${invalid} — fix it in the roster manager first.`);

  const accessRef = db.doc(`churches/${FXCC}/config/shepherdAccess`);
  const existing = await accessRef.get();
  if (existing.exists) throw new Error(`config/shepherdAccess already exists (${JSON.stringify(existing.data().emails)}) — refusing to overwrite.`);

  const emails = accessEmails(roster);
  console.log(`\n${roster.elders.length} elders on the roster → ${emails.length} emails with access:`);
  for (const e of roster.elders) {
    const state = e.active === false ? 'INACTIVE — no access' : e.sabbatical ? 'sabbatical — keeps access' : 'active';
    console.log(`  ${e.name.padEnd(18)} ${state.padEnd(26)} ${(e.emails || []).join(', ') || '(no email)'}`);
  }
  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); process.exit(0); }

  // create() fails if the doc appeared since the check above — never overwrite.
  await accessRef.create({ emails, version: 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: 'backfill-shepherd-access' });
  const written = (await accessRef.get()).data();
  const same = JSON.stringify(written.emails) === JSON.stringify(emails);
  console.log(`\nWrote config/shepherdAccess (version ${written.version}); read-back ${same ? 'matches' : 'DOES NOT MATCH'}.`);
  process.exit(same ? 0 : 1);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
