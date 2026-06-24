// Foundation F5 — Scheduled-Occurrences feed. Tests the canonical Occurrence
// adapters + getOccurrences aggregator, and asserts the new Occurrence→VEVENT
// mapping reproduces the LEGACY per-type ICS builders (functions/lib/ics.js)
// byte-for-byte — the no-regression gate for the calendar feed. Run: npm run test:unit
//
// (The client≡server twin-parity assertions are added in Phase B once
// functions/lib/occurrences.js exists.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  reservationsToOccurrences, shiftsToOccurrences, maintenanceToOccurrences,
  tasksToOccurrences, getOccurrences, occurrenceToVEvent, buildCalendar,
} from '../../src/lib/occurrences.js';

const require = createRequire(import.meta.url);
const legacy = require('../lib/ics.js');
const server = require('../lib/occurrences.js'); // CJS twin

// ── Fixtures (non-terminal status; terminal-skip covered separately) ────────

const JOBS = [
  { _docId: 'j1', jobNumber: 'JOB-1', title: 'Setup', scheduledDate: '2026-07-01', scheduledTime: '09:00', scheduledEndTime: '11:00', location: 'Gym', description: 'Bring tables', signupCount: 2, spotsTotal: 5, pay: 20, status: 'open' },
  { _docId: 'j2', title: 'Teardown', scheduledDate: '2026-07-02', scheduledTime: '14:00', signupCount: 0, spotsTotal: 3, status: 'open' }, // timed, no end → +1h
  { _docId: 'j3', title: 'Late', scheduledDate: '2026-07-03', scheduledTime: '23:30', signupCount: 1, spotsTotal: 2, status: 'open' }, // +1h crosses midnight
  { _docId: 'j4', title: 'All Day', scheduledDate: '2026-07-04', signupCount: 0, spotsTotal: 1, status: 'open' }, // no time → all-day
  { _docId: 'j5', scheduledDate: '2026-07-05', scheduledTime: 'garbage', signupCount: 0, spotsTotal: 1, status: 'open' }, // unparseable time → all-day, no title → 'Shift'
  { _docId: 'j6', title: 'Bad End', scheduledDate: '2026-07-06', scheduledTime: '10:00', scheduledEndTime: '09:00', signupCount: 0, spotsTotal: 1, status: 'open' }, // end <= start → +1h
];

const RESERVATIONS = [
  { _docId: 'r1', eventName: 'Wedding', purpose: 'Wedding', returnDate: '2026-07-10', ministry: 'Facilities', status: 'approved', roomName: 'Sanctuary', location: 'x' }, // purpose==name → omitted
  { _docId: 'r2', eventName: 'Meeting', purpose: 'Board sync', status: 'pending', location: 'Room 5' }, // no returnDate → end=eventDate-ish; purpose kept
  { _docId: 'r3', purpose: 'Cleanup', eventDate: '2026-07-12' }, // no eventName → title=purpose
];
RESERVATIONS[0].eventDate = '2026-07-09';
RESERVATIONS[1].eventDate = '2026-07-11';

const MAINTENANCE = [
  { _docId: 'm1', ticketNumber: 'MNT-1', name: 'Fix HVAC', dueDate: '2026-07-15', description: 'Filter', priority: 'High', status: 'Open' },
  { _docId: 'm2', dueDate: '2026-07-16', status: 'In Progress' }, // no name → 'Maintenance', no desc-parts except status
];

const TASKS = [
  { _docId: 't1', taskNumber: 'TSK-1', name: 'Plan', dueDate: '2026-07-20', description: 'Outline', priority: 'High', status: 'To Do' },
  { _docId: 't2', name: 'Low one', dueDate: '2026-07-21', priority: 'Low', status: 'To Do' },
  { _docId: 't3', name: 'Med default', dueDate: '2026-07-22', status: 'Done' }, // completed but has dueDate → NOT skipped
];

// ── Byte-parity: Occurrence→VEVENT ≡ legacy per-type builders ────────────────

test('shift VEVENT byte-parity vs legacy jobEventLines', () => {
  for (const job of JOBS) {
    const [occ] = shiftsToOccurrences([job]); // default includePay:false matches the server feed builder
    assert.deepEqual(occurrenceToVEvent(occ), legacy.jobEventLines(job), `job ${job._docId}`);
  }
});

test('reservation VEVENT byte-parity vs legacy reservationEventLines', () => {
  for (const r of RESERVATIONS) {
    const [occ] = reservationsToOccurrences([r]);
    assert.deepEqual(occurrenceToVEvent(occ), legacy.reservationEventLines(r), `res ${r._docId}`);
  }
});

test('maintenance VEVENT byte-parity vs legacy maintenanceEventLines', () => {
  for (const t of MAINTENANCE) {
    const [occ] = maintenanceToOccurrences([t]);
    assert.deepEqual(occurrenceToVEvent(occ), legacy.maintenanceEventLines(t), `mnt ${t._docId}`);
  }
});

