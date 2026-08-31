// Foundation F4 — Attention engine, SERVER TWIN of src/lib/attention.js.
// Cloud Functions are CommonJS and the deploy package only contains functions/,
// so this can't import the ESM module or the shared JSON at runtime — it inlines
// the same collectors + thresholds (the same constraint that makes F2's server
// isAccessEligible its own copy).
//
// ⚠️ KEEP IN SYNC with src/lib/attention.js. functions/test/attention.test.mjs
// imports BOTH this and the client module and asserts computeAttention produces
// identical output across a battery of fixtures, and that these inlined
// thresholds equal src/lib/attention-thresholds.json + the F2 EXPIRY_* windows.
// Any drift fails the test.

// Inlined copy of src/lib/attention-thresholds.json (pinned by the parity test).
const THRESHOLDS = { workDueSoonDays: 7, warrantyExpiringDays: 30, certLookbackDays: 90 };
// Inlined copy of F2's people.js EXPIRY_* windows (pinned by the parity test).
const EXPIRY_CRITICAL_DAYS = 7;
const EXPIRY_WARNING_DAYS = 30;

const ATTENTION_KINDS = [
  'item_overdue', 'work_overdue', 'cert_expiring', 'low_stock',
  'warranty_expiring', 'shift_unfilled', 'reservation_pending', 'contractor_outstanding',
];
const ATTENTION_SEVERITIES = ['critical', 'warning', 'info'];
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

function ymdAddDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const idOf = (doc) => doc._docId || doc.id || null;
function mk(kind, severity, fields) { return { kind, severity, ...fields }; }

function collectItemOverdue(ctx) {
  const { items, todayStr } = ctx;
  return items
    .filter(i => i.status === 'Checked Out' && i.expectedReturn && i.expectedReturn < todayStr)
    .map(i => mk('item_overdue', 'critical', {
      id: `item_overdue:${idOf(i)}`, title: i.description || 'Item',
      dueDate: i.expectedReturn, subjectRef: idOf(i), link: `?item=${idOf(i)}`,
    }));
}

function collectLowStock(ctx) {
  const { supplies } = ctx;
  return supplies
    .filter(s => s.minQuantity != null && Number(s.quantity) <= Number(s.minQuantity))
    .map(s => mk('low_stock', 'warning', {
      id: `low_stock:${idOf(s)}`, title: s.description || 'Supply',
      count: Number(s.quantity), subjectRef: idOf(s), link: '#supplies',
    }));
}

function collectReservationsPending(ctx) {
  const { reservations } = ctx;
  return reservations
    .filter(r => r.status === 'Pending')
    .map(r => mk('reservation_pending', 'info', {
      id: `reservation_pending:${idOf(r)}`, title: r.itemDesc || r.eventName || 'Reservation',
      dueDate: r.eventDate || null, subjectRef: idOf(r), link: '#reservations',
    }));
}

function collectWarranty(ctx) {
  const { items, todayStr } = ctx;
  const horizon = ymdAddDays(todayStr, THRESHOLDS.warrantyExpiringDays);
  return items
    .filter(i => i.warrantyExpiry && i.status !== 'Disposed' && i.warrantyExpiry <= horizon)
    .map(i => mk('warranty_expiring', i.warrantyExpiry < todayStr ? 'critical' : 'warning', {
      id: `warranty_expiring:${idOf(i)}`, title: i.description || 'Item',
      dueDate: i.warrantyExpiry, subjectRef: idOf(i), link: `?item=${idOf(i)}`,
    }));
}

function collectWork(ctx) {
  const { workItems, todayStr, hasHub } = ctx;
  const dueSoon = ymdAddDays(todayStr, THRESHOLDS.workDueSoonDays);
  const out = [];
  for (const w of workItems) {
    const hub = w.type === 'maintenance' ? 'maintenance' : 'tasks';
    if (!hasHub(hub)) continue;
    if (!w.dueDate || w.status === 'Complete' || w.status === 'Cancelled') continue;
    if (w.dueDate > dueSoon) continue;
    out.push(mk('work_overdue', w.dueDate < todayStr ? 'critical' : 'warning', {
      id: `work_overdue:${idOf(w)}`, title: w.name || (w.type === 'maintenance' ? 'Ticket' : 'Task'),
      dueDate: w.dueDate, subjectRef: idOf(w), link: w.type === 'maintenance' ? '#maintenance' : '#tasks',
    }));
  }
  return out;
}

