// Pure unit tests for the time-aware room-conflict engine (room-calendar Phase 1).
// Runs under `npm run test:unit` (node --test, no emulator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesOf, isAllDay, effectiveWindow, datesOverlap, reservationsCollide, findRoomConflict, roomUnavailability, seriesCancelTargets,
} from '../../src/utils/reservationConflict.js';

const room = (over) => ({ roomDocId: 'R1', status: 'Approved', eventDate: '2026-07-12', ...over });

test('minutesOf parses HH:MM, rejects garbage', () => {
  assert.equal(minutesOf('00:00'), 0);
  assert.equal(minutesOf('12:30'), 750);
  assert.equal(minutesOf('23:59'), 1439);
  assert.equal(minutesOf(''), null);
  assert.equal(minutesOf('9am'), null);
  assert.equal(minutesOf('24:00'), null);
  assert.equal(minutesOf('10:75'), null);
});

test('isAllDay: no startTime, or multi-day span', () => {
  assert.equal(isAllDay(room({})), true);                                   // no time
  assert.equal(isAllDay(room({ startTime: '09:00' })), false);              // single-day timed
  assert.equal(isAllDay(room({ startTime: '09:00', returnDate: '2026-07-12' })), false); // same-day returnDate
  assert.equal(isAllDay(room({ startTime: '20:00', returnDate: '2026-07-13' })), true);  // multi-day span
});

test('effectiveWindow applies buffers + +1h default end', () => {
  assert.deepEqual(effectiveWindow(room({ startTime: '09:00', endTime: '10:30' })), { start: 540, end: 630 });
  assert.deepEqual(effectiveWindow(room({ startTime: '09:00' })), { start: 540, end: 600 });           // +1h
  assert.deepEqual(effectiveWindow(room({ startTime: '09:00', endTime: '08:00' })), { start: 540, end: 600 }); // end<=start → +1h
  assert.deepEqual(effectiveWindow(room({ startTime: '09:00', endTime: '10:00', setupMinutes: 30, teardownMinutes: 15 })), { start: 510, end: 615 });
  assert.equal(effectiveWindow(room({})), null);                            // all-day
});

test('datesOverlap inclusive on spans', () => {
  assert.equal(datesOverlap({ eventDate: '2026-07-10', returnDate: '2026-07-12' }, { eventDate: '2026-07-12' }), true);
  assert.equal(datesOverlap({ eventDate: '2026-07-10' }, { eventDate: '2026-07-11' }), false);
});

test('two all-day bookings on the same day collide', () => {
  assert.equal(reservationsCollide(room({}), room({})), true);
});

test('all-day vs timed on the same day collide (all-day blocks the room)', () => {
  assert.equal(reservationsCollide(room({}), room({ startTime: '09:00', endTime: '10:00' })), true);
});

test('timed bookings: overlap collides, adjacent does not', () => {
  const a = room({ startTime: '09:00', endTime: '11:00' });
  assert.equal(reservationsCollide(a, room({ startTime: '10:00', endTime: '12:00' })), true);  // overlap
  assert.equal(reservationsCollide(a, room({ startTime: '11:00', endTime: '12:00' })), false); // back-to-back OK
  assert.equal(reservationsCollide(a, room({ startTime: '07:00', endTime: '09:00' })), false); // ends as a starts
});

test('buffers push adjacent bookings into conflict', () => {
  const a = room({ startTime: '09:00', endTime: '11:00', teardownMinutes: 30 });
  // b starts at 11:00 but a now occupies until 11:30 → collide.
  assert.equal(reservationsCollide(a, room({ startTime: '11:00', endTime: '12:00' })), true);
  // 30-min gap clears it.
  assert.equal(reservationsCollide(a, room({ startTime: '11:30', endTime: '12:00' })), false);
});

test('timed bookings on different days never collide', () => {
  const a = room({ startTime: '09:00', endTime: '23:00' });
  assert.equal(reservationsCollide(a, room({ eventDate: '2026-07-13', startTime: '00:00', endTime: '10:00' })), false);
});

