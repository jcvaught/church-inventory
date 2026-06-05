import { B, f1, f2, btnP } from './brand/tokens.js';
import { useWindowWidth } from '../hooks/useMobile.js';
import { useVersionCheck } from '../hooks/useVersionCheck.js';

// Non-blocking "a new version is live" prompt. Renders nothing until the
// polled build id differs from this tab's. Fixed bottom-corner card; on
// mobile it sits above the bottom nav. "Reload" pulls the fresh build;
// "Later" hides it until an even newer build ships. Mounted once at the app
// root (main.jsx), so it overlays every signed-in/signed-out state.
export default function UpdateBanner() {
  const isMobile = useWindowWidth() < 768;
  const { updateAvailable, reload, dismiss } = useVersionCheck();
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        zIndex: 10000,
        left: isMobile ? 12 : 'auto',
        right: isMobile ? 12 : 24,
        bottom: isMobile ? 84 : 24, // clear the mobile bottom nav
        maxWidth: 380,
        background: B.navy,
        color: B.white,
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 8px 28px rgba(27,42,74,0.28)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        fontFamily: f2,
      }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 170 }}>
        <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Update available</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>A new version of ChurchOpsHub is ready.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={reload} style={{ ...btnP, padding: '8px 16px', fontSize: 13 }}>Reload</button>
        <button
          onClick={dismiss}
          aria-label="Dismiss update notice"
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: f1, cursor: 'pointer', padding: '8px 4px' }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
