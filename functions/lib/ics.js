// Server-side iCalendar (.ics) builder — the ORIGINAL per-type VEVENT builders.
// As of F5 (2026-06-18) the icsCalendarFeed endpoint no longer calls these;
// it routes through the canonical Occurrence adapters in functions/lib/
// occurrences.js. This file is retained as the GOLDEN BYTE-PARITY REFERENCE:
// functions/test/occurrences.test.mjs asserts the new Occurrence→VEVENT mapping
// reproduces these builders exactly, so any drift in the new path is caught.
// (Safe to delete once F5 is long-shipped and the test is frozen to literals.)
// No DOM — returns strings. All-day events use DTEND = day+1 per the iCal spec;
// timed events fall back to +1h when no end time is given.

function escICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function dateToICS(dateStr) {
  return dateStr ? dateStr.slice(0, 10).replace(/-/g, '') : null;
}

function addOneDay(icsDate) {
  const d = new Date(
    parseInt(icsDate.slice(0, 4)),
    parseInt(icsDate.slice(4, 6)) - 1,
    parseInt(icsDate.slice(6, 8)) + 1
  );
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Canonical job time is "HH:MM" 24h, but tolerate "h:mm AM/PM" too.
function timeToICS(dateStr, timeStr) {
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

function vevent(lines) {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
}

// ── Per-type VEVENT builders ──────────────────────────────────────────────

function jobEventLines(job) {
  if (!job.scheduledDate) return null;
  const dtTime = timeToICS(job.scheduledDate, job.scheduledTime);
  const dtEnd = timeToICS(job.scheduledDate, job.scheduledEndTime);
  const dateOnly = dateToICS(job.scheduledDate);
  const lines = [];
  if (dtTime) {
    lines.push(`DTSTART:${dtTime}`);
    if (dtEnd && dtEnd > dtTime) {
      lines.push(`DTEND:${dtEnd}`);
    } else {
      const h = parseInt(dtTime.slice(9, 11));
      const endH = h + 1;
      let endDate = dtTime.slice(0, 8);
      if (endH >= 24) endDate = addOneDay(endDate);
      lines.push(`DTEND:${endDate}T${String(endH % 24).padStart(2, '0')}${dtTime.slice(11)}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly}`);
    lines.push(`DTEND;VALUE=DATE:${addOneDay(dateOnly)}`);
  }
  lines.push(`SUMMARY:${escICS(job.title || 'Shift')}`);
  const parts = [];
  if (job.description) parts.push(job.description);
  parts.push(`${job.signupCount || 0}/${job.spotsTotal || 1} spots filled`);
  lines.push(`DESCRIPTION:${escICS(parts.join(' | '))}`);
  if (job.location) lines.push(`LOCATION:${escICS(job.location)}`);
  lines.push(`UID:${escICS(job.jobNumber || job._docId)}@churchopshub-jobs`);
  return vevent(lines);
}

function reservationEventLines(res) {
  if (!res.eventDate) return null;
  const start = dateToICS(res.eventDate);
  const end = dateToICS(res.returnDate || res.eventDate);
  const lines = [
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${addOneDay(end)}`,
    `SUMMARY:${escICS(res.eventName || res.purpose || 'Reservation')}`,
  ];
  const parts = [];
  if (res.purpose && res.purpose !== res.eventName) parts.push(res.purpose);
  if (res.ministry) parts.push(`Ministry: ${res.ministry}`);
  if (res.status) parts.push(`Status: ${res.status}`);
  if (parts.length) lines.push(`DESCRIPTION:${escICS(parts.join(' | '))}`);
  if (res.roomName || res.location) lines.push(`LOCATION:${escICS(res.roomName || res.location)}`);
  lines.push(`UID:${escICS(res._docId)}@churchopshub-reservations`);
  return vevent(lines);
}

function maintenanceEventLines(ticket) {
  if (!ticket.dueDate) return null;
  const dt = dateToICS(ticket.dueDate);
  const lines = [
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${addOneDay(dt)}`,
    `SUMMARY:${escICS(ticket.name || 'Maintenance')}`,
  ];
  const parts = [];
  if (ticket.description) parts.push(ticket.description);
  if (ticket.priority) parts.push(`Priority: ${ticket.priority}`);
  if (ticket.status) parts.push(`Status: ${ticket.status}`);
  if (parts.length) lines.push(`DESCRIPTION:${escICS(parts.join(' | '))}`);
  lines.push(`UID:${escICS(ticket.ticketNumber || ticket._docId)}@churchopshub-maintenance`);
  return vevent(lines);
}

// Wrap a flat array of VEVENT line-arrays into a full VCALENDAR document.
function buildCalendar(calName, eventBlocks) {
  const flat = [];
  eventBlocks.filter(Boolean).forEach(block => flat.push(...block));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchOpsHub//Calendar Feed//EN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escICS(calName)}`,
    'CALSCALE:GREGORIAN',
    ...flat,
    'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = {
  jobEventLines,
  reservationEventLines,
  maintenanceEventLines,
  buildCalendar,
};
