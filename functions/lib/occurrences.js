// Foundation F5 — Scheduled-Occurrences feed. SERVER TWIN (CommonJS) of
// src/lib/occurrences.js (Cloud Functions can't import the ESM lib). Adapters
// turn already-fetched arrays into the canonical Occurrence shape; the
// Occurrence→VEVENT mapping + buildCalendar drive the icsCalendarFeed endpoint.
//
// ⚠️ KEEP IN SYNC with src/lib/occurrences.js. functions/test/occurrences.test.mjs
// imports BOTH and asserts identical output (client ≡ server) + byte-parity with
// the legacy functions/lib/ics.js builders. Any drift fails the test.

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

const ICS_DOMAIN = {
  reservation: 'reservations',
  shift: 'jobs',
  maintenance_due: 'maintenance',
  work: 'tasks',
};

function reservationsToOccurrences(reservations) {
  return (reservations || []).filter(r => r && r.eventDate && r.status !== 'denied').map(r => {
    const parts = [];
    if (r.purpose && r.purpose !== r.eventName) parts.push(r.purpose);
    if (r.ministry) parts.push(`Ministry: ${r.ministry}`);
    if (r.status) parts.push(`Status: ${r.status}`);
    return {
      id: `reservation:${r._docId}`,
      sourceType: 'reservation',
      sourceId: r._docId,
      title: r.eventName || r.purpose || 'Reservation',
      start: r.eventDate,
      startTime: null,
      end: r.returnDate || null,
      endTime: null,
      allDay: true,
      location: r.roomName || r.location || null,
      link: null,
      description: parts.length ? parts.join(' | ') : null,
      priority: null,
      uid: r._docId,
      status: r.status || null,
    };
  });
}

function shiftsToOccurrences(jobs, opts) {
  const includePay = !!(opts && opts.includePay);
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

function maintenanceToOccurrences(tickets) {
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

function tasksToOccurrences(tasks) {
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

function getOccurrences(ctx, opts) {
  ctx = ctx || {};
  opts = opts || {};
  const { sourceTypes, range } = opts;
  const includePay = !!opts.includePay;
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

function occurrenceToVEvent(occ) {
  if (!occ || !occ.start) return null;
  const lines = [];
  const dtTime = occ.allDay ? null : timeToICS(occ.start, occ.startTime);
  if (dtTime) {
    lines.push(`DTSTART:${dtTime}`);
    const dtEnd = occ.endTime ? timeToICS(occ.end || occ.start, occ.endTime) : null;
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

function buildCalendar(calName, occurrences) {
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
  ].join('\r\n');
}

module.exports = {
  escICS, dateToICS, addOneDay, timeToICS, ICS_DOMAIN,
  reservationsToOccurrences, shiftsToOccurrences, maintenanceToOccurrences, tasksToOccurrences,
  getOccurrences, occurrenceToVEvent, buildCalendar,
};
