import { useContext, useEffect, useState, Suspense } from 'react';
import { B, f1, f2 } from '../components/brand/tokens.js';
import { LapsedBanner } from '../components/primitives/LapsedBanner.jsx';
import { Spinner } from '../components/primitives/Spinner.jsx';
import { MobileCtx } from '../hooks/useMobile.js';
import { lazyWithRetry } from '../utils/lazyWithRetry.js';
import { ChunkErrorBoundary } from '../components/primitives/ChunkErrorBoundary.jsx';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';
import { isVolunteerOnly } from '../utils/roleHelpers.js';

// Audit overnight 2026-05-12 / Perf #7: hub pages were all eagerly imported,
// loading recharts + the full Tasks/Insights/People-Access surface even for
// free-tier inventory-only churches. Lazy-load each hub so the main bundle
// drops by ~200 KB gzipped and TTI on mobile improves accordingly.
const InsightsPage      = lazyWithRetry(() => import('./hubs/InsightsPage.jsx').then(m => ({ default: m.InsightsPage })), 'InsightsPage');
const CoordinationPage  = lazyWithRetry(() => import('./hubs/CoordinationPage.jsx').then(m => ({ default: m.CoordinationPage })), 'CoordinationPage');
const AccountabilityPage = lazyWithRetry(() => import('./hubs/AccountabilityPage.jsx').then(m => ({ default: m.AccountabilityPage })), 'AccountabilityPage');
const PeopleAccessPage  = lazyWithRetry(() => import('./hubs/PeopleAccessPage.jsx').then(m => ({ default: m.PeopleAccessPage })), 'PeopleAccessPage');
// Tasks and Maintenance are one engine now (WorkBoard), selected by `type`.
const WorkBoard         = lazyWithRetry(() => import('./hubs/WorkBoard.jsx').then(m => ({ default: m.WorkBoard })), 'WorkBoard');
const JobsPage          = lazyWithRetry(() => import('./hubs/JobsPage.jsx').then(m => ({ default: m.JobsPage })), 'JobsPage');
const ShepherdHubPage   = lazyWithRetry(() => import('./hubs/ShepherdHubPage.jsx').then(m => ({ default: m.ShepherdHubPage })), 'ShepherdHubPage');
const WorkPage          = lazyWithRetry(() => import('./WorkPage.jsx').then(m => ({ default: m.WorkPage })), 'WorkPage');
// Free/core hubs — Inventory (Items + Supplies) and Reservations. Were top-level
// tabs; folded into the hub grid for navigation consistency (2026-06-23).
const InventoryPage     = lazyWithRetry(() => import('./InventoryPage.jsx').then(m => ({ default: m.InventoryPage })), 'InventoryPage');
const ReservationsPage  = lazyWithRetry(() => import('./ReservationsPage.jsx').then(m => ({ default: m.ReservationsPage })), 'ReservationsPage');

const HubLoadingFallback = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'80px 20px' }}>
    <Spinner />
  </div>
);

