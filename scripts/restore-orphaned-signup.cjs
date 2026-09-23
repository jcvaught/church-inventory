#!/usr/bin/env node
/**
 * restore-orphaned-signup.cjs — repair a half-finished church signup.
 *
 * Both signup flows in src/useAuth.js create the Firebase Auth account first,
 * then write Firestore. On any failure in between they try to delete the orphan
 * Auth account so the user can retry — but that cleanup is itself best effort
 * (useAuth.js:296, :361). One network fault can break the signup AND the
 * cleanup, leaving a user who can't go forward (the "Account incomplete" screen
 * only accepts an EXISTING church code) and can't start over ("This email is
 * already registered"). First seen 2026-09-22.
 *
 * This writes exactly what createChurch (src/useAuth.js:239-288) would have
 * written — same fields, same flat COH-012 subscription shape, nothing extra.
 * Creating the church doc fires sendWelcomeEmail (functions/index.js:1234).
 *
 * Usage:
 *   node scripts/restore-orphaned-signup.cjs \
 *     --uid UaWr... --email admin@church.org \
 *     --first Javid --last Workman \
 *     --church "Hopeful Trails" --code HOPEFUL [--dry-run]
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const EXPECTED_PROJECT = 'church-inventory-9615c';
const TRIAL_DAYS = 90; // src/lib/entitlement.js:30

// Copied verbatim from src/useAuth.js:39-60 — module-private there, so they
// can't be imported. Keep in sync if those defaults change.
const DEFAULT_LOCATIONS = [
  "Sanctuary", "Sound Booth", "Media Room", "Church Office",
  "Children's Wing", "Youth Room", "Security Office",
  "Maintenance Closet", "Storage Room A", "Storage Room B",
  "Outdoor Shed", "Kitchen", "Fellowship Hall", "Lobby"
];
const DEFAULT_MINISTRIES = [
  "Worship", "Media", "Administration", "Children's Ministry",
  "Youth Ministry", "Security", "Facilities", "Grounds",
  "Outreach", "Small Groups"
];
const DEFAULT_TAGS = [
  "audio-visual", "computers", "communication", "lighting",
  "streaming", "display", "power-tools", "hand-tools", "ladders",
  "outdoor", "plumbing", "electrical", "painting",
  "worship-tech", "sunday-essentials", "portable", "high-value",
  "office-supplies", "cleaning", "batteries", "worship-supplies"
];

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : process.argv[i + 1];
}
const DRY_RUN = process.argv.includes('--dry-run');

const uid        = arg('uid');
const email      = (arg('email') || '').trim().toLowerCase();
const firstName  = arg('first');
const lastName   = arg('last');
const churchName = arg('church');
const churchCode = (arg('code') || '').trim().toUpperCase();

if (!uid || !email || !firstName || !lastName || !churchName || !churchCode) {
  console.error('usage: --uid U --email E --first F --last L --church "Name" --code CODE [--dry-run]');
  process.exit(2);
}

function die(msg) { console.error('\n  ABORT: ' + msg + '\n'); process.exit(1); }

(async () => {
  if (serviceAccount.project_id !== EXPECTED_PROJECT) {
    die(`service account points at ${serviceAccount.project_id}, expected ${EXPECTED_PROJECT}`);
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const auth = admin.auth();

  const churchId = `${uid}-church`;
  console.log(`\nRestoring ${churchName} (${churchCode}) for ${email}`);
  console.log(`  project: ${serviceAccount.project_id}`);
  console.log(`  church:  churches/${churchId}${DRY_RUN ? '   [DRY RUN]' : ''}\n`);

  // ── Preflight ───────────────────────────────────────────────────────────
  let authUser;
  try { authUser = await auth.getUser(uid); }
  catch { die(`no Auth user with uid ${uid}`); }
  if ((authUser.email || '').toLowerCase() !== email) {
    die(`Auth email is ${authUser.email}, expected ${email} — wrong uid?`);
  }
  console.log(`  ✓ Auth user exists (${authUser.email}, created ${authUser.metadata.creationTime})`);

  if ((await db.doc(`users/${uid}`).get()).exists) die(`users/${uid} already exists — not an orphaned signup`);
  console.log('  ✓ users/ profile absent (as expected)');

  if ((await db.doc(`churches/${churchId}`).get()).exists) die(`churches/${churchId} already exists`);
  console.log('  ✓ church doc absent (as expected)');

  const codeTaken = await db.collection('churches').where('churchCode', '==', churchCode).limit(1).get();
  if (!codeTaken.empty) die(`church code ${churchCode} is already used by ${codeTaken.docs[0].id}`);
  console.log(`  ✓ church code ${churchCode} is free`);

  // sendWelcomeEmail greets the admin from Auth displayName, not Firestore
  // (functions/index.js:1250, :1264) — an empty one yields "Hi there".
  const wantName = `${firstName} ${lastName}`.trim();
  if (!authUser.displayName) {
    if (DRY_RUN) console.log(`  ! displayName empty — would set to "${wantName}"`);
    else { await auth.updateUser(uid, { displayName: wantName }); console.log(`  ✓ displayName set to "${wantName}"`); }
  } else {
    console.log(`  ✓ displayName present ("${authUser.displayName}")`);
  }

  // ── The batch — mirrors createChurch, src/useAuth.js:239-288 ────────────
  const now = new Date().toISOString();
  const trialEndsAt = new Date(Date.parse(now) + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const churchDoc = { churchName, churchCode, createdBy: uid, createdAt: now };
  const profile = {
    name: wantName, firstName, lastName, email,
    role: 'admin', churchId, active: true, createdAt: now, lastLogin: now,
  };
  const subscription = {
    plan: 'free', status: 'trialing', trialStartedAt: now, trialEndsAt,
    stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null,
    grandfathered: false, createdAt: now,
  };
  // No onboardingComplete on config/main — a restored church should get the
  // same first-run wizard a real one does (src/App.jsx:676).
  const configMain = { churchName, churchCode, createdBy: uid, createdAt: now };
  const configSettings = { locations: DEFAULT_LOCATIONS, ministries: DEFAULT_MINISTRIES, tags: DEFAULT_TAGS };

  console.log(`\n  trial: ${now}  →  ${trialEndsAt}  (${TRIAL_DAYS} days from restore)\n`);

  if (DRY_RUN) {
    console.log('  Would write:');
    for (const [path, data] of [
      [`churches/${churchId}`, churchDoc],
      [`users/${uid}`, profile],
      [`churches/${churchId}/config/main`, configMain],
      [`churches/${churchId}/config/settings`, { locations: `${DEFAULT_LOCATIONS.length} defaults`, ministries: `${DEFAULT_MINISTRIES.length} defaults`, tags: `${DEFAULT_TAGS.length} defaults` }],
      [`churches/${churchId}/config/subscription`, subscription],
    ]) console.log(`\n  ${path}\n` + JSON.stringify(data, null, 2).split('\n').map(l => '    ' + l).join('\n'));
    console.log('\n  DRY RUN — nothing written.\n');
    process.exit(0);
  }

  const batch = db.batch();
  batch.set(db.doc(`churches/${churchId}`), churchDoc);
  batch.set(db.doc(`users/${uid}`), profile);
  batch.set(db.doc(`churches/${churchId}/config/main`), configMain);
  batch.set(db.doc(`churches/${churchId}/config/settings`), configSettings);
  batch.set(db.doc(`churches/${churchId}/config/subscription`), subscription);
  await batch.commit();

  console.log('  ✓ batch committed — 5 documents written');
  console.log(`\n  Done. sendWelcomeEmail should fire on churches/${churchId}.`);
  console.log('  Verify with: node scripts/verify-restored-signup.cjs --uid ' + uid + '\n');
  process.exit(0);
})().catch(e => { console.error('\n  FAILED:', e.message, '\n'); process.exit(1); });
