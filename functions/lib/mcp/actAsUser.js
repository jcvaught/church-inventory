// COH-016 — acting as the key's owner.
//
// createCustomToken(uid) -> identitytoolkit signInWithCustomToken -> an ID token
// for that user. Every Firestore REST call then carries it, so firestore.rules
// see request.auth.uid == the owner. Cached per uid for 50 minutes (ID tokens
// live 60).
//
// DEPLOY RISK (cannot be verified offline): on Gen-2, createCustomToken needs
// the runtime service account to hold iam.serviceAccounts.signBlob (Service
// Account Token Creator on itself). If the first prod call fails with a
// signBlob / IAM error, STOP and report — granting IAM is an owner call.

// Web API key: public by design, the same value as src/firebase.js.
const WEB_API_KEY = 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y';
const CACHE_MS = 50 * 60 * 1000;

function createTokenProvider({ createCustomToken, fetchFn, now = () => Date.now(), apiKey = WEB_API_KEY }) {
  const cache = new Map(); // uid -> { idToken, expiresAt }
  const doFetch = (...a) => (fetchFn || globalThis.fetch)(...a);

  return async function getIdToken(uid) {
    const hit = cache.get(uid);
    if (hit && hit.expiresAt > now()) return hit.idToken;
    const customToken = await createCustomToken(uid);
    const res = await doFetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`signInWithCustomToken failed (${res.status})`);
      Object.defineProperty(err, 'detail', { value: text, enumerable: false });
      throw err;
    }
    const body = await res.json();
    if (!body || !body.idToken) throw new Error('signInWithCustomToken returned no idToken');
    cache.set(uid, { idToken: body.idToken, expiresAt: now() + CACHE_MS });
    return body.idToken;
  };
}

module.exports = { createTokenProvider, WEB_API_KEY, CACHE_MS };
