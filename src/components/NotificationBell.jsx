import { useState, useRef, useEffect } from 'react';
import { B, f1, f2 } from './brand/tokens.js';
import { useNotifications } from '../hooks/useNotifications.js';

function ago(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// Header notification bell + dropdown inbox. `onNavigate` takes the same nav
// descriptor shape as global search ({kind:'item'|'tab'|'hub', …}) so a click
// routes to the relevant area (AppShell passes handleSearchNav).
export function NotificationBell({ churchId, uid, onNavigate }) {
  const { items, unread, markRead, markAllRead } = useNotifications(churchId, uid);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  function clickItem(n) {
    markRead(n._docId);
    if (n.link && onNavigate) onNavigate(n.link);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} aria-haspopup="menu" aria-expanded={open}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 11px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: B.white, fontSize: 15 }}>
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: B.red, color: '#fff', borderRadius: 10, minWidth: 16, height: 16, fontSize: 10, fontWeight: 700, fontFamily: f1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: B.white, borderRadius: 12, width: 340, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(27,42,74,0.2)', zIndex: 300, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid ' + B.sand }}>
            <span style={{ fontFamily: f1, fontWeight: 700, fontSize: 14, color: B.navy }}>Notifications</span>
            {unread > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: B.teal, fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer' }}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: B.textLight, fontSize: 13, fontFamily: f2 }}>No notifications yet.</div>
            ) : items.map((n) => (
              <button key={n._docId} onClick={() => clickItem(n)} role="menuitem"
                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, padding: '11px 14px', border: 'none', borderBottom: '1px solid ' + B.cream, background: n.read ? 'transparent' : B.tealPale, cursor: 'pointer' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: n.read ? 'transparent' : B.teal, marginTop: 5, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: B.navy, fontFamily: f1 }}>{n.title}</span>
                  {n.body && <span style={{ display: 'block', fontSize: 12, color: B.textMid, marginTop: 1 }}>{n.body}</span>}
                  <span style={{ display: 'block', fontSize: 11, color: B.textLight, marginTop: 2 }}>{ago(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
