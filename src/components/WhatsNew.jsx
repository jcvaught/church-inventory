import { Modal } from './primitives/Modal.jsx';
import { B, f1, f2 } from './brand/tokens.js';
import { WHATS_NEW } from '../data/whatsNew.js';

const SEEN_KEY = 'coh_whatsnew_seen';
const LATEST = WHATS_NEW[0]?.date || '';

// Count entries newer than what the user has seen. Read at render time (per the
// project's rule against memoizing impure localStorage reads); callers force a
// re-render after markWhatsNewSeen to clear the unseen dot.
export function getUnseenCount() {
  try {
    const seen = localStorage.getItem(SEEN_KEY) || '';
    return WHATS_NEW.filter((e) => e.date > seen).length;
  } catch {
    return 0;
  }
}

export function markWhatsNewSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST); } catch { /* localStorage unavailable */ }
}

function fmtDate(d) {
  const [y, m, day] = (d || '').split('-').map(Number);
  if (!y) return d;
  // Local Date construction avoids the UTC off-by-one of new Date('YYYY-MM-DD').
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function tagStyle(tag) {
  const map = { New: [B.tealPale, B.teal], Improved: [B.goldLight, '#96750E'], Fixed: [B.redPale, B.red] };
  const [bg, col] = map[tag] || [B.warmGray, B.textMid];
  return { background: bg, color: col };
}

export function WhatsNewModal({ onClose }) {
  return (
    <Modal open onClose={onClose} title="What's New">
      <p style={{ margin: '0 0 18px', fontSize: 13, color: B.textLight }}>Recent updates to ChurchOpsHub.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '60vh', overflowY: 'auto' }}>
        {WHATS_NEW.map((e, i) => (
          <div key={i} style={{ borderLeft: '2px solid ' + B.sand, paddingLeft: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, ...tagStyle(e.tag) }}>{e.tag}</span>
              <span style={{ fontFamily: f1, fontWeight: 700, fontSize: 14, color: B.navy }}>{e.title}</span>
            </div>
            <div style={{ fontSize: 11, color: B.textLight, marginBottom: 6 }}>{fmtDate(e.date)}</div>
            <p style={{ margin: 0, fontSize: 13, color: B.textDark, lineHeight: 1.6, fontFamily: f2 }}>{e.body}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
