// scripts/setup-e2e-tenant.mjs
//
// Idempotent bootstrap for the dedicated `e2e-test-church` tenant.
// Run from the repo root:
//
//     node scripts/setup-e2e-tenant.mjs
//
// Reads scripts/serviceAccountKey.json for Admin SDK creds.
//
// Layer 1 of docs/E2E-ISOLATION-PLAN-2026-05-25.md. Decouples the E2E
// suite from the production FXCC church so real members' data can't
// leak into test selectors (the "Supplies36" tab-name pollution that
// broke 5 a11y specs) and so a misbehaving test can't scribble on real
// data. Same script can be re-run any time — every write is `set(..., { merge: true })`
// and Auth users are reused if they already exist.

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const CHURCH_ID = 'e2e-test-church';
const CHURCH_NAME = 'E2E Test Church';
const CHURCH_CODE = 'E2ETST';

const ACCOUNTS = [
  { key: 'admin',     email: 'e2e-admin@churchopshub.com',     password: 'E2eTestPass123!', role: 'admin', firstName: 'E2E', lastName: 'Admin' },
  { key: 'memberA',   email: 'e2e-member-a@churchopshub.com',  password: 'E2eTestPass123!', role: 'user',  firstName: 'E2E', lastName: 'MemberA' },
  { key: 'memberB',   email: 'e2e-member-b@churchopshub.com',  password: 'E2eTestPass123!', role: 'user',  firstName: 'E2E', lastName: 'MemberB' },
  // Volunteer-shell account (2026-05-27): explicit allowedHubs:['jobs'] flips
  // isVolunteerOnly(userProfile) → true so the 4-tab jobs-first shell + the
  // VolunteerHome landing render. Don't add this user to e2e/admin-helpers.js
  // uids() unless you also adapt the suite — Member A/B remain the default
  // non-admin actors for the existing specs.
  { key: 'volunteer', email: 'e2e-volunteer@churchopshub.com', password: 'E2eTestPass123!', role: 'user',  firstName: 'E2E', lastName: 'Volunteer', allowedHubs: ['jobs'] },
];

const accountName = acc => `${acc.firstName} ${acc.lastName}`;

function init() {
  if (admin.apps.length) return;
  const key = require(pathResolve(__dirname, 'serviceAccountKey.json'));
  admin.initializeApp({ credential: admin.credential.cert(key) });
}

async function ensureAuthUser({ email, password, displayName }) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    console.log(`  ✓ Auth user exists: ${email} (${existing.uid})`);
    return existing.uid;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }
  const created = await admin.auth().createUser({ email, password, displayName, emailVerified: true });
  console.log(`  + Created Auth user: ${email} (${created.uid})`);
  return created.uid;
}

async function main() {
  init();
  const db = admin.firestore();
  const now = new Date().toISOString();

  console.log(`Setting up E2E tenant: churches/${CHURCH_ID}\n`);

  console.log('1. Ensuring Auth users…');
  const uids = {};
  for (const acc of ACCOUNTS) {
    uids[acc.key] = await ensureAuthUser({
      email: acc.email,
      password: acc.password,
      displayName: accountName(acc),
    });
  }
  const adminUid = uids.admin;

  console.log('\n2. Writing church + config docs…');

  await db.doc(`churches/${CHURCH_ID}`).set({
    churchName: CHURCH_NAME,
    churchCode: CHURCH_CODE,
    createdBy: adminUid,
    createdAt: now,
  }, { merge: true });
  console.log(`  ✓ churches/${CHURCH_ID}`);

  // onboardingComplete suppresses the "Welcome to ChurchOpsHub!" modal that
  // src/App.jsx:514 auto-shows for admins on a fresh church with 0 items.
  // Without this, the modal intercepts every test click and the suite hangs
  // at "Hubs" navigation.
  await db.doc(`churches/${CHURCH_ID}/config/main`).set({
    churchName: CHURCH_NAME,
    churchCode: CHURCH_CODE,
    createdBy: adminUid,
    createdAt: now,
    onboardingComplete: true,
  }, { merge: true });
  console.log('  ✓ config/main (onboardingComplete: true)');

  await db.doc(`churches/${CHURCH_ID}/config/settings`).set({
    locations: ['Main Office', 'Storage Room', 'Auditorium'],
    ministries: ['Worship', 'Children', 'Youth'],
    tags: ['high-priority', 'sensitive'],
  }, { merge: true });
  console.log('  ✓ config/settings');

  // Grandfathered + all_in unlocks every hub in useSubscription.hasHub()
  // without involving Stripe. The flag is read first, before any plan or
  // trialEndsAt check, so an expired/null trial date is harmless here.
  await db.doc(`churches/${CHURCH_ID}/config/subscription`).set({
    plan: 'all_in',
    hubs: [],
    maxUsers: 999,
    status: 'active',
    grandfathered: true,
    grandfatheredUntil: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialHubs: [],
    freeHubsSelected: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    createdAt: now,
  }, { merge: true });
  console.log('  ✓ config/subscription (grandfathered all_in — every hub unlocked)');

  // Jobs Hub notifications-gate specs flip this on/off; default to enabled.
  await db.doc(`churches/${CHURCH_ID}/config/notifications`).set({ enabled: true }, { merge: true });
  console.log('  ✓ config/notifications (enabled)');

  console.log('\n3. Writing user docs (keyed by Auth uid)…');
  // The Firestore rule that gates Jobs Hub access (firestore.rules:34) treats
  // a MISSING `allowedHubs` field as "legacy full access" but a present-with-
  // null field as "no hubs". The client-side App.jsx check happens to handle
  // null as "all", but the rule wins on actual Firestore reads, so members
  // see "No open jobs" even though the UI tab shows up. We delete the field
  // explicitly here to cover the case where a prior setup run wrote it.
  const FIELD_DELETE = admin.firestore.FieldValue.delete();
  for (const acc of ACCOUNTS) {
    // If the account has an explicit allowedHubs array (e.g. the volunteer
    // account), write it through. Otherwise delete the field so the rule
    // treats the user as "legacy full access".
    const allowedHubsValue = Array.isArray(acc.allowedHubs) ? acc.allowedHubs : FIELD_DELETE;
    await db.doc(`users/${uids[acc.key]}`).set({
      name: accountName(acc),
      firstName: acc.firstName,
      lastName: acc.lastName,
      email: acc.email,
      role: acc.role,
      churchId: CHURCH_ID,
      active: true,
      allowedHubs: allowedHubsValue,
      createdAt: now,
      lastLogin: now,
    }, { merge: true });
    const allowedNote = Array.isArray(acc.allowedHubs) ? ` allowedHubs:[${acc.allowedHubs.join(',')}]` : '';
    console.log(`  ✓ users/${uids[acc.key]}  ←  ${acc.email}  (${acc.role})${allowedNote}`);
  }

  console.log('\n✓ E2E tenant ready.');
  console.log(`  churchId:      ${CHURCH_ID}`);
  console.log(`  admin uid:     ${uids.admin}`);
  console.log(`  memberA uid:   ${uids.memberA}`);
  console.log(`  memberB uid:   ${uids.memberB}`);
  console.log(`  volunteer uid: ${uids.volunteer}`);
  console.log('\nNext: update e2e/admin-helpers.js CHURCH_ID + uids() map, regen auth-state.');

  process.exit(0);
}

main().catch(err => {
  console.error('\n✗ setup failed:');
  console.error(err);
  process.exit(1);
});
