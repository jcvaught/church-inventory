// Pure, zero-import time-aware room-conflict detection (room-calendar Phase 1,
// docs/ROOM-CALENDAR-PLAN-2026-06-23.md). A reservation occupies a room over its
// date span [eventDate..returnDate]. A SINGLE-day timed booking occupies a clock
// window [startTime − setupMinutes, endTime + teardownMinutes] within that day;
// all-day bookings (no startTime) and multi-day spans occupy the whole day(s).
//
// Buffers (setupMinutes/teardownMinutes) are supported now but default to 0 — the
// booking form doesn't expose them until Phase 3; the math is forward-compatible.

// Minutes since midnight from "HH:MM" (24h). null on empty/garbage.
export function minutesOf(t) {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// A booking is all-day when it has no usable start time OR spans multiple days.
export function isAllDay(r) {
  return minutesOf(r && r.startTime) == null || (!!r && !!r.returnDate && r.returnDate > r.eventDate);
}

// The buffer-expanded [start,end] minute window for a single-day timed booking,
// or null when the booking is all-day. End defaults to +60min when missing/≤start.
export function effectiveWindow(r) {
  if (isAllDay(r)) return null;
  const s = minutesOf(r.startTime);
  const e = minutesOf(r.endTime);
  const start = s - (Number(r.setupMinutes) || 0);
  const end = (e != null && e > s ? e : s + 60) + (Number(r.teardownMinutes) || 0);
  return { start, end };
}

// Inclusive date-span overlap on YYYY-MM-DD strings.
export function datesOverlap(a, b) {
  const aStart = a.eventDate, aEnd = a.returnDate || a.eventDate;
  const bStart = b.eventDate, bEnd = b.returnDate || b.eventDate;
  return aStart <= bEnd && aEnd >= bStart;
}

// True when two bookings of the SAME room collide. Callers must pre-filter to the
// same room + active statuses (Pending/Approved). Times disambiguate only when
// BOTH bookings are single-day-timed on the same calendar day; otherwise any
// shared day is a collision (an all-day booking blocks the room for that day).
// Adjacent timed bookings (one ends exactly when the next starts) do NOT collide
// — buffers, when set, push them apart.
export function reservationsCollide(a, b) {
  if (!datesOverlap(a, b)) return false;
  const wa = effectiveWindow(a);
  const wb = effectiveWindow(b);
  if (!wa || !wb) return true;          // either side all-day ⇒ the shared day collides
  if (a.eventDate !== b.eventDate) return false; // two single-day timed ⇒ must be the same day
  return wa.start < wb.end && wb.start < wa.end;  // half-open interval overlap
}

// Find the first active same-room booking the candidate collides with, or null.
// `existing` is the full reservations array; `excludeDocId` skips a record when
// editing it. ACTIVE = Pending | Approved (terminal/denied/cancelled don't hold a room).
export function findRoomConflict(candidate, existing, { excludeDocId } = {}) {
  const ACTIVE = new Set(['Pending', 'Approved']);
  for (const r of existing || []) {
    if (!r || r._docId === excludeDocId) continue;
    if (r.roomDocId !== candidate.roomDocId) continue;
    if (!ACTIVE.has(r.status)) continue;
    if (reservationsCollide(candidate, r)) return r;
  }
  return null;
}
