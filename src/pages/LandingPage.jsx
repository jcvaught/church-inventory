import { useState, useEffect } from 'react';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';
import { PRICE, TRIAL_DAYS } from '../lib/entitlement.js';

const CORE_FEATURES = [
  { icon: '📦', title: 'Equipment Inventory', desc: 'Track every item your church owns — status, location, ministry, photos, and printable QR code labels.' },
  { icon: '🧴', title: 'Supplies Tracking', desc: 'Monitor consumable quantities, log every adjustment, and get alerted before you run out.' },
  { icon: '📅', title: 'Reservations', desc: 'Let your team request and schedule items in advance. Approve or deny with a single click.' },
  { icon: '📋', title: 'Activity Log', desc: 'Every check-out, return, and edit is automatically recorded. Full audit trail, always.' },
  { icon: '👥', title: 'Team Members', desc: 'Invite your whole team — admin, manager, and user roles, no member limit.' },
];

const HUBS = [
  { icon: '🔧', name: 'Maintenance', desc: 'Kanban-style repair tickets, vendor directory, photo documentation, and overdue tracking.' },
  { icon: '📊', name: 'Insights', desc: 'Utilization charts, ministry breakdowns, seasonal trends, and depreciation tracking.' },
  { icon: '🤝', name: 'Coordination', desc: 'Checkout bundles, bulk reservations, and email notifications for your team.' },
  { icon: '✅', name: 'Accountability', desc: 'Physical audits by location, chain of custody timelines, and insurance-ready CSV exports.' },
  { icon: '✅', name: 'Tasks', desc: 'Kanban task board for church admin — assign tasks, set visibility (private or shared), and track progress.' },
  { icon: '🔑', name: 'People Access', desc: 'Track background checks, key assignments, certifications, and custom compliance milestones.' },
  { icon: '💼', name: 'Jobs & Shifts', desc: 'Post jobs for teens and volunteers, manage signups, and send announcements — all in one place.' },
];

const STEPS = [
  { n: '1', title: 'Create your church', desc: 'Sign up and give your church a name and unique code. Takes 60 seconds, no card.' },
  { n: '2', title: 'Add your inventory', desc: 'Start adding equipment and supplies with locations, ministries, and photos.' },
  { n: '3', title: 'Invite your team', desc: 'Share your church code with staff and volunteers. Everyone sees the same live data.' },
];

