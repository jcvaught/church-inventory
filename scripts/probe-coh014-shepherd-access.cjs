/**
 * COH-014 production probe — the Shepherd access list is what admits an elder,
 * not the `elder` claim, and only for their own church.
 *
 *   node scripts/probe-coh014-shepherd-access.cjs
 *
 * Mints a throwaway verified user in e2e-test-church with `elder:true`, puts
 * its email on e2e-test-church's config/shepherdAccess, signs in over REST and
 * runs a Firestore count() on shepherdPeople as that user:
 *   1. listed, own church           → allowed
 *   2. FXCC's shepherdPeople        → denied (not a member of FXCC)
 *   3. removed from the list, SAME token (still elder:true) → denied
 * Everything it creates is deleted in `finally`. Refuses to run if
 * e2e-test-church already has a shepherdAccess doc (never overwrite).
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');

const PROJECT = key.project_id;
const API_KEY = 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y'; // public web key, src/firebase.js
const E2E = 'e2e-test-church';
const FXCC = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const auth = admin.auth();

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`sign-in failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

function claimsOf(idToken) {
  return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
}

async function count(idToken, churchId) {
  const parent = `projects/${PROJECT}/databases/(default)/documents/churches/${churchId}`;
  const r = await fetch(`https://firestore.googleapis.com/v1/${parent}:runAggregationQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: 'shepherdPeople' }] },
      aggregations: [{ alias: 'n', count: {} }],
    } }),
  });
  return r.status;
}

(async () => {
  const accessRef = db.doc(`churches/${E2E}/config/shepherdAccess`);
  if ((await accessRef.get()).exists) throw new Error(`${E2E} already has config/shepherdAccess — refusing to overwrite.`);

  const email = `coh014-probe-${Date.now()}@churchopshub.com`;
  let uid = null;
  let accessCreated = false;
  const results = [];
  const expect = (label, got, want) => { results.push({ label, got, want, ok: got === want }); };
  try {
    ({ uid } = await auth.createUser({ email, emailVerified: true }));
    await auth.setCustomUserClaims(uid, { elder: true });
    await db.doc(`users/${uid}`).set({ churchId: E2E, role: 'user', active: true, email, name: 'COH-014 probe' });
    await accessRef.create({ emails: [email], version: 1, updatedBy: 'probe-coh014-shepherd-access' });
    accessCreated = true;

    const token = await idTokenFor(uid);
    const c = claimsOf(token);
    console.log(`probe user ${email} · token elder=${c.elder} email_verified=${c.email_verified}`);

    expect('listed, own church → allowed', await count(token, E2E), 200);
    expect('FXCC directory → denied', await count(token, FXCC), 403);

    await accessRef.set({ emails: [], version: 2, updatedBy: 'probe-coh014-shepherd-access' });
    expect('removed, same token (elder:true) → denied', await count(token, E2E), 403);
  } finally {
    if (accessCreated) await accessRef.delete();
    if (uid) {
      await db.doc(`users/${uid}`).delete();
      await auth.deleteUser(uid);
    }
    console.log(`cleanup: access doc ${accessCreated ? 'deleted' : 'not created'}, probe user ${uid ? 'deleted' : 'not created'}`);
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (HTTP ${r.got}, want ${r.want})`);
  process.exit(results.length === 3 && results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
