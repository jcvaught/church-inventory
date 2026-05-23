// Stripped Firebase init for anonymous routes (PublicJobsPage).
// Only imports firebase/app so callers can use getFunctions() without
// dragging Auth/Firestore/Storage SDKs into the public-traffic bundle.
// The full init for authenticated paths lives in firebase.js.
import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  apiKey:            "AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y",
  authDomain:        "churchopshub.com",
  projectId:         "church-inventory-9615c",
  storageBucket:     "church-inventory-9615c.firebasestorage.app",
  messagingSenderId: "178475375356",
  appId:             "1:178475375356:web:617a1674049e6508429579"
};

if (!getApps().length) {
  initializeApp(firebaseConfig);
}
