import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, getDocs,
  collection, query, where
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase.js';

const DEFAULT_LOCATIONS = [
  "Sanctuary", "Sound Booth", "Media Room", "Church Office",
  "Children's Wing", "Youth Room", "Security Office",
  "Maintenance Closet", "Storage Room A", "Storage Room B",
  "Outdoor Shed", "Kitchen", "Fellowship Hall", "Lobby"
];

const DEFAULT_MINISTRIES = [
  "Worship", "Media", "Administration", "Children's Ministry",
  "Youth Ministry", "Security", "Facilities", "Grounds",
  "Outreach", "Small Groups"
];

const DEFAULT_TAGS = [
  "audio-visual", "computers", "communication", "lighting",
  "streaming", "display", "power-tools", "hand-tools", "ladders",
  "outdoor", "plumbing", "electrical", "painting",
  "worship-tech", "sunday-essentials", "portable", "high-value",
  "office-supplies", "cleaning", "batteries", "worship-supplies"
];

export function useAuth() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Load user profile from Firestore
        try {
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            setUserProfile({ id: firebaseUser.uid, ...profileDoc.data() });
          } else {
            setUserProfile(null); // Authenticated but no profile yet
          }
        } catch (err) {
          console.error('Error loading profile:', err);
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Create a new church (first-time setup)
  const createChurch = useCallback(async ({ churchName, churchCode, userName, email, password }) => {
    setError(null);
    try {
      // Check if church code is already taken
      const snap = await getDocs(collection(db, 'churches'));
      for (const d of snap.docs) {
        const data = d.data();
        if (data.churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          throw new Error('This church code is already in use. Please choose another.');
        }
        const cfg = await getDoc(doc(db, 'churches', d.id, 'config', 'main'));
        if (cfg.exists() && cfg.data().churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          throw new Error('This church code is already in use. Please choose another.');
        }
      }
      // Also check via users collection for legacy churches without parent docs
      const usersSnap = await getDocs(collection(db, 'users'));
      const legacyChurchIds = [...new Set(usersSnap.docs.map(d => d.data().churchId).filter(Boolean))];
      for (const cid of legacyChurchIds) {
        const cfg = await getDoc(doc(db, 'churches', cid, 'config', 'main'));
        if (cfg.exists() && cfg.data().churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          throw new Error('This church code is already in use. Please choose another.');
        }
      }

      // Create auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: userName });

      // Create church document (parent + config)
      const churchId = cred.user.uid + '-church';
      await setDoc(doc(db, 'churches', churchId), {
        churchName,
        churchCode: churchCode.toUpperCase(),
        createdBy: cred.user.uid,
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'churches', churchId, 'config', 'main'), {
        churchName,
        churchCode: churchCode.toUpperCase(),
        createdBy: cred.user.uid,
        createdAt: new Date().toISOString()
      });

      // Create settings with defaults
      await setDoc(doc(db, 'churches', churchId, 'config', 'settings'), {
        locations: DEFAULT_LOCATIONS,
        ministries: DEFAULT_MINISTRIES,
        tags: DEFAULT_TAGS
      });

      // Create user profile
      const profile = {
        name: userName,
        email,
        role: 'admin',
        churchId,
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUserProfile({ id: cred.user.uid, ...profile });

      return { success: true };
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'This email is already registered. Try signing in instead.'
        : err.code === 'auth/weak-password'
        ? 'Password should be at least 6 characters.'
        : err.message;
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // Register with church code
  const register = useCallback(async ({ userName, email, password, churchCode }) => {
    setError(null);
    let cred = null;
    try {
      // Create auth account first (needed for Firestore access)
      cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: userName });

      // Now find church by code — check parent doc first, then config subcollection
      let foundChurchId = null;
      const snap = await getDocs(collection(db, 'churches'));
      for (const d of snap.docs) {
        const data = d.data();
        if (data.churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          foundChurchId = d.id;
          break;
        }
        const cfg = await getDoc(doc(db, 'churches', d.id, 'config', 'main'));
        if (cfg.exists() && cfg.data().churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          foundChurchId = d.id;
          await setDoc(doc(db, 'churches', d.id), { churchCode: cfg.data().churchCode, churchName: cfg.data().churchName || '', createdAt: cfg.data().createdAt || new Date().toISOString() }, { merge: true });
          break;
        }
      }

      // If no parent docs exist yet (legacy setup), discover via users collection
      if (!foundChurchId) {
        const usersSnap = await getDocs(collection(db, 'users'));
        const churchIds = [...new Set(usersSnap.docs.map(d => d.data().churchId).filter(Boolean))];
        for (const cid of churchIds) {
          const cfg = await getDoc(doc(db, 'churches', cid, 'config', 'main'));
          if (cfg.exists() && cfg.data().churchCode?.toUpperCase() === churchCode.toUpperCase()) {
            foundChurchId = cid;
            await setDoc(doc(db, 'churches', cid), { churchCode: cfg.data().churchCode, churchName: cfg.data().churchName || '', createdAt: cfg.data().createdAt || new Date().toISOString() }, { merge: true });
            break;
          }
        }
      }

      if (!foundChurchId) {
        // Clean up: delete the auth account since church code was invalid
        await cred.user.delete();
        throw new Error('Invalid church code. Please check with your administrator.');
      }

      // Create user profile
      const profile = {
        name: userName,
        email,
        role: 'member',
        churchId: foundChurchId,
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUserProfile({ id: cred.user.uid, ...profile });

      return { success: true };
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'This email is already registered. Try signing in instead.'
        : err.code === 'auth/weak-password'
        ? 'Password should be at least 6 characters.'
        : err.message;
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // Email/password sign in
  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Update last login
      const profileDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (profileDoc.exists()) {
        await setDoc(doc(db, 'users', cred.user.uid), { lastLogin: new Date().toISOString() }, { merge: true });
        setUserProfile({ id: cred.user.uid, ...profileDoc.data() });
      }
      return { success: true };
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password.'
        : err.code === 'auth/too-many-requests'
        ? 'Too many attempts. Please try again later.'
        : 'Sign in failed. Please try again.';
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // Google sign in (for existing users only)
  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profileDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (profileDoc.exists()) {
        await setDoc(doc(db, 'users', cred.user.uid), { lastLogin: new Date().toISOString() }, { merge: true });
        setUserProfile({ id: cred.user.uid, ...profileDoc.data() });
        return { success: true };
      } else {
        // Google user exists in Auth but not in our DB — needs to register
        return { success: false, needsRegistration: true, email: cred.user.email, name: cred.user.displayName };
      }
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return { success: false };
      setError('Google sign-in failed. Please try again.');
      return { success: false, error: err.message };
    }
  }, []);

  // Register via Google (after Google sign-in if no profile exists)
  const registerWithGoogle = useCallback(async ({ churchCode }) => {
    setError(null);
    try {
      if (!auth.currentUser) throw new Error('No Google session found.');

      let foundChurchId = null;
      const snap = await getDocs(collection(db, 'churches'));
      for (const d of snap.docs) {
        const data = d.data();
        if (data.churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          foundChurchId = d.id;
          break;
        }
        const cfg = await getDoc(doc(db, 'churches', d.id, 'config', 'main'));
        if (cfg.exists() && cfg.data().churchCode?.toUpperCase() === churchCode.toUpperCase()) {
          foundChurchId = d.id;
          await setDoc(doc(db, 'churches', d.id), { churchCode: cfg.data().churchCode, churchName: cfg.data().churchName || '', createdAt: cfg.data().createdAt || new Date().toISOString() }, { merge: true });
          break;
        }
      }

      // Fallback: discover via users collection for legacy data
      if (!foundChurchId) {
        const usersSnap = await getDocs(collection(db, 'users'));
        const churchIds = [...new Set(usersSnap.docs.map(d => d.data().churchId).filter(Boolean))];
        for (const cid of churchIds) {
          const cfg = await getDoc(doc(db, 'churches', cid, 'config', 'main'));
          if (cfg.exists() && cfg.data().churchCode?.toUpperCase() === churchCode.toUpperCase()) {
            foundChurchId = cid;
            await setDoc(doc(db, 'churches', cid), { churchCode: cfg.data().churchCode, churchName: cfg.data().churchName || '', createdAt: cfg.data().createdAt || new Date().toISOString() }, { merge: true });
            break;
          }
        }
      }

      if (!foundChurchId) {
        throw new Error('Invalid church code. Please check with your administrator.');
      }

      const profile = {
        name: auth.currentUser.displayName || auth.currentUser.email,
        email: auth.currentUser.email,
        role: 'member',
        churchId: foundChurchId,
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid), profile);
      setUserProfile({ id: auth.currentUser.uid, ...profile });
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err) {
      const msg = err.code === 'auth/user-not-found'
        ? 'No account found with that email.'
        : 'Failed to send reset email. Please try again.';
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  return {
    user,
    userProfile,
    loading,
    error,
    setError,
    createChurch,
    register,
    login,
    loginWithGoogle,
    registerWithGoogle,
    logout,
    resetPassword
  };
}