test('task VEVENT matches the legacy client export shape (all-day, PRIORITY, tasks UID)', () => {
  const [occ] = tasksToOccurrences([TASKS[0]]);
  assert.deepEqual(occurrenceToVEvent(occ), [
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260720',
    'DTEND;VALUE=DATE:20260721',
    'SUMMARY:Plan',
    'DESCRIPTION:Outline',
    'PRIORITY:1',
    'UID:TSK-1@churchopshub-tasks',
    'END:VEVENT',
  ]);
  // priority mapping
  assert.equal(tasksToOccurrences([TASKS[1]])[0].priority, 9); // Low
  assert.equal(tasksToOccurrences([TASKS[2]])[0].priority, 5); // default
});

test('buildCalendar (feed) ≡ legacy buildCalendar over the same events', () => {
  const occs = [
    ...shiftsToOccurrences(JOBS),
    ...reservationsToOccurrences(RESERVATIONS),
    ...maintenanceToOccurrences(MAINTENANCE),
  ];
  const legacyBlocks = [
    ...JOBS.map(legacy.jobEventLines),
    ...RESERVATIONS.map(legacy.reservationEventLines),
    ...MAINTENANCE.map(legacy.maintenanceEventLines),
  ];
  assert.equal(buildCalendar('FXCC — Calendar', occs), legacy.buildCalendar('FXCC — Calendar', legacyBlocks));
});

// ── Adapter behavior ─────────────────────────────────────────────────────────

test('adapters apply the legacy terminal-status skips', () => {
  assert.equal(shiftsToOccurrences([{ _docId: 'x', scheduledDate: '2026-07-01', status: 'cancelled' }]).length, 0);
  assert.equal(reservationsToOccurrences([{ _docId: 'x', eventDate: '2026-07-01', status: 'denied' }]).length, 0);
  assert.equal(maintenanceToOccurrences([{ _docId: 'x', dueDate: '2026-07-01', status: 'Complete' }]).length, 0);
  assert.equal(maintenanceToOccurrences([{ _docId: 'x', dueDate: '2026-07-01', status: 'Cancelled' }]).length, 0);
  // tasks skip nothing — a completed task with a due date still produces an occurrence
  assert.equal(tasksToOccurrences([{ _docId: 'x', name: 'done', dueDate: '2026-07-01', status: 'Done' }]).length, 1);
});

test('adapters drop undatable records', () => {
  assert.equal(shiftsToOccurrences([{ _docId: 'x', status: 'open' }]).length, 0); // no scheduledDate
  assert.equal(reservationsToOccurrences([{ _docId: 'x' }]).length, 0); // no eventDate
  assert.equal(maintenanceToOccurrences([{ _docId: 'x', status: 'Open' }]).length, 0); // no dueDate
  assert.equal(tasksToOccurrences([{ _docId: 'x', name: 'n' }]).length, 0); // no dueDate
});

test('reservation end falls back to eventDate when no returnDate', () => {
  const [occ] = reservationsToOccurrences([{ _docId: 'r', eventDate: '2026-07-11', status: 'approved' }]);
  assert.equal(occ.end, null);
  // VEVENT all-day DTEND = addOneDay(eventDate)
  assert.deepEqual(occurrenceToVEvent(occ).filter(l => l.startsWith('DTEND')), ['DTEND;VALUE=DATE:20260712']);
});

// ── Timed room bookings (room-calendar Phase 0) ──────────────────────────────
// NB: these are kept OUT of the shared RESERVATIONS fixture on purpose — the
// legacy ics.js builder only knows all-day reservations, so a timed fixture
// would fail the byte-parity assertions above. The pipeline below is new.

test('single-day reservation with startTime is a timed occurrence', () => {
  const [occ] = reservationsToOccurrences([{ _docId: 'rt', eventName: 'Fellowship lunch', eventDate: '2026-07-12', startTime: '12:00', endTime: '14:00', roomName: 'Fellowship Hall', status: 'approved' }]);
  assert.equal(occ.allDay, false);
  assert.equal(occ.startTime, '12:00');
  assert.equal(occ.endTime, '14:00');
  // Timed VEVENT carries DTSTART/DTEND with the clock times (reuses timeToICS).
  const v = occurrenceToVEvent(occ);
  assert.ok(v.includes('DTSTART:20260712T120000'), v.join('\n'));
  assert.ok(v.includes('DTEND:20260712T140000'), v.join('\n'));
});

test('reservation with startTime but no endTime defaults to +1h', () => {
  const [occ] = reservationsToOccurrences([{ _docId: 'rt2', eventName: 'Prayer', eventDate: '2026-07-13', startTime: '06:00', status: 'approved' }]);
  assert.equal(occ.allDay, false);
  assert.equal(occ.endTime, null);
  assert.ok(occurrenceToVEvent(occ).includes('DTEND:20260713T070000'));
});

