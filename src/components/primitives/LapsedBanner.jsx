import { B, f1, f2 } from '../brand/tokens.js';
import { PRICE } from '../../lib/entitlement.js';
import { SubscribeButton } from './SubscribeButton.jsx';

// COH-012 A.4 — the day-91 state, presented. A lapsed church keeps every hub
// and finishes what it started; it cannot start anything new (owner #3). This
// banner says so wherever it is shown and offers the one plan. Admins get the
// Subscribe button; everyone else is told who can.
//   • `compact` — the app-wide strip under the header (App.jsx)
//   • default   — the card shown inside a hub, and by blocked create actions
export function LapsedBanner({ isAdmin, compact = false, onGoToSettings, source = 'lapsed_banner' }) {
  const line = `Your 90 days are up. ChurchOpsHub is $${PRICE.monthly}/month or $${PRICE.annual}/year for everything — until then you can finish what you started, but not add anything new.`;
  if (compact) {
    return (
      <div role="status" style={{ background: B.goldLight, borderBottom: `1px solid ${B.gold}`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#7A5800', fontFamily: f1, fontWeight: 600 }}>{line}</span>
        {isAdmin
          ? <SubscribeButton source={source} label={`Subscribe — $${PRICE.monthly}/mo`} style={{ padding: '6px 14px', fontSize: 12 }} />
          : <span style={{ fontSize: 12, color: '#96750E', fontFamily: f2 }}>Ask a church admin to subscribe in Settings.</span>}
      </div>
    );
  }
  return (
    <div style={{ background: B.white, borderRadius: 14, padding: '20px 22px', border: `1px solid ${B.gold}`, marginBottom: 20 }}>
      <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 15, color: B.navy, marginBottom: 6 }}>Your trial has ended</div>
      <p style={{ color: B.textMid, fontSize: 14, margin: '0 0 14px', fontFamily: f2, lineHeight: 1.5 }}>{line}</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {isAdmin
          ? <>
              <SubscribeButton source={source} item="flat_monthly" label={`$${PRICE.monthly}/month`} />
              <SubscribeButton source={source} item="flat_annual" label={`$${PRICE.annual}/year`} style={{ background: B.gold, color: B.navy }} />
              {onGoToSettings && <button onClick={onGoToSettings} style={{ background: 'none', border: 'none', color: B.teal, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: f1 }}>Billing details →</button>}
            </>
          : <span style={{ fontSize: 13, color: B.textLight, fontFamily: f2 }}>Ask a church admin to subscribe in Settings.</span>}
      </div>
    </div>
  );
}
