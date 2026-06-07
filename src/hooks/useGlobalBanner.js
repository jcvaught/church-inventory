import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

// Subscribes to the single global app-wide banner doc (appConfig/banner).
// Owner-controlled (see SettingsPage owner panel); readable by any signed-in
// user. Used to surface a site-wide maintenance/announcement banner — and, in
// particular, the "we're updating, back soon" notice during a migration window
// (see docs/LOCAL-TESTING-AND-REVERT-2026-06-06.md). Returns the banner data
// object or null. Errors (e.g. a transient permission blip) resolve to null so
// a missing banner never breaks the app shell.
export function useGlobalBanner() {
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'appConfig', 'banner'),
      (snap) => setBanner(snap.exists() ? snap.data() : null),
      () => setBanner(null),
    );
    return () => unsub();
  }, []);
  return banner;
}
