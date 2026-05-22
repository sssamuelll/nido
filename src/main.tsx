import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { ErrorView } from './components/ErrorView';

const dsn = import.meta.env.VITE_SENTRY_DSN_CLIENT;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  integrations: [Sentry.browserTracingIntegration()],
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      Sentry.captureException(err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <ErrorView message="Algo salió mal. Intenta de nuevo." onRetry={resetError} />
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
