import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { HelmetProvider } from 'react-helmet-async';
import { importWithRetry } from './utils/lazyWithRetry.js';
import UpdateBanner from './components/UpdateBanner.jsx';

Sentry.init({
  dsn: "https://92a9eb2a55b9544dd9e673291f57eff8@o4511040580091904.ingest.us.sentry.io/4511040584089600",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
  tracesSampleRate: 0.2,
  environment: import.meta.env.MODE,
  // Drop a known class of transient noise from the Sentry issue feed.
  // Firebase Firestore SDK logs "Uncaught Error in snapshot listener" to
  // console.error whenever an in-flight listener loses access — which
  // commonly happens during auth-state transitions (sign-out, token
  // refresh, rapid E2E context teardown). Our useFirestore hook's
  // per-subscription error callbacks already handle these via handleErr
  // (which Sentry-captures with context), so the SDK's console.error is
  // duplicate noise.
  beforeSend(event, hint) {
    const exc = hint?.originalException;
    const msg = (event.message || (exc && exc.message) || '').toString();
    if (msg.includes('@firebase/firestore') && msg.includes('Uncaught Error in snapshot listener')) {
      return null;
    }
    // Firebase Auth's IndexedDB-backed persistence (its token store) throws
    // "UnknownError: Connection to Indexed Database server lost. Refresh the
    // page to try again" when the browser drops the IDB connection — Safari/iOS
    // eviction, a backgrounded/killed tab, cleared site data, private mode.
    // It is transient, environmental (not app code), and self-heals on the
    // refresh the message itself prompts. Firestore offline persistence is not
    // enabled, so this is Auth-only token-store noise, not a data-cache issue.
    if (msg.includes('Connection to Indexed Database server lost')) {
      return null;
    }
    // Intentional rule-block / user-error codes from Firebase callables
    // (HttpsError) and the Firestore client SDK. These fire whenever a
    // member tries something the rules disallow (admin-only mutation, no
    // hub access, missing waiver/compliance precondition, signed-out
    // session) — that's the system *working*, not breaking. Filtering
    // here keeps the Sentry feed dominated by `internal`/`unknown`/
    // unhandled exceptions, where real bugs live.
    const code = (exc && exc.code) || '';
    if (code === 'permission-denied' || code === 'failed-precondition' ||
        code === 'unauthenticated' || code === 'not-found' ||
        code === 'functions/permission-denied' || code === 'functions/failed-precondition' ||
        code === 'functions/unauthenticated' || code === 'functions/not-found') {
      return null;
    }
    return event;
  },
});

// Lazy-load PostHog after first paint so it stays out of the critical JS
// path. Activates only when VITE_POSTHOG_KEY is set in Vercel env vars —
// otherwise the entire block is dead-code-eliminated by Vite. Autocaptures
// pageviews + pageleave; sufficient for blog traffic visibility.
if (import.meta.env.VITE_POSTHOG_KEY) {
  const initPostHog = () =>
    import('posthog-js').then(({ default: posthog }) => {
      posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
      });
      window.posthog = posthog;
    });
  'requestIdleCallback' in window ? requestIdleCallback(initPostHog) : setTimeout(initPostHog, 1500);
}

const root = ReactDOM.createRoot(document.getElementById('root'));

// Anonymous-traffic split: when the URL carries ?jobs= (the public teen-
// facing job board share link), render a minimal tree that pulls only
// firebase/app + firebase/functions + PublicJobsPage — not the
// authenticated app, hub pages, Firestore/Auth/Storage SDKs, zxing, etc.
// Audit 2026-05-23 C-1: anonymous bundle was ~2 MB before this split.
const params = new URLSearchParams(window.location.search);
const publicJobsChurchId = params.get('jobs');

if (publicJobsChurchId) {
  Promise.all([
    importWithRetry(() => import('./firebasePublic.js'), 'firebasePublic'),
    importWithRetry(() => import('./pages/PublicJobsPage.jsx'), 'PublicJobsPage'),
  ]).then(([, mod]) => {
    const PublicJobsPage = mod.PublicJobsPage;
    const churchName = params.get('cn') ? decodeURIComponent(params.get('cn')) : '';
    const churchCode = params.get('cc') ? decodeURIComponent(params.get('cc')) : '';
    const onGetStarted = (mode = 'register') => {
      window.location.href = mode === 'login' ? '/?signin=1' : '/?signup=1';
    };
    root.render(
      <React.StrictMode>
        <HelmetProvider>
          <PublicJobsPage
            churchId={publicJobsChurchId}
            churchName={churchName}
            churchCode={churchCode}
            onGetStarted={onGetStarted}
          />
        </HelmetProvider>
      </React.StrictMode>
    );
  });
} else {
  importWithRetry(() => import('./App.jsx'), 'App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <HelmetProvider>
          <App />
          <UpdateBanner />
        </HelmetProvider>
      </React.StrictMode>
    );
  });
}
