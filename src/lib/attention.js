// Foundation F4 — the Attention engine.
//
// "What needs attention" (overdue work, expiring certs, low stock, warranty
// expiring, unfilled shifts, pending reservations, outstanding contractor pay,
// overdue checked-out items) was computed in three unrelated places, each with
// its own copy of the "overdue/expiring/low?" predicates:
//   • src/pages/Dashboard.jsx        — inventory cards (client, subscribed data)
//   • functions/index.js gatherAttentionSignals — AI digest + weekly email (server)
//   • (and the thresholds were hard-coded in each)
// This module is the single canonical contract + the pure per-domain collectors,
// so every consumer reads the SAME list computed the SAME way.
//
// PURE + dependency-light so it imports cleanly into BOTH the Vite app (src/) and
// node --test (functions/test/). It operates on already-subscribed arrays — it
// does NOT fetch. The client passes live useFirestore arrays; the server twin
// (functions/lib/attention.cjs, Phase C) passes freshly-.get()'d snapshots.
//
// CROSS-ENV NO-DRIFT (see docs/PLATFORM-FOUNDATIONS-2026-06-06.md §Sharing):
//   • The numeric thresholds live in ONE shared file — attention-thresholds.json
//     (JSON imports in both Vite and Node), so there is one copy of the numbers.
//   • The cert windows (7/30) are NOT re-declared here — they come from F2's
//     EXPIRY_CRITICAL_DAYS / EXPIRY_WARNING_DAYS, so the compliance collector
//     shares People-model constants instead of forking a third copy (F2's 2nd
//     real consumer). The server twin keeps a CJS copy pinned by the parity
//     suite in functions/test/attention.test.mjs (same pattern as the F2
//     people-resolver parity test).

import { EXPIRY_CRITICAL_DAYS, EXPIRY_WARNING_DAYS } from './people.js';
import thresholds from './attention-thresholds.json' with { type: 'json' };

export const ATTENTION_KINDS = [
  'item_overdue',           // checked-out inventory item past its expected return
  'work_overdue',           // task or maintenance ticket overdue / due soon
  'cert_expiring',          // People Access compliance record expired / expiring
  'low_stock',              // supply at or below its min quantity
  'warranty_expiring',      // item warranty expired / expiring
  'shift_unfilled',         // open job/shift not fully staffed
  'reservation_pending',    // reservation awaiting approval
  'contractor_outstanding', // approved-but-unpaid contractor time entry
];

export const ATTENTION_SEVERITIES = ['critical', 'warning', 'info'];
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

// ── pure date helpers (string YYYY-MM-DD; lexicographic compare is correct for
// ISO dates, and UTC arithmetic avoids any local-timezone drift — identical
// across the ESM client and the CJS server twin) ────────────────────────────
export function ymdAddDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const idOf = (doc) => doc._docId || doc.id || null;

function item(kind, severity, fields) {
  return { kind, severity, ...fields };
}

// ── Collectors — one pure function per domain, each hub-gates itself ─────────
// Every collector takes the normalized ctx and returns AttentionItem[]. A
// collector for an inactive hub returns []. Inventory (items/supplies) is the
// always-on free base, so its collectors are never hub-gated.

/** Overdue checked-out inventory items (always-on base hub). */
export function collectItemOverdue(ctx) {
  const { items, todayStr } = ctx;
  return items
    .filter(i => i.status === 'Checked Out' && i.expectedReturn && i.expectedReturn < todayStr)
    .map(i => item('item_overdue', 'critical', {
      id: `item_overdue:${idOf(i)}`,
      title: i.description || 'Item',
      dueDate: i.expectedReturn,
      subjectRef: idOf(i),
      link: `?item=${idOf(i)}`,
    }));
}

/** Low-stock supplies (always-on base hub). A supply with no min threshold is
 *  not "low stock" — the canonical predicate requires minQuantity != null
 *  (normalizes a micro-edge in the old Dashboard `quantity <= minQuantity`). */
export function collectLowStock(ctx) {
  const { supplies } = ctx;
  return supplies
    .filter(s => s.minQuantity != null && Number(s.quantity) <= Number(s.minQuantity))
    .map(s => item('low_stock', 'warning', {
      id: `low_stock:${idOf(s)}`,
      title: s.description || 'Supply',
      count: Number(s.quantity),
      subjectRef: idOf(s),
      link: '#supplies',
    }));
}

/** Reservations awaiting approval (always-on base hub). */
export function collectReservationsPending(ctx) {
  const { reservations } = ctx;
  return reservations
    .filter(r => r.status === 'Pending')
    .map(r => item('reservation_pending', 'info', {
      id: `reservation_pending:${idOf(r)}`,
      title: r.itemDesc || r.eventName || 'Reservation',
      dueDate: r.eventDate || null,
      subjectRef: idOf(r),
      link: '#reservations',
    }));
}

/** Item warranties expired / expiring within warrantyExpiringDays (base hub). */
export function collectWarranty(ctx) {
  const { items, todayStr } = ctx;
  const horizon = ymdAddDays(todayStr, thresholds.warrantyExpiringDays);
  return items
    .filter(i => i.warrantyExpiry && i.status !== 'Disposed' && i.warrantyExpiry <= horizon)
    .map(i => item('warranty_expiring', i.warrantyExpiry < todayStr ? 'critical' : 'warning', {
      id: `warranty_expiring:${idOf(i)}`,
      title: i.description || 'Item',
      dueDate: i.warrantyExpiry,
      subjectRef: idOf(i),
      link: `?item=${idOf(i)}`,
    }));
}

