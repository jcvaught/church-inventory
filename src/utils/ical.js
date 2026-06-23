// Client-side .ics export (Blob download). As of F5 the VEVENT bodies come from
// the canonical Occurrence adapters + occurrenceToVEvent in src/lib/occurrences.js
// (one mapping, shared with the server calendar FEED). This file keeps only the
// download wrapper + the client VCALENDAR header — its PRODID differs from the
// feed's and it omits METHOD:PUBLISH, a byte-difference preserved on purpose.
import { localDateStr } from './date.js';
import { tasksToOccurrences, shiftsToOccurrences, occurrenceToVEvent, escICS, foldLine } from '../lib/occurrences.js';

function buildICS(calName, events) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchOpsHub//EN',
    `X-WR-CALNAME:${escICS(calName)}`,
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].map(foldLine).join('\r\n');
}

function downloadICS(content, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/calendar' })),
    download: filename,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function occurrencesToVEvents(occurrences) {
  const lines = [];
  occurrences.forEach(o => { const ev = occurrenceToVEvent(o); if (ev) lines.push(...ev); });
  return lines;
}

export function exportTasksICS(tasks, churchName) {
  const events = occurrencesToVEvents(tasksToOccurrences(tasks));
  downloadICS(buildICS(`Tasks — ${churchName || 'ChurchOpsHub'}`, events), `tasks-${localDateStr(new Date())}.ics`);
}

export function exportJobsICS(jobs, churchName, { calendarLabel = 'Jobs', filenamePrefix = 'jobs' } = {}) {
  // includePay: the client download carries the per-person pay line (the server
  // feed omits it). A title-less shift now summarizes as "Shift" rather than a
  // blank SUMMARY (the adapter's fallback, matching the feed) — a benign
  // convergence; the posting form requires a title so no real job is affected.
  const events = occurrencesToVEvents(shiftsToOccurrences(jobs, { includePay: true }));
  downloadICS(buildICS(`${calendarLabel} — ${churchName || 'ChurchOpsHub'}`, events), `${filenamePrefix}-${localDateStr(new Date())}.ics`);
}
