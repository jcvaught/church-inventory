// Foundation F2 — the People model.
//
// A single, PURE (zero-import) resolver that unifies the two backing stores for a
// human in a church:
//   • users/{uid}        — auth accounts (role, allowedHubs, name/email/phone)
//   • accessPeople/{id}  — People Access "tracked people" (personType, hourlyRate,
//                          compliance records via accessRecords, optional userId link)
// into one uniform `Person`, regardless of which store backs it.
//
// THE LINK IS CANONICAL. People Access links a tracked person to a user account via
// `accessPerson.userId`. That link means "same human." The resolver collapses a
// linked pair into ONE `Person`, so a contractor who is also a user, or a volunteer
// tracked for compliance, is never double-counted.
//
// Backing stores stay as they are — we are NOT merging the collections. This is the
// shared reference shape + resolver layer so features stop hand-rolling "is this a
// user or a tracked person?" logic.
//
// This module is intentionally pure and dependency-free so it imports cleanly into
// BOTH the Vite app (src/) and node --test (functions/test/). It operates on
// already-subscribed arrays — it does NOT fetch. Callers pass the live
// `users` / `accessPeople` / `accessRecords` arrays from useFirestore.
//
// SERVER TWIN: functions/index.js `isAccessEligible` implements the same
// link-collapse + non-expired-record eligibility rule on the Cloud Functions side
// (commonjs, so it can't import this ESM module). The two are pinned together by a
// parity fixture in functions/test/people-resolver.test.mjs — keep them in lockstep.

// ── PersonRef ──────────────────────────────────────────────────────────────
// PersonRef = { kind: 'user' | 'tracked', id, displayName }
// The shared reference shape used everywhere a human is referenced (work
// assignment, contractor time entries, shift sign-ups, search, attention engine).

export const PERSON_KINDS = ['user', 'tracked'];

/** Construct a PersonRef. */
export function makeRef(kind, id, displayName = '') {
  return { kind, id, displayName };
}

/** Stable string key for a ref — use for Set/Map dedup. */
export function refKey(ref) {
  return ref ? `${ref.kind}:${ref.id}` : '';
}

// ── Compliance / expiry thresholds (the shared, no-drift constants) ──────────
// A record is `expired` when its expiryDate is before today; `critical` within
// EXPIRY_CRITICAL_DAYS; `warning` within EXPIRY_WARNING_DAYS; else `ok`. A record
// with no expiryDate never lapses (returns null). Mirrors PeopleAccessPage and the
// server's non-expired check — DO NOT fork these numbers.
export const EXPIRY_CRITICAL_DAYS = 7;
export const EXPIRY_WARNING_DAYS = 30;

function startOfDay(d) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

function addDays(d, n) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}

/**
 * Classify a `YYYY-MM-DD` expiry string against `today` (any Date; normalized to
 * local midnight here). Returns 'expired' | 'critical' | 'warning' | 'ok', or null
 * when there is no expiry date (= never lapses). Parses the date as LOCAL (not UTC)
 * to avoid timezone-shift false positives — same as PeopleAccessPage.getExpiryStatus.
 */
export function expiryStatus(expiryDate, today = new Date()) {
  if (!expiryDate) return null;
  const [y, m, day] = String(expiryDate).split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  const t0 = startOfDay(today);
  if (dt < t0) return 'expired';
  if (dt <= addDays(t0, EXPIRY_CRITICAL_DAYS)) return 'critical';
  if (dt <= addDays(t0, EXPIRY_WARNING_DAYS)) return 'warning';
  return 'ok';
}

/**
 * Summarize a tracked person's compliance across all their accessRecords.
 * complianceStatus = { ok, expiringSoon: Entry[], expired: Entry[] }
 * where Entry = { type, expiryDate, status, requirementId? }.
 * `ok` is true when no record is expired. NOTE: this is the "nothing lapsed"
 * summary; requirement-gating ("do they hold a non-expired record of each type a
 * shift needs?") is a separate concern — see isEligibleFor.
 */
export function complianceStatusForTracked(trackedId, accessRecords = [], today = new Date()) {
  const expiringSoon = [];
  const expired = [];
  for (const r of accessRecords) {
    if (r.personId !== trackedId) continue;
    const status = expiryStatus(r.expiryDate, today);
    const entry = { type: r.type, expiryDate: r.expiryDate || null, status, requirementId: r.requirementId };
    if (status === 'expired') expired.push(entry);
    else if (status === 'critical' || status === 'warning') expiringSoon.push(entry);
  }
  return { ok: expired.length === 0, expiringSoon, expired };
}

// ── The resolver ─────────────────────────────────────────────────────────────
// Person = {
//   ref,                 // canonical PersonRef (prefers the user identity if linked)
//   displayName,
//   roles,               // Set<'admin'|'manager'|'member'|'volunteer'|'contractor'|'staff'>
//   linkedUserId,        // uid if backed by / linked to a user account, else null
//   linkedTrackedId,     // accessPeople doc id if backed by / linked to a tracked person
//   hourlyRate,          // contractors only (number), else undefined
//   contact,             // { email, phone }
//   complianceStatus,    // from People Access, or null if no tracked record
//   active,              // false when archived
// }

