// ╔══════════════════════════════════════════════════════════════╗
// ║  FIREBASE CONFIGURATION                                     ║
// ║  Replace the placeholder values below with YOUR project's   ║
// ║  config from the Firebase Console.                          ║
// ║                                                              ║
// ║  See SETUP-GUIDE.md Step 2 for instructions.                ║
// ╚══════════════════════════════════════════════════════════════╝

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

// Your Church ID — this is used to keep your data separate.
// For Phase 1 (single church), you can leave this as-is.
// For Phase 2 (multi-church), each church gets a unique ID.
export const CHURCH_ID = "my-church";
