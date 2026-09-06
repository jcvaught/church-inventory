// COH-007 — who is eligible for automatic archiving, as pure logic.
//
// Extracted because the interesting cases here are all edges, and none of them
// are visible in a rendered board: the exact 42-day boundary, a completed task
// whose `completedAt` was never stamped, a malformed date string, a Firestore
// Timestamp where an ISO string was expected, and a future date. Each one is a
// decision about whether a real church's task disappears from its board.
//
// CommonJS: this is loaded by functions/index.js at runtime, and the deploy
// package only contains functions/.

// "Complete for more than six weeks." Exactly 42 days is NOT eligible; the next
// representable instant is.
const ARCHIVE_AFTER_DAYS = 42;

// The instant a task must have completed strictly BEFORE to be eligible.
function archiveCutoffISO(now, days = ARCHIVE_AFTER_DAYS) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

// A completion stamp this app actually wrote: an ISO-8601 UTC string, which is
// what every task creation and completion path produces. Anything else — a
// Firestore Timestamp, a number, a date-only string, free text — is a value we
// cannot compare against the cutoff without guessing, and guessing here archives
// a task that was never properly completed.
//
// `completedAt` is deliberately NOT reconstructed from `updatedAt` or
// `createdAt`. Those answer a different question, and a task whose completion
// was never stamped has no completion date to infer.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function isUsableCompletedAt(value) {
  return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

// Returns { eligible, reason }. `reason` names why a document the eligibility
// query returned is being skipped, and is what the run summary counts.
//
// Scoped, per A12/A17, to what the range query can actually SEE. A document with
// no `completedAt` at all never appears in that query, and a malformed value
// sorting outside the range is equally absent — so this can only guard the
// malformed values it was handed. Population-wide data quality is a separate,
// bounded decision and is not promised here.
function evaluateArchiveCandidate(data, cutoffISO) {
  if (!data) return { eligible: false, reason: 'missing' };
  if (data.type !== 'task') return { eligible: false, reason: 'not-a-task' };
  if (data.status !== 'Complete') return { eligible: false, reason: 'not-complete' };
  if (data.archived === true) return { eligible: false, reason: 'already-archived' };
  if (!isUsableCompletedAt(data.completedAt)) return { eligible: false, reason: 'malformed-completed-at' };
  // Strictly older: a task completed exactly at the cutoff has been complete for
  // exactly 42 days, and the contract says MORE than six weeks.
  if (!(data.completedAt < cutoffISO)) return { eligible: false, reason: 'too-recent' };
  return { eligible: true, reason: null };
}

module.exports = {
  ARCHIVE_AFTER_DAYS,
  archiveCutoffISO,
  isUsableCompletedAt,
  evaluateArchiveCandidate,
};
