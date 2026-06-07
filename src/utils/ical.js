// Client-side .ics export (Blob download). The server-side calendar FEED uses
// a parallel pure builder at functions/lib/ics.js (Cloud Functions can't import
// from src/). If the VEVENT shape changes here, mirror it there.
import { localDateStr } from './date.js';

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
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${dateToICS(dateStr)}T${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}00`;
}

function buildICS(calName, events) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchOpsHub//EN',
    `X-WR-CALNAME:${escICS(calName)}`,
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(content, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/calendar' })),
    download: filename,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function exportTasksICS(tasks, churchName) {
  const events = [];
  (tasks || []).filter(t => t.dueDate).forEach(task => {
    const dt = dateToICS(task.dueDate);
    if (!dt) return;
    events.push('BEGIN:VEVENT');
    events.push(`DTSTART;VALUE=DATE:${dt}`);
    events.push(`DTEND;VALUE=DATE:${addOneDay(dt)}`);
    events.push(`SUMMARY:${escICS(task.name)}`);
    if (task.description) events.push(`DESCRIPTION:${escICS(task.description)}`);
    events.push(`PRIORITY:${task.priority === 'High' ? 1 : task.priority === 'Low' ? 9 : 5}`);
    events.push(`UID:${escICS(task.taskNumber || task._docId)}@churchopshub-tasks`);
    events.push('END:VEVENT');
  });
  downloadICS(buildICS(`Tasks — ${churchName || 'ChurchOpsHub'}`, events), `tasks-${localDateStr(new Date())}.ics`);
}

export function exportJobsICS(jobs, churchName, { calendarLabel = 'Jobs', filenamePrefix = 'jobs' } = {}) {
  const events = [];
  (jobs || []).filter(j => j.scheduledDate).forEach(job => {
    const dtTime = timeToICS(job.scheduledDate, job.scheduledTime);
    const dtEnd = timeToICS(job.scheduledDate, job.scheduledEndTime);
    const dateOnly = dateToICS(job.scheduledDate);
    events.push('BEGIN:VEVENT');
    if (dtTime) {
      events.push(`DTSTART:${dtTime}`);
      if (dtEnd && dtEnd > dtTime) {
        events.push(`DTEND:${dtEnd}`);
      } else {
        // Fallback: no end time provided, or end <= start → default to +1 hour.
        const h = parseInt(dtTime.slice(9, 11));
        const endH = h + 1;
        let endDate = dtTime.slice(0, 8);
        if (endH >= 24) endDate = addOneDay(endDate);
        events.push(`DTEND:${endDate}T${String(endH % 24).padStart(2, '0')}${dtTime.slice(11)}`);
      }
    } else {
      events.push(`DTSTART;VALUE=DATE:${dateOnly}`);
      events.push(`DTEND;VALUE=DATE:${addOneDay(dateOnly)}`);
    }
    events.push(`SUMMARY:${escICS(job.title)}`);
    const parts = [];
    if (job.description) parts.push(job.description);
    if (job.pay != null) parts.push(`Pay: $${Number(job.pay).toFixed(2)}/person`);
    parts.push(`${job.signupCount || 0}/${job.spotsTotal || 1} spots filled`);
    events.push(`DESCRIPTION:${escICS(parts.join(' | '))}`);
    if (job.location) events.push(`LOCATION:${escICS(job.location)}`);
    events.push(`UID:${escICS(job.jobNumber || job._docId)}@churchopshub-jobs`);
    events.push('END:VEVENT');
  });
  downloadICS(buildICS(`${calendarLabel} — ${churchName || 'ChurchOpsHub'}`, events), `${filenamePrefix}-${localDateStr(new Date())}.ics`);
}
