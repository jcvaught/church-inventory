/**
 * Work Unification — set the per-church read-path flag.
 *
 * Flips `churches/{churchId}/config/featureFlags.workItemsEnabled`, the switch
 * that points a church's tasks + maintenance at the unified `workItems`
 * collection (on) vs. the legacy `tasks` / `maintenanceTickets` collections
 * (off). This is the toggle the Thursday maintenance window flips — and the one
 * the emulator/test rehearsals need to exercise the flag-on path. Until this
 * script existed nothing wrote the flag, so it could never be flipped.
 *
 * Safe by construction: writing to PRODUCTION requires the explicit `--prod`
 * guard (mirrors migrate-work-unification.cjs), so an emulator-intended run that
 * forgot `FIRESTORE_EMULATOR_HOST` refuses to touch prod instead of silently
 * flipping a real church.
 *
 * Usage:
 *   # EMULATOR (FIRESTORE_EMULATOR_HOST set — e.g. via `npm run flag:emulator`):
 *   node scripts/set-work-flag.cjs --church=<id> --on
 *   node scripts/set-work-flag.cjs --church=<id> --off
 *   node scripts/set-work-flag.cjs --church=<id> --status     # read, no write
 *
 *   # PRODUCTION (guarded — requires --prod; FXCC-first, watch, then roll out):
 *   node scripts/set-work-flag.cjs --church=<id> --on  --prod
 *   node scripts/set-work-flag.cjs --church=<id> --off --prod
 *   node scripts/set-work-flag.cjs --church=<id> --status --prod
 */
const admin = require('firebase-admin');

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROD_OK = process.argv.includes('--prod');
const ON = process.argv.includes('--on');
const OFF = process.argv.includes('--off');
const STATUS = process.argv.includes('--status');
const churchArg = process.argv.find((a) => a.startsWith('--church='));
const churchId = churchArg ? churchArg.slice('--church='.length) : null;

function die(msg) { console.error(msg); process.exit(1); }

if (!churchId) die('✋ Missing --church=<id>. Pass the church document id.');
if (!STATUS && !ON && !OFF) die('✋ Pass one of --on, --off, or --status.');
if (ON && OFF) die('✋ --on and --off are mutually exclusive.');

// Same prod guard as the migration: a real-backend write needs --prod, so an
// emulator run that forgot FIRESTORE_EMULATOR_HOST can never hit production.
if (!STATUS && !EMULATOR && !PROD_OK) {
  die('✋ Refusing to write PRODUCTION without --prod.\n' +
      '   For the emulator, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (or use `npm run flag:emulator`).\n' +
      '   For a real prod flip, re-run with --prod.');
}

if (EMULATOR) {
  admin.initializeApp({ projectId: 'church-inventory-9615c' });
} else {
  const key = require('./serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(key) });
}
const db = admin.firestore();

const TARGET = EMULATOR ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION';
const flagRef = db.doc(`churches/${churchId}/config/featureFlags`);

async function main() {
  const before = await flagRef.get();
  const current = before.exists && before.data().workItemsEnabled === true;
  console.log(`\nchurch : ${churchId}`);
  console.log(`target : ${TARGET}`);
  console.log(`current: workItemsEnabled = ${current}${before.exists ? '' : '  (no featureFlags doc yet → treated as off)'}`);

  if (STATUS) { console.log('\n(status only — no write)'); return; }

  // Confirm the church exists before flipping (a typo'd id would otherwise
  // create a stray featureFlags doc under a non-existent church).
  const church = await db.doc(`churches/${churchId}`).get();
  if (!church.exists) die(`\n✋ No church document at churches/${churchId} — refusing to write a flag under a non-existent church.`);

  const next = ON;
  if (next === current) { console.log(`\n= already ${next ? 'ON' : 'OFF'} — no change.`); return; }

  await flagRef.set({ workItemsEnabled: next }, { merge: true });
  console.log(`\n✍️  set workItemsEnabled = ${next}  →  ${next ? 'ON (unified workItems)' : 'OFF (legacy collections)'}`);
  if (!EMULATOR) console.log('   Prod flip applied. Watch logs/Sentry; flip --off to revert instantly (no deploy).');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
