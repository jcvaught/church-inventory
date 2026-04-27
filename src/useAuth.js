import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
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

// Look up a church by its join code. Returns the churchId string or null.
async function findChurchByCode(churchCode) {
  const code = churchCode.toUpperCase();
  const snap = await getDocs(query(collection(db, 'churches'), where('churchCode', '==', code)));
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

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
            setUserProfile({ id: firebaseUser.uid, uid: firebaseUser.uid, ...profileDoc.data() });
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
  const createChurch = useCallback(async ({ churchName, churchCode, firstName, lastName, email, password }) => {
    const userName = (firstName + ' ' + lastName).trim();
    setError(null);
    let cred = null;
    try {
      // Create auth account first so Firestore reads are authenticated
      cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: userName });

      // Check if this email already created a church (1-church-per-email limit)
      const emailChurchCheck = await getDocs(query(collection(db, 'churches'), where('createdBy', '==', cred.user.uid)));
      if (!emailChurchCheck.empty) {
        await cred.user.delete();
        throw new Error('An account with this email has already created a church. Please sign in instead.');
      }

      // Check if church code is already taken
      const existing = await findChurchByCode(churchCode);
      if (existing) {
        await cred.user.delete();
        throw new Error('This church code is already in use. Please choose another.');
      }

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

      // Create subscription doc — starts with 90-day all-hubs trial
      const trialStartedAt = new Date().toISOString();
      const trialEndsAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const TRIAL_HUBS = ['maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];
      await setDoc(doc(db, 'churches', churchId, 'config', 'subscription'), {
        plan: 'free',
        hubs: [],
        maxUsers: 10,
        status: 'trialing',
        trialStartedAt,
        trialEndsAt,
        trialHubs: TRIAL_HUBS,
        freeHubsSelected: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        grandfathered: false,
        grandfatheredUntil: null,
        createdAt: new Date().toISOString()
      });

      // Create user profile
      const profile = {
        name: userName,
        firstName,
        lastName,
        email,
        role: 'admin',
        churchId,
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUserProfile({ id: cred.user.uid, uid: cred.user.uid, ...profile });
      await sendEmailVerification(cred.user).catch(() => {});

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
  const register = useCallback(async ({ firstName, lastName, email, password, churchCode, allowedHubs }) => {
    const userName = (firstName + ' ' + lastName).trim();
    setError(null);
    let cred = null;
    try {
      // Create auth account first (needed for Firestore access)
      cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: userName });

      // Find church by code
      const foundChurchId = await findChurchByCode(churchCode);

      if (!foundChurchId) {
        // Clean up: delete the auth account since church code was invalid
        await cred.user.delete();
        throw new Error('Invalid church code. Please check with your administrator.');
      }

      // Create user profile — allowedHubs null means "inherit all church hubs" (default for non-invite signups)
      const profile = {
        name: userName,
        firstName,
        lastName,
        email,
        role: 'user',
        churchId: foundChurchId,
        active: true,
        ...(allowedHubs != null ? { allowedHubs } : {}),
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUserProfile({ id: cred.user.uid, uid: cred.user.uid, ...profile });
      await sendEmailVerification(cred.user).catch(() => {});

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
        setUserProfile({ id: cred.user.uid, uid: cred.user.uid, ...profileDoc.data() });
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
        setUserProfile({ id: cred.user.uid, uid: cred.user.uid, ...profileDoc.data() });
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
  const registerWithGoogle = useCallback(async ({ churchCode, allowedHubs }) => {
    setError(null);
    try {
      if (!auth.currentUser) throw new Error('No Google session found.');

      const foundChurchId = await findChurchByCode(churchCode);

      if (!foundChurchId) {
        throw new Error('Invalid church code. Please check with your administrator.');
      }

      const displayName = auth.currentUser.displayName || '';
      const spaceIdx = displayName.indexOf(' ');
      const firstName = spaceIdx >= 0 ? displayName.slice(0, spaceIdx) : displayName;
      const lastName = spaceIdx >= 0 ? displayName.slice(spaceIdx + 1) : '';
      // allowedHubs null means "inherit all church hubs" (default for non-invite signups)
      const profile = {
        name: displayName || auth.currentUser.email,
        firstName,
        lastName,
        email: auth.currentUser.email,
        role: 'user',
        churchId: foundChurchId,
        active: true,
        ...(allowedHubs != null ? { allowedHubs } : {}),
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid), profile);
      setUserProfile({ id: auth.currentUser.uid, uid: auth.currentUser.uid, ...profile });
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

  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser).catch(() => {});
  }, []);

  // Delete the current user's account (reauthenticates first; password ignored for Google users)
  const deleteAccount = useCallback(async (password) => {
    setError(null);
    try {
      const currentUser = auth.currentUser;
      const isGoogle = currentUser.providerData[0]?.providerId === 'google.com';
      if (isGoogle) {
        await reauthenticateWithPopup(currentUser, googleProvider);
      } else {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
      }
      await deleteDoc(doc(db, 'users', currentUser.uid));
      await deleteUser(currentUser);
      setUser(null);
      setUserProfile(null);
      return { success: true };
    } catch (err) {
      const msg =
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Incorrect password. Please try again.'
          : err.code === 'auth/popup-closed-by-user'
          ? 'Sign-in popup was closed. Please try again.'
          : err.message;
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
    resetPassword,
    resendVerification,
    deleteAccount
  };
}
