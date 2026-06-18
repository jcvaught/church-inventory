// Foundation F4 — Attention engine unit tests. Runs under `npm run test:unit`
// (node --test, no emulator). Imports the PURE src/lib/attention.js directly
// (root package.json is type:module, so node loads the .js as ESM).
//
// Phase A: exercises every client collector + computeAttention ordering/gating.
// Phase C: the CLIENT≡SERVER parity suite (bottom) pins functions/lib/attention.js
// to the client module over a fixture battery, and pins the server's inlined
// thresholds to the shared JSON + F2 EXPIRY_* — same pattern as the F2
// people-resolver parity test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAttention,
  summarizeAttention,
  collectCompliance,
  collectWork,
  ymdAddDays,
  ATTENTION_KINDS,
} from '../../src/lib/attention.js';

import serverAttention from '../lib/attention.js'; // CJS server twin (default import = module.exports)
import sharedThresholds from '../../src/lib/attention-thresholds.json' with { type: 'json' };
import { EXPIRY_CRITICAL_DAYS, EXPIRY_WARNING_DAYS } from '../../src/lib/people.js';

// A fixed "today" so all date math is deterministic regardless of run date.
const TODAY = '2026-06-17';
const allHubs = () => true;
const noHubs = () => false;

// Build a ctx with sane empty defaults; spread overrides per test.
const ctx = (over = {}) => ({ todayStr: TODAY, hasHub: allHubs, ...over });

test('ymdAddDays is timezone-stable and correct across month boundaries', () => {
  assert.equal(ymdAddDays('2026-06-17', 7), '2026-06-24');
  assert.equal(ymdAddDays('2026-06-17', -90), '2026-03-19');
  assert.equal(ymdAddDays('2026-01-31', 1), '2026-02-01');
  assert.equal(ymdAddDays('2026-12-31', 1), '2027-01-01');
});

test('collectItemOverdue flags only past-due checked-out items', () => {
  const out = computeAttention(ctx({
    items: [
      { _docId: 'a', status: 'Checked Out', expectedReturn: '2026-06-10', description: 'Drill' },   // overdue
      { _docId: 'b', status: 'Checked Out', expectedReturn: '2026-06-30', description: 'Ladder' },   // future
      { _docId: 'c', status: 'Available', expectedReturn: '2026-06-01', description: 'Cart' },        // not out
    ],
  }), { kinds: ['item_overdue'] });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'item_overdue');
  assert.equal(out[0].severity, 'critical');
  assert.equal(out[0].subjectRef, 'a');
  assert.equal(out[0].dueDate, '2026-06-10');
});

test('collectLowStock requires a min threshold (a supply with no min is never low)', () => {
  const out = computeAttention(ctx({
    supplies: [
      { _docId: 's1', description: 'Cups', quantity: 2, minQuantity: 5 },   // low
      { _docId: 's2', description: 'Plates', quantity: 9, minQuantity: 5 },  // ok
      { _docId: 's3', description: 'Napkins', quantity: 0, minQuantity: null }, // no threshold → NOT low
    ],
  }), { kinds: ['low_stock'] });
  assert.equal(out.length, 1);
  assert.equal(out[0].subjectRef, 's1');
  assert.equal(out[0].severity, 'warning');
});

test('collectWarranty: expired → critical, expiring-soon → warning, disposed ignored', () => {
  const out = computeAttention(ctx({
    items: [
      { _docId: 'w1', status: 'Available', warrantyExpiry: '2026-06-01', description: 'Mixer' },  // expired
      { _docId: 'w2', status: 'Available', warrantyExpiry: '2026-07-01', description: 'Amp' },     // soon (<30d)
      { _docId: 'w3', status: 'Available', warrantyExpiry: '2026-12-01', description: 'Piano' },   // far
      { _docId: 'w4', status: 'Disposed', warrantyExpiry: '2026-06-01', description: 'Old PC' },   // disposed
    ],
  }), { kinds: ['warranty_expiring'] });
  const byId = Object.fromEntries(out.map(o => [o.subjectRef, o]));
  assert.equal(out.length, 2);
  assert.equal(byId.w1.severity, 'critical');
  assert.equal(byId.w2.severity, 'warning');
});

