import { useState, useEffect } from 'react';
import { B, f1 } from './brand/tokens.js';

// PWA install nudge. Android/desktop Chrome fire `beforeinstallprompt` → we show
// an Install button. iOS Safari has no such event, so we show the manual
// Share → Add to Home Screen hint (required there for web push to work at all).
// 30-day dismissal via localStorage; hidden once installed (standalone).
const DISMISS_KEY = 'coh_install_dismissed';

function dismissedRecently() {
  try { const t = localStorage.getItem(DISMISS_KEY); return t && (Date.now() - Number(t)) < 30 * 864e5; } catch { return false; }
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', onBIP);
    let t;
    if (isIOS()) t = setTimeout(() => { setIosHint(true); setShow(true); }, 1500);
    return () => { window.removeEventListener('beforeinstallprompt', onBIP); if (t) clearTimeout(t); };
  }, []);

  if (!show) return null;

  const close = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setShow(false); };

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    close();
  }

  return (
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 350, background: B.navy, color: B.white, borderRadius: 14, padding: '14px 16px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480, margin: '0 auto' }}>
      <span style={{ fontSize: 22 }} aria-hidden="true">📲</span>
      <div style={{ flex: 1, fontSize: 13, fontFamily: f1, lineHeight: 1.5 }}>
        {iosHint
          ? <>Install ChurchOpsHub: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> — required for notifications on iPhone.</>
          : <>Install ChurchOpsHub for quick access and notifications.</>}
      </div>
      {!iosHint && <button onClick={install} style={{ background: B.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontFamily: f1, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Install</button>}
      <button onClick={close} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>×</button>
    </div>
  );
}
