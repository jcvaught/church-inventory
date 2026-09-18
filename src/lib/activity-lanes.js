// COH-012 Part B — activityLog timestamp LANES.
//
// `activityLog.timestamp` has two on-disk types: historical rows carry an ISO
// string, COH-002-era rows carry a Firestore Timestamp (the writer switched
// from `new Date().toISOString()` to `serverTimestamp()`). A Firestore
// inequality filter is TYPE-SCOPED: `where('timestamp', '>=', <string>)`
// returns string rows only and `where('timestamp', '>=', <Timestamp>)`
// returns Timestamp rows only, so a single filter sees one lane and silently
// drops the other. And a MIXED-type range on one field — `>= <string> AND
// < <Timestamp>` — matches NOTHING.
//
// Both facts are MEASURED, not reasoned (feedback: measure infra claims).
// FXCC production, 2026-09-18, REST count() over 1010 rows, window since
// 2026-06-20:  `>= "2026-06-20"` → 173 · `>= Timestamp(2026-06-20)` → 43 ·
// `>= "2026-06-20" AND < Timestamp(0)` → 0. The Firestore emulator agrees on
// all three (functions/test/handlers/insightsDigest.test.mjs relies on that).
//
// Consequences that shaped this module:
//   • The server digest (one string filter) was reading 173 of 216 — 81%.
//   • The client's first dual-lane attempt (src/useFirestore.js before Part B)
//     put a `< Timestamp(0)` upper bound on the string lane "so it would not
//     also return every Timestamp row". Type-scoping already prevents that,
//     and the mixed-type range made the lane return ZERO rows — the in-app
//     Insights hub was computing over the 43 Timestamp rows only, 20%.
//   • So each lane is ONE lower-bound filter of its own type. Never add an
//     upper bound of the other type.
//
// The fix is to query BOTH lanes and merge. This module is the pure part of
// that: it computes the two lanes' bounds and merges the results into the ISO
// string shape the rest of the app expects. Query execution stays SDK-specific
// on each side (browser `query()` in src/useFirestore.js, admin
// `.where()` in functions/index.js) — only the lane logic is shared.
//
// Two copies, deliberately: the ESM module here and a CJS twin at
// functions/lib/activity-lanes.js (regenerate with
// `python3 scripts/activity-lanes-twin.py`); functions/test/activity-lanes.test.mjs
// imports both and asserts identical output. Same precedent as entitlement.js.
//
// Dual-lane is permanent, not a migration bridge (plan Part B step 4): the
// alternative is rewriting ~1000 live audit rows to fix a reporting query.

/**
 * The bounds for the two type lanes of an `activityLog.timestamp` window that
 * starts at `sinceISO` (any string `new Date()` parses — a full ISO instant or
 * a bare `YYYY-MM-DD`). `Timestamp` is the SDK's class (browser or admin; both
 * expose `fromDate`) so this stays SDK-agnostic.
 *
 *   legacy  — string rows:    timestamp >= sinceISO
 *   current — Timestamp rows: timestamp >= Timestamp(sinceISO)
 *
 * Each lane is exactly one `>=` filter of its own type and nothing else —
 * see the header for the measured reason there is no upper bound.
 */
export function activityLaneBounds(sinceISO, Timestamp) {
  if (typeof sinceISO !== 'string' || !sinceISO) throw new TypeError('activityLaneBounds: sinceISO must be a non-empty string');
  const sinceDate = new Date(sinceISO);
  if (Number.isNaN(sinceDate.getTime())) throw new TypeError(`activityLaneBounds: unparseable sinceISO "${sinceISO}"`);
  return {
    legacy: { gte: sinceISO },
    current: { gte: Timestamp.fromDate(sinceDate) },
  };
}

/**
 * One row's `timestamp` as an ISO string, whichever lane it came from.
 * Strings pass through (they are already ISO); Firestore Timestamps and Dates
 * are converted; anything else (missing, malformed) becomes null so a sort
 * comparator can treat it uniformly.
 */
export function activityTimestampISO(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw.toDate === 'function') return raw.toDate().toISOString();
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  return null;
}

/**
 * Merge the rows from every lane into one list, oldest→newest by ISO
 * timestamp, capped at `maxEntries`. Each row is returned with its
 * `timestamp` normalised to an ISO string (or null); every other field is
 * kept as-is. Rows with a null timestamp sort first so they are never
 * silently dropped by the cap in preference to dated rows.
 */
export function mergeActivityLanes(lanes, { maxEntries = Infinity } = {}) {
  const rows = [];
  for (const lane of lanes) {
    for (const row of lane) rows.push({ ...row, timestamp: activityTimestampISO(row.timestamp) });
  }
  rows.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  return Number.isFinite(maxEntries) ? rows.slice(0, maxEntries) : rows;
}
