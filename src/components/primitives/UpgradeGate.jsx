import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase.js';
import { B, f1, f2 } from '../brand/tokens.js';

export function UpgradeGate({ hubName, hubLabel, hubDescription, hasHub, previewSrc, previewAlt, children }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (hasHub) return children;

  function track(action) {
    try {
      window.posthog?.capture('upgrade_gate_click', { hubName, action });
    } catch {
      // PostHog optional; never block checkout on telemetry
    }
  }

  async function handleUpgrade() {
    track('subscribe');
    setError('');
    setLoading(true);
    try {
      const fns = getFunctions(app);
      const createSession = httpsCallable(fns, 'createCheckoutSession');
      const { data } = await createSession({
        item: 'pro_monthly',
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });
      window.location.href = data.url;
    } catch (err) {
      setError((err.message || 'Failed to start checkout.') + ' If this keeps happening, contact jcvaught@gmail.com.');
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto' }}>
      {previewSrc && (
        <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid ' + B.sand, marginBottom: 20, background: B.white, position: 'relative' }}>
          <img
            src={previewSrc}
            alt={previewAlt || ''}
            aria-hidden="true"
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              maskImage: 'linear-gradient(to bottom, black 80%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent)',
            }}
          />
          <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', fontFamily: f1, fontSize: 11, fontWeight: 600, color: B.navy, letterSpacing: 0.4, textTransform: 'uppercase' }}>Preview</div>
        </div>
      )}
      <div style={{ background: B.white, borderRadius: 18, padding: '48px 32px', border: '1px solid ' + B.sand, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: B.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>🔒</div>
        <h2 style={{ fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.navy, margin: '0 0 8px' }}>{hubLabel}</h2>
        <p style={{ color: B.textMid, fontSize: 15, margin: '0 0 6px', fontFamily: f2 }}>{hubDescription}</p>
        <p style={{ color: B.textLight, fontSize: 13, margin: '0 0 28px', fontFamily: f1 }}>Unlock this and every paid feature for <strong style={{ color: B.navy }}>$15/month</strong> — or $150/year. Unlimited team members.</p>
        {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', fontFamily: f2 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            style={{ padding: '12px 28px', borderRadius: 10, background: loading ? B.warmGray : B.teal, color: B.white, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, fontFamily: f1 }}>
            {loading ? 'Redirecting…' : 'Subscribe Now'}
          </button>
          <a
            onClick={() => track('contact')}
            href={'mailto:churchopshub@gmail.com?subject=' + encodeURIComponent('Question about ' + hubLabel)}
            style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, border: '1px solid ' + B.sand, color: B.textDark, textDecoration: 'none', fontSize: 14, fontWeight: 600, fontFamily: f1 }}>
            Questions? Contact us
          </a>
        </div>
        <p style={{ color: B.textLight, fontSize: 12, marginTop: 16 }}>Cancel anytime in Settings → Subscription</p>
      </div>
    </div>
  );
}
