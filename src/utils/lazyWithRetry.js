import { lazy } from 'react';

// Stale-chunk self-heal. When a new build is deployed, Vite emits new
// hashed chunk filenames and the old ones are removed from the host. A
// browser still running the previous build references the old filenames,
// so its lazy import() either 404s with:
//   "TypeError: Failed to fetch dynamically imported module: .../X-<hash>.js"
// or — when a SPA catch-all rewrite serves index.html for the missing
// asset and `X-Content-Type-Options: nosniff` is set — fails with:
//   "TypeError: 'text/html' is not a valid JavaScript MIME type."
//
// Strategy:
//   1. Retry the import once (covers a transient network blip).
//   2. If it still fails, the chunk is genuinely gone (a deploy happened).
//      Force a one-time hard reload so the browser fetches the fresh
//      index.html + chunk manifest. A sessionStorage flag (cleared on a
//      successful import) prevents an infinite reload loop if the failure
//      is something other than a stale chunk.
export async function importWithRetry(factory, name) {
  const reloadKey = `chunk-reload:${name}`;
  try {
    const mod = await factory();
    window.sessionStorage.removeItem(reloadKey);
    return mod;
  } catch {
    try {
      const mod = await factory();
      window.sessionStorage.removeItem(reloadKey);
      return mod;
    } catch (retryErr) {
      const alreadyReloaded = window.sessionStorage.getItem(reloadKey);
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        // Return a never-resolving promise so callers don't observe the
        // error in the brief window before the reload lands.
        return new Promise(() => {});
      }
      // Reloaded once and still broken — surface the real error.
      throw retryErr;
    }
  }
}

export function lazyWithRetry(factory, name) {
  return lazy(() => importWithRetry(factory, name));
}
