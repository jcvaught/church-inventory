import { B, f1, f2 } from '../brand/tokens.js';

export function UpgradeGate({ hubName, hubLabel, hubPrice, hubDescription, hasHub, children }) {
  if (hasHub) return children;

  const mailSubject = encodeURIComponent('Upgrade to ' + hubLabel);

  return (
    <div style={{ background: B.white, borderRadius: 18, padding: '48px 32px', border: '1px solid ' + B.sand, textAlign: 'center', maxWidth: 560, margin: '40px auto' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: B.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>🔒</div>
      <h2 style={{ fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.navy, margin: '0 0 8px' }}>{hubLabel}</h2>
      <p style={{ color: B.textMid, fontSize: 15, margin: '0 0 6px', fontFamily: f2 }}>{hubDescription}</p>
      <p style={{ color: B.textLight, fontSize: 13, margin: '0 0 28px', fontFamily: f1 }}>Starting at <strong style={{ color: B.navy }}>{hubPrice}</strong>/month</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href={'mailto:hello@churchopshub.com?subject=' + mailSubject}
          style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: B.teal, color: B.white, textDecoration: 'none', fontSize: 14, fontWeight: 600, fontFamily: f1 }}>
          Start Free Trial
        </a>
        <a
          href="mailto:hello@churchopshub.com"
          style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, border: '1px solid ' + B.sand, color: B.textDark, textDecoration: 'none', fontSize: 14, fontWeight: 600, fontFamily: f1 }}>
          Learn More
        </a>
      </div>
      <p style={{ color: B.textLight, fontSize: 12, marginTop: 16 }}>30-day free trial · No credit card required to start</p>
    </div>
  );
}
