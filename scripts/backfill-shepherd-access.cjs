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
 *   node scripts/backfill-shepherd-access.cjs --check  # read-only drift check:
 *       exit 1 unless the access list equals what the roster grants. Run it
 *       AFTER the rules deploy: until then an old client bundle can still write
 *       the roster directly, without the access list following (COH-014 review).
 *   node scripts/backfill-shepherd-access.cjs --repair # rewrite the access list from
 *       the roster if (and only if) they have drifted, then re-check. Also the
 *       recovery for a deleted or corrupted access doc.
 *
 * Refuses to act if the roster doc is missing or fails validateRoster (no
 * DEFAULT_ROSTER fallback — the access path fails closed), or if an access doc
 * already exists (the callable owns it from then on; use --repair to fix one).
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');
const { validateRoster, accessEmails } = require('../functions/lib/roster');

const FXCC = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';
const APPLY = process.argv.includes('--apply');
const REPAIR = process.argv.includes('--repair');
const CHECK = REPAIR || process.argv.includes('--check');
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

(async () => {
  console.log(`project ${key.project_id} · ${REPAIR ? 'repair' : CHECK ? 'check' : APPLY ? 'APPLY' : 'dry run'}`);
  const rosterSnap = await db.doc(`churches/${FXCC}/config/shepherdRoster`).get();
  if (!rosterSnap.exists) throw new Error('config/shepherdRoster does not exist — refusing (no default fallback).');
  const roster = rosterSnap.data();
  const invalid = validateRoster(roster);
  if (invalid) throw new Error(`roster fails validation: ${invalid} — fix it in the roster manager first.`);

  const accessRef = db.doc(`churches/${FXCC}/config/shepherdAccess`);
  const existing = await accessRef.get();
  if (CHECK) {
    const want = accessEmails(roster);
    const have = existing.exists ? existing.get('emails') : null;
    const ok = Array.isArray(have) && JSON.stringify(have) === JSON.stringify(want);
    console.log(`roster grants: ${JSON.stringify(want)}`);
    console.log(`access list:   ${JSON.stringify(have)}`);
    if (ok) { console.log('IN SYNC'); process.exit(0); }
    if (!REPAIR) { console.log('DRIFT — run with --repair (or re-save the roster from the roster manager).'); process.exit(1); }
    const prevVersion = existing.exists ? (existing.get('version') || 0) : 0;
    await accessRef.set({ emails: want, version: prevVersion + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: 'backfill-shepherd-access --repair' });
    const after = (await accessRef.get()).get('emails');
    const fixed = JSON.stringify(after) === JSON.stringify(want);
    console.log(fixed ? `REPAIRED — access list rewritten from the roster (version ${prevVersion + 1}); IN SYNC` : 'REPAIR FAILED — read-back does not match');
    process.exit(fixed ? 0 : 1);
  }
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
