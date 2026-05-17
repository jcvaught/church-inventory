import { useState, useEffect } from 'react';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';

const FREE_FEATURES = [
  { icon: '📦', title: 'Equipment Inventory', desc: 'Track every item your church owns — status, location, ministry, photos, and printable QR code labels.' },
  { icon: '🧴', title: 'Supplies Tracking', desc: 'Monitor consumable quantities, log every adjustment, and get alerted before you run out.' },
  { icon: '📅', title: 'Reservations', desc: 'Let your team request and schedule items in advance. Approve or deny with a single click.' },
  { icon: '📋', title: 'Activity Log', desc: 'Every check-out, return, and edit is automatically recorded. Full audit trail, always.' },
  { icon: '👥', title: 'Team Members', desc: 'Invite up to 10 team members with admin, manager, and user roles.' },
];

const HUBS = [
  { icon: '🔧', name: 'Maintenance Hub', price: '$7/mo', desc: 'Kanban-style repair tickets, vendor directory, photo documentation, and overdue tracking.' },
  { icon: '📊', name: 'Insights Hub', price: '$7/mo', desc: 'Utilization charts, ministry breakdowns, seasonal trends, and depreciation tracking.' },
  { icon: '🤝', name: 'Coordination Hub', price: '$7/mo', desc: 'Checkout bundles, bulk reservations, and email notifications for your team.' },
  { icon: '✅', name: 'Accountability Hub', price: '$5/mo', desc: 'Physical audits by location, chain of custody timelines, and insurance-ready CSV exports.' },
  { icon: '✅', name: 'Tasks Hub', price: '$7/mo', desc: 'Kanban task board for church admin — assign tasks, set visibility (private or shared), and track progress.' },
  { icon: '🔑', name: 'People Access Hub', price: '$7/mo', desc: 'Track background checks, key assignments, certifications, and custom compliance milestones.' },
  { icon: '💼', name: 'Job Hub', price: '$7/mo', desc: 'Post jobs for teens and volunteers, manage signups, and send announcements — all in one place.' },
  { icon: '👤', name: 'Team Hub', price: '$9–$19/mo', desc: 'Expand beyond 10 members with role-based hub access and ministry assignments.' },
];

const STEPS = [
  { n: '1', title: 'Create your church', desc: 'Sign up free and give your church a name and unique code. Takes 60 seconds.' },
  { n: '2', title: 'Add your inventory', desc: 'Start adding equipment and supplies with locations, ministries, and photos.' },
  { n: '3', title: 'Invite your team', desc: 'Share your church code with staff and volunteers. Everyone sees the same live data.' },
];