test('collectWork hub-gates per type and respects status + due window', () => {
  const workItems = [
    { _docId: 't1', type: 'task', status: 'In Progress', dueDate: '2026-06-10', name: 'Bulletin' },   // overdue task
    { _docId: 't2', type: 'task', status: 'Complete', dueDate: '2026-06-10', name: 'Done' },           // complete → skip
    { _docId: 'm1', type: 'maintenance', status: 'Backlog', dueDate: '2026-06-20', name: 'HVAC' },     // due-soon maint
    { _docId: 't3', type: 'task', status: 'Backlog', dueDate: '2026-08-01', name: 'Far' },             // beyond window
  ];
  const all = collectWork(ctx({ workItems }));
  const byId = Object.fromEntries(all.map(o => [o.subjectRef, o]));
  assert.equal(all.length, 2);
  assert.equal(byId.t1.severity, 'critical');   // overdue
  assert.equal(byId.m1.severity, 'warning');     // due soon

  // tasks hub off → only the maintenance item survives
  const maintOnly = collectWork(ctx({ workItems, hasHub: (h) => h === 'maintenance' }));
  assert.equal(maintOnly.length, 1);
  assert.equal(maintOnly[0].subjectRef, 'm1');
});

test('collectCompliance shares F2 windows: expired/≤7d critical, ≤30d warning, >90d-ago dropped', () => {
  const accessRecords = [
    { _docId: 'r1', personId: 'p1', personName: 'Ann', type: 'background_check', expiryDate: '2026-06-10' }, // expired (within lookback) → critical
    { _docId: 'r2', personId: 'p2', personName: 'Bob', type: 'certification', expiryDate: '2026-06-20' },    // ≤7d → critical
    { _docId: 'r3', personId: 'p3', personName: 'Cy', type: 'certification', expiryDate: '2026-07-10' },     // ≤30d → warning
    { _docId: 'r4', personId: 'p4', personName: 'Di', type: 'certification', expiryDate: '2026-12-01' },     // far → none
    { _docId: 'r5', personId: 'p5', personName: 'Ed', type: 'key_assignment', expiryDate: '2026-01-01' },    // long expired (>90d) → dropped
  ];
  const out = collectCompliance(ctx({ accessRecords }));
  const byId = Object.fromEntries(out.map(o => [o.subjectRef, o]));
  assert.equal(out.length, 3);
  assert.equal(byId.p1.severity, 'critical');
  assert.equal(byId.p2.severity, 'critical');
  assert.equal(byId.p3.severity, 'warning');

  // hub off → nothing
  assert.equal(collectCompliance(ctx({ accessRecords, hasHub: noHubs })).length, 0);
});

test('collectShifts flags only open, future, understaffed jobs (Jobs hub)', () => {
  const jobListings = [
    { _docId: 'j1', status: 'open', scheduledDate: '2026-06-20', title: 'Greeter', signupCount: 1, spotsTotal: 3 }, // unfilled
    { _docId: 'j2', status: 'open', scheduledDate: '2026-06-20', title: 'Usher', signupCount: 2, spotsTotal: 2 },   // full
    { _docId: 'j3', status: 'open', scheduledDate: '2026-06-01', title: 'Past', signupCount: 0, spotsTotal: 2 },    // past
  ];
  const out = computeAttention(ctx({ jobListings }), { kinds: ['shift_unfilled'] });
  assert.equal(out.length, 1);
  assert.equal(out[0].subjectRef, 'j1');
  assert.equal(out[0].count, 2); // spots remaining
});

test('collectContractor flags approved-but-unpaid entries (People Access hub)', () => {
  const timeEntries = [
    { _docId: 'e1', status: 'approved', personName: 'Joe', cost: 120.5, date: '2026-06-12' }, // outstanding
    { _docId: 'e2', status: 'paid', personName: 'Joe', cost: 80, date: '2026-06-01' },         // paid → skip
    { _docId: 'e3', status: 'scheduled', personName: 'Sue', cost: 0, date: '2026-06-25' },     // scheduled → skip
  ];
  const out = computeAttention(ctx({ timeEntries }), { kinds: ['contractor_outstanding'] });
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 120.5);
});

test('computeAttention sorts critical → warning → info, then by dueDate', () => {
  const out = computeAttention(ctx({
    reservations: [{ _docId: 'rv', status: 'Pending', itemDesc: 'Van', eventDate: '2026-06-19' }], // info
    items: [{ _docId: 'i1', status: 'Checked Out', expectedReturn: '2026-06-10', description: 'Drill' }], // critical
    supplies: [{ _docId: 's1', description: 'Cups', quantity: 1, minQuantity: 5 }], // warning
  }));
  assert.deepEqual(out.map(o => o.severity), ['critical', 'warning', 'info']);
});

