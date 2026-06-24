// ── Foundation F5 — The Scheduled-Occurrences feed ──────────────────────────
//
// One canonical `Occurrence` shape + per-source adapters + a `getOccurrences()`
// aggregator, so the calendar views, the ICS/Google-Calendar feed, "this week"
// surfaces, and the future event-day ops view all read ONE shape of "a dated
// thing" instead of each re-deriving it per collection.
//
// Pure, zero-import (mirrors the F2/F4 lib contract): adapters operate on
// already-subscribed arrays — they do NOT fetch. **Server twin =
// functions/lib/occurrences.js** (CommonJS; Cloud Functions can't import this
// ESM lib). The two are pinned together by functions/test/occurrences.test.mjs
// (client ≡ server + ICS byte-parity vs the legacy builders). KEEP IN SYNC.
//
// NOTE on recurrence: COH MATERIALIZES recurrence into per-date docs (shift
// series, reservation series, task/maintenance spawn-next-on-completion all
// write one doc per occurrence date), so getOccurrences is a pure adapter +
// range-filter over already-dated docs — NOT a read-time expander. The
// recurrence math itself is already DRY in src/utils/date.js (+ its server
// twin). See docs/FOUNDATION-F5-PLAN-2026-06-18.md.

// ── ICS string primitives (the single owner on the client side; src/utils/
// ical.js imports these instead of keeping its own copies) ──────────────────

export function escICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545 §3.1 — content lines longer than 75 OCTETS must be folded: split into
// ≤75-octet pieces, each continuation line prefixed with a single space (which
// counts toward the octet budget). Octet-aware + never splits a multibyte char,
// so a long SUMMARY/DESCRIPTION/LOCATION doesn't get rejected by strict importers.
// A short line is returned unchanged (so byte-parity with the legacy short fixtures
// holds). The TextEncoder global exists in both Vite and Node.
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const segments = [];
  let cur = '';
  let curBytes = 0;
  let first = true;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    const limit = first ? 75 : 74; // continuation reserves 1 octet for the leading space
    if (curBytes + chBytes > limit) {
      segments.push(first ? cur : ' ' + cur);
      first = false;
      cur = ch;
      curBytes = chBytes;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) segments.push(first ? cur : ' ' + cur);
  return segments.join('\r\n');
}

export function dateToICS(dateStr) {
  return dateStr ? dateStr.slice(0, 10).replace(/-/g, '') : null;
}

