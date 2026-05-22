// @ts-check
// Node-side Firebase **client** SDK, separate from the Admin SDK in
// admin-helpers.js. Firestore security rules ARE enforced for the client SDK
// whether it runs in a browser or in Node — so audit rule-rejection tests
// (T1/T2/T3) and the M10 getPublicJobs callable test (T4) live here as pure
// Node, no Playwright browser needed.
//
// Use this from spec files that need to test rules; use admin-helpers.js
// (Admin SDK) for seeding/cleanup, where bypassing rules is what we want.

import { initializeApp, getApp } from 'firebase/app';
import {
  getFirestore, collection, doc, addDoc, updateDoc, getDoc,
} from 'firebase/firestore';
import {
  getAuth, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Public Firebase config — verbatim from src/firebase.js. The apiKey here is
// the publicly distributed web-app key (already shipped in the prod JS
// bundle); rules + App Check are what enforce security.
const firebaseConfig = {
  apiKey:            'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y',
  authDomain:        'churchopshub.com',
  projectId:         'church-inventory-9615c',
  storageBucket:     'church-inventory-9615c.firebasestorage.app',
  messagingSenderId: '178475375356',
  appId:             '1:178475375356:web:617a1674049e6508429579',
};

// Use a named app so we don't clash with anything else; idempotent across
// repeated imports in a single test process.
const APP_NAME = 'e2e-client';
let _app;
try { _app = getApp(APP_NAME); }
catch { _app = initializeApp(firebaseConfig, APP_NAME); }

export const app = _app;
export const clientDb = getFirestore(app);
export const clientAuth = getAuth(app);

// Re-export firestore primitives the specs use against the client SDK.
export { collection, doc, addDoc, updateDoc, getDoc };

// ── Credentials (mirror auth.setup.*.js / CLAUDE.md) ──
const CREDENTIALS = {
  admin:    { email: 'e2e-admin@churchopshub.com',    password: 'E2eTestPass123!' },
  'member-a': { email: 'jcvaught@gmail.com',          password: 'testpass123' },
  'member-b': { email: 'e2e-member-b@churchopshub.com', password: 'E2eTestPass123!' },
};

export async function signInAsClient(role) {
  const c = CREDENTIALS[role];
  if (!c) throw new Error(`Unknown client role: ${role}`);
  await signInWithEmailAndPassword(clientAuth, c.email, c.password);
  return clientAuth.currentUser?.uid || null;
}

export async function signOutClient() {
  if (clientAuth.currentUser) await signOut(clientAuth);
}

// Call the public getPublicJobs CF for T4. No auth required (the CF is
// onCall, no-auth — sanitizes for the public board).
export async function callGetPublicJobs(churchId) {
  const fns = getFunctions(app);
  const fn = httpsCallable(fns, 'getPublicJobs');
  const res = await fn({ churchId });
  return res.data;
}

// Assert that a client-SDK write rejects with permission-denied (the rule
// engine's standard refusal code). Returns the rejection so the caller can
// also assert on the message if useful.
export async function expectRejected(promise, expectedCode = 'permission-denied') {
  let err = null;
  try { await promise; }
  catch (e) { err = e; }
  if (!err) throw new Error(`Expected promise to reject with code "${expectedCode}", but it resolved`);
  if (err.code !== expectedCode) {
    throw new Error(`Expected reject code "${expectedCode}", got "${err.code}" (${err.message})`);
  }
  return err;
}
