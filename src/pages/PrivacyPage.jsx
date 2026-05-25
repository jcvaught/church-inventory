import { B, f1 } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';
import { PrivacyBody } from '../components/legal/PrivacyBody.jsx';

export function PrivacyPage() {
  return (
    <>
      <SEO
        title="Privacy Policy — ChurchOpsHub"
        description="ChurchOpsHub privacy policy: how we collect, use, and protect your church's data."
        canonical="/privacy"
      />

      {/* Nav */}
      <div style={{ background: B.navy, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}><FullLogo /></a>
        <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', fontFamily: f1, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>← Back</button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: f1, fontSize: 30, fontWeight: 800, color: B.navy, margin: '0 0 4px' }}>Privacy Policy</h1>
        <PrivacyBody />
      </div>
    </>
  );
}
