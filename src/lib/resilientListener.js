// Listener resilience (2026-10-18, docs/LISTENER-RESILIENCE-PLAN-2026-10-18.md).
//
// A Firestore onSnapshot error is PERMANENT: every SDK path that calls a
// listener's error callback also discards the listener (@firebase/firestore
// 4.14.1 — eventManagerOnWatchError, eventManagerListen's catch, terminate).
// Transport blips are retried inside the SDK and never reach the callback, so
// an error we see means the data has stopped updating. This wraps one listener
// so a retryable drop resubscribes with bounded backoff, and every drop is
// reported so its frequency is measured rather than guessed.
//
// Pure: no firebase, Sentry or DOM imports — everything arrives via `env`, so
// functions/test/resilient-listener.test.mjs drives it with fakes. The binding
// is src/utils/resilientSnapshot.js.

// `aborted` is deliberately absent: its only SDK source is terminate(), and a
// terminated instance cannot be resubscribed. The app never terminates, so an
// `aborted` here is unexpected and is reported as permanent.
import { isMissingIndexError } from './sentryFilter.js';

export const RETRYABLE_LISTENER_CODES = new Set([
  'deadline-exceeded', 'unavailable', 'internal', 'unknown', 'resource-exhausted', 'cancelled',
]);

// Rule/user codes main.jsx beforeSend drops for exceptions. captureMessage
// carries no exception, so that filter can't see these reports — mirror it
// here so a dropped listener never reports what an error would not.
export const UNREPORTED_LISTENER_CODES = new Set([
  'permission-denied', 'failed-precondition', 'unauthenticated', 'not-found',
]);

export const MAX_FAILURES = 6;

export function backoffMs(failures, random = Math.random) {
  return Math.min(60000, 2000 * 2 ** (failures - 1) + Math.floor(random() * 1000));
}

export function createResilientListener({ label, subscribe, onNext, onError, env }) {
  // Reporting must never block the retry it describes.
  const report = (e) => { try { env.report(e); } catch { /* Sentry down */ } };
  let closed = false;
  let failures = 0;
  let generation = 0;
  let current = null;
  let timer = null;
  let offVisible = null;

  const stopCurrent = () => {
    const unsub = current;
    current = null;
    if (unsub) { try { unsub(); } catch { /* already gone */ } }
  };

  function open() {
    if (closed) return;
    const gen = ++generation;
    const next = (snap) => {
      if (closed || gen !== generation) return;
      failures = 0;
      onNext(snap);
    };
    const error = (err) => {
      if (closed || gen !== generation) return;
      handleError(err);
    };
    let unsub = null;
    try {
      unsub = subscribe(next, error);
    } catch (err) {
      error(err);
      return;
    }
    // An error delivered before subscribe() returned has already moved on to
    // a newer generation (or closed us): this listener is stale — close it.
    if (gen !== generation || closed) { try { unsub?.(); } catch { /* gone */ } return; }
    current = unsub;
  }

  function handleError(err) {
    // Invalidate this generation first: the SDK has already dropped it, and a
    // late event from it must not reach the caller after a resubscribe.
    generation++;
    stopCurrent();
    const code = err?.code;
    const retryable = RETRYABLE_LISTENER_CODES.has(code);
    if (retryable) failures++;
    // Decide BEFORE telling the caller, so it can act on the outcome: a caller
    // that ignores a drop must not keep ignoring it once we have given up.
    const willRetry = retryable && failures <= MAX_FAILURES;
    try { onError?.(err, { willRetry }); } catch { /* caller's handler must not wedge the retry */ }
    if (closed) return; // the caller tore us down from inside onError
    if (!retryable) {
      if (!UNREPORTED_LISTENER_CODES.has(code) || isMissingIndexError(code, err?.message)) report({ level: 'error', label, code: code || 'none', outcome: 'permanent' });
      return;
    }
    if (!willRetry) {
      report({ level: 'error', label, code, outcome: 'gave-up', attempt: failures - 1 });
      return;
    }
    report({ level: 'warning', label, code, outcome: 'retry', attempt: failures });
    timer = env.setTimeout(() => {
      timer = null;
      if (closed) return;
      if (env.isHidden()) {
        offVisible = env.onVisible(() => {
          offVisible?.();
          offVisible = null;
          open();
        });
      } else {
        open();
      }
    }, backoffMs(failures, env.random || Math.random));
  }

  open();

  return function unsubscribe() {
    if (closed) return;
    closed = true;
    if (timer !== null) { env.clearTimeout(timer); timer = null; }
    if (offVisible) { offVisible(); offVisible = null; }
    stopCurrent();
  };
}
