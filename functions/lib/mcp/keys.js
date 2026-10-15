// COH-016 — API keys for the ChatGPT MCP server.
//
// `apiKeys/{sha256hex}` (top level, Admin-SDK only — firestore.rules deny all
// client access). The plaintext key is `coh_` + 32 random bytes base64url,
// returned ONCE by createKey and never stored or logged. Dates are ISO strings,
// the app's convention.
//
// This module touches only apiKeys / apiKeyUsage and users/{uid} via the Admin
// SDK `db` it is handed. It never reads task data.

const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

// COH-016: who may hold an API key. Owner decision 2026-10-15: John only
// (jvaught@fxcc.org). Widening later = edit this list. The server allowlist is
// the real gate; the Settings card hiding itself for other uids is cosmetic.
const API_KEY_ALLOWLIST = ['RCFuTSK9ARfGF83v6TOS1Yf4Cnn2'];

const KEY_PREFIX = 'coh_';
const KEY_TTL_DAYS = 90;
const MAX_ACTIVE_KEYS = 5;
const ID_LEN = 12;
const LAST_USED_MIN_INTERVAL_MS = 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 60;

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

function generateKey() {
  const key = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { key, hash: sha256hex(key) };
}

const shortId = (hash) => hash.slice(0, ID_LEN);

const isLive = (k, nowMs) => !k.revokedAt && new Date(k.expiresAt).getTime() > nowMs;

/** Create a key for `uid`. Throws HttpsError on refusal. */
async function createKey({ db, uid, label, now = new Date(), allowlist = API_KEY_ALLOWLIST }) {
  if (!allowlist.includes(uid)) {
    throw new HttpsError('permission-denied', 'API keys are not available for this account.');
  }
  const cleanLabel = typeof label === 'string' ? label.trim() : '';
  if (!cleanLabel || cleanLabel.length > 60) {
    throw new HttpsError('invalid-argument', 'Label must be 1-60 characters.');
  }
  const userSnap = await db.doc(`users/${uid}`).get();
  const churchId = userSnap.exists ? userSnap.data().churchId : null;
  if (!churchId || userSnap.data().active === false) {
    throw new HttpsError('failed-precondition', 'No active church profile found.');
  }
  const { key, hash } = generateKey();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + KEY_TTL_DAYS * 86400000).toISOString();
  // Transaction: the 5-key cap must hold under concurrent creates.
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection('apiKeys').where('uid', '==', uid));
    const live = existing.docs.filter((d) => isLive(d.data(), now.getTime()));
    if (live.length >= MAX_ACTIVE_KEYS) {
      throw new HttpsError('resource-exhausted', `You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
    }
    tx.set(db.doc(`apiKeys/${hash}`), {
      uid, churchId, label: cleanLabel, createdAt, expiresAt, lastUsedAt: null, revokedAt: null,
    });
  });
  return { key, id: shortId(hash), expiresAt };
}

/** The caller's own keys, newest first, with only a short id prefix. */
async function listKeys({ db, uid, now = new Date() }) {
  const snap = await db.collection('apiKeys').where('uid', '==', uid).get();
  return snap.docs
    .map((d) => {
      const k = d.data();
      return {
        id: shortId(d.id),
        label: k.label,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt || null,
        revoked: !!k.revokedAt,
        expired: new Date(k.expiresAt).getTime() <= now.getTime(),
      };
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/** Revoke one of the caller's OWN keys by its short id. Idempotent. */
async function revokeKey({ db, uid, id, now = new Date() }) {
  if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'A valid key id is required.');
  }
  const snap = await db.collection('apiKeys').where('uid', '==', uid).get();
  const matches = snap.docs.filter((d) => d.id.startsWith(id));
  if (matches.length === 0) throw new HttpsError('not-found', 'Key not found.');
  if (matches.length > 1) throw new HttpsError('failed-precondition', 'Ambiguous key id.');
  const doc = matches[0];
  if (!doc.data().revokedAt) await doc.ref.update({ revokedAt: now.toISOString() });
  return { id, revoked: true };
}

/**
 * Authenticate a Bearer value. Returns `{ ok:true, hash, keyId, uid, churchId }`
 * or `{ ok:false }` — never says WHY, so a probe learns nothing. Also refuses a
 * key whose owner is no longer on the allowlist. Updates lastUsedAt at most
 * once per minute.
 */
async function authenticateKey({ db, authorization, now = new Date(), allowlist = API_KEY_ALLOWLIST }) {
  const m = /^Bearer\s+(\S+)$/i.exec(typeof authorization === 'string' ? authorization : '');
  const key = m ? m[1] : '';
  if (!key.startsWith(KEY_PREFIX) || key.length < 20 || key.length > 100) return { ok: false };
  const hash = sha256hex(key);
  const snap = await db.doc(`apiKeys/${hash}`).get();
  if (!snap.exists) return { ok: false };
  const k = snap.data();
  if (!isLive(k, now.getTime())) return { ok: false };
  if (!allowlist.includes(k.uid)) return { ok: false };
  const last = k.lastUsedAt ? new Date(k.lastUsedAt).getTime() : 0;
  if (now.getTime() - last >= LAST_USED_MIN_INTERVAL_MS) {
    await snap.ref.update({ lastUsedAt: now.toISOString() }).catch(() => {});
  }
  return { ok: true, hash, keyId: shortId(hash), uid: k.uid, churchId: k.churchId };
}

/**
 * Fixed-window rate limit, one `apiKeyUsage/{hash}` doc per key (Admin SDK
 * transaction). > 60s since windowStart resets; count >= 60 refuses; else
 * increments. Returns `{ ok }`.
 */
async function rateLimit({ db, hash, now = new Date(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS }) {
  const ref = db.doc(`apiKeyUsage/${hash}`);
  const t = now.getTime();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : null;
    if (!cur || t - cur.windowStart >= windowMs) {
      tx.set(ref, { windowStart: t, count: 1 });
      return { ok: true };
    }
    if (cur.count >= limit) return { ok: false };
    tx.update(ref, { count: cur.count + 1 });
    return { ok: true };
  });
}

module.exports = {
  API_KEY_ALLOWLIST, KEY_PREFIX, KEY_TTL_DAYS, MAX_ACTIVE_KEYS, RATE_LIMIT,
  sha256hex, generateKey, shortId,
  createKey, listKeys, revokeKey, authenticateKey, rateLimit,
};