export function LandingPage({ onGetStarted }) {
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
      offers: { '@type': 'Offer', price: String(PRICE.monthly), priceCurrency: 'USD', description: `${TRIAL_DAYS}-day free trial, then $${PRICE.monthly}/month or $${PRICE.annual}/year for everything` },
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
        title="Church Operations Platform — Inventory, Tasks, Shifts & More | ChurchOpsHub"
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
              Get Started
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
            <span>{TRIAL_DAYS} days of everything — no credit card required</span>
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
            ChurchOpsHub is the operations platform built for churches — inventory, supplies,
            reservations, maintenance, tasks, volunteer shifts, and compliance, all in one place.
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
              Start Your {TRIAL_DAYS}-Day Trial
            </button>
            <button
              onClick={() => onGetStarted('login')}
              style={{ ...btnS, padding: '15px 36px', fontSize: 16, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
            >
              Sign In
            </button>
          </div>
          <p style={{ marginTop: 28, fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: f1 }}>
            No credit card · No setup fee · Everything included for 90 days
          </p>
        </div>
      </section>

      {/* ── FREE FEATURES ── */}
      <section style={{ background: B.cream, padding: mob ? '64px 24px' : '88px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: f1, fontSize: mob ? 30 : 40, fontWeight: 700, color: B.navy, margin: '0 0 14px' }}>
              Know what you have
            </h2>
            <p style={{ fontSize: 17, color: B.textMid, margin: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              The inventory core: every item, every supply, every reservation, every change — with the whole team in it.
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: wide ? 'repeat(3,1fr)' : mid ? 'repeat(2,1fr)' : '1fr',
            gap: 20,
          }}>
            {CORE_FEATURES.map(ft => (
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
              Run the rest of the building
            </h2>
            <p style={{ fontSize: 17, color: B.textMid, margin: 0, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Every hub below is included — there is nothing to add on.
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
                  }}>Included</div>
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
            One plan. Everything included. No per-hub math, no seat tiers.
          </p>
          <div style={{ display: 'inline-block', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 20px', marginBottom: 40 }}>
            <span style={{ fontSize: 14, color: '#166534', fontFamily: f1, fontWeight: 600 }}>
              🎉 Every new church gets <strong>{TRIAL_DAYS} days of everything</strong> — no credit card required.
            </span>
          </div>

          <div style={{
            background: B.navy, borderRadius: 20, padding: mob ? '32px 24px' : '40px 40px',
            textAlign: 'left', position: 'relative', overflow: 'hidden', marginBottom: 24,
            maxWidth: 620, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 18, color: 'rgba(255,255,255,0.6)', marginBottom: 14 }}>ChurchOpsHub</div>
            <div style={{ display: mid ? 'grid' : 'flex', flexDirection: 'column', gridTemplateColumns: mid ? '1fr 1fr' : undefined, gap: 16, marginBottom: 28 }}>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: f1, fontWeight: 800, fontSize: 44, color: '#fff', lineHeight: 1 }}>${PRICE.monthly}</span>
                  <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', fontFamily: f1 }}>/month</span>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', border: `1px solid ${B.gold}`, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -9, right: 14, background: B.gold, color: B.navy, fontFamily: f1, fontWeight: 800, fontSize: 10, padding: '3px 10px', borderRadius: 100, letterSpacing: 1 }}>2 MONTHS FREE</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: f1, fontWeight: 800, fontSize: 44, color: '#fff', lineHeight: 1 }}>${PRICE.annual}</span>
                  <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', fontFamily: f1 }}>/year</span>
                </div>
              </div>
            </div>
            <div style={{ display: mid ? 'grid' : 'block', gridTemplateColumns: mid ? '1fr 1fr' : undefined, columnGap: 20 }}>
              {['Equipment inventory & supplies', 'Reservations & spaces', 'Tasks & maintenance board', 'Contractor hours & timesheets', 'Jobs & volunteer shifts', 'People Access & compliance', 'Insights & weekly digests', 'Accountability & audits', 'Unlimited team members', 'Cancel anytime'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                  {check(true)}{item}
                </div>
              ))}
            </div>
            <button
              onClick={() => onGetStarted('register')}
              style={{ ...btnP, width: '100%', marginTop: 22, textAlign: 'center', background: B.teal }}
            >
              Start Your {TRIAL_DAYS}-Day Trial
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '14px 0 0', fontFamily: f1, lineHeight: 1.6 }}>
              Nothing to pay for {TRIAL_DAYS} days. After that, a church that hasn't subscribed keeps its data and finishes what it started — it just can't add anything new.
            </p>
          </div>

          <p style={{ fontSize: 13, color: B.textLight, margin: '4px 0 0', fontFamily: f1 }}>
            Already paying for a single tool like eSPACE or UpKeep? ChurchOpsHub does more for a fraction of the price.
          </p>
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

      {/* ── FROM THE BLOG (featured post) ── */}
      <section style={{ background: B.cream, padding: mob ? '56px 24px' : '72px 40px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: f1, fontSize: 13, fontWeight: 600, color: B.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            From the blog
          </div>
          <a href="/blog/volunteer-coordinator-role-guide" style={{ textDecoration: 'none' }}>
            <h3 style={{ fontFamily: f1, fontSize: mob ? 22 : 26, fontWeight: 700, color: B.navy, margin: '0 0 14px', lineHeight: 1.3 }}>
              Volunteer Coordinator Role Guide: What the Job Actually Looks Like
            </h3>
            <p style={{ fontSize: 15, color: B.textMid, lineHeight: 1.65, margin: '0 0 18px' }}>
              The seven core responsibilities, what the role is and isn't, realistic time commitment, and the tools that keep a coordinator from burning out. Read this before you appoint your next one.
            </p>
            <span style={{ fontFamily: f1, fontSize: 14, fontWeight: 600, color: B.teal }}>
              Read the guide →
            </span>
          </a>
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
            Start today. No credit card, no commitment.
          </p>
          <button
            onClick={() => onGetStarted('register')}
            style={{ ...btnP, padding: '16px 44px', fontSize: 17, background: B.white, color: B.teal }}
          >
            Get Started
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
              Get Started
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontFamily: f1 }}>
            © {new Date().getFullYear()} ChurchOpsHub
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: 'rgba(255,255,255,0.40)', fontFamily: f1, textAlign: mob ? 'left' : 'center' }}>
          More from our network:{' '}
          <a href="https://masteryhelp.com/blog" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.6)' }}>Learn Biblical Greek &amp; Hebrew</a>{' · '}
          <a href="https://repcrew.fit/blog" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.6)' }}>Workout accountability</a>
        </div>
      </footer>

    </div>
  );
}
