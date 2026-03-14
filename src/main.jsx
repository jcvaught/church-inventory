import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.jsx';

Sentry.init({
  dsn: "https://92a9eb2a55b9544dd9e673291f57eff8@o4511040580091904.ingest.us.sentry.io/4511040584089600",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
  tracesSampleRate: 0.2,
  environment: import.meta.env.MODE,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