const ROLE_BY_PERSON_TYPE = {
  member: 'member',
  volunteer: 'volunteer',
  staff: 'staff',
  contractor: 'contractor',
};

const docId = (p) => (p ? (p._docId || p.id) : null);

function displayNameOf(user, tracked) {
  return (user && user.name) || (tracked && tracked.name) || (user && user.email) || (tracked && tracked.email) || '';
}

function buildPerson(user, tracked, accessRecords, today) {
  const roles = new Set();
  if (user) {
    if (user.role === 'admin') roles.add('admin');
    else if (user.role === 'manager') roles.add('manager');
    else roles.add('member');
  }
  if (tracked) {
    const mapped = ROLE_BY_PERSON_TYPE[tracked.personType];
    if (mapped) roles.add(mapped);
  }

  const trackedId = docId(tracked);
  // Canonical ref prefers the user identity (auth is the stronger key) when linked.
  const ref = user
    ? makeRef('user', user.id, displayNameOf(user, tracked))
    : makeRef('tracked', trackedId, displayNameOf(user, tracked));

  const hourlyRate = tracked && tracked.personType === 'contractor' && tracked.hourlyRate != null
    ? Number(tracked.hourlyRate)
    : undefined;

  return {
    ref,
    displayName: ref.displayName,
    roles,
    linkedUserId: user ? user.id : null,
    linkedTrackedId: trackedId,
    hourlyRate,
    contact: {
      email: (user && user.email) || (tracked && tracked.email) || '',
      phone: (user && user.phone) || (tracked && tracked.phone) || '',
    },
    complianceStatus: trackedId ? complianceStatusForTracked(trackedId, accessRecords, today) : null,
    active: tracked ? tracked.active !== false : (user ? user.active !== false : true),
  };
}

function normalizeCtx(ctx) {
  return {
    users: (ctx && ctx.users) || [],
    accessPeople: (ctx && ctx.accessPeople) || [],
    accessRecords: (ctx && ctx.accessRecords) || [],
    today: (ctx && ctx.today) || new Date(),
  };
}

/**
 * Resolve a single PersonRef to a uniform `Person`, collapsing the user↔tracked
 * link. Returns null if neither side is found.
 * ctx = { users, accessPeople, accessRecords, today } — already-subscribed arrays.
 */
export function getPerson(ref, ctx) {
  if (!ref) return null;
  const { users, accessPeople, accessRecords, today } = normalizeCtx(ctx);
  let user = null;
  let tracked = null;
  if (ref.kind === 'user') {
    user = users.find(u => u.id === ref.id) || null;
    if (user) tracked = accessPeople.find(p => p.userId === user.id) || null;
  } else {
    tracked = accessPeople.find(p => docId(p) === ref.id) || null;
    if (tracked && tracked.userId) user = users.find(u => u.id === tracked.userId) || null;
  }
  if (!user && !tracked) return null;
  return buildPerson(user, tracked, accessRecords, today);
}

/**
 * Enumerate every distinct human in the church as a unified `Person`, collapsing
 * linked user↔tracked pairs:
 *   • a user with no tracked record   → user-backed Person
 *   • a tracked person with no user   → tracked-backed Person
 *   • a linked pair                   → ONE Person (emitted once, user-keyed)
 */
export function listPeople(ctx) {
  const { users, accessPeople, accessRecords, today } = normalizeCtx(ctx);
  const out = [];
  const collapsedTracked = new Set();

  for (const u of users) {
    const tracked = accessPeople.find(p => p.userId === u.id) || null;
    if (tracked) collapsedTracked.add(docId(tracked));
    out.push(buildPerson(u, tracked, accessRecords, today));
  }
  for (const p of accessPeople) {
    if (collapsedTracked.has(docId(p))) continue; // already emitted with its linked user
    if (p.userId && users.some(u => u.id === p.userId)) continue; // linked, user already emitted
    out.push(buildPerson(null, p, accessRecords, today));
  }
  return out;
}

/**
 * Eligibility for a job's `requiredAccessTypes`, expressed over a resolved Person.
 * Mirror of functions/index.js `isAccessEligible`: empty requirement list ⇒ eligible;
 * otherwise the person must hold a non-expired tracked record of EACH required type.
 * A person with no tracked record can never satisfy a non-empty requirement list.
 * (Assumes the 1:1 user↔tracked link that People Access enforces; the server's
 * Set-based form additionally aggregates across multiple tracked docs per uid.)
 */
export function isEligibleFor(person, requiredTypes, accessRecords = [], today = new Date()) {
  if (!requiredTypes || requiredTypes.length === 0) return true;
  if (!person || !person.linkedTrackedId) return false;
  const myRecords = accessRecords.filter(r => r.personId === person.linkedTrackedId);
  return requiredTypes.every(reqType =>
    myRecords.some(r => r.type === reqType && expiryStatus(r.expiryDate, today) !== 'expired')
  );
}
