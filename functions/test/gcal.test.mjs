// Google Calendar sync — pure mapping tests for occurrenceToGcalEvent.
// Asserts the Calendar API v3 event resource mirrors the F5 Occurrence the same
// way occurrenceToVEvent does (timed vs all-day, +1h default end, midnight
// carry, exclusive all-day end, source-id stamping). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { occurrenceToGcalEvent, addOneDayYmd, parseTime } = require('../lib/gcal.js');
const { reservationsToOccurrences } = require('../lib/occurrences.js');

const TZ = 'America/Chicago';

// ── parseTime ────────────────────────────────────────────────────────────
test('parseTime: 24h, 12h AM/PM, and garbage', () => {
  assert.deepEqual(parseTime('09:00'), { h: 9, min: 0 });
  assert.deepEqual(parseTime('2:30 PM'), { h: 14, min: 30 });
  assert.deepEqual(parseTime('12:00 AM'), { h: 0, min: 0 });
  assert.deepEqual(parseTime('12:15 PM'), { h: 12, min: 15 });
  assert.equal(parseTime('garbage'), null);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime(null), null);
});

test('addOneDayYmd: rolls month/year boundaries', () => {
  assert.equal(addOneDayYmd('2026-07-01'), '2026-07-02');
  assert.equal(addOneDayYmd('2026-07-31'), '2026-08-01');
  assert.equal(addOneDayYmd('2026-12-31'), '2027-01-01');
});

// ── Timed events ───────────────────────────────────────────────────────────
test('timed event with explicit end', () => {
  const ev = occurrenceToGcalEvent({
    start: '2026-07-01', startTime: '09:00', end: '2026-07-01', endTime: '11:00',
    allDay: false, title: 'Setup', location: 'Gym', description: 'Bring tables',
    sourceType: 'shift', sourceId: 'j1',
  }, TZ);
  assert.deepEqual(ev.start, { dateTime: '2026-07-01T09:00:00', timeZone: TZ });
  assert.deepEqual(ev.end, { dateTime: '2026-07-01T11:00:00', timeZone: TZ });
  assert.equal(ev.summary, 'Setup');
  assert.equal(ev.location, 'Gym');
  assert.equal(ev.description, 'Bring tables');
  assert.deepEqual(ev.extendedProperties.private, { cohSource: 'shift', cohId: 'j1' });
});

test('timed event, no end → +1h default', () => {
  const ev = occurrenceToGcalEvent({
    start: '2026-07-02', startTime: '14:00', allDay: false, title: 'Teardown',
    sourceType: 'shift', sourceId: 'j2',
  }, TZ);
  assert.deepEqual(ev.start, { dateTime: '2026-07-02T14:00:00', timeZone: TZ });
  assert.deepEqual(ev.end, { dateTime: '2026-07-02T15:00:00', timeZone: TZ });
});

test('timed event, +1h crosses midnight → next day', () => {
  const ev = occurrenceToGcalEvent({
    start: '2026-07-03', startTime: '23:30', allDay: false, title: 'Late',
    sourceType: 'shift', sourceId: 'j3',
  }, TZ);
  assert.deepEqual(ev.start, { dateTime: '2026-07-03T23:30:00', timeZone: TZ });
  assert.deepEqual(ev.end, { dateTime: '2026-07-04T00:30:00', timeZone: TZ });
});

test('timed event, end <= start → falls back to +1h', () => {
  const ev = occurrenceToGcalEvent({
    start: '2026-07-06', startTime: '10:00', endTime: '09:00', allDay: false, title: 'Bad End',
    sourceType: 'shift', sourceId: 'j6',
  }, TZ);
  assert.deepEqual(ev.end, { dateTime: '2026-07-06T11:00:00', timeZone: TZ });
});

// ── All-day events ───────────────────────────────────────────────────────────
test('all-day single date → exclusive next-day end, no timeZone', () => {
  const ev = occurrenceToGcalEvent({
    start: '2026-07-04', allDay: true, title: 'All Day',
    sourceType: 'shift', sourceId: 'j4',
  }, TZ);
  assert.deepEqual(ev.start, { date: '2026-07-04' });
  assert.deepEqual(ev.end, { date: '2026-07-05' });
  assert.equal(ev.start.timeZone, undefined);
});

test('all-day multi-day span → end = returnDate + 1 (exclusive)', () => {
  const ev = occurrenceToGcalEvent({
    start: '2026-07-09', end: '2026-07-10', allDay: true, title: 'Wedding', location: 'Sanctuary',
    sourceType: 'reservation', sourceId: 'r1',
  }, TZ);
  assert.deepEqual(ev.start, { date: '2026-07-09' });
  assert.deepEqual(ev.end, { date: '2026-07-11' });
});

test('unparseable time on a non-allDay occurrence → treated as all-day', () => {
  // Mirrors occurrences.js: a bad startTime yields allDay:true upstream, but
  // guard the mapping too — if allDay:false slips through with junk time, we
  // must not emit a broken dateTime.
  const ev = occurrenceToGcalEvent({
    start: '2026-07-05', startTime: 'garbage', allDay: false, title: 'Shift',
    sourceType: 'shift', sourceId: 'j5',
  }, TZ);
  assert.deepEqual(ev.start, { date: '2026-07-05' });
  assert.deepEqual(ev.end, { date: '2026-07-06' });
});

test('missing/empty occurrence → null', () => {
  assert.equal(occurrenceToGcalEvent(null, TZ), null);
  assert.equal(occurrenceToGcalEvent({}, TZ), null);
});

test('title fallback when occurrence has no title', () => {
  const ev = occurrenceToGcalEvent({ start: '2026-07-07', allDay: true }, TZ);
  assert.equal(ev.summary, 'Event');
});

// ── End-to-end via the real reservation adapter ──────────────────────────────
test('reservation adapter → gcal event (timed single-day booking)', () => {
  const [occ] = reservationsToOccurrences([{
    _docId: 'res1', eventName: 'Youth group', eventDate: '2026-07-20',
    startTime: '18:00', endTime: '20:00', status: 'Approved', roomName: 'Youth Room',
  }]);
  const ev = occurrenceToGcalEvent(occ, TZ);
  assert.deepEqual(ev.start, { dateTime: '2026-07-20T18:00:00', timeZone: TZ });
  assert.deepEqual(ev.end, { dateTime: '2026-07-20T20:00:00', timeZone: TZ });
  assert.equal(ev.location, 'Youth Room');
  assert.deepEqual(ev.extendedProperties.private, { cohSource: 'reservation', cohId: 'res1' });
});
