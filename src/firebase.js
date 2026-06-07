// ╔══════════════════════════════════════════════════════════════╗
// ║  FIREBASE CONFIGURATION                                     ║
// ║  Replace the placeholder values below with YOUR project's   ║
// ║  config from the Firebase Console.                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            "AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y",
  authDomain:        "churchopshub.com",
  projectId:         "church-inventory-9615c",
  storageBucket:     "church-inventory-9615c.firebasestorage.app",
  messagingSenderId: "178475375356",
  appId:             "1:178475375356:web:617a1674049e6508429579"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

// ── Local sandbox (Firebase Emulator Suite) ──────────────────────────────
// When the app is started with VITE_USE_EMULATORS=true (`npm run dev:emulator`),
// Auth/Firestore/Storage point at the LOCAL emulators — zero connection to
// production data. The flag is unset in every real build, so prod/Vercel is
// completely unaffected (this whole block dead-code-eliminates). Cloud
// Functions are intentionally NOT emulated, so callable-backed actions
// (job sign-up, @mention emails, Stripe) won't work in the sandbox — test
// those against the e2e test tenant instead. See docs/LOCAL-TESTING-AND-REVERT.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  console.warn('🧪 Firebase EMULATOR mode — Auth/Firestore/Storage are local. No production data is touched. (Cloud Functions are NOT emulated.)');
}

// FCM Web Push public key (VAPID). Public by design — safe to ship in the
// client bundle. Used by src/utils/push.js getToken(). Generated in the
// Firebase console → Project settings → Cloud Messaging → Web Push certificates.
export const VAPID_KEY = 'BDI5p2M4XfDC9Pn52vDr32Yebhvb_w_QGt1vNsO575AUb2XfY9KSkd_SgTtDudhAG6TX1sOeN2JhxMZoHTny9_g';