test('inactive hubs contribute nothing; base inventory still does', () => {
  const out = computeAttention(ctx({
    hasHub: noHubs,
    supplies: [{ _docId: 's1', description: 'Cups', quantity: 1, minQuantity: 5 }],     // base → shows
    workItems: [{ _docId: 't1', type: 'task', status: 'Backlog', dueDate: '2026-06-10', name: 'X' }], // gated → hidden
    accessRecords: [{ _docId: 'r1', personId: 'p1', type: 'cert', expiryDate: '2026-06-18' }],        // gated → hidden
  }));
  assert.deepEqual(out.map(o => o.kind), ['low_stock']);
});

test('summarizeAttention groups by kind with severity counts', () => {
  const items = computeAttention(ctx({
    items: [
      { _docId: 'i1', status: 'Checked Out', expectedReturn: '2026-06-10', description: 'A' },
      { _docId: 'i2', status: 'Checked Out', expectedReturn: '2026-06-11', description: 'B' },
    ],
  }));
  const sum = summarizeAttention(items);
  assert.equal(sum.item_overdue.count, 2);
  assert.equal(sum.item_overdue.critical, 2);
});

test('every emitted kind is a declared ATTENTION_KIND', () => {
  const out = computeAttention(ctx({
    items: [
      { _docId: 'i1', status: 'Checked Out', expectedReturn: '2026-06-10', description: 'A' },
      { _docId: 'w1', status: 'Available', warrantyExpiry: '2026-06-01', description: 'B' },
    ],
    supplies: [{ _docId: 's1', description: 'Cups', quantity: 1, minQuantity: 5 }],
    reservations: [{ _docId: 'rv', status: 'Pending', itemDesc: 'Van' }],
    workItems: [{ _docId: 't1', type: 'task', status: 'Backlog', dueDate: '2026-06-18', name: 'X' }],
    accessRecords: [{ _docId: 'r1', personId: 'p1', type: 'cert', expiryDate: '2026-06-18' }],
    jobListings: [{ _docId: 'j1', status: 'open', scheduledDate: '2026-06-20', signupCount: 0, spotsTotal: 2 }],
    timeEntries: [{ _docId: 'e1', status: 'approved', cost: 10, date: '2026-06-12' }],
  }));
  for (const it of out) assert.ok(ATTENTION_KINDS.includes(it.kind), `unknown kind ${it.kind}`);
});

// ── CLIENT ≡ SERVER parity (Phase C) ─────────────────────────────────────────

test('PARITY — server inlined thresholds equal the shared JSON', () => {
  assert.deepEqual(serverAttention.THRESHOLDS, sharedThresholds);
});

test('PARITY — server cert windows equal F2 people.js EXPIRY_* (no forked numbers)', () => {
  assert.equal(serverAttention.EXPIRY_CRITICAL_DAYS, EXPIRY_CRITICAL_DAYS);
  assert.equal(serverAttention.EXPIRY_WARNING_DAYS, EXPIRY_WARNING_DAYS);
});