function collectCompliance(ctx) {
  const { accessRecords, todayStr, hasHub } = ctx;
  if (!hasHub('people_access')) return [];
  const warnHorizon = ymdAddDays(todayStr, EXPIRY_WARNING_DAYS);
  const critHorizon = ymdAddDays(todayStr, EXPIRY_CRITICAL_DAYS);
  const lookbackFloor = ymdAddDays(todayStr, -THRESHOLDS.certLookbackDays);
  return accessRecords
    .filter(r => r.expiryDate && r.expiryDate >= lookbackFloor && r.expiryDate <= warnHorizon)
    .map(r => {
      const expired = r.expiryDate < todayStr;
      const severity = expired || r.expiryDate <= critHorizon ? 'critical' : 'warning';
      return mk('cert_expiring', severity, {
        id: `cert_expiring:${idOf(r)}`, title: `${r.personName || 'Someone'} — ${r.type || 'record'}`,
        dueDate: r.expiryDate, subjectRef: r.personId || null, link: '#people_access',
      });
    });
}

function collectShifts(ctx) {
  const { jobListings, todayStr, hasHub } = ctx;
  if (!hasHub('jobs')) return [];
  return jobListings
    .filter(j => j.status === 'open' && j.scheduledDate >= todayStr
      && (Number(j.signupCount) || 0) < (Number(j.spotsTotal) || 1))
    .map(j => mk('shift_unfilled', 'warning', {
      id: `shift_unfilled:${idOf(j)}`, title: j.title || 'Shift', dueDate: j.scheduledDate,
      count: (Number(j.spotsTotal) || 1) - (Number(j.signupCount) || 0), subjectRef: idOf(j), link: '#jobs',
    }));
}

function collectContractor(ctx) {
  const { timeEntries, hasHub } = ctx;
  if (!hasHub('people_access')) return [];
  return timeEntries
    .filter(e => e.status === 'approved')
    .map(e => mk('contractor_outstanding', 'warning', {
      id: `contractor_outstanding:${idOf(e)}`, title: `${e.personName || 'Contractor'} — payment due`,
      dueDate: e.date || null, count: Math.round((Number(e.cost) || 0) * 100) / 100,
      subjectRef: idOf(e), link: '#people_access',
    }));
}

const COLLECTORS = [
  collectItemOverdue, collectLowStock, collectReservationsPending, collectWarranty,
  collectWork, collectCompliance, collectShifts, collectContractor,
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

function computeAttention(ctx, opts = {}) {
  const norm = normalizeCtx(ctx);
  const allow = opts.kinds ? new Set(opts.kinds) : null;
  let out = [];
  for (const collect of COLLECTORS) out = out.concat(collect(norm));
  if (allow) out = out.filter(it => allow.has(it.kind));
  out.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    // Plain ASCII compare on canonical YYYY-MM-DD — twin of src/lib/attention.js.
    // NOT localeCompare (default locale differs browser↔Node). '~' sends undated last.
    const da = a.dueDate || '~', db = b.dueDate || '~';
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return out;
}

function summarizeAttention(attentionItems) {
  const by = {};
  for (const it of attentionItems) {
    const g = by[it.kind] || (by[it.kind] = { count: 0, critical: 0, warning: 0, info: 0, items: [] });
    g.count += 1; g[it.severity] += 1; g.items.push(it);
  }
  return by;
}

// ── Digest signal builder (server-only presentation) ─────────────────────────
// The AI "what needs attention this week" digest + the weekly email feed Claude a
// grouped {tasks, maintenance, compliance, inventory, shifts, contractor} object.
// This derives that exact shape from the canonical collectors, so the digest's
// membership/thresholds can't drift from the dashboard's — the F4 no-drift goal —
// while the Claude prompt input stays byte-identical (pinned by the differential
// test in functions/test/attention.test.mjs). Contractor stays computed directly
// (its upcoming/hours-logged fields are digest content, not "attention" items).
//
// `data` = arrays of doc data WITH `_docId` attached, plus `has(hubName)`:
//   { taskData, maintData, recordsData, suppliesData, itemsData, jobsData, timeData, has }
function buildDigestSignals(data, todayStr) {
  const { taskData = [], maintData = [], recordsData = [], suppliesData = [],
    itemsData = [], jobsData = [], timeData = [], has } = data;
  const byDue = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '');
  const sig = {};

  const workGroup = (workItems) => {
    const items = collectWork({ workItems, todayStr, hasHub: has }).slice().sort(byDue);
    if (!items.length) return null;
    return {
      overdue: items.filter(i => i.severity === 'critical').length,
      dueThisWeek: items.filter(i => i.severity === 'warning').length,
      examples: items.slice(0, 5).map(i => `${i.title} (due ${i.dueDate}${i.severity === 'critical' ? ', OVERDUE' : ''})`),
    };
  };
  if (has('tasks')) { const g = workGroup(taskData); if (g) sig.tasks = g; }
  if (has('maintenance')) { const g = workGroup(maintData); if (g) sig.maintenance = g; }

  if (has('people_access')) {
    const items = collectCompliance({ accessRecords: recordsData, todayStr, hasHub: has }).slice().sort(byDue);
    if (items.length) sig.compliance = {
      expired: items.filter(i => i.dueDate < todayStr).length,
      expiringSoon: items.filter(i => i.dueDate >= todayStr).length,
      examples: items.slice(0, 5).map(i => `${i.title} ${i.dueDate < todayStr ? 'EXPIRED' : 'expires'} ${i.dueDate}`),
    };
  }

  // Inventory base (always-on): low stock + warranty. Examples read the source
  // docs (for unit / quantity) via subjectRef, in the collectors' source order.
  const lowItems = collectLowStock({ supplies: suppliesData });
  const warrantyItems = collectWarranty({ items: itemsData, todayStr, hasHub: has });
  if (lowItems.length || warrantyItems.length) {
    const bySupply = Object.fromEntries(suppliesData.map(s => [idOf(s), s]));
    const byItem = Object.fromEntries(itemsData.map(i => [idOf(i), i]));
    sig.inventory = {
      lowStock: lowItems.length,
      warrantyExpiring: warrantyItems.length,
      examples: [
        ...lowItems.slice(0, 4).map(it => { const s = bySupply[it.subjectRef] || {}; return `${s.description} low (${s.quantity}${s.unit ? ' ' + s.unit : ''} left)`; }),
        ...warrantyItems.slice(0, 3).map(it => { const i = byItem[it.subjectRef] || {}; return `${i.description} warranty ${i.warrantyExpiry < todayStr ? 'EXPIRED' : 'expires'} ${i.warrantyExpiry}`; }),
      ],
    };
  }

  if (has('jobs')) {
    const items = collectShifts({ jobListings: jobsData, todayStr, hasHub: has });
    if (items.length) {
      const byJob = Object.fromEntries(jobsData.map(j => [idOf(j), j]));
      const sorted = items.slice().sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      sig.shifts = {
        unfilled: items.length,
        examples: sorted.slice(0, 5).map(it => {
          const j = byJob[it.subjectRef] || {};
          return `${j.title || 'Shift'} ${j.scheduledDate} — ${(Number(j.signupCount) || 0)}/${j.spotsTotal || 1} filled`;
        }),
      };
    }
  }

  // Contractor: kept computed directly — its upcoming/hours-logged fields are
  // digest content, not attention items. The "approved = outstanding" predicate
  // is a status literal (no threshold), so there's nothing to drift.
  if (has('people_access')) {
    const upcoming = timeData.filter(e => e.status === 'scheduled' && e.date >= todayStr).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const outstanding = timeData.filter(e => e.status === 'approved');
    const outstandingTotal = outstanding.reduce((s, e) => s + (Number(e.cost) || 0), 0);
    const loggedThisWeek = timeData.filter(e => e.status !== 'scheduled' && e.date >= ymdAddDays(todayStr, -7));
    if (upcoming.length || outstandingTotal > 0 || loggedThisWeek.length) sig.contractor = {
      upcoming: upcoming.length,
      outstandingPayment: Math.round(outstandingTotal * 100) / 100,
      hoursLoggedLast7d: Math.round(loggedThisWeek.reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100) / 100,
      examples: upcoming.slice(0, 4).map(e => `${e.personName || 'Contractor'} scheduled ${e.date}${e.estHours ? ` (~${e.estHours}h)` : ''}`),
    };
  }

  return sig;
}

