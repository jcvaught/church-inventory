import { useEffect, useState } from 'react';
import { BUILD_ID } from '../version.js';

// Polls /version.json for the currently-deployed build id and flags when it
// differs from the build this tab is running. Checks every 5 minutes, plus
// whenever the tab regains focus/visibility (so a user returning to a long-
// open tab is told promptly). No-ops in dev / when the id is unknown.
//
// Why polling instead of the service worker: public/sw.js is byte-stable
// across deploys, so the browser never sees a "new" SW and `updatefound`
// never fires. The deployed build id is the only reliable signal.
const POLL_MS = 5 * 60 * 1000;

export function useVersionCheck() {
  const [latestId, setLatestId] = useState(null);
  const [dismissedId, setDismissedId] = useState(null);

  useEffect(() => {
    if (!BUILD_ID || BUILD_ID === 'dev') return; // skip in dev / unknown builds
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const id = data && data.buildId;
        if (!cancelled && id && id !== BUILD_ID) setLatestId(id);
      } catch {
        // offline / 404 (e.g. dev) / parse error — treat as "no update", stay quiet
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const interval = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const first = setTimeout(check, 4000); // let first paint settle

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  // Reappears if an even newer build ships after a dismiss.
  const updateAvailable = !!latestId && latestId !== dismissedId;

  async function reload() {
    // Nudge the SW to re-check before reloading (network-first, so a plain
    // reload already pulls fresh code — this is belt-and-suspenders).
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch { /* ignore */ }
    window.location.reload();
  }

  return { updateAvailable, reload, dismiss: () => setDismissedId(latestId) };
}