test('PARITY — client and server computeAttention agree across a fixture battery', () => {
  const statuses = ['Available', 'Checked Out', 'In Use', 'Disposed', 'Under Repair'];
  const resStatuses = ['Pending', 'Approved', 'Denied', 'Returned', 'Cancelled'];
  const teStatuses = ['scheduled', 'approved', 'paid', 'logged'];
  const dates = ['2026-06-01', '2026-06-17', '2026-06-18', '2026-06-25', '2026-07-15', '2026-03-01', null];
  const mins = [0, 3, 5, null, undefined];
  const types = ['task', 'maintenance'];
  const workStatuses = ['Backlog', 'In Progress', 'Complete', 'Cancelled', 'On Hold'];
  const hubSets = [
    () => true,
    () => false,
    (h) => h === 'tasks',
    (h) => h === 'maintenance',
    (h) => h === 'people_access',
    (h) => h === 'jobs',
    (h) => h !== 'people_access',
  ];
  const TODAY = '2026-06-18';

  for (let t = 0; t < 1500; t++) {
    const n = 1 + (t % 5);
    const ctx = {
      todayStr: TODAY,
      hasHub: hubSets[t % hubSets.length],
      items: Array.from({ length: n }, (_, i) => ({
        _docId: `i${i}`, status: statuses[(t + i) % statuses.length],
        expectedReturn: dates[(t * 2 + i) % dates.length],
        warrantyExpiry: dates[(t * 3 + i) % dates.length], description: `Item${i}`,
      })),
      supplies: Array.from({ length: n }, (_, i) => ({
        _docId: `s${i}`, quantity: (t + i) % 9, minQuantity: mins[(t + i) % mins.length], description: `Sup${i}`,
      })),
      reservations: Array.from({ length: n }, (_, i) => ({
        _docId: `r${i}`, status: resStatuses[(t + i) % resStatuses.length], itemDesc: `Res${i}`, eventDate: dates[(t + i) % dates.length],
      })),
      workItems: Array.from({ length: n }, (_, i) => ({
        _docId: `w${i}`, type: types[(t + i) % types.length], status: workStatuses[(t + i) % workStatuses.length],
        dueDate: dates[(t * 2 + i) % dates.length], name: `Work${i}`,
      })),
      accessRecords: Array.from({ length: n }, (_, i) => ({
        _docId: `ar${i}`, personId: `p${i}`, personName: `Person${i}`, type: 'certification',
        expiryDate: dates[(t * 4 + i) % dates.length],
      })),
      jobListings: Array.from({ length: n }, (_, i) => ({
        _docId: `j${i}`, status: i % 2 ? 'open' : 'completed', scheduledDate: dates[(t + i) % dates.length],
        signupCount: (t + i) % 4, spotsTotal: 1 + ((t + i) % 4), title: `Job${i}`,
      })),
      timeEntries: Array.from({ length: n }, (_, i) => ({
        _docId: `e${i}`, status: teStatuses[(t + i) % teStatuses.length], cost: (t + i) * 1.5, date: dates[(t + i) % dates.length], personName: `Con${i}`,
      })),
    };
    assert.deepEqual(serverAttention.computeAttention(ctx), computeAttention(ctx), `mismatch at fixture ${t}`);
  }
});

// ── buildDigestSignals ≡ legacy gatherAttentionSignals (Phase C) ─────────────
// Verbatim copy of the pre-F4 grouped-signal logic from functions/index.js
// gatherAttentionSignals. The differential test below proves the new collector-
// backed buildDigestSignals produces a byte-identical `signals` object, so the
// Claude prompt input (and therefore the AI digest + email) does not change.
function legacyBuildDigestSignals(data, todayStr) {
  const { taskData, maintData, recordsData, suppliesData, itemsData, jobsData, timeData, has } = data;
  const in7 = ymdAddDays(todayStr, 7);
  const in30 = ymdAddDays(todayStr, 30);
  const floor90 = ymdAddDays(todayStr, -90);
  const sig = {};
  if (has('tasks')) {
    const open = taskData.filter(t => t.dueDate && t.status !== 'Complete' && t.status !== 'Cancelled' && t.dueDate <= in7);
    if (open.length) sig.tasks = {
      overdue: open.filter(t => t.dueDate < todayStr).length,
      dueThisWeek: open.filter(t => t.dueDate >= todayStr).length,
      examples: open.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 5).map(t => `${t.name || 'Task'} (due ${t.dueDate}${t.dueDate < todayStr ? ', OVERDUE' : ''})`),
    };
  }
  if (has('maintenance')) {
    const open = maintData.filter(t => t.dueDate && t.status !== 'Complete' && t.status !== 'Cancelled' && t.dueDate <= in7);
    if (open.length) sig.maintenance = {
      overdue: open.filter(t => t.dueDate < todayStr).length,
      dueThisWeek: open.filter(t => t.dueDate >= todayStr).length,
      examples: open.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 5).map(t => `${t.name || 'Ticket'} (due ${t.dueDate}${t.dueDate < todayStr ? ', OVERDUE' : ''})`),
    };
  }
  if (has('people_access')) {
    const recs = recordsData.filter(r => r.expiryDate && r.expiryDate >= floor90 && r.expiryDate <= in30);
    if (recs.length) sig.compliance = {
      expired: recs.filter(r => r.expiryDate < todayStr).length,
      expiringSoon: recs.filter(r => r.expiryDate >= todayStr).length,
      examples: recs.sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '')).slice(0, 5).map(r => `${r.personName || 'Someone'} — ${r.type || 'record'} ${r.expiryDate < todayStr ? 'EXPIRED' : 'expires'} ${r.expiryDate}`),
    };
  }
  const lowSupplies = suppliesData.filter(s => s.minQuantity != null && Number(s.quantity) <= Number(s.minQuantity));
  const warrantyItems = itemsData.filter(i => i.warrantyExpiry && i.status !== 'Disposed' && i.warrantyExpiry <= in30);
  if (lowSupplies.length || warrantyItems.length) sig.inventory = {
    lowStock: lowSupplies.length,
    warrantyExpiring: warrantyItems.length,
    examples: [
      ...lowSupplies.slice(0, 4).map(s => `${s.description} low (${s.quantity}${s.unit ? ' ' + s.unit : ''} left)`),
      ...warrantyItems.slice(0, 3).map(i => `${i.description} warranty ${i.warrantyExpiry < todayStr ? 'EXPIRED' : 'expires'} ${i.warrantyExpiry}`),
    ],
  };
  if (has('jobs')) {
    const unfilled = jobsData.filter(j => j.status === 'open' && (Number(j.signupCount) || 0) < (Number(j.spotsTotal) || 1));
    if (unfilled.length) sig.shifts = {
      unfilled: unfilled.length,
      examples: unfilled.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '')).slice(0, 5).map(j => `${j.title || 'Shift'} ${j.scheduledDate} — ${(Number(j.signupCount) || 0)}/${j.spotsTotal || 1} filled`),
    };
  }
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

