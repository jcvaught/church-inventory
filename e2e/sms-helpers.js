// @ts-check
// Helpers for simulating signed Twilio webhook calls to the deployed
// `twilioInbound` function — gated UAT for the M6 STOP/START flows + the
// recycled-phone START gate. The function validates X-Twilio-Signature
// against the URL + form params, so we sign requests exactly the way Twilio
// does (HMAC-SHA1 over URL + sorted-key concatenation, base64).

import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read functions/.env once, return the parsed map. Manual parser — no dotenv.
let _envCache = null;
function loadFunctionsEnv() {
  if (_envCache) return _envCache;
  const envPath = pathResolve(__dirname, '..', 'functions', '.env');
  const raw = readFileSync(envPath, 'utf-8');
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  _envCache = out;
  return out;
}

// The function's validator falls back to this URL when TWILIO_INBOUND_URL is
// unset; functions/.env doesn't set it, so prod uses the same fallback.
export const TWILIO_INBOUND_URL = 'https://us-central1-church-inventory-9615c.cloudfunctions.net/twilioInbound';

export function getTwilioAuthToken() {
  const env = loadFunctionsEnv();
  const tok = env.TWILIO_AUTH_TOKEN;
  if (!tok) throw new Error('TWILIO_AUTH_TOKEN missing from functions/.env');
  return tok;
}

// Sign a request the way Twilio does: HMAC-SHA1(url + sortedKeys.map(k => k+v).join(''))
// with the auth token as the key, then base64. Twilio's library produces the
// same value via twilio.validateRequest in the function.
export function signTwilioRequest(url, params, authToken) {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

// POST a signed Twilio webhook payload to the live twilioInbound endpoint.
// Returns { status, body } so the caller can assert on the HTTP-level outcome
// (the function returns 200 + TwiML on accepted writes, 403 on a bad signature).
export async function postSignedTwilioInbound(params) {
  const url = TWILIO_INBOUND_URL;
  const token = getTwilioAuthToken();
  const signature = signTwilioRequest(url, params, token);
  const formBody = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body: formBody,
  });
  return { status: res.status, body: await res.text() };
}
