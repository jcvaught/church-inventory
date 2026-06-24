// Google Calendar real-time sync (GCAL-SYNC-PLAN-2026-06-24).
// Dependency-free `fetch` — NO `googleapis` SDK (matches the Brevo/Twilio/Claude
// pattern; heavy dep + cold-start cost otherwise). Two halves:
//
//   1. occurrenceToGcalEvent(occ, tz) — PURE. Turns the F5 canonical Occurrence
//      (functions/lib/occurrences.js) into a Calendar API v3 event resource, so
//      the GCal event and the ICS VEVENT never drift. Unit-tested in
//      functions/test/gcal.test.mjs.
//   2. OAuth + REST helpers — read GOOGLE_OAUTH_CLIENT_ID / _SECRET from env at
//      call time (not import time, so this module loads fine pre-Phase-0).
//
// Least-privilege scope: calendar.app.created (app only manages calendars it
// created). See the plan for the OAuth-verification gate.

const OAUTH_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CAL_API = 'https://www.googleapis.com/calendar/v3';

// ── Pure date/time helpers (twins of the occurrences.js logic) ──────────────

// 'YYYY-MM-DD' (+ optional time noise) → next calendar day as 'YYYY-MM-DD'.
// Used for all-day end dates, which Google treats as EXCLUSIVE (matches the
// ICS DTEND;VALUE=DATE +1-day convention).
function addOneDayYmd(ymd) {
  const d = new Date(
    parseInt(ymd.slice(0, 4)),
    parseInt(ymd.slice(5, 7)) - 1,
    parseInt(ymd.slice(8, 10)) + 1
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// '09:00' / '9:00 AM' / '2:30 PM' → { h, min } in 24h, or null if unparseable.
// Same regex/AM-PM logic as occurrences.timeToICS so timed-vs-all-day matches.
function parseTime(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, min };
}

// Local-naive RFC3339 (no offset) — Google applies the separate `timeZone`
// field, so we never compute DST offsets ourselves.
function localDateTime(ymd, h, min) {
  return `${ymd.slice(0, 10)}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

// ── The mapping: Occurrence → Calendar API v3 event resource ────────────────
// Mirrors occurrenceToVEvent: timed events get start/end dateTime (+1h default
// end, carrying past midnight); all-day events get exclusive date end. Stamps
// extendedProperties.private with the COH source ids — the forward-compat hook
// a future 2-way watch channel uses to reconcile an inbound change to its doc.
function occurrenceToGcalEvent(occ, tz) {
  if (!occ || !occ.start) return null;
  const ev = { summary: occ.title || 'Event' };
  if (occ.description) ev.description = occ.description;
  if (occ.location) ev.location = occ.location;

  const t = occ.allDay ? null : parseTime(occ.startTime);
  if (t) {
    const startYmd = occ.start.slice(0, 10);
    ev.start = { dateTime: localDateTime(startYmd, t.h, t.min), timeZone: tz };
    const endT = parseTime(occ.endTime);
    const endYmd = (occ.end || occ.start).slice(0, 10);
    // Use the explicit end only if it's strictly after the start on the same/later day.
    const startAbs = startYmd + String(t.h).padStart(2, '0') + String(t.min).padStart(2, '0');
    const endAbs = endT ? endYmd + String(endT.h).padStart(2, '0') + String(endT.min).padStart(2, '0') : null;
    if (endT && endAbs > startAbs) {
      ev.end = { dateTime: localDateTime(endYmd, endT.h, endT.min), timeZone: tz };
    } else {
      // Default to +1 hour, carrying into the next day if it crosses midnight.
      let eh = t.h + 1;
      let eYmd = startYmd;
      if (eh >= 24) { eh -= 24; eYmd = addOneDayYmd(startYmd); }
      ev.end = { dateTime: localDateTime(eYmd, eh, t.min), timeZone: tz };
    }
  } else {
    const startYmd = occ.start.slice(0, 10);
    ev.start = { date: startYmd };
    ev.end = { date: addOneDayYmd((occ.end || occ.start).slice(0, 10)) }; // exclusive
  }

  ev.extendedProperties = {
    private: {
      cohSource: occ.sourceType || '',
      cohId: occ.sourceId || '',
    },
  };
  return ev;
}

// ── OAuth + REST (dependency-free fetch; creds read at call time) ────────────

function oauthCreds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('gcal: GOOGLE_OAUTH_CLIENT_ID / _SECRET not configured (Phase 0)');
  }
  return { clientId, clientSecret };
}

// The consent-screen URL the admin is sent to. `state` carries the signed
// churchId; `redirectUri` is the gcalAuthCallback function URL.
function buildConsentUrl(redirectUri, state) {
  const { clientId } = oauthCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-consent
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`gcal token ${res.status}: ${json.error || ''} ${json.error_description || ''}`.trim());
    err.status = res.status;
    err.googleError = json.error;
    throw err;
  }
  return json;
}

// Authorization-code → tokens (one-time, at connect). Returns the refresh_token.
function exchangeCode(code, redirectUri) {
  const { clientId, clientSecret } = oauthCreds();
  return postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

// refresh_token → short-lived access_token (every sync). A 400 invalid_grant
// here means the user revoked access → caller marks connected:false.
async function getAccessToken(refreshToken) {
  const { clientId, clientSecret } = oauthCreds();
  const json = await postToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return json.access_token;
}

// Revoke a token (disconnect). Best-effort — Google 200s even on already-revoked.
async function revokeToken(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => {});
}

// Thin Calendar API wrapper. Returns parsed JSON (or {} for 204 deletes).
// Throws an Error with .status on non-2xx so callers can branch on 404/410/429.
async function calFetch(accessToken, method, path, body) {
  const res = await fetch(`${CAL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`gcal ${method} ${path} → ${res.status}: ${json.error?.message || ''}`.trim());
    err.status = res.status;
    err.googleError = json.error;
    throw err;
  }
  return json;
}

// Calendar/event ops on the dedicated COH calendar.
const createCalendar = (accessToken, summary, timeZone) =>
  calFetch(accessToken, 'POST', '/calendars', { summary, timeZone });
const deleteCalendar = (accessToken, calendarId) =>
  calFetch(accessToken, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}`);
const insertEvent = (accessToken, calendarId, event) =>
  calFetch(accessToken, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, event);
const patchEvent = (accessToken, calendarId, eventId, event) =>
  calFetch(accessToken, 'PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, event);
const deleteEvent = (accessToken, calendarId, eventId) =>
  calFetch(accessToken, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);

module.exports = {
  OAUTH_SCOPE,
  // pure
  occurrenceToGcalEvent, addOneDayYmd, parseTime, localDateTime,
  // oauth
  buildConsentUrl, exchangeCode, getAccessToken, revokeToken,
  // rest
  calFetch, createCalendar, deleteCalendar, insertEvent, patchEvent, deleteEvent,
};