const HUB_DEFS = [
  // ── Core hubs (Inventory, Reservations). `core` = always visible to every
  //    member regardless of per-user allowedHubs (a per-user permission, not
  //    billing). COH-012 A.4: nothing is free any more — every hub is included
  //    in the one plan, and a lapsed church keeps them all. ──
  {
    key: 'inventory',
    label: 'Inventory Hub',
    icon: '📦',
    color: '#2A7D6E',
    desc: "Track your church's items and supplies — check-in/out, locations, and low-stock alerts.",
    core: true,
  },
  {
    key: 'reservations',
    label: 'Reservations Hub',
    icon: '📅',
    color: '#0D9488',
    desc: 'Reserve equipment and rooms — request, approve, and avoid double-bookings.',
    core: true,
  },
  {
    key: 'insights',
    label: 'Insights Hub',
    icon: '📊',
    color: '#0D9488',
    desc: 'Utilization stats, ministry breakdowns, seasonal trends, and financial tracking.',
  },
  {
    // Synthetic "Work" card — shown ONLY to users who can use both Tasks and
    // Maintenance (mergeWork below); it replaces the two separate cards and
    // opens the unified board with a Tasks/Maintenance toggle (WorkPage). The
    // underlying access keys stay 'tasks'/'maintenance' (allowedHubs is never
    // collapsed to a 'work' key), so per-category scoping is preserved.
    key: 'work',
    label: 'Work',
    icon: '🗂️',
    color: '#059669',
    desc: "Tasks and maintenance in one board — assign, track, and complete your church's to-dos and repairs.",
    synthetic: true,
  },
  {
    key: 'maintenance',
    label: 'Maintenance Hub',
    icon: '🔧',
    color: '#D97706',
    desc: 'Track repair tickets, manage vendors, and keep your equipment in top shape.',
  },
  {
    key: 'coordination',
    label: 'Coordination Hub',
    icon: '🤝',
    color: '#7C3AED',
    desc: 'Checkout bundles and email notifications to keep your team in the loop.',
  },
  {
    key: 'accountability',
    label: 'Accountability Hub',
    icon: '📋',
    color: '#2563EB',
    desc: 'Physical audits, chain of custody, and insurance-ready inventory exports.',
  },
  {
    key: 'people_access',
    label: 'People Access Hub',
    icon: '🔑',
    color: '#DC2626',
    desc: 'Track background checks, key assignments, certifications, and custom compliance milestones.',
  },
  {
    key: 'tasks',
    label: 'Tasks Hub',
    icon: '✅',
    color: '#059669',
    desc: 'Kanban task board for church admin — assign, track, and share tasks with your team.',
  },
  {
    key: 'jobs',
    label: 'Job Hub',
    icon: '💼',
    color: '#E85D04',
    desc: 'Post paid jobs for teens to sign up for — moving walls, resetting chairs, and more.',
  },
  // Shepherd Hub is special-cased: NOT a paid/subscription hub (no price, no
  // UpgradeGate). FXCC-only, gated to elders + John via the elder custom claim
  // (see canSeeShepherd). Lives in the grid for consistency; could graduate into
  // a real paid hub later.
  {
    key: 'shepherd',
    label: 'Shepherd Hub',
    icon: '🐑',
    color: '#1B2A4A',
    desc: "Elders' private view of the congregation from Planning Center — pastoral notes, care threads, and shepherding assignments.",
    special: true,
  },
];

function HubContent({ hubKey, store, userProfile, jobsInitialView, isElder, userCanSeeHub, initialItemId, scannedItemId, onScannedItemConsumed }) {
  let page = null;
  if (hubKey === 'inventory') page = <InventoryPage store={store} userProfile={userProfile} initialItemId={initialItemId} scannedItemId={scannedItemId} onScannedItemConsumed={onScannedItemConsumed} />;
  else if (hubKey === 'reservations') page = <ReservationsPage store={store} userProfile={userProfile} userCanSeeHub={userCanSeeHub} />;
  else if (hubKey === 'insights') page = <InsightsPage store={store} userProfile={userProfile} />;
  else if (hubKey === 'work') page = <WorkPage store={store} userProfile={userProfile} userCanSeeHub={userCanSeeHub} />;
  else if (hubKey === 'maintenance') page = <WorkBoard store={store} userProfile={userProfile} type="maintenance" />;
  else if (hubKey === 'coordination') page = <CoordinationPage store={store} userProfile={userProfile} />;
  else if (hubKey === 'accountability') page = <AccountabilityPage store={store} userProfile={userProfile} />;
  else if (hubKey === 'people_access') page = <PeopleAccessPage store={store} userProfile={userProfile} />;
  else if (hubKey === 'tasks') page = <WorkBoard store={store} userProfile={userProfile} type="task" />;
  else if (hubKey === 'jobs') page = <JobsPage store={store} userProfile={userProfile} initialView={jobsInitialView} />;
  else if (hubKey === 'shepherd') page = <ShepherdHubPage userProfile={userProfile} isElder={isElder} />;
  if (!page) return null;
  // key={hubKey} gives each hub a fresh boundary, so an error on one hub
  // doesn't stick when the user navigates to another.
  return (
    <ChunkErrorBoundary key={hubKey}>
      <Suspense fallback={<HubLoadingFallback />}>{page}</Suspense>
    </ChunkErrorBoundary>
  );
}