// ── Digest visibility + cache policy — SERVER-ONLY, no client twin ───────────
// The client's attention panel reads the per-user store, which is already
// visibility-filtered. The digest has no such luxury: it runs on the Admin SDK,
// which bypasses rules, and one cached payload is emailed to every admin, so it
// cannot honour recipient-specific visibility. COH-006 C-1 therefore excludes
// private and shared tasks outright. Legacy tasks with no `visibility` are team
// tasks. These two are exempt from the KEEP-IN-SYNC rule at the top of the file.

// Bump when a change alters WHAT may appear in a digest, not merely how it reads.
// A payload cached under an older policy misses and is rebuilt, so the change
// takes effect immediately instead of at the start of the next ISO week. Cost of
// a bump: one extra Claude call per church, once.
const DIGEST_POLICY_VERSION = 2;

function digestVisibleTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(t => t && (!t.visibility || t.visibility === 'team'));
}

// A cached digest is reusable only if it is this ISO week AND was built under the
// current policy. A payload with no policyVersion predates COH-006 and may name
// another member's private task.
function isDigestCacheUsable(cached, weekKey) {
  return !!cached && cached.weekKey === weekKey && cached.policyVersion === DIGEST_POLICY_VERSION;
}

module.exports = {
  DIGEST_POLICY_VERSION, digestVisibleTasks, isDigestCacheUsable,
  THRESHOLDS, EXPIRY_CRITICAL_DAYS, EXPIRY_WARNING_DAYS,
  ATTENTION_KINDS, ATTENTION_SEVERITIES, ymdAddDays,
  collectItemOverdue, collectLowStock, collectReservationsPending, collectWarranty,
  collectWork, collectCompliance, collectShifts, collectContractor,
  computeAttention, summarizeAttention, buildDigestSignals,
};
