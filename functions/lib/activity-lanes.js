// COH-012 Part B — activityLog timestamp lanes, SERVER TWIN of src/lib/activity-lanes.js.
// Cloud Functions are CommonJS and the deploy package only contains functions/,
// so this cannot import the ESM module at runtime — it carries the same code.
//
// ⚠️ GENERATED from src/lib/activity-lanes.js by scripts/activity-lanes-twin.py
// (export keywords stripped, module.exports appended). KEEP IN SYNC:
// functions/test/activity-lanes.test.mjs imports BOTH and asserts identical
// output across the fixture matrix. Any drift fails the test. The WHY lives in
// the ESM module's header comment.

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
function activityLaneBounds(sinceISO, Timestamp) {
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
function activityTimestampISO(raw) {
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
function mergeActivityLanes(lanes, { maxEntries = Infinity } = {}) {
  const rows = [];
  for (const lane of lanes) {
    for (const row of lane) rows.push({ ...row, timestamp: activityTimestampISO(row.timestamp) });
  }
  rows.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  return Number.isFinite(maxEntries) ? rows.slice(0, maxEntries) : rows;
}

module.exports = { activityLaneBounds, activityTimestampISO, mergeActivityLanes };
