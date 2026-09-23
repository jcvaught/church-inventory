#!/usr/bin/env node
/**
 * verify-restored-signup.cjs — prove a restore-orphaned-signup.cjs run worked.
 *
 * Document existence is NOT proof: a correct-looking batch can still fail to
 * load in the app under deployed rules. So this also mints a custom token for
 * the restored user, exchanges it for an ID token, and issues the same reads
 * the app makes on boot through the Firestore REST API, which enforces rules.
 * Nothing about the user's credentials changes.
 *
 * Usage: node scripts/verify-restored-signup.cjs --uid <uid> [--code CODE]
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const entitlement = require('../functions/lib/entitlement.js');

const WEB_API_KEY = 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y'; // src/firebase.js:13 (public)
const PROJECT = serviceAccount.project_id;

function arg(n) { const i = process.argv.indexOf('--' + n); return i === -1 ? null : process.argv[i + 1]; }
const uid = arg('uid');
const wantCode = (arg('code') || '').trim().toUpperCase() || null;
if (!uid) { console.error('usage: --uid <uid> [--code CODE]'); process.exit(2); }

// createChurch's exact field sets (src/useAuth.js:239-288). welcomeEmailSentAt
// is the one legitimate later addition, written by the trigger.
const EXPECTED = {
  church:       ['churchName', 'churchCode', 'createdBy', 'createdAt'],
  profile:      ['name', 'firstName', 'lastName', 'email', 'role', 'churchId', 'active', 'createdAt', 'lastLogin'],
  configMain:   ['churchName', 'churchCode', 'createdBy', 'createdAt'],
  settings:     ['locations', 'ministries', 'tags'],
  subscription: ['plan', 'status', 'trialStartedAt', 'trialEndsAt', 'stripeCustomerId', 'stripeSubscriptionId', 'currentPeriodEnd', 'grandfathered', 'createdAt'],
};

let failures = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}
function diffKeys(actual, expected, label, allowExtra = []) {
  const a = Object.keys(actual).sort();
  const missing = expected.filter(k => !a.includes(k));
  const extra = a.filter(k => !expected.includes(k) && !allowExtra.includes(k));
  check(!missing.length && !extra.length, label,
    missing.length || extra.length
      ? [missing.length ? 'missing: ' + missing.join(',') : '', extra.length ? 'unexpected: ' + extra.join(',') : ''].filter(Boolean).join('; ')
      : `${a.length} fields match createChurch`);
}

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const churchId = `${uid}-church`;
  console.log(`\nVerifying churches/${churchId}  (project ${PROJECT})\n`);

  // ── 1. Shape ────────────────────────────────────────────────────────────
  console.log('Document shape vs createChurch:');
  const [churchSnap, userSnap, mainSnap, setSnap, subSnap] = await Promise.all([
    db.doc(`churches/${churchId}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`churches/${churchId}/config/main`).get(),
    db.doc(`churches/${churchId}/config/settings`).get(),
    db.doc(`churches/${churchId}/config/subscription`).get(),
  ]);
  for (const [snap, name] of [[churchSnap, 'church'], [userSnap, 'users/'], [mainSnap, 'config/main'], [setSnap, 'config/settings'], [subSnap, 'config/subscription']]) {
    if (!snap.exists) { check(false, `${name} exists`); }
  }
  if (!churchSnap.exists || !userSnap.exists) { console.log('\n  Nothing to verify — restore did not run.\n'); process.exit(1); }

  diffKeys(churchSnap.data(), EXPECTED.church, 'church doc', ['welcomeEmailSentAt']);
  diffKeys(userSnap.data(), EXPECTED.profile, 'users/ profile');
  diffKeys(mainSnap.data(), EXPECTED.configMain, 'config/main');
  diffKeys(setSnap.data(), EXPECTED.settings, 'config/settings');
  diffKeys(subSnap.data(), EXPECTED.subscription, 'config/subscription');

  check(!('onboardingComplete' in mainSnap.data()), 'onboardingComplete absent', 'first-run wizard will show (src/App.jsx:676)');
  check(userSnap.data().role === 'admin' && userSnap.data().active === true, 'profile is an active admin');
  check(churchSnap.data().churchCode === mainSnap.data().churchCode, 'church code consistent across church doc and config/main');

  // ── 2. Entitlement + join path ──────────────────────────────────────────
  console.log('\nEntitlement and joining:');
  const sub = subSnap.data();
  check(entitlement.canCreate(sub), 'canCreate()', `state=${entitlement.entitlementState(sub)}, ${entitlement.trialDaysRemaining(sub)} trial days left`);
  const code = wantCode || churchSnap.data().churchCode;
  const byCode = await db.collection('churches').where('churchCode', '==', code).limit(1).get();
  check(!byCode.empty && byCode.docs[0].id === churchId, `lookupChurchByCode("${code}") resolves`, byCode.empty ? 'NOT FOUND' : byCode.docs[0].id);

  // ── 3. Real reads under deployed rules ──────────────────────────────────
  console.log('\nApp boot reads under deployed rules (as the user, via REST):');
  const customToken = await admin.auth().createCustomToken(uid);
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  }).then(r => r.json());
  if (!signIn.idToken) { check(false, 'exchange custom token for ID token', JSON.stringify(signIn.error?.message || signIn)); }
  else {
    for (const path of [`users/${uid}`, `churches/${churchId}`, `churches/${churchId}/config/main`, `churches/${churchId}/config/settings`, `churches/${churchId}/config/subscription`]) {
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
        { headers: { Authorization: 'Bearer ' + signIn.idToken } });
      check(res.status === 200, `GET ${path}`, res.status === 200 ? '200' : `${res.status} — rules denied`);
    }
  }

  // ── 4. Welcome email (async trigger — poll before judging) ──────────────
  console.log('\nWelcome email (functions/index.js:1234):');
  let stamp = churchSnap.data().welcomeEmailSentAt, waited = 0;
  while ((!stamp || stamp === 'sending') && waited < 120) {
    await new Promise(r => setTimeout(r, 5000)); waited += 5;
    stamp = (await db.doc(`churches/${churchId}`).get()).data().welcomeEmailSentAt;
    process.stdout.write(`\r  …waited ${waited}s for the trigger  `);
  }
  process.stdout.write('\r' + ' '.repeat(44) + '\r');
  if (stamp && stamp !== 'sending') check(true, 'welcome email delivered', stamp);
  else if (stamp === 'sending') check(false, 'welcome email STUCK at "sending"', 'send threw; no retry configured — send it by hand');
  else check(false, 'welcome email never stamped', 'trigger bailed early (Brevo unconfigured, or Auth lookup failed) — check function logs');

  console.log(failures === 0 ? '\n  ALL CHECKS PASSED\n' : `\n  ${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('\n  FAILED:', e.message, '\n'); process.exit(1); });