test('findRoomConflict: same room + active only, honors excludeDocId', () => {
  const existing = [
    { _docId: 'a', roomDocId: 'R1', status: 'Approved', eventDate: '2026-07-12', startTime: '09:00', endTime: '11:00' },
    { _docId: 'b', roomDocId: 'R2', status: 'Approved', eventDate: '2026-07-12' },          // different room
    { _docId: 'c', roomDocId: 'R1', status: 'Denied',   eventDate: '2026-07-12' },          // not active
  ];
  const cand = { roomDocId: 'R1', eventDate: '2026-07-12', startTime: '10:00', endTime: '12:00' };
  assert.equal(findRoomConflict(cand, existing)?._docId, 'a');               // collides with a
  assert.equal(findRoomConflict(cand, existing, { excludeDocId: 'a' }), null); // editing a → no conflict
  const noClash = { roomDocId: 'R1', eventDate: '2026-07-12', startTime: '11:00', endTime: '12:00' };
  assert.equal(findRoomConflict(noClash, existing), null);                   // adjacent to a, different room from b, c inactive
});

// ── Room availability rules (blackout dates + weekly blocked windows) ────────
// 2026-07-12 is a Sunday (getDay() === 0).

test('roomUnavailability: no rules ⇒ always available', () => {
  assert.equal(roomUnavailability({ eventDate: '2026-07-12' }, { name: 'X' }), null);
  assert.equal(roomUnavailability({ eventDate: '2026-07-12' }, null), null);
});

test('roomUnavailability: blackout date blocks (all-day + timed)', () => {
  const room = { blackoutDates: ['2026-07-12'] };
  assert.equal(roomUnavailability({ eventDate: '2026-07-12' }, room)?.label, 'a blackout date');
  assert.equal(roomUnavailability({ eventDate: '2026-07-12', startTime: '14:00', endTime: '15:00' }, room)?.date, '2026-07-12');
  assert.equal(roomUnavailability({ eventDate: '2026-07-13' }, room), null); // different day
});

test('roomUnavailability: weekly blocked window blocks overlapping times only', () => {
  const room = { blockedWindows: [{ day: 0, start: '09:00', end: '12:00', label: 'Worship' }] }; // Sunday AM
  // All-day Sunday booking ⇒ blocked.
  assert.ok(roomUnavailability({ eventDate: '2026-07-12' }, room));
  // Timed Sunday booking overlapping the window ⇒ blocked.
  assert.ok(roomUnavailability({ eventDate: '2026-07-12', startTime: '11:00', endTime: '13:00' }, room));
  // Timed Sunday booking AFTER the window ⇒ fine.
  assert.equal(roomUnavailability({ eventDate: '2026-07-12', startTime: '13:00', endTime: '15:00' }, room), null);
  // Same time on a Monday (day 1) ⇒ fine.
  assert.equal(roomUnavailability({ eventDate: '2026-07-13', startTime: '10:00', endTime: '11:00' }, room), null);
});

test('roomUnavailability: a multi-day span that crosses a blocked Sunday is blocked', () => {
  const room = { blockedWindows: [{ day: 0, start: '09:00', end: '12:00' }] };
  // Fri 2026-07-10 → Sun 2026-07-12 (all-day span) crosses Sunday ⇒ blocked.
  assert.ok(roomUnavailability({ eventDate: '2026-07-10', returnDate: '2026-07-12' }, room));
  // Fri → Sat span ⇒ no Sunday ⇒ fine.
  assert.equal(roomUnavailability({ eventDate: '2026-07-10', returnDate: '2026-07-11' }, room), null);
});

// ── Recurring-series cancel scoping (Phase 3b) ───────────────────────────────
test('seriesCancelTargets: one / future / all, active-only', () => {
  const G = 'grp1';
  const series = [
    { _docId: 'a', recurrenceGroupId: G, eventDate: '2026-07-06', status: 'Approved' },
    { _docId: 'b', recurrenceGroupId: G, eventDate: '2026-07-13', status: 'Pending' },
    { _docId: 'c', recurrenceGroupId: G, eventDate: '2026-07-20', status: 'Cancelled' }, // terminal → excluded from future/all
    { _docId: 'd', recurrenceGroupId: G, eventDate: '2026-07-27', status: 'Approved' },
    { _docId: 'z', recurrenceGroupId: 'other', eventDate: '2026-07-13', status: 'Approved' }, // different series
  ];
  const b = series[1];
  assert.deepEqual(seriesCancelTargets(b, series, 'one').map(x => x._docId), ['b']);
  // future from b (2026-07-13): b + d (c is Cancelled, a is earlier, z is other series)
  assert.deepEqual(seriesCancelTargets(b, series, 'future').map(x => x._docId).sort(), ['b', 'd']);
  // all active in the series: a, b, d
  assert.deepEqual(seriesCancelTargets(b, series, 'all').map(x => x._docId).sort(), ['a', 'b', 'd']);
});
