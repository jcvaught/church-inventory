// Foundation F4 — Attention engine unit tests. Runs under `npm run test:unit`
// (node --test, no emulator). Imports the PURE src/lib/attention.js directly
// (root package.json is type:module, so node loads the .js as ESM).
//
// Phase A: exercises every client collector + computeAttention ordering/gating.
// The CLIENT≡SERVER parity suite (pinning functions/lib/attention.cjs to these
// same fixtures) is added in Phase C alongside the server twin — same pattern as
// the F2 people-resolver parity test.

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
