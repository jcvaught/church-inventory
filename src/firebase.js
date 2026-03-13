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
  authDomain:        "church-inventory-9615c.firebaseapp.com",
  projectId:         "church-inventory-9615c",
  storageBucket:     "church-inventory-9615c.firebasestorage.app",
  messagingSenderId: "178475375356",
  appId:             "1:178475375356:web:617a1674049e6508429579"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);
