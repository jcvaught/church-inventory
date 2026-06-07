// ╔══════════════════════════════════════════════════════════════╗
// ║  FIREBASE CONFIGURATION                                     ║
// ║  Replace the placeholder values below with YOUR project's   ║
// ║  config from the Firebase Console.                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

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

// FCM Web Push public key (VAPID). Public by design — safe to ship in the
// client bundle. Used by src/utils/push.js getToken(). Generated in the
// Firebase console → Project settings → Cloud Messaging → Web Push certificates.
export const VAPID_KEY = 'BDI5p2M4XfDC9Pn52vDr32Yebhvb_w_QGt1vNsO575AUb2XfY9KSkd_SgTtDudhAG6TX1sOeN2JhxMZoHTny9_g';
