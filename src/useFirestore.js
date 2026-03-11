// ╔══════════════════════════════════════════════════════════════╗
// ║  useFirestore — Real-time database hook                     ║
// ║  Handles reading, writing, and syncing all inventory data   ║
// ║  across every device in real time.                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { useState, useEffect, useCallback } from 'react';
import {
  doc, setDoc, onSnapshot, getDoc
} from 'firebase/firestore';
import { db, CHURCH_ID } from './firebase.js';
import {
  SEED_ELECTRONICS, SEED_TOOLS, SEED_CONSUMABLES, SEED_USERS
} from './data/seedData.js';

// All data for the church lives in one Firestore document.
// This keeps things simple and avoids complex queries.
// Firestore docs can hold up to 1MB — plenty for thousands of items.
const docRef = doc(db, 'churches', CHURCH_ID);

const INITIAL_STATE = {
  electronics: SEED_ELECTRONICS,
  tools: SEED_TOOLS,
  consumables: SEED_CONSUMABLES,
  log: [],
  reservations: [],
  users: SEED_USERS,
};

export function useFirestore() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen for real-time updates
  useEffect(() => {
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData(snapshot.data());
        } else {
          // First time — seed the database
          setDoc(docRef, INITIAL_STATE)
            .then(() => setData(INITIAL_STATE))
            .catch((err) => setError(err.message));
        }
        setLoading(false);
      },
      (err) => {
        console.error('Firestore error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Generic updater — merges partial updates into the document
  const update = useCallback(async (updates) => {
    try {
      await setDoc(docRef, updates, { merge: true });
    } catch (err) {
      console.error('Update error:', err);
      setError(err.message);
    }
  }, []);

  return { data, loading, error, update };
}
