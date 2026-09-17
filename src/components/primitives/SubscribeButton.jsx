import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase.js';
import { B, f1, f2 } from '../brand/tokens.js';

// COH-012 A.4 — the one client path into Stripe checkout for the flat plan.
// Replaces the checkout half of UpgradeGate (deleted). `item` is one of the two
// purchasable keys createCheckoutSession accepts; anything else is refused
// server-side, so a stale bundle can never charge a legacy price.
export function startCheckout(item = 'flat_monthly') {
  const fns = getFunctions(app);
  const createSession = httpsCallable(fns, 'createCheckoutSession');
  return createSession({
    item,
    successUrl: window.location.href,
    cancelUrl: window.location.href,
  }).then(({ data }) => { window.location.href = data.url; });
}

export function SubscribeButton({ item = 'flat_monthly', label = 'Subscribe', source = 'unknown', style = {} }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function onClick() {
    try { window.posthog?.capture('subscribe_click', { source, item }); } catch { /* telemetry optional */ }
    setError('');
    setLoading(true);
    try {
      await startCheckout(item);
    } catch (err) {
      setError((err.message || 'Failed to start checkout.') + ' If this keeps happening, contact jcvaught@gmail.com.');
      setLoading(false);
    }
  }
  return (
    <>
      <button onClick={onClick} disabled={loading}
        style={{ padding: '10px 22px', borderRadius: 10, background: loading ? B.warmGray : B.teal, color: B.white, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, fontFamily: f1, ...style }}>
        {loading ? 'Redirecting…' : label}
      </button>
      {error && <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '8px 0 0', fontFamily: f2 }}>{error}</p>}
    </>
  );
}
