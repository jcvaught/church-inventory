import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.jsx';

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
    return event;
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);
