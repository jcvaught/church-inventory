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
  doc, setDoc, getDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Sentry from '@sentry/react';
import { auth, googleProvider, db } from './firebase.js';
import { TRIAL_DAYS } from './lib/entitlement.js';

// Default hubs granted to a member who signs up with just the church code (no
// hub-scoped invite). Previously this was "all hubs" (allowedHubs omitted),
// then Job + Maintenance. Now scoped to Job only (2026-06-10): a plain
// church-code signup should NOT auto-land in Maintenance/Inventory — least
// privilege. ['jobs'] also makes the new member a volunteer (isVolunteerOnly),
// so they get the jobs-first shell and never see inventory. Admins still see
// everything (role override); hub-scoped invites still set their own hubs; an
// admin grants more access per-member via Settings → Team Members → Edit Access.
const DEFAULT_MEMBER_HUBS = ['jobs'];

// Shepherd Hub is FXCC-only (P2). Only FXCC members invoke the elder-claim
// grant on sign-in, so every other church's logins don't hit the callable.
// Mirrors SHEPHERD_CHURCH_ID in functions/index.js — keep in sync.
const SHEPHERD_CHURCH_ID = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';

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
    // COH-012 A.4.4: the church exists but is lapsed — the server's message
    // says what to do; pass it through untouched, and don't page Sentry.
    if (err?.code === 'functions/failed-precondition') {
      const lapsed = new Error(err.message);
      lapsed.code = 'church-lapsed';
      throw lapsed;
    }
    // S-9: distinguish "code doesn't exist" (returns null) from
    // "lookup failed" (throws). Previously both returned null, so users
    // saw "Invalid church code" during transient CF outages even when
    // their code was correct.
    Sentry.captureException(err, { extra: { phase: 'findChurchByCode', code } });
    const wrapped = new Error("We couldn't verify your church code right now. Please check your connection and try again.");
    wrapped.code = 'lookup-failed';
    throw wrapped;
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
  // Shepherd Hub elder gate (P2): true iff the server-set `elder` custom claim
  // is present on the signed-in token. Drives hub visibility in P3; Firestore
  // rules enforce the real boundary regardless of this flag.
  const [isElder, setIsElder] = useState(false);
  // True when claimElderRole returns `unverified: true` — a rostered
  // email/password account whose email isn't verified yet, so the server
  // withholds the grant (LNCH-3). Google sign-in is always verified, so this
  // never fires for that path.
  const [elderUnverified, setElderUnverified] = useState(false);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Load user profile from Firestore
        try {
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            const profileData = profileDoc.data();
            setUserProfile({ id: firebaseUser.uid, uid: firebaseUser.uid, ...profileData });
            setProfileMissing(false);
            // Shepherd Hub elder gate (P2) — FXCC members only, so no other
            // church's logins hit the callable. Grants/revokes the `elder`
            // custom claim by email allow-list, then force-refreshes the ID
            // token if it changed so Firestore rules see the new claim.
            if (profileData.churchId === SHEPHERD_CHURCH_ID) {
              try {
                const claimFn = httpsCallable(getFunctions(), 'claimElderRole');
                const res = await claimFn();
                if (res.data?.changed) {
                  await firebaseUser.getIdToken(true);
                  // LNCH-1: the claim grant/revoke rewrites `allowedHubs`
                  // server-side (first-grant Shepherd-only scoping, or the
                  // revoke restore), but `profileData` above was read BEFORE
                  // the claim ran — it's now stale. Re-read so the in-memory
                  // profile reflects the write in THIS session; otherwise a
                  // new elder's first session still renders the volunteer/
                  // jobs shell because isVolunteerOnly sees the signup
                  // default. Guard: on a failed re-read, keep the stale
                  // profile (don't null it out) — it self-heals on reload.
                  try {
                    const freshDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (freshDoc.exists()) {
                      setUserProfile({ id: firebaseUser.uid, uid: firebaseUser.uid, ...freshDoc.data() });
                    }
                  } catch (reReadErr) {
                    Sentry.captureException(reReadErr, { tags: { flow: 'claimElderRole-reread' } });
                  }
                }
                setIsElder(!!res.data?.elder);
                setElderUnverified(res.data?.unverified === true);
              } catch (e) {
                setIsElder(false);
                setElderUnverified(false);
                Sentry.captureException(e, { tags: { flow: 'claimElderRole' } });
              }
            } else {
              setIsElder(false);
              setElderUnverified(false);
            }
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
        setIsElder(false);
        setElderUnverified(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Create a new church (first-time setup)
  const createChurch = useCallback(async ({ churchName, churchCode, firstName, lastName, email, password }) => {
    const userName = (firstName + ' ' + lastName).trim();
    // S-14: normalize email casing/whitespace before any storage write.
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);
    let cred = null;
    try {
      // Create auth account first so Firestore reads are authenticated
      cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

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

        // S-7: write the whole signup chain in one Firestore batch so it's
        // atomic — any single write failure rolls them all back. The
        // companion rules update (firestore.rules) added a self-creator
        // create branch to config/main and config/settings so they pass
        // rule evaluation inside a batch (where users/{uid} isn't yet
        // visible). Closes the partial-failure window that left earlier
        // signups stranded with auth + some-but-not-all Firestore docs.
        const churchId = cred.user.uid + '-church';
        const now = new Date().toISOString();
        const trialEndsAt = new Date(Date.parse(now) + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const profile = {
          name: userName,
          firstName,
          lastName,
          email: normalizedEmail,
          role: 'admin',
          churchId,
          active: true,
          createdAt: now,
          lastLogin: now,
        };

        const batch = writeBatch(db);
        batch.set(doc(db, 'churches', churchId), {
          churchName,
          churchCode: churchCode.toUpperCase(),
          createdBy: cred.user.uid,
          createdAt: now,
        });
        batch.set(doc(db, 'users', cred.user.uid), profile);
        batch.set(doc(db, 'churches', churchId, 'config', 'main'), {
          churchName,
          churchCode: churchCode.toUpperCase(),
          createdBy: cred.user.uid,
          createdAt: now,
        });
        batch.set(doc(db, 'churches', churchId, 'config', 'settings'), {
          locations: DEFAULT_LOCATIONS,
          ministries: DEFAULT_MINISTRIES,
          tags: DEFAULT_TAGS,
        });
        // COH-012 A.4: the flat shape. `status: 'trialing'` + trialEndsAt IS the
        // trial (src/lib/entitlement.js); no hubs / trialHubs / freeHubsSelected /
        // maxUsers — a church born after cutover carries no field nothing reads.
        batch.set(doc(db, 'churches', churchId, 'config', 'subscription'), {
          plan: 'free',
          status: 'trialing',
          trialStartedAt: now,
          trialEndsAt,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          grandfathered: false,
          createdAt: now,
        });
        await batch.commit();

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
      return { success: false, error: msg, code: err.code };
    }
  }, []);

  // Create a church for the user who is ALREADY signed in.
  //
  // createChurch() can't serve this case: it starts by creating an Auth
  // account, and these users already have one. It is the escape hatch for
  // anyone who reaches ProfileMissingScreen as the FIRST person from their
  // church — before this, that screen only accepted an EXISTING church code, so
  // a first-time admin could not go forward (no church to join) and could not
  // start over (their email is already registered). That dead end produced a
  // support email on 2026-09-22; see docs/CHANGELOG.md.
  const createChurchForCurrentUser = useCallback(async ({ churchName, churchCode, firstName, lastName }) => {
    setError(null);
    try {
      const current = auth.currentUser;
      if (!current) throw new Error('You are not signed in. Please sign in and try again.');

      const userName = (firstName + ' ' + lastName).trim();
      const normalizedEmail = (current.email || '').trim().toLowerCase();
      const churchId = current.uid + '-church';
      const now = new Date().toISOString();

      // Keep Auth's displayName in step, so the welcome email greets them by
      // name (functions/index.js reads displayName, not the Firestore profile).
      if (userName && current.displayName !== userName) {
        await updateProfile(current, { displayName: userName });
      }

      // Three states are reachable here, and only one of them is an error.
      // Signup became atomic with S-7; a pre-S-7 partial signup can leave a
      // church document with no profile, and rejecting that (as the
      // one-church-per-email check in createChurch does) would leave exactly
      // the user this screen exists to rescue still stranded.
      const ownChurchSnap = await getDoc(doc(db, 'churches', churchId));
      const ownProfileSnap = await getDoc(doc(db, 'users', current.uid));

      if (ownChurchSnap.exists() && ownProfileSnap.exists()) {
        throw new Error('This account has already set up a church. Try signing in instead.');
      }

      if (ownChurchSnap.exists()) {
        // Repair: the church survived, the profile didn't. Adopt the church as
        // it stands — do NOT overwrite it with the values from this form.
        const existing = ownChurchSnap.data();
        const repaired = {
          name: userName || normalizedEmail,
          firstName,
          lastName,
          email: normalizedEmail,
          role: 'admin',
          churchId,
          active: true,
          createdAt: now,
          lastLogin: now,
        };
        await setDoc(doc(db, 'users', current.uid), repaired);
        setUserProfile({ id: current.uid, uid: current.uid, ...repaired });
        setProfileMissing(false);
        return { success: true, repaired: true, churchName: existing.churchName };
      }

      // findChurchByCode routes through the lookupChurchByCode callable, which
      // tolerates a caller with no profile only because assertActiveCaller
      // returns early when the user doc is absent (functions/index.js). That
      // fail-open is deliberate (COH-011) but it is load-bearing HERE: tighten
      // it and first-time admins are stranded again. Covered by a handler test.
      const existingCode = await findChurchByCode(churchCode);
      if (existingCode) {
        throw new Error('This church code is already in use. Please choose another.');
      }

      const trialEndsAt = new Date(Date.parse(now) + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const profile = {
        name: userName || normalizedEmail,
        firstName,
        lastName,
        email: normalizedEmail,
        role: 'admin',
        churchId,
        active: true,
        createdAt: now,
        lastLogin: now,
      };

      // Same batch as createChurch (S-7): all five documents or none.
      const batch = writeBatch(db);
      batch.set(doc(db, 'churches', churchId), {
        churchName,
        churchCode: churchCode.toUpperCase(),
        createdBy: current.uid,
        createdAt: now,
      });
      batch.set(doc(db, 'users', current.uid), profile);
      batch.set(doc(db, 'churches', churchId, 'config', 'main'), {
        churchName,
        churchCode: churchCode.toUpperCase(),
        createdBy: current.uid,
        createdAt: now,
      });
      batch.set(doc(db, 'churches', churchId, 'config', 'settings'), {
        locations: DEFAULT_LOCATIONS,
        ministries: DEFAULT_MINISTRIES,
        tags: DEFAULT_TAGS,
      });
      batch.set(doc(db, 'churches', churchId, 'config', 'subscription'), {
        plan: 'free',
        status: 'trialing',
        trialStartedAt: now,
        trialEndsAt,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        grandfathered: false,
        createdAt: now,
      });
      await batch.commit();

      // BOTH are required: App.jsx renders the auth screen while userProfile is
      // null, so clearing profileMissing alone would drop them out of the app.
      setUserProfile({ id: current.uid, uid: current.uid, ...profile });
      setProfileMissing(false);
      return { success: true };
    } catch (err) {
      // Deliberately NOT registerWithGoogle's S-11 sign-out-on-failure. Being
      // ejected for a typo is how the 2026-09-22 user burned two attempts
      // before giving up and emailing support. Keep the session; show the error.
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // Register with church code
  const register = useCallback(async ({ firstName, lastName, email, password, churchCode, allowedHubs }) => {
    const userName = (firstName + ' ' + lastName).trim();
    // S-14: normalize email casing/whitespace before any storage write.
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);
    let cred = null;
    try {
      // Create auth account first (needed for Firestore access)
      cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

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

        // S-13: single shared timestamp.
        const now = new Date().toISOString();
        // Create user profile. A hub-scoped invite passes its own allowedHubs;
        // a plain church-code signup defaults to DEFAULT_MEMBER_HUBS (scoped),
        // NOT all-hubs, so new members don't leak into every hub.
        const profile = {
          name: userName,
          firstName,
          lastName,
          email: normalizedEmail,
          role: 'user',
          churchId: foundChurchId,
          active: true,
          allowedHubs: allowedHubs != null ? allowedHubs : DEFAULT_MEMBER_HUBS,
          createdAt: now,
          lastLogin: now,
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
      return { success: false, error: msg, code: err.code };
    }
  }, []);

  // Email/password sign in
  const login = useCallback(async (email, password) => {
    setError(null);
    // S-14: normalize so users that signed up with mixed-case email don't
    // hit auth/invalid-credential just because they typed it differently.
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
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
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return { success: false };
      }
      Sentry.captureException(err, {
        tags: { flow: 'google-signin' },
        extra: { code: err.code, message: err.message },
      });
      const codeMsg = err.code === 'auth/popup-blocked'
        ? 'Your browser blocked the sign-in popup. Allow popups for churchopshub.com and try again.'
        : err.code === 'auth/unauthorized-domain'
          ? 'This domain is not authorized for Google sign-in. Contact support.'
          : `Google sign-in failed (${err.code || 'unknown'}). Please try again.`;
      setError(codeMsg);
      return { success: false, error: err.message, code: err.code };
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
      const now = new Date().toISOString();
      // S-14: normalize email casing/whitespace so search-by-email is reliable.
      const normalizedEmail = (auth.currentUser.email || '').trim().toLowerCase();
      // Plain church-code signup defaults to DEFAULT_MEMBER_HUBS (scoped), not
      // all-hubs; hub-scoped invites still pass their own allowedHubs.
      const profile = {
        name: displayName || normalizedEmail,
        firstName,
        lastName,
        email: normalizedEmail,
        role: 'user',
        churchId: foundChurchId,
        active: true,
        allowedHubs: allowedHubs != null ? allowedHubs : DEFAULT_MEMBER_HUBS,
        createdAt: now,
        lastLogin: now,
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid), profile);
      setUserProfile({ id: auth.currentUser.uid, uid: auth.currentUser.uid, ...profile });
      // Clear the stuck-signup flag so a user recovering from ProfileMissingScreen
      // (or finishing the normal googleRegister flow) lands in the app instead of
      // being held on the recovery screen — profileMissing is otherwise only
      // re-evaluated on the next auth-state change.
      setProfileMissing(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      // S-11: sign out so the Google session doesn't linger in a half-signed-up
      // state. Without this, a failed church-code lookup leaves the user
      // authenticated with no profile (the stuck state).
      try { await signOut(auth); } catch (signOutErr) {
        Sentry.captureException(signOutErr, { extra: { phase: 'registerWithGoogle cleanup' } });
      }
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
    // S-14: normalize so the email matches whatever Firebase Auth has stored.
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
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
    isElder,
    elderUnverified,
    profileMissing,
    loading,
    error,
    setError,
    createChurch,
    createChurchForCurrentUser,
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
