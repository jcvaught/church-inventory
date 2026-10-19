// Which captured exceptions main.jsx beforeSend drops (2026-10-18). Rule and
// user codes are the system working, not breaking — EXCEPT a missing composite
// index, which also arrives as failed-precondition but is an engineering
// fault: useFirestore.handleErr captures it at level 'fatal' with tag
// missingIndex, and until this carve-out the filter silently dropped it.
// Pure; functions/test/sentry-filter.test.mjs.
const DROPPED_CODES = new Set([
  'permission-denied', 'failed-precondition', 'unauthenticated', 'not-found',
  'functions/permission-denied', 'functions/failed-precondition',
  'functions/unauthenticated', 'functions/not-found',
]);

export function isMissingIndexError(code, message) {
  return code === 'failed-precondition' && typeof message === 'string' && message.includes('requires an index');
}

export function shouldDropForCode(code, message) {
  if (!code || !DROPPED_CODES.has(code)) return false;
  return !isMissingIndexError(code, message);
}
