import { useContext } from 'react';
import { B, f1, f2, btnP } from '../components/brand/tokens.js';
import { UpgradeGate } from '../components/primitives/UpgradeGate.jsx';
import { MobileCtx } from '../hooks/useMobile.js';
import { InsightsPage } from './hubs/InsightsPage.jsx';
import { MaintenancePage } from './hubs/MaintenancePage.jsx';
import { CoordinationPage } from './hubs/CoordinationPage.jsx';
import { AccountabilityPage } from './hubs/AccountabilityPage.jsx';
import { PeopleAccessPage } from './hubs/PeopleAccessPage.jsx';
import { TasksPage } from './hubs/TasksPage.jsx';
import { JobsPage } from './hubs/JobsPage.jsx';

const HUB_DEFS = [
  {
    key: 'insights',
    label: 'Insights Hub',
    icon: '📊',
    price: '$7/mo',
    color: '#0D9488',
    desc: 'Utilization stats, ministry breakdowns, seasonal trends, and financial tracking.',
  },
  {
    key: 'maintenance',
    label: 'Maintenance Hub',
    icon: '🔧',
    price: '$7/mo',
    color: '#D97706',
    desc: 'Track repair tickets, manage vendors, and keep your equipment in top shape.',
  },
  {
    key: 'coordination',
    label: 'Coordination Hub',
    icon: '🤝',
    price: '$7/mo',
    color: '#7C3AED',
    desc: 'Checkout bundles and email notifications to keep your team in the loop.',
  },
  {
    key: 'accountability',
    label: 'Accountability Hub',
    icon: '📋',
    price: '$5/mo',
    color: '#2563EB',
    desc: 'Physical audits, chain of custody, and insurance-ready inventory exports.',
  },
  {
    key: 'people_access',
    label: 'People Access Hub',
    icon: '🔑',
    price: '$7/mo',
    color: '#DC2626',
    desc: 'Track background checks, key assignments, certifications, and custom compliance milestones.',
  },
  {
    key: 'tasks',
    label: 'Tasks Hub',
    icon: '✅',
    price: '$7/mo',
    color: '#059669',
    desc: 'Kanban task board for church admin — assign, track, and share tasks with your team.',
  },
  {
    key: 'jobs',
    label: 'Job Hub',
    icon: '💼',
    price: '$7/mo',
    color: '#E85D04',
    desc: 'Post paid jobs for teens to sign up for — moving walls, resetting chairs, and more.',
  },
];

const UPGRADE_DESCRIPTIONS = {
  insights: 'Understand how your inventory is really being used — utilization stats, ministry breakdowns, seasonal trends, and financial tracking.',
  maintenance: 'Track repair tickets, manage vendors, and keep your equipment in top shape.',
  coordination: 'Checkout bundles and email notifications for your team.',
  accountability: 'Physical audits, chain of custody reports, and insurance-ready inventory exports.',
  people_access: 'Track who has background checks, key assignments, certifications, and custom compliance milestones — dates only, never results.',
  tasks: 'A general-purpose Kanban task board — assign tasks, set priorities, track progress, and control who sees what.',
  jobs: 'Post jobs for teens to sign up for, manage the signup list, and keep everyone in the loop with announcements.',
};

const UPGRADE_PRICES = {
  insights: '$7', maintenance: '$7', coordination: '$7', accountability: '$5', people_access: '$7', tasks: '$7', jobs: '$7',
};

function HubContent({ hubKey, store, userProfile }) {
  if (hubKey === 'insights') return <InsightsPage store={store} userProfile={userProfile} />;
  if (hubKey === 'maintenance') return <MaintenancePage store={store} userProfile={userProfile} />;
  if (hubKey === 'coordination') return <CoordinationPage store={store} userProfile={userProfile} />;
  if (hubKey === 'accountability') return <AccountabilityPage store={store} userProfile={userProfile} />;
  if (hubKey === 'people_access') return <PeopleAccessPage store={store} userProfile={userProfile} />;
  if (hubKey === 'tasks') return <TasksPage store={store} userProfile={userProfile} />;
  if (hubKey === 'jobs') return <JobsPage store={store} userProfile={userProfile} />;
  return null;
}

