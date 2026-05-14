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
  doc, setDoc, getDoc, deleteDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Sentry from '@sentry/react';
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
// Phase D / H-02: this used to query the `churches` collection directly,
// which required `allow list: if request.auth != null` on the collection —
// any authenticated user could dump every church code and join any church.
// Now routed through the `lookupChurchByCode` callable so reads are
// server-side and only the matched churchId is returned.
async function findChurchByCode(churchCode) {
  const code = churchCode.trim().toUpperCase();
  if (!code) return null;
  const fn = httpsCallable(getFunctions(), 'lookupChurchByCode');
  try {
    const res = await fn({ code });
    return res.data?.found ? res.data.churchId : null;
  } catch (err) {
    console.error('[ChurchOpsHub] lookupChurchByCode failed', err);
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  // True when the Auth account exists but `users/{uid}` doesn't — the
  // "Haleigh stuck" state. App.jsx renders a recovery screen for this
  // instead of silently showing the login form again.
  const [profileMissing, setProfileMissing] = useState(false);
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
            setProfileMissing(false);
          } else {
            // Authenticated but no Firestore profile — the half-signed-up
            // state. Surface to user + log to Sentry so we hear about
            // future cases proactively instead of waiting for an email.
            setUserProfile(null);
            setProfileMissing(true);
            Sentry.captureMessage('Auth account has no Firestore profile (stuck-signup state)', {
              level: 'warning',
              extra: {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                creationTime: firebaseUser.metadata?.creationTime,
                lastSignInTime: firebaseUser.metadata?.lastSignInTime,
              },
            });
          }
        } catch (err) {
          // Transient Firestore read failure — keep profileMissing false so
          // the user can retry login; surface the actual error to Sentry.
          console.error('Error loading profile:', err);
          setUserProfile(null);
          setProfileMissing(false);
          Sentry.captureException(err);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setProfileMissing(false);
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

      // Inner try/catch wraps every step after Auth creation so we can clean
      // up the orphan Auth account on ANY failure (rules denial, network
      // blip, Firestore quota, business-rule rejection). Without this, a
      // mid-chain failure leaves the user with auth/email-already-in-use
      // on retry and no path to recovery short of contacting support.
      try {
        await updateProfile(cred.user, { displayName: userName });

        // Check if this email already created a church (1-church-per-email limit).
        // Phase D: dropped the collection query (would need `allow list` on churches).
        // The convention is churchId = '{creatorUid}-church', so a direct getDoc on
        // that path tells us the same thing and is permitted by `allow get` for the
        // self-creator branch.
        const ownChurchSnap = await getDoc(doc(db, 'churches', cred.user.uid + '-church'));
        if (ownChurchSnap.exists()) {
          throw new Error('An account with this email has already created a church. Please sign in instead.');
        }

        // Check if church code is already taken
        const existing = await findChurchByCode(churchCode);
        if (existing) {
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

        // Create user profile BEFORE the config subdocs. The rules on
        // churches/{id}/config/main and config/settings require
        // isChurchAdminOrManager(), which reads role from users/{uid}.
        // If we write config docs first, that doc doesn't exist yet, every
        // config write is denied, and the new church creator is stranded
        // with auth + parent church doc but no config + no user profile
        // (the state Haleigh Watson's TrueNorth Church signup landed in
        // on 2026-05-14).
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

        setUserProfile({ id: cred.user.uid, uid: cred.user.uid, ...profile });
      } catch (innerErr) {
        // Anything between Auth creation and the last setDoc threw — best
        // effort: delete the orphan Auth account so the user can retry with
        // the same email. If the delete itself fails, log to Sentry; the
        // user will still see a friendly error from the outer catch.
        try { await cred.user.delete(); } catch (delErr) {
          Sentry.captureException(delErr, { extra: { uid: cred.user.uid, phase: 'createChurch cleanup' } });
        }
        throw innerErr;
      }

      // Verification email is non-blocking; surface failures to Sentry so we
      // hear about SendGrid/quota issues instead of silently swallowing them.
      await sendEmailVerification(cred.user).catch(err => {
        Sentry.captureException(err, { extra: { phase: 'createChurch sendEmailVerification' } });
      });

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

      // Inner try/catch: clean up the Auth account on ANY failure between
      // Auth creation and the final profile setDoc. Otherwise the user gets
      // stuck with auth/email-already-in-use on retry.
      try {
        await updateProfile(cred.user, { displayName: userName });

        // Find church by code
        const foundChurchId = await findChurchByCode(churchCode);

        if (!foundChurchId) {
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
      } catch (innerErr) {
        try { await cred.user.delete(); } catch (delErr) {
          Sentry.captureException(delErr, { extra: { uid: cred.user.uid, phase: 'register cleanup' } });
        }
        throw innerErr;
      }

      await sendEmailVerification(cred.user).catch(err => {
        Sentry.captureException(err, { extra: { phase: 'register sendEmailVerification' } });
      });

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
      // If the profile is missing here, onAuthStateChanged will set
      // profileMissing=true and App.jsx will show the recovery screen.
      // We still return success because authentication itself succeeded.
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
      }
      // No Firestore profile. Distinguish two cases:
      //   1. First-time Google sign-in: Auth account was just created in this
      //      popup, so creationTime === lastSignInTime. User legitimately
      //      needs to enter a church code → needsRegistration flow.
      //   2. Returning user whose profile is missing: same stuck-signup state
      //      as Haleigh, but reached via Google. Fall through to the
      //      onAuthStateChanged-driven recovery screen.
      const meta = cred.user.metadata || {};
      const isFirstSignIn = meta.creationTime === meta.lastSignInTime;
      if (isFirstSignIn) {
        return { success: false, needsRegistration: true, email: cred.user.email, name: cred.user.displayName };
      }
      Sentry.captureMessage('Returning Google user has no Firestore profile (stuck-signup state)', {
        level: 'warning',
        extra: {
          uid: cred.user.uid,
          email: cred.user.email,
          creationTime: meta.creationTime,
          lastSignInTime: meta.lastSignInTime,
        },
      });
      // Return success so onAuthStateChanged's profileMissing path takes over.
      return { success: true };
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
    profileMissing,
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
