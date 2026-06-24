// Pure unit tests for the time-aware room-conflict engine (room-calendar Phase 1).
// Runs under `npm run test:unit` (node --test, no emulator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesOf, isAllDay, effectiveWindow, datesOverlap, reservationsCollide, findRoomConflict,
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