export function addOneDay(icsDate) {
  const d = new Date(
    parseInt(icsDate.slice(0, 4)),
    parseInt(icsDate.slice(4, 6)) - 1,
    parseInt(icsDate.slice(6, 8)) + 1
  );
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Canonical time is "HH:MM" 24h, but tolerate "h:mm AM/PM" too.
export function timeToICS(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${dateToICS(dateStr)}T${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}00`;
}

// sourceType → the ICS UID domain suffix (preserves the legacy per-type UIDs).
export const ICS_DOMAIN = {
  reservation: 'reservations',
  shift: 'jobs',
  maintenance_due: 'maintenance',
  work: 'tasks',
};

// ── Per-source adapters: raw records → Occurrence[] ─────────────────────────
// Each applies the SAME terminal-status skip the legacy ICS feed did, so the
// occurrence stream and the old per-type builders agree exactly.

export function reservationsToOccurrences(reservations) {
  // Skip terminal "not happening" statuses. Case-insensitive: real reservations
  // store 'Denied'/'Cancelled' (capitalized); the legacy/seed data used lowercase.
  return (reservations || []).filter(r => r && r.eventDate && !['denied', 'cancelled'].includes(String(r.status || '').toLowerCase())).map(r => {
    const parts = [];
    if (r.purpose && r.purpose !== r.eventName) parts.push(r.purpose);
    if (r.ministry) parts.push(`Ministry: ${r.ministry}`);
    if (r.status) parts.push(`Status: ${r.status}`);
    // Single-day room bookings carry start/end times → timed VEVENT (DTSTART
    // with a time, like shifts). Multi-day spans and any record without a
    // startTime stay all-day — matching the date-only legacy reservations
    // (byte-parity) and the scope (single-day=timed, multi-day=span).
    const timed = !!r.startTime && (!r.returnDate || r.returnDate === r.eventDate);
    return {
      id: `reservation:${r._docId}`,
      sourceType: 'reservation',
      sourceId: r._docId,
      title: r.eventName || r.purpose || 'Reservation',
      start: r.eventDate,
      startTime: timed ? r.startTime : null,
      end: r.returnDate || null,
      endTime: timed ? (r.endTime || null) : null,
      allDay: !timed,
      location: r.roomName || r.location || null,
      link: null,
      description: parts.length ? parts.join(' | ') : null,
      priority: null,
      uid: r._docId,
      status: r.status || null,
    };
  });
}

export function shiftsToOccurrences(jobs, { includePay = false } = {}) {
  return (jobs || []).filter(j => j && j.scheduledDate && j.status !== 'cancelled').map(j => {
    const parts = [];
    if (j.description) parts.push(j.description);
    if (includePay && j.pay != null) parts.push(`Pay: $${Number(j.pay).toFixed(2)}/person`);
    parts.push(`${j.signupCount || 0}/${j.spotsTotal || 1} spots filled`);
    return {
      id: `shift:${j._docId}`,
      sourceType: 'shift',
      sourceId: j._docId,
      title: j.title || 'Shift',
      start: j.scheduledDate,
      startTime: j.scheduledTime || null,
      end: null,
      endTime: j.scheduledEndTime || null,
      allDay: !timeToICS(j.scheduledDate, j.scheduledTime),
      location: j.location || null,
      link: null,
      description: parts.join(' | '),
      priority: null,
      uid: j.jobNumber || j._docId,
      status: j.status || null,
    };
  });
}

export function maintenanceToOccurrences(tickets) {
  return (tickets || []).filter(t => t && t.dueDate && t.status !== 'Complete' && t.status !== 'Cancelled').map(t => {
    const parts = [];
    if (t.description) parts.push(t.description);
    if (t.priority) parts.push(`Priority: ${t.priority}`);
    if (t.status) parts.push(`Status: ${t.status}`);
    return {
      id: `maintenance_due:${t._docId}`,
      sourceType: 'maintenance_due',
      sourceId: t._docId,
      title: t.name || 'Maintenance',
      start: t.dueDate,
      startTime: null,
      end: null,
      endTime: null,
      allDay: true,
      location: null,
      link: null,
      description: parts.length ? parts.join(' | ') : null,
      priority: null,
      uid: t.ticketNumber || t._docId,
      status: t.status || null,
    };
  });
}

// Tasks intentionally skip NO status (the legacy client export emits completed
// tasks that still carry a dueDate). `priority` here is the iCal numeric.
export function tasksToOccurrences(tasks) {
  return (tasks || []).filter(t => t && t.dueDate).map(t => ({
    id: `work:${t._docId}`,
    sourceType: 'work',
    sourceId: t._docId,
    title: t.name,
    start: t.dueDate,
    startTime: null,
    end: null,
    endTime: null,
    allDay: true,
    location: null,
    link: null,
    description: t.description || null,
    priority: t.priority === 'High' ? 1 : t.priority === 'Low' ? 9 : 5,
    uid: t.taskNumber || t._docId,
    status: t.status || null,
  }));
}

// ── The aggregator ──────────────────────────────────────────────────────────
// ctx = already-subscribed arrays: { reservations, jobListings, tasks,
// maintenance }. opts.sourceTypes restricts which adapters run; opts.range
// ({ start, end } inclusive YYYY-MM-DD) filters by placement date; opts.includePay
// is passed through to shifts (the client download wants the Pay line).
export function getOccurrences(ctx = {}, { sourceTypes, range, includePay = false } = {}) {
  const want = t => !sourceTypes || sourceTypes.includes(t);
  const out = [];
  if (want('reservation')) out.push(...reservationsToOccurrences(ctx.reservations));
  if (want('shift')) out.push(...shiftsToOccurrences(ctx.jobListings, { includePay }));
  if (want('work')) out.push(...tasksToOccurrences(ctx.tasks));
  if (want('maintenance_due')) out.push(...maintenanceToOccurrences(ctx.maintenance));
  if (!range) return out;
  const { start, end } = range;
  return out.filter(o => (!start || o.start >= start) && (!end || o.start <= end));
}

// ── Occurrence → iCalendar ───────────────────────────────────────────────────
// One VEVENT mapping for every source type. Reproduces the legacy per-type
// builders line-for-line (timed-vs-all-day + the +1h fallback; per-type UID
// domain). Returns an array of VEVENT lines, or null when undatable.
export function occurrenceToVEvent(occ) {
  if (!occ || !occ.start) return null;
  const lines = [];
  const dtTime = occ.allDay ? null : timeToICS(occ.start, occ.startTime);
  if (dtTime) {
    lines.push(`DTSTART:${dtTime}`);
    const dtEnd = occ.endTime ? timeToICS(occ.end || occ.start, occ.endTime) : null;
    if (dtEnd && dtEnd > dtTime) {
      lines.push(`DTEND:${dtEnd}`);
    } else {
      // No end time, or end <= start → default to +1 hour.
      const h = parseInt(dtTime.slice(9, 11));
      const endH = h + 1;
      let endDate = dtTime.slice(0, 8);
      if (endH >= 24) endDate = addOneDay(endDate);
      lines.push(`DTEND:${endDate}T${String(endH % 24).padStart(2, '0')}${dtTime.slice(11)}`);
    }
  } else {
    const dateOnly = dateToICS(occ.start);
    lines.push(`DTSTART;VALUE=DATE:${dateOnly}`);
    lines.push(`DTEND;VALUE=DATE:${addOneDay(dateToICS(occ.end || occ.start))}`);
  }
  lines.push(`SUMMARY:${escICS(occ.title)}`);
  if (occ.description) lines.push(`DESCRIPTION:${escICS(occ.description)}`);
  if (occ.priority != null) lines.push(`PRIORITY:${occ.priority}`);
  if (occ.location) lines.push(`LOCATION:${escICS(occ.location)}`);
  lines.push(`UID:${escICS(occ.uid)}@churchopshub-${ICS_DOMAIN[occ.sourceType]}`);
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
}

// Full VCALENDAR document for the server FEED (icsCalendarFeed). The client
// download wrapper (src/utils/ical.js `buildICS`) keeps its own header — its
// PRODID + missing METHOD line differ from the feed's, and that byte-difference
// is preserved on purpose.
export function buildCalendar(calName, occurrences) {
  const flat = [];
  (occurrences || []).forEach(o => { const ev = occurrenceToVEvent(o); if (ev) flat.push(...ev); });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchOpsHub//Calendar Feed//EN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escICS(calName)}`,
    'CALSCALE:GREGORIAN',
    ...flat,
    'END:VCALENDAR',
  ].map(foldLine).join('\r\n');
}
