import { useState } from 'react';
import { B, f1 } from './brand/tokens.js';

// Site-wide banner driven by the global appConfig/banner doc (see
// useGlobalBanner + the owner control in SettingsPage).
//   type 'maintenance' → red, NOT dismissible (used during update windows).
//   type 'info'        → teal, dismissible (general announcements).
// Dismissal is keyed on the banner's `updatedAt`, so posting a NEW message
// re-shows even if the previous one was dismissed. localStorage read happens at
// render time (per the project's lint rule against memoizing impure reads); the
// `force` counter only re-renders after a dismiss click.
export function GlobalBanner({ banner }) {
  const [, force] = useState(0);
  if (!banner?.active || !banner?.message) return null;

  const maintenance = banner.type === 'maintenance';
  const updatedAt = banner.updatedAt || '';

  let dismissed = false;
  if (!maintenance) {
    try {
      dismissed = !!updatedAt && localStorage.getItem('coh_banner_dismissed') === updatedAt;
    } catch { /* localStorage unavailable */ }
  }
  if (dismissed) return null;

  const bg = maintenance ? '#FFF1F2' : B.tealPale;
  const border = maintenance ? '#FECACA' : B.teal;
  const color = maintenance ? '#B91C1C' : B.teal;

  const onDismiss = () => {
    try { localStorage.setItem('coh_banner_dismissed', updatedAt); } catch { /* ignore */ }
    force((n) => n + 1);
  };

  return (
    <div role="status" aria-live="polite" style={{ background:bg, borderBottom:`1px solid ${border}`, padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
      <span style={{ fontSize:13, color, fontFamily:f1, fontWeight:600 }}>
        <span aria-hidden="true">{maintenance ? '🛠️ ' : '📣 '}</span>{banner.message}
      </span>
      {!maintenance && (
        <button onClick={onDismiss} aria-label="Dismiss banner" style={{ background:'none', border:'none', color, cursor:'pointer', fontSize:18, lineHeight:1, fontFamily:f1, flexShrink:0 }}>×</button>
      )}
    </div>
  );
}