export function HubsPage({ store, userProfile, hubKey, onOpenHub, hasHub, isLapsed, subscriptionLoading, userCanSeeHub, onGoToSettings, jobsInitialView, canSeeShepherd, isElder, initialItemId, scannedItemId, onScannedItemConsumed }) {
  const isAdmin = userProfile?.role === 'admin';
  const isMobile = useContext(MobileCtx);
  const def = HUB_DEFS.find(h => h.key === hubKey);
  const volunteerMode = isVolunteerOnly(userProfile);

  // Tasks + Maintenance collapse into one "Work" card+board ONLY for users who
  // can use both. A user scoped to just one keeps that one card (untouched), so
  // per-category access scoping is preserved. allowedHubs stays 'tasks'/'maintenance'.
  const mergeWork = !volunteerMode && !!userCanSeeHub?.('tasks') && !!userCanSeeHub?.('maintenance');

  // Single-hub users (volunteers + anyone whose admin scoped them to exactly
  // one hub they have access to) skip the picker grid — auto-route them into
  // that hub. Admins/managers and multi-hub users still see the picker.
  // Shepherd-only elders (allowedHubs: [], the Shepherd-scoping default set by
  // claimElderRole's first grant) get the same treatment (F3/LNCH-4) — straight
  // into My Flock. Shepherd is `special:true`, so this branch skips the
  // hasHub/userCanSeeHub checks the single-hub branch needs; canSeeShepherd
  // (elder claim + FXCC, computed in App.jsx) is the real gate. The two
  // conditions can't overlap (length 1 vs 0), so the single-hub branch keeps
  // precedence for free.
  const allowedHubs = userProfile?.allowedHubs;
  // Fire at most once per mount. Without this, clicking "← All Hubs" (which
  // nulls hubKey) would recompute a truthy target on the very next render and
  // the effect below would route straight back in — the breadcrumb would
  // never actually reach the picker for these users.
  const [autoRouted, setAutoRouted] = useState(false);
  const autoRouteKey = (!hubKey
    && !subscriptionLoading
    && !autoRouted
    && Array.isArray(allowedHubs)
    && (
      (allowedHubs.length === 1 && hasHub(allowedHubs[0]) && userCanSeeHub?.(allowedHubs[0]))
      || (allowedHubs.length === 0 && canSeeShepherd)
    ))
    ? (allowedHubs.length === 1 ? allowedHubs[0] : 'shepherd')
    : null;
  useEffect(() => {
    if (autoRouteKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoRouted(true);
      onOpenHub(autoRouteKey);
    }
  }, [autoRouteKey, onOpenHub]);

  // ── Active hub view ──
  if (hubKey && def) {
    // Shepherd is special-cased: no subscription. Render directly,
    // gated on canSeeShepherd (elders + John; rules enforce the real boundary).
    if (def.special) {
      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => onOpenHub(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.teal, fontSize: 13, fontWeight: 600, fontFamily: f1, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              ← All Hubs
            </button>
          </div>
          {canSeeShepherd
            ? <HubContent hubKey={hubKey} store={store} userProfile={userProfile} isElder={isElder} />
            : <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: f2 }}>This hub is for elders only.</div>}
        </div>
      );
    }
    // Core hubs (Inventory, Reservations): open to any member who can reach
    // the picker — not subject to per-user allowedHubs.
    if (def.core) {
      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => onOpenHub(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.teal, fontSize: 13, fontWeight: 600, fontFamily: f1, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              ← All Hubs
            </button>
          </div>
          {isLapsed?.() && <LapsedBanner isAdmin={isAdmin} onGoToSettings={onGoToSettings} source={'hub_' + hubKey} />}
          <HubContent hubKey={hubKey} store={store} userProfile={userProfile}
            initialItemId={initialItemId} scannedItemId={scannedItemId} onScannedItemConsumed={onScannedItemConsumed} />
        </div>
      );
    }
    // Work area ('work' is a merged shell, not a real hub key). Access is
    // enforced inside WorkPage at category granularity — show it to anyone
    // who can use at least one of Tasks/Maintenance.
    if (hubKey === 'work') {
      const canSeeWork = userCanSeeHub?.('tasks') || userCanSeeHub?.('maintenance');
      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => onOpenHub(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.teal, fontSize: 13, fontWeight: 600, fontFamily: f1, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              ← All Hubs
            </button>
          </div>
          {isLapsed?.() && canSeeWork && <LapsedBanner isAdmin={isAdmin} onGoToSettings={onGoToSettings} source="hub_work" />}
          {canSeeWork
            ? <HubContent hubKey="work" store={store} userProfile={userProfile} userCanSeeHub={userCanSeeHub} />
            : <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: f2 }}>You don't have access to this hub. Contact your admin.</div>}
        </div>
      );
    }
    return (
      <div>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => onOpenHub(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.teal, fontSize: 13, fontWeight: 600, fontFamily: f1, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            ← All Hubs
          </button>
        </div>
        {/* COH-012 A.4: no paywall on the hub itself — a lapsed church keeps
            every hub and finishes what it started. The banner says what it
            can't do; canCreate (store + callables) enforces it. */}
        {isLapsed?.() && userCanSeeHub(hubKey) && <LapsedBanner isAdmin={isAdmin} onGoToSettings={onGoToSettings} source={'hub_' + hubKey} />}
        {userCanSeeHub(hubKey)
          ? <HubContent hubKey={hubKey} store={store} userProfile={userProfile} jobsInitialView={jobsInitialView} />
          : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: f2 }}>
              You don't have access to this hub. Contact your admin.
            </div>
          )
        }
      </div>
    );
  }

  // ── Hub picker ──
  // If auto-routing, suppress the picker render so the user never sees the
  // full upgrade grid flash before useEffect lands them in their hub.
  if (autoRouteKey) return null;
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: isMobile ? 20 : 24, fontFamily: f1, color: B.navy }}>Hubs</h2>
        <p style={{ margin: 0, fontSize: 13, color: B.textLight, fontFamily: f2 }}>
          Everything your church runs on — all of it included.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, opacity: subscriptionLoading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {HUB_DEFS.filter(hub => {
          // Shepherd: only FXCC elders + John ever see the card.
          if (hub.key === 'shepherd') return canSeeShepherd;
          // Volunteers (jobs-only) see only their hub — no inventory/upgrade cards.
          if (volunteerMode) return hub.key === 'jobs';
          // Core hubs (Inventory, Reservations) are always shown.
          if (hub.core) return true;
          if (hub.key === 'people_access' && userProfile?.role === 'user') return false;
          // Work merge: show the synthetic "Work" card only when both categories
          // are usable, and hide the individual Tasks/Maintenance cards then.
          if (hub.key === 'work') return mergeWork;
          if ((hub.key === 'tasks' || hub.key === 'maintenance') && mergeWork) return false;
          // Every hub is included (COH-012 A.4); the only per-hub gate left is
          // the per-user allowedHubs permission.
          return userCanSeeHub(hub.key);
        }).map(hub => {
          const isSpecial = !!hub.special;
          const isCore = !!hub.core;
          const canSee = isSpecial || isCore || hub.key === 'work' ? true : userCanSeeHub(hub.key);
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
                border: `2px solid ${hub.color}`,
                position: 'relative',
                transition: 'box-shadow 0.15s, transform 0.1s',
                opacity: canSee ? 1 : 0.6,
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(27,42,74,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              onFocus={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(27,42,74,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
            >
              {/* Status badge */}
              <div style={{ position: 'absolute', top: 14, right: 14 }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, background: hub.color + '18', color: hub.color }}>{isSpecial ? 'Elders' : 'Included'}</span>
              </div>

              <EmojiIcon emoji={hub.icon} decorative style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: f1, color: B.navy, marginBottom: 8 }}>{hub.label}</div>
              <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, lineHeight: 1.5, marginBottom: 16 }}>{hub.desc}</div>

              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: f1, color: canSee ? hub.color : B.textLight }}>
                {canSee ? 'Open →' : 'No access'}
              </div>
            </div>
          );
        })}
      </div>

      {/* COH-012 A.4: the picker carries the lapsed banner instead of an upsell —
          there is nothing to upsell to a church that already has every hub. */}
      {!volunteerMode && isLapsed?.() && <div style={{ marginTop: 28 }}><LapsedBanner isAdmin={isAdmin} onGoToSettings={onGoToSettings} source="hub_picker" /></div>}
    </div>
  );
}
