import { useContext, useState, Suspense } from 'react';
import { B, f1 } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { lazyWithRetry } from '../utils/lazyWithRetry.js';
import { Spinner } from '../components/primitives/Spinner.jsx';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';

// Work area — the unified Tasks + Maintenance board (rescoped Phase 4, see
// docs/WORK-MERGE-TASKS-MAINTENANCE-PLAN-2026-06-23.md). Tasks and maintenance
// already share one `workItems` collection (Phase 2); this is the UI merge.
//
// Access scoping is preserved at CATEGORY granularity: the toggle only offers
// the categories the user's `allowedHubs` permits (resolved via the same
// `userCanSeeHub('tasks')`/`userCanSeeHub('maintenance')` the nav uses). A user
// allowed only one category lands straight on that board with no toggle — but
// in practice such users keep their original single hub card and never reach
// here; this page is rendered for users who can use BOTH. Jobs is NOT here.
const TasksPage       = lazyWithRetry(() => import('./hubs/TasksPage.jsx').then(m => ({ default: m.TasksPage })), 'TasksPage');
const MaintenancePage = lazyWithRetry(() => import('./hubs/MaintenancePage.jsx').then(m => ({ default: m.MaintenancePage })), 'MaintenancePage');

const CATEGORIES = [
  { key: 'tasks', hub: 'tasks', label: 'Tasks', icon: '✅', color: '#059669' },
  { key: 'maintenance', hub: 'maintenance', label: 'Maintenance', icon: '🔧', color: '#D97706' },
];

const WorkLoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 20px' }}>
    <Spinner />
  </div>
);

export function WorkPage({ store, userProfile, userCanSeeHub }) {
  const isMobile = useContext(MobileCtx);

  // Category-granular scoping: keep only the categories this user may use.
  // (No userCanSeeHub ⇒ caller is unscoped/test ⇒ show both.)
  const cats = CATEGORIES.filter(c => (userCanSeeHub ? userCanSeeHub(c.hub) : true));

  const [selected, setSelected] = useState(() => {
    const saved = localStorage.getItem('workCategory');
    if (saved && cats.some(c => c.key === saved)) return saved;
    return cats[0]?.key || 'tasks';
  });
  const choose = (key) => { setSelected(key); localStorage.setItem('workCategory', key); };

  if (cats.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: 'inherit' }}>
        You don't have access to this hub. Contact your admin.
      </div>
    );
  }

  // A single-category user (no toggle) lands on their one board, labeled to it.
  const active = cats.some(c => c.key === selected) ? selected : cats[0].key;

  return (
    <div>
      {cats.length > 1 && (
        <div role="tablist" aria-label="Work category"
          style={{ display: 'inline-flex', gap: 4, background: B.warmGray, padding: 4, borderRadius: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {cats.map(c => {
            const on = c.key === active;
            return (
              <button key={c.key} role="tab" aria-selected={on} onClick={() => choose(c.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: isMobile ? '8px 14px' : '9px 18px',
                  border: 'none', borderRadius: 9, cursor: 'pointer',
                  fontFamily: f1, fontSize: 14, fontWeight: 700,
                  background: on ? B.white : 'transparent',
                  color: on ? c.color : B.textMid,
                  boxShadow: on ? '0 1px 4px rgba(27,42,74,0.12)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                <EmojiIcon emoji={c.icon} decorative /> {c.label}
              </button>
            );
          })}
        </div>
      )}

      <Suspense fallback={<WorkLoadingFallback />}>
        {active === 'maintenance'
          ? <MaintenancePage store={store} userProfile={userProfile} />
          : <TasksPage store={store} userProfile={userProfile} />}
      </Suspense>
    </div>
  );
}