test('DIGEST PARITY — buildDigestSignals byte-identical to legacy gatherAttentionSignals', () => {
  const TODAY = '2026-06-18';
  const workStatuses = ['Backlog', 'In Progress', 'Complete', 'Cancelled', 'On Hold'];
  const dates = ['2026-06-01', '2026-06-17', '2026-06-18', '2026-06-25', '2026-07-15', '2026-03-01', null];
  const mins = [0, 3, 5, null, undefined];
  const units = ['', 'boxes', 'lbs', undefined];
  const teStatuses = ['scheduled', 'approved', 'paid', 'logged'];
  const hubSets = [() => true, () => false, (h) => h === 'tasks', (h) => h === 'maintenance',
    (h) => h === 'people_access', (h) => h === 'jobs', (h) => h !== 'people_access', (h) => h === 'tasks' || h === 'jobs'];

  for (let t = 0; t < 2000; t++) {
    const n = t % 7; // include n=0 (empty) cases
    const has = hubSets[t % hubSets.length];
    const data = {
      has,
      taskData: Array.from({ length: n }, (_, i) => ({ _docId: `t${i}`, type: 'task', name: `Task${i}`, status: workStatuses[(t + i) % workStatuses.length], dueDate: dates[(t * 2 + i) % dates.length] })),
      maintData: Array.from({ length: n }, (_, i) => ({ _docId: `m${i}`, type: 'maintenance', name: `Tk${i}`, status: workStatuses[(t + i) % workStatuses.length], dueDate: dates[(t * 3 + i) % dates.length] })),
      recordsData: Array.from({ length: n }, (_, i) => ({ _docId: `ar${i}`, personId: `p${i}`, personName: `Per${i}`, type: 'certification', expiryDate: dates[(t * 4 + i) % dates.length] })),
      suppliesData: Array.from({ length: n }, (_, i) => ({ _docId: `s${i}`, description: `Sup${i}`, quantity: (t + i) % 9, minQuantity: mins[(t + i) % mins.length], unit: units[(t + i) % units.length] })),
      itemsData: Array.from({ length: n }, (_, i) => ({ _docId: `it${i}`, description: `Itm${i}`, status: i % 4 === 0 ? 'Disposed' : 'Available', warrantyExpiry: dates[(t * 5 + i) % dates.length] })),
      // jobsData is future-only by query contract (where scheduledDate >= today)
      jobsData: Array.from({ length: n }, (_, i) => ({ _docId: `j${i}`, title: `Job${i}`, status: i % 2 ? 'open' : 'completed', scheduledDate: ['2026-06-18', '2026-06-25', '2026-07-15'][(t + i) % 3], signupCount: (t + i) % 4, spotsTotal: 1 + ((t + i) % 4) })),
      timeData: Array.from({ length: n }, (_, i) => ({ _docId: `e${i}`, status: teStatuses[(t + i) % teStatuses.length], cost: (t + i) * 1.25, hours: (t + i) % 6, estHours: i % 2 ? (i + 1) : undefined, date: dates[(t + i) % dates.length], personName: `Con${i}` })),
    };
    assert.deepEqual(serverAttention.buildDigestSignals(data, TODAY), legacyBuildDigestSignals(data, TODAY), `digest signals mismatch at fixture ${t}`);
  }
});
