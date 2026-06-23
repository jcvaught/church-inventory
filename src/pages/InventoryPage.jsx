import { useContext, useState, useEffect, Suspense } from 'react';
import { B, f1 } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { lazyWithRetry } from '../utils/lazyWithRetry.js';
import { Spinner } from '../components/primitives/Spinner.jsx';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';

// Inventory Hub — Items + Supplies under one card with a sub-nav toggle, mirroring
// WorkPage's Tasks/Maintenance pattern (see docs/HUB-RESTRUCTURE-PLAN-2026-06-23.md).
// Both are free/core: no per-category access scoping (unlike WorkPage) — any member
// who can reach the hub sees both. Selection persists in localStorage.inventoryCategory.
const ItemsPage    = lazyWithRetry(() => import('./ItemsPage.jsx').then(m => ({ default: m.ItemsPage })), 'ItemsPage');
const SuppliesPage = lazyWithRetry(() => import('./SuppliesPage.jsx').then(m => ({ default: m.SuppliesPage })), 'SuppliesPage');

const CATEGORIES = [
  { key: 'items', label: 'Items', icon: '📦', color: '#2A7D6E' },
  { key: 'supplies', label: 'Supplies', icon: '🧴', color: '#0D9488' },
];

const InvLoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 20px' }}>
    <Spinner />
  </div>
);

export function InventoryPage({ store, userProfile, initialItemId, scannedItemId, onScannedItemConsumed }) {
  const isMobile = useContext(MobileCtx);

  const [selected, setSelected] = useState(() => {
    // A deep-link (?item=) or scan must land on the Items board, whatever was saved.
    if (initialItemId || scannedItemId) return 'items';
    const saved = localStorage.getItem('inventoryCategory');
    return saved === 'supplies' ? 'supplies' : 'items';
  });
  const choose = (key) => { setSelected(key); localStorage.setItem('inventoryCategory', key); };

  // A scan arriving while the hub is already mounted must surface the Items board.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (scannedItemId) setSelected('items'); }, [scannedItemId]);

  return (
    <div>
      <div role="tablist" aria-label="Inventory category"
        style={{ display: 'inline-flex', gap: 4, background: B.warmGray, padding: 4, borderRadius: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => {
          const on = c.key === selected;
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

      <Suspense fallback={<InvLoadingFallback />}>
        {selected === 'supplies'
          ? <SuppliesPage store={store} userProfile={userProfile} />
          : <ItemsPage store={store} userProfile={userProfile} initialItemId={initialItemId} scannedItemId={scannedItemId} onScannedItemConsumed={onScannedItemConsumed} />}
      </Suspense>
    </div>
  );
}