test('multi-day reservation with startTime stays all-day (span)', () => {
  // eventDate < returnDate ⇒ a span (camp/lock-in); times are ignored.
  const [occ] = reservationsToOccurrences([{ _docId: 'rspan', eventName: 'Youth lock-in', eventDate: '2026-07-18', returnDate: '2026-07-19', startTime: '20:00', endTime: '08:00', status: 'approved' }]);
  assert.equal(occ.allDay, true);
  assert.equal(occ.startTime, null);
  assert.deepEqual(occurrenceToVEvent(occ).filter(l => l.startsWith('DTSTART')), ['DTSTART;VALUE=DATE:20260718']);
});

test('timed reservation: client ≡ server twin', () => {
  const r = { _docId: 'rtwin', eventName: 'Setup', eventDate: '2026-07-12', startTime: '08:30', endTime: '09:30', roomName: 'Gym', status: 'approved' };
  assert.deepEqual(server.reservationsToOccurrences([r]), reservationsToOccurrences([r]));
  assert.deepEqual(
    server.occurrenceToVEvent(server.reservationsToOccurrences([r])[0]),
    occurrenceToVEvent(reservationsToOccurrences([r])[0]),
  );
});

test('client Pay line is opt-in (includePay)', () => {
  const job = JOBS[0];
  assert.ok(!shiftsToOccurrences([job])[0].description.includes('Pay:'));
  assert.ok(shiftsToOccurrences([job], { includePay: true })[0].description.includes('Pay: $20.00/person'));
});

// ── getOccurrences aggregator ────────────────────────────────────────────────

test('getOccurrences aggregates all sources from ctx', () => {
  const ctx = { reservations: RESERVATIONS, jobListings: JOBS, tasks: TASKS, maintenance: MAINTENANCE };
  const all = getOccurrences(ctx);
  const counts = all.reduce((m, o) => ({ ...m, [o.sourceType]: (m[o.sourceType] || 0) + 1 }), {});
  assert.deepEqual(counts, { shift: JOBS.length, reservation: RESERVATIONS.length, maintenance_due: MAINTENANCE.length, work: TASKS.length });
});

test('getOccurrences honors sourceTypes + range filters', () => {
  const ctx = { reservations: RESERVATIONS, jobListings: JOBS, tasks: TASKS, maintenance: MAINTENANCE };
  assert.ok(getOccurrences(ctx, { sourceTypes: ['shift'] }).every(o => o.sourceType === 'shift'));
  const julyFirstWeek = getOccurrences(ctx, { range: { start: '2026-07-01', end: '2026-07-06' } });
  assert.ok(julyFirstWeek.every(o => o.start >= '2026-07-01' && o.start <= '2026-07-06'));
  assert.ok(julyFirstWeek.length > 0 && julyFirstWeek.length < JOBS.length + RESERVATIONS.length + TASKS.length + MAINTENANCE.length);
});

test('Occurrence ids are stable and unique per source doc', () => {
  const all = getOccurrences({ jobListings: JOBS, reservations: RESERVATIONS, tasks: TASKS, maintenance: MAINTENANCE });
  const ids = all.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('shift:j1') && ids.includes('reservation:r1') && ids.includes('work:t1') && ids.includes('maintenance_due:m1'));
});

// ── TWIN PARITY — client (src/lib) ≡ server (functions/lib) ──────────────────

test('TWIN PARITY — adapters + getOccurrences + VEVENT agree exactly', () => {
  const ctx = { reservations: RESERVATIONS, jobListings: JOBS, tasks: TASKS, maintenance: MAINTENANCE };
  // getOccurrences output identical (incl. includePay variants)
  assert.deepEqual(server.getOccurrences(ctx), getOccurrences(ctx));
  assert.deepEqual(server.getOccurrences(ctx, { includePay: true }), getOccurrences(ctx, { includePay: true }));
  assert.deepEqual(
    server.getOccurrences(ctx, { sourceTypes: ['shift', 'work'], range: { start: '2026-07-01', end: '2026-07-21' } }),
    getOccurrences(ctx, { sourceTypes: ['shift', 'work'], range: { start: '2026-07-01', end: '2026-07-21' } }),
  );
  // VEVENT + full-calendar byte-identical across both twins
  const occs = getOccurrences(ctx, { includePay: true });
  for (const o of occs) {
    assert.deepEqual(server.occurrenceToVEvent(o), occurrenceToVEvent(o), `VEVENT mismatch for ${o.id}`);
  }
  assert.equal(server.buildCalendar('FXCC — Calendar', occs), buildCalendar('FXCC — Calendar', occs));
});

test('TWIN PARITY — server twin also matches the legacy ics.js builders', () => {
  for (const job of JOBS) assert.deepEqual(server.occurrenceToVEvent(server.shiftsToOccurrences([job])[0]), legacy.jobEventLines(job));
  for (const r of RESERVATIONS) assert.deepEqual(server.occurrenceToVEvent(server.reservationsToOccurrences([r])[0]), legacy.reservationEventLines(r));
  for (const t of MAINTENANCE) assert.deepEqual(server.occurrenceToVEvent(server.maintenanceToOccurrences([t])[0]), legacy.maintenanceEventLines(t));
});
