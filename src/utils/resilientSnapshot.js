import { onSnapshot } from 'firebase/firestore';
import * as Sentry from '@sentry/react';
import { createResilientListener } from '../lib/resilientListener.js';

// Drop-in for onSnapshot(target, onNext, onError) with a leading label naming
// the listener in Sentry. Every realtime listener in src/ goes through this —
// a raw onSnapshot stops for good on its first error (see
// src/lib/resilientListener.js; guarded by functions/test/resilient-listener.test.mjs).
// Thin adapter only: all behavior lives in the pure lib.

const env = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (t) => window.clearTimeout(t),
  isHidden: () => document.visibilityState === 'hidden',
  onVisible: (cb) => {
    const h = () => { if (document.visibilityState !== 'hidden') cb(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  },
  report: ({ level, label, code, outcome, attempt }) => {
    Sentry.captureMessage('Firestore listener dropped', {
      level,
      tags: { listener: label, code, outcome },
      extra: { attempt },
      fingerprint: ['firestore-listener-dropped', outcome],
    });
  },
  random: Math.random,
};

export function onSnapshotResilient(label, target, onNext, onError) {
  return createResilientListener({
    label,
    subscribe: (next, error) => onSnapshot(target, next, error),
    onNext,
    onError,
    env,
  });
}
