export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Recurrence date math ──────────────────────────────────────────────────
// Month-end- and Feb-29-safe. Server twin: functions/lib/recurrence.js (Cloud
// Functions can't import from src/). KEEP THE TWO IN SYNC — functions/test/
// recurrence.test.mjs asserts they produce identical output.

// Advance a Date by ONE recurrence step in place; month-adds clamp to the last
// valid day of the target month (Jan 31 + 1 month → Feb 28/29, never Mar 3).
function advanceOnce(d, freq) {
  if (freq === 'weekly') { d.setDate(d.getDate() + 7); return; }
  if (freq === 'biweekly') { d.setDate(d.getDate() + 14); return; }
  const months = { monthly: 1, quarterly: 3, annually: 12 }[freq];
  if (!months) return;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
}

// Next single occurrence after a YYYY-MM-DD string (parsed at local noon to
// stay clear of DST/UTC midnight edges).
export function calculateNextDue(dueDate, recurrence) {
  const base = dueDate ? new Date(dueDate + 'T12:00:00') : new Date();
  advanceOnce(base, recurrence);
  return localDateStr(base);
}

// The canonical recurrence cadences — the ONE list of [value, label] pairs the
// UI offers, and exactly the frequencies advanceOnce() above implements. Lives
// here (next to the math) so the dropdown and the engine can't drift. Consumed
// by the Tasks/Maintenance boards (via boardUI's RECURRENCE_OPTIONS, which
// prepends a "None"), the Jobs composer, and the Reservations composer.
export const RECURRENCE_FREQS = [
  ['weekly', 'Weekly'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['annually', 'Annually'],
];

// Every occurrence from startDate through endDate inclusive (YYYY-MM-DD), capped.
export function generateRecurrenceDates(startDate, freq, endDate, cap = 100) {
  if (!startDate || !freq || !endDate || endDate < startDate) return [];
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const end = parse(endDate);
  const cur = parse(startDate);
  const dates = [];
  while (cur <= end && dates.length < cap) {
    dates.push(localDateStr(cur));
    advanceOnce(cur, freq);
  }
  return dates;
}
