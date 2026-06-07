import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app, db, VAPID_KEY } from '../firebase.js';

// Web push enablement. The FCM SW is registered with a dedicated scope so it
// doesn't clobber the PWA's /sw.js. Returns { ok, reason } so callers can show
// a friendly message. iOS only supports web push for an installed PWA — see
// InstallPrompt.

export async function pushSupported() {
  try {
    return (await isSupported()) && 'serviceWorker' in navigator && 'Notification' in window;
  } catch {
    return false;
  }
}

export async function enablePush(uid) {
  try {
    if (!uid) return { ok: false, reason: 'no-user' };
    if (!(await pushSupported())) return { ok: false, reason: 'unsupported' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-push/' });
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return { ok: false, reason: 'no-token' };
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'error' };
  }
}
