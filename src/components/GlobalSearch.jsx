import { useState, useEffect, useRef } from 'react';
import { B, f1, f2, inp } from './brand/tokens.js';

// Global search / command palette (Cmd/Ctrl+K). Read-only over the collections
// the store already subscribes to — no extra Firestore reads, no index. Each
// result carries a `nav` descriptor that AppShell routes (item → open detail,
// tab → switch tab, hub → open hub). Hub-gated types are hidden when the user
// can't see that hub. See PLATFORM-FOUNDATIONS Foundation 6 (search). v1 jumps
// to the right area; per-type deep-open beyond items is a follow-up.

const PER_TYPE = 5;
const TOTAL = 30;

const m = (text, q) => (text || '').toString().toLowerCase().includes(q);
const titleOf = (r) => r.description || r.name || r.title || r.label || r.purpose || '(untitled)';

function buildResults(store, canSeeHub, q) {
  const out = [];

  const take = (arr, mapper) => { for (const r of arr.slice(0, PER_TYPE)) out.push(mapper(r)); };

  // Items (core)
  take((store.items || []).filter(i =>
    m(i.description, q) || m(i.itemId, q) || m(i.location, q) || m(i.category, q)),
    i => ({ key: 'item-' + i._docId, type: 'Item', icon: '📦', title: i.description || i.itemId, subtitle: [i.itemId, i.location].filter(Boolean).join(' · '), nav: { kind: 'item', itemId: i.itemId } }));

  // People (people_access hub)
  if (canSeeHub('people_access')) {
    take((store.accessPeople || []).filter(p => p.active !== false && (
      m(p.name, q) || m(p.email, q) || m(p.phone, q))),
      p => ({ key: 'person-' + p._docId, type: 'Person', icon: '👤', title: p.name, subtitle: [p.personType, p.email].filter(Boolean).join(' · '), nav: { kind: 'hub', hub: 'people_access' } }));
  }

  // Tasks (tasks hub)
  if (canSeeHub('tasks')) {
    take((store.tasks || []).filter(t =>
      m(t.name, q) || m(t.title, q) || m(t.description, q) || m(t.taskNumber, q)),
      t => ({ key: 'task-' + t._docId, type: 'Task', icon: '✅', title: titleOf(t), subtitle: [t.taskNumber, t.status].filter(Boolean).join(' · '), nav: { kind: 'hub', hub: 'tasks' } }));
  }

  // Maintenance tickets (maintenance hub)
  if (canSeeHub('maintenance')) {
    take((store.maintenanceTickets || []).filter(t =>
      m(t.name, q) || m(t.description, q) || m(t.ticketNumber, q) || m(t.priority, q)),
      t => ({ key: 'ticket-' + t._docId, type: 'Maintenance', icon: '🔧', title: titleOf(t), subtitle: [t.ticketNumber, t.status].filter(Boolean).join(' · '), nav: { kind: 'hub', hub: 'maintenance' } }));
  }

  // Jobs / shifts (jobs hub)
  if (canSeeHub('jobs')) {
    take((store.jobListings || []).filter(j =>
      m(j.title, q) || m(j.name, q) || m(j.location, q) || m(j.jobNumber, q)),
      j => ({ key: 'job-' + j._docId, type: 'Job', icon: '💼', title: j.title || j.name || '(untitled job)', subtitle: [j.jobNumber, j.location, j.scheduledDate].filter(Boolean).join(' · '), nav: { kind: 'hub', hub: 'jobs' } }));
  }

  // Supplies (core)
  take((store.supplies || []).filter(s =>
    m(s.description, q) || m(s.supplyId, q) || m(s.location, q)),
    s => ({ key: 'supply-' + s._docId, type: 'Supply', icon: '🧴', title: s.description || s.supplyId, subtitle: [s.supplyId, s.location].filter(Boolean).join(' · '), nav: { kind: 'tab', tab: 'supplies' } }));

  // Reservations (core)
  take((store.reservations || []).filter(r =>
    m(r.purpose, q) || m(r.resourceName, q) || m(r.requestedByName, q) || m(r.person, q)),
    r => ({ key: 'res-' + r._docId, type: 'Reservation', icon: '📅', title: r.purpose || r.resourceName || 'Reservation', subtitle: [r.resourceName, r.status, r.date].filter(Boolean).join(' · '), nav: { kind: 'tab', tab: 'reservations' } }));

  return out.slice(0, TOTAL);
}

export function GlobalSearch({ store, canSeeHub, onNavigate, onClose }) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const query = q.trim().toLowerCase();
  const results = query.length >= 1 ? buildResults(store, canSeeHub, query) : [];

  function choose(r) {
    if (!r) return;
    onNavigate(r.nav);
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[activeIdx]); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,30,0.45)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.white, borderRadius: 16, width: '100%', maxWidth: 580, boxShadow: '0 24px 70px rgba(15,20,30,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
        <div style={{ padding: 12, borderBottom: '1px solid ' + B.sand }}>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search items, people, tasks, maintenance, jobs…"
            style={{ ...inp, fontSize: 15, border: 'none', padding: '8px 6px' }}
          />
        </div>

        <div style={{ overflowY: 'auto' }}>
          {query.length >= 1 && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: B.textLight, fontFamily: f2, fontSize: 14 }}>
              No matches for “{q.trim()}”.
            </div>
          )}
          {query.length < 1 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: B.textLight, fontFamily: f2, fontSize: 13 }}>
              Type to search across your church — items, people, tasks, maintenance, jobs, supplies, and reservations.
            </div>
          )}
          {results.map((r, idx) => (
            <button
              key={r.key}
              onClick={() => choose(r)}
              onMouseEnter={() => setActiveIdx(idx)}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: idx === activeIdx ? B.tealPale : 'transparent',
              }}
            >
              <span style={{ fontSize: 18 }} aria-hidden="true">{r.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: B.navy, fontFamily: f1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                {r.subtitle && <span style={{ display: 'block', fontSize: 12, color: B.textLight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.subtitle}</span>}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textMid, background: B.warmGray, borderRadius: 20, padding: '2px 10px', flexShrink: 0 }}>{r.type}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid ' + B.sand, fontSize: 11, color: B.textLight, fontFamily: f1, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
