// Foundation F5 calendar-dedup — the shared month-grid + windowing logic that
// BoardCalendar (Tasks/Maintenance) and JobCalendar (Jobs) now both consume.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthMatrix, windowGroups } from '../../src/utils/calendarGrid.js';

test('monthMatrix — full weeks, Sunday-aligned, correct current-month span', () => {
  const days = monthMatrix(2026, 6); // July 2026 (month index 6)
  assert.equal(days.length % 7, 0);
  assert.equal(days[0].date.getDay(), 0); // first cell is a Sunday
  const current = days.filter(d => d.isCurrentMonth);
  assert.equal(current.length, 31);
  assert.equal(current[0].date.getDate(), 1);
  assert.equal(current[current.length - 1].date.getDate(), 31);
});

test('monthMatrix — Feb leap vs non-leap', () => {
  assert.equal(monthMatrix(2024, 1).filter(d => d.isCurrentMonth).length, 29);
  assert.equal(monthMatrix(2026, 1).filter(d => d.isCurrentMonth).length, 28);
});

test('windowGroups — buckets by date relative to now, with injectable overdue', () => {
  const now = new Date(2026, 6, 10); // 2026-07-10; week→07-17, month→08-09
  const items = [
    { d: '2026-07-05', open: true },   // past + open → Overdue
    { d: '2026-07-08', open: false },  // past + not open → dropped (not overdue, before today)
    { d: '2026-07-10', open: true },   // today → This Week
    { d: '2026-07-15', open: true },   // within 7 → This Week
    { d: '2026-07-30', open: true },   // within 30 → Next 30 Days
    { d: '2026-09-01', open: true },   // beyond → Later
    { d: null, open: true },           // undatable → dropped
  ];
  const groups = windowGroups(items, { dateOf: i => i.d, todayStr: '2026-07-10', now, isOverdue: i => i.open });
  const by = Object.fromEntries(groups.map(g => [g.label, g.items.map(i => i.d)]));
  assert.deepEqual(by['Overdue'], ['2026-07-05']);
  assert.deepEqual(by['This Week'], ['2026-07-10', '2026-07-15']);
  assert.deepEqual(by['Next 30 Days'], ['2026-07-30']);
  assert.deepEqual(by['Later'], ['2026-09-01']);
});

test('windowGroups — sorts within a bucket ascending', () => {
  const now = new Date(2026, 6, 1);
  const items = [{ d: '2026-07-20' }, { d: '2026-07-10' }, { d: '2026-07-15' }];
  const later = windowGroups(items, { dateOf: i => i.d, todayStr: '2026-07-01', now, isOverdue: () => false })
    .find(g => g.label === 'Next 30 Days');
  assert.deepEqual(later.items.map(i => i.d), ['2026-07-10', '2026-07-15', '2026-07-20']);
});