export function LandingPage({ onGetStarted }) {
  const [showHubs, setShowHubs] = useState(false);
  const [w, setW] = useState(window.innerWidth);

  useEffect(() => {
    let t;
    const handler = () => { clearTimeout(t); t = setTimeout(() => setW(window.innerWidth), 80); };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); clearTimeout(t); };
  }, []);

  const mob = w < 768;
  const mid = w >= 600;
  const wide = w >= 900;

  const check = (dark) => (
    <span style={{ color: dark ? B.tealLight : B.teal, fontWeight: 700, marginRight: 8 }}>✓</span>
  );

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'ChurchOpsHub',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'The operations platform built for churches. Track inventory, supplies, reservations, maintenance, and more.',
      url: 'https://churchopshub.com',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [
        'Equipment inventory tracking',
        'Consumable supplies management',
        'Item reservations and scheduling',
        'Activity and audit log',
        'Role-based team access',
        'Maintenance ticket tracking',
        'Utilization and insights reporting',
        'Checkout bundles and coordination',
        'Physical asset audits',
        'Background check and key assignment tracking',
        'Kanban task board',
        'Job board with teen and volunteer signups',
      ],
      publisher: { '@type': 'Organization', name: 'ChurchOpsHub', url: 'https://churchopshub.com' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'ChurchOpsHub',
      url: 'https://churchopshub.com',
      logo: 'https://churchopshub.com/og-image.png',
      description: 'Church inventory and operations management software built for churches of all sizes.',
      sameAs: [],
    },
  ];

  return (
    <div style={{ fontFamily: f2, color: B.textDark, background: B.cream }}>
      <SEO
        title="Church Operations Platform — Free Inventory & More | ChurchOpsHub"
        description="ChurchOpsHub is the operations platform built for churches. Track inventory, supplies, reservations, maintenance tickets, and team compliance — all in one place."
        canonical="/"
        jsonLd={jsonLd}
      />

      {/* ── NAV ── */}
      <nav style={{
        background: B.navy, padding: mob ? '14px 20px' : '14px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <FullLogo size={30} light />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!mob && (
            <>
              <a href="/blog" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: f1, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                Blog
              </a>
              <a href="?help" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: f1, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                Help
              </a>
            </>
          )}
          <button
            onClick={() => onGetStarted('login')}
            style={{ ...btnS, padding: '8px 16px', fontSize: 13, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
          >
            Sign In
          </button>
          {!mob && (
            <button
              onClick={() => onGetStarted('register')}
              style={{ ...btnP, padding: '8px 16px', fontSize: 13 }}
            >
              Get Started Free
            </button>
          )}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        background: `linear-gradient(150deg, ${B.navy} 0%, #1e3258 100%)`,
        padding: mob ? '72px 24px 80px' : '104px 40px 120px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 100,
            padding: '7px 20px', fontSize: 13, color: 'rgba(255,255,255,0.9)',
            fontFamily: f1, marginBottom: 32, letterSpacing: 0.3,
          }}>
            <span style={{ background: '#0D9488', borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#fff' }}>FREE TRIAL</span>
            <span>90 days of all paid hubs — no credit card required</span>
          </div>
          <h1 style={{
            fontFamily: f1, fontSize: mob ? 38 : 56, fontWeight: 800,
            color: '#fff', margin: '0 0 22px', lineHeight: 1.08, letterSpacing: -1.5,
          }}>
            Know what you have.<br />
            Know where it is.<br />
            <span style={{ color: '#5ecfbb' }}>Know who has it.</span>
          </h1>
          <p style={{
            fontSize: mob ? 16 : 19, color: 'rgba(255,255,255,0.65)',
            margin: '0 0 16px', lineHeight: 1.7,
            maxWidth: 540, marginLeft: 'auto', marginRight: 'auto',
          }}>
            ChurchOpsHub is the operations platform built for churches — start with free inventory,
            then add maintenance, insights, scheduling, and accountability when you're ready to grow.
          </p>
          <p style={{
            fontSize: mob ? 13 : 15, color: 'rgba(255,255,255,0.4)',
            margin: '0 0 44px', lineHeight: 1.7,
            maxWidth: 540, marginLeft: 'auto', marginRight: 'auto',
          }}>
            Done with spreadsheets and lost equipment? Planning Center doesn't track physical assets —
            ChurchOpsHub was built specifically for that gap.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => onGetStarted('register')}
              style={{ ...btnP, padding: '15px 36px', fontSize: 16 }}
            >
              Start Free — 90-Day Trial
            </button>
            <button
              onClick={() => onGetStarted('login')}
              style={{ ...btnS, padding: '15px 36px', fontSize: 16, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
            >
              Sign In
            </button>
          </div>
          <p style={{ marginTop: 28, fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: f1 }}>
            No credit card · No setup fee · All hubs free for 90 days
          </p>
        </div>
      </section>

      {/* ── FREE FEATURES ── */}
      <section style={{ background: B.cream, padding: mob ? '64px 24px' : '88px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: f1, fontSize: mob ? 30 : 40, fontWeight: 700, color: B.navy, margin: '0 0 14px' }}>
              Everything you need, forever free
            </h2>
            <p style={{ fontSize: 17, color: B.textMid, margin: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              The core inventory system is free with no time limit. No trial, no credit card, no catch.
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: wide ? 'repeat(3,1fr)' : mid ? 'repeat(2,1fr)' : '1fr',
            gap: 20,
          }}>
            {FREE_FEATURES.map(ft => (
              <div key={ft.title} style={{
                background: B.white, borderRadius: 16, padding: '28px 24px',
                border: `1px solid ${B.sand}`,
              }}>
                <div style={{ fontSize: 30, marginBottom: 14 }}>{ft.icon}</div>
                <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 16, color: B.navy, marginBottom: 8 }}>{ft.title}</div>
                <div style={{ fontSize: 14, color: B.textMid, lineHeight: 1.65 }}>{ft.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HUBS TEASER ── */}
      <section style={{ background: B.warmGray, padding: mob ? '64px 24px' : '88px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: f1, fontSize: mob ? 30 : 40, fontWeight: 700, color: B.navy, margin: '0 0 14px' }}>
              Unlock more when you're ready
            </h2>
            <p style={{ fontSize: 17, color: B.textMid, margin: 0, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Optional paid hubs extend ChurchOpsHub with specialized tools for your team's growing needs.
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: wide ? 'repeat(3,1fr)' : mid ? 'repeat(2,1fr)' : '1fr',
            gap: 20,
          }}>
            {HUBS.map(h => (
              <div key={h.name} style={{
                background: B.white, borderRadius: 16, padding: '24px',
                border: `1px solid ${B.sand}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ fontSize: 28 }}>{h.icon}</div>
                  <div style={{
                    fontFamily: f1, fontSize: 12, fontWeight: 700, color: B.teal,
                    background: B.tealPale, padding: '4px 11px', borderRadius: 100,
                  }}>{h.price}</div>
                </div>
                <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 15, color: B.navy, marginBottom: 8 }}>{h.name}</div>
                <div style={{ fontSize: 13, color: B.textMid, lineHeight: 1.65 }}>{h.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ background: B.cream, padding: mob ? '64px 24px' : '88px 40px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: f1, fontSize: mob ? 30 : 40, fontWeight: 700, color: B.navy, margin: '0 0 14px' }}>
            Simple, honest pricing
          </h2>
          <p style={{ fontSize: 17, color: B.textMid, margin: '0 0 16px', lineHeight: 1.6 }}>
            Start free. Add what you need. Bundle everything and save.
          </p>
          <div style={{ display: 'inline-block', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 20px', marginBottom: 40 }}>
            <span style={{ fontSize: 14, color: '#166534', fontFamily: f1, fontWeight: 600 }}>
              🎉 New churches get a <strong>90-day free trial</strong> of all paid hubs — no credit card required.
            </span>
          </div>

          <div style={{
            display: mid ? 'grid' : 'flex', flexDirection: 'column',
            gridTemplateColumns: mid ? '1fr 1fr' : undefined,
            gap: 20, marginBottom: 24,
          }}>
            {/* Free card */}
            <div style={{
              background: B.white, borderRadius: 20, padding: mob ? '32px 24px' : '40px 32px',
              border: `1px solid ${B.sand}`, textAlign: 'left',
            }}>
              <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 18, color: B.textMid, marginBottom: 8 }}>Inventory Hub</div>
              <div style={{ fontFamily: f1, fontWeight: 800, fontSize: 48, color: B.navy, lineHeight: 1, marginBottom: 6 }}>Free</div>
              <div style={{ fontSize: 13, color: B.textLight, marginBottom: 28, fontFamily: f1 }}>Forever · No credit card</div>
              {['Full equipment inventory', 'Supplies tracking', 'Reservations', 'Activity log', '10 team members', '90-day trial of all hubs'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, fontSize: 14, color: B.textMid }}>
                  {check(false)}{item}
                </div>
              ))}
              <button
                onClick={() => onGetStarted('register')}
                style={{ ...btnS, width: '100%', marginTop: 28, textAlign: 'center' }}
              >
                Start Free — 90-Day Trial
              </button>
            </div>

            {/* All-In card */}
            <div style={{
              background: B.navy, borderRadius: 20, padding: mob ? '32px 24px' : '40px 32px',
              textAlign: 'left', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 20, right: 20,
                background: B.gold, color: B.navy,
                fontFamily: f1, fontWeight: 800, fontSize: 11,
                padding: '4px 12px', borderRadius: 100, letterSpacing: 1,
              }}>
                BEST VALUE
              </div>
              <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 18, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>All-In Bundle</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: f1, fontWeight: 800, fontSize: 48, color: '#fff', lineHeight: 1 }}>$29</span>
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', fontFamily: f1 }}>/mo</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28, fontFamily: f1 }}>Unlimited users · Cancel anytime</div>
              {['All 7 feature hubs included', 'Unlimited team members', 'Maintenance & ticketing', 'Insights & analytics', 'Coordination & scheduling', 'Accountability & audits', 'People Access & compliance', 'Kanban task board', 'Job board & announcements'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                  {check(true)}{item}
                </div>
              ))}
              <button
                onClick={() => onGetStarted('register')}
                style={{ ...btnP, width: '100%', marginTop: 28, textAlign: 'center', background: B.teal }}
              >
                Get Started
              </button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '14px 0 0', fontFamily: f1 }}>
                Save $16/mo vs. buying hubs separately
              </p>
            </div>
          </div>

          {/* Individual hub pricing toggle */}
          <button
            onClick={() => setShowHubs(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: B.teal, fontFamily: f1, fontSize: 14, fontWeight: 600,
              padding: '10px 0', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 11 }}>{showHubs ? '▲' : '▼'}</span>
            {showHubs ? 'Hide' : 'See'} individual hub pricing
          </button>

          {showHubs && (
            <div style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: wide ? 'repeat(3,1fr)' : mid ? 'repeat(2,1fr)' : '1fr',
              gap: 12, textAlign: 'left',
            }}>
              {HUBS.map(h => (
                <div key={h.name} style={{
                  background: B.white, borderRadius: 14, padding: '18px 20px',
                  border: `1px solid ${B.sand}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 14, color: B.navy }}>{h.name}</div>
                    <div style={{ fontFamily: f1, fontSize: 13, fontWeight: 700, color: B.teal }}>{h.price}</div>
                  </div>
                  <div style={{ fontSize: 12, color: B.textMid, lineHeight: 1.6 }}>{h.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: B.warmGray, padding: mob ? '64px 24px' : '88px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: f1, fontSize: mob ? 30 : 40, fontWeight: 700, color: B.navy, margin: 0 }}>
              Up and running in minutes
            </h2>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: wide ? 'repeat(3,1fr)' : '1fr',
            gap: 40,
          }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 60, height: 60, borderRadius: '50%', background: B.navy,
                  color: '#fff', fontFamily: f1, fontWeight: 800, fontSize: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  {s.n}
                </div>
                <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 18, color: B.navy, marginBottom: 10 }}>{s.title}</div>
                <div style={{ fontSize: 15, color: B.textMid, lineHeight: 1.65 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{
        background: `linear-gradient(135deg, ${B.teal} 0%, ${B.tealLight} 100%)`,
        padding: mob ? '64px 24px' : '88px 40px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: f1, fontSize: mob ? 30 : 40, fontWeight: 800, color: '#fff', margin: '0 0 16px', lineHeight: 1.15 }}>
            Ready to get organized?
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)', margin: '0 0 40px', lineHeight: 1.6 }}>
            Start free today. No credit card, no commitment.
          </p>
          <button
            onClick={() => onGetStarted('register')}
            style={{ ...btnP, padding: '16px 44px', fontSize: 17, background: B.white, color: B.teal }}
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: B.navy, padding: mob ? '40px 24px' : '48px 40px' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexDirection: mob ? 'column' : 'row',
          justifyContent: 'space-between', alignItems: mob ? 'flex-start' : 'center',
          gap: 24,
        }}>
          <FullLogo size={28} light />
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/blog" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>
              Blog
            </a>
            <a href="/privacy" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>
              Privacy
            </a>
            <a href="/terms" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>
              Terms
            </a>
            <a href="/sms-program" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>
              SMS Program
            </a>
            <a
              href="mailto:churchopshub@gmail.com"
              style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}
            >
              Contact
            </a>
            <button
              onClick={() => onGetStarted('login')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 14, fontFamily: f1 }}
            >
              Sign In
            </button>
            <button
              onClick={() => onGetStarted('register')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 14, fontFamily: f1 }}
            >
              Get Started Free
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontFamily: f1 }}>
            © {new Date().getFullYear()} ChurchOpsHub
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: 'rgba(255,255,255,0.40)', fontFamily: f1, textAlign: mob ? 'left' : 'center' }}>
          More from our network:{' '}
          <a href="https://courtclimber.com/blog" rel="noopener" style={{ color: 'rgba(255,255,255,0.6)' }}>Pickleball club software</a>{' · '}
          <a href="https://masteryhelp.com/blog" rel="noopener" style={{ color: 'rgba(255,255,255,0.6)' }}>Learn Biblical Greek &amp; Hebrew</a>{' · '}
          <a href="https://repcrew.fit/blog" rel="noopener" style={{ color: 'rgba(255,255,255,0.6)' }}>Workout accountability</a>
        </div>
      </footer>

    </div>
  );
}
