import { B, f1 } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';
import { TermsBody } from '../components/legal/TermsBody.jsx';

export function TermsPage() {
  return (
    <>
      <SEO
        title="Terms of Service — ChurchOpsHub"
        description="ChurchOpsHub terms of service: your rights and responsibilities when using the platform."
        canonical="/terms"
      />

      {/* Nav */}
      <div style={{ background: B.navy, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}><FullLogo /></a>
        <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', fontFamily: f1, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>← Back</button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: f1, fontSize: 30, fontWeight: 800, color: B.navy, margin: '0 0 4px' }}>Terms of Service</h1>
        <TermsBody />
      </div>
    </>
  );
}