/** Overdue / due-soon work items (tasks + maintenance), hub-gated per type. */
export function collectWork(ctx) {
  const { workItems, todayStr, hasHub } = ctx;
  const dueSoon = ymdAddDays(todayStr, thresholds.workDueSoonDays);
  const out = [];
  for (const w of workItems) {
    const hub = w.type === 'maintenance' ? 'maintenance' : 'tasks';
    if (!hasHub(hub)) continue;
    if (!w.dueDate || w.status === 'Complete' || w.status === 'Cancelled') continue;
    if (w.dueDate > dueSoon) continue;
    out.push(item('work_overdue', w.dueDate < todayStr ? 'critical' : 'warning', {
      id: `work_overdue:${idOf(w)}`,
      title: w.name || (w.type === 'maintenance' ? 'Ticket' : 'Task'),
      dueDate: w.dueDate,
      subjectRef: idOf(w),
      link: w.type === 'maintenance' ? '#maintenance' : '#tasks',
    }));
  }
  return out;
}

/** Compliance records expired / expiring (People Access hub). Shares F2's expiry
 *  windows (EXPIRY_CRITICAL_DAYS / EXPIRY_WARNING_DAYS) — no forked numbers — and
 *  applies the certLookbackDays floor so long-expired records don't resurface. */
export function collectCompliance(ctx) {
  const { accessRecords, todayStr, hasHub } = ctx;
  if (!hasHub('people_access')) return [];
  const warnHorizon = ymdAddDays(todayStr, EXPIRY_WARNING_DAYS);
  const critHorizon = ymdAddDays(todayStr, EXPIRY_CRITICAL_DAYS);
  const lookbackFloor = ymdAddDays(todayStr, -thresholds.certLookbackDays);
  return accessRecords
    .filter(r => r.expiryDate && r.expiryDate >= lookbackFloor && r.expiryDate <= warnHorizon)
    .map(r => {
      const expired = r.expiryDate < todayStr;
      const severity = expired || r.expiryDate <= critHorizon ? 'critical' : 'warning';
      return item('cert_expiring', severity, {
        id: `cert_expiring:${idOf(r)}`,
        title: `${r.personName || 'Someone'} — ${r.type || 'record'}`,
        dueDate: r.expiryDate,
        subjectRef: r.personId || null,
        link: '#people_access',
      });
    });
}

/** Open shifts that aren't fully staffed (Jobs hub). */
export function collectShifts(ctx) {
  const { jobListings, todayStr, hasHub } = ctx;
  if (!hasHub('jobs')) return [];
  return jobListings
    .filter(j => j.status === 'open' && j.scheduledDate >= todayStr
      && (Number(j.signupCount) || 0) < (Number(j.spotsTotal) || 1))
    .map(j => item('shift_unfilled', 'warning', {
      id: `shift_unfilled:${idOf(j)}`,
      title: j.title || 'Shift',
      dueDate: j.scheduledDate,
      count: (Number(j.spotsTotal) || 1) - (Number(j.signupCount) || 0),
      subjectRef: idOf(j),
      link: '#jobs',
    }));
}

/** Approved-but-unpaid contractor time entries (People Access hub). */
export function collectContractor(ctx) {
  const { timeEntries, hasHub } = ctx;
  if (!hasHub('people_access')) return [];
  return timeEntries
    .filter(e => e.status === 'approved')
    .map(e => item('contractor_outstanding', 'warning', {
      id: `contractor_outstanding:${idOf(e)}`,
      title: `${e.personName || 'Contractor'} — payment due`,
      dueDate: e.date || null,
      count: Math.round((Number(e.cost) || 0) * 100) / 100,
      subjectRef: idOf(e),
      link: '#people_access',
    }));
}

const COLLECTORS = [
  collectItemOverdue,
  collectLowStock,
  collectReservationsPending,
  collectWarranty,
  collectWork,
  collectCompliance,
  collectShifts,
  collectContractor,
];

function normalizeCtx(ctx) {
  return {
    todayStr: (ctx && ctx.todayStr) || '',
    hasHub: (ctx && ctx.hasHub) || (() => false),
    items: (ctx && ctx.items) || [],
    supplies: (ctx && ctx.supplies) || [],
    reservations: (ctx && ctx.reservations) || [],
    workItems: (ctx && ctx.workItems) || [],
    accessRecords: (ctx && ctx.accessRecords) || [],
    jobListings: (ctx && ctx.jobListings) || [],
    timeEntries: (ctx && ctx.timeEntries) || [],
  };
}

/**
 * Run every collector over the ctx and return a flat, sorted AttentionItem[].
 * ctx = { todayStr, hasHub, items, supplies, reservations, workItems,
 *         accessRecords, jobListings, timeEntries } — already-subscribed arrays.
 * opts.kinds — optional allow-list to restrict which kinds are computed (a
 * consumer that only renders a subset, e.g. the inventory dashboard cards).
 */
export function computeAttention(ctx, opts = {}) {
  const norm = normalizeCtx(ctx);
  const allow = opts.kinds ? new Set(opts.kinds) : null;
  let out = [];
  for (const collect of COLLECTORS) out = out.concat(collect(norm));
  if (allow) out = out.filter(it => allow.has(it.kind));
  out.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return (a.dueDate || '￿').localeCompare(b.dueDate || '￿');
  });
  return out;
}

/** Group an AttentionItem[] by kind → { count, critical, warning, info, items[] }.
 *  Convenience for digest summaries + tests; consumers can also render the flat list. */
export function summarizeAttention(attentionItems) {
  const by = {};
  for (const it of attentionItems) {
    const g = by[it.kind] || (by[it.kind] = { count: 0, critical: 0, warning: 0, info: 0, items: [] });
    g.count += 1;
    g[it.severity] += 1;
    g.items.push(it);
  }
  return by;
}