export function HubsPage({ store, userProfile, hubKey, onOpenHub, hasHub, subscriptionLoading, userCanSeeHub, onGoToSettings }) {
  const isMobile = useContext(MobileCtx);
  const def = HUB_DEFS.find(h => h.key === hubKey);

  // ── Active hub view ──
  if (hubKey && def) {
    const hubLabel = def.label;
    const hubHas = hasHub(hubKey);
    return (
      <div>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => onOpenHub(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.teal, fontSize: 13, fontWeight: 600, fontFamily: f1, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            ← All Hubs
          </button>
        </div>
        <UpgradeGate
          hubName={hubKey}
          hubLabel={hubLabel}
          hubPrice={UPGRADE_PRICES[hubKey]}
          hubDescription={UPGRADE_DESCRIPTIONS[hubKey]}
          hasHub={hubHas}
        >
          {userCanSeeHub(hubKey)
            ? <HubContent hubKey={hubKey} store={store} userProfile={userProfile} />
            : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: f2 }}>
                You don't have access to this hub. Contact your admin.
              </div>
            )
          }
        </UpgradeGate>
      </div>
    );
  }

  // ── Hub picker ──
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: isMobile ? 20 : 24, fontFamily: f1, color: B.navy }}>Hubs</h2>
        <p style={{ margin: 0, fontSize: 13, color: B.textLight, fontFamily: f2 }}>
          Extend ChurchOpsHub with paid add-ons for your church's specific needs.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, opacity: subscriptionLoading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {HUB_DEFS.filter(hub => !(hub.key === 'people_access' && userProfile?.role === 'user')).map(hub => {
          const active = hasHub(hub.key);
          const canSee = active && userCanSeeHub(hub.key);
          return (
            <div key={hub.key}
              onClick={() => onOpenHub(hub.key)}
              role="button"
              tabIndex={0}
              aria-label={hub.label}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenHub(hub.key); } }}
              style={{
                background: B.white,
                borderRadius: 16,
                padding: 22,
                cursor: 'pointer',
                border: active ? `2px solid ${hub.color}` : `1px solid ${B.sand}`,
                position: 'relative',
                transition: 'box-shadow 0.15s, transform 0.1s',
                opacity: active && !canSee ? 0.6 : 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(27,42,74,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              onFocus={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(27,42,74,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
            >
              {/* Status badge */}
              <div style={{ position: 'absolute', top: 14, right: 14 }}>
                {active
                  ? <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, background: hub.color + '18', color: hub.color }}>Active</span>
                  : <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, background: B.warmGray, color: B.textLight }}>{hub.price}</span>
                }
              </div>

              <div style={{ fontSize: 32, marginBottom: 12 }}>{hub.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: f1, color: B.navy, marginBottom: 8 }}>{hub.label}</div>
              <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, lineHeight: 1.5, marginBottom: 16 }}>{hub.desc}</div>

              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: f1, color: active ? hub.color : B.textLight }}>
                {active ? (canSee ? 'Open →' : 'No access') : `Upgrade for ${hub.price} →`}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-In Bundle callout */}
      <div style={{ marginTop: 28, padding: 20, background: `linear-gradient(135deg, ${B.navy} 0%, ${B.navyLight} 100%)`, borderRadius: 16, color: B.white }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: f1, marginBottom: 4 }}>✨ All-In Bundle</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: f2 }}>
              All 7 hubs for $29/mo — save over 40% vs. buying individually.
            </div>
          </div>
          <button onClick={() => { onGoToSettings?.(); }}
            style={{ ...btnP, background: B.gold, color: B.navy, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>
            View Plans
          </button>
        </div>
      </div>
    </div>
  );
}
