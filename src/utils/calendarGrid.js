// Shared calendar-layout logic (Foundation F5 calendar-dedup). The month-grid
// day matrix and the Overdue / This Week / Next 30 Days / Later windowing were
// copied character-for-character across BoardCalendar (Tasks + Maintenance),
// JobCalendar (Jobs), and VolunteerHome. This is the single source of that
// LOGIC; each component keeps its own rendering chrome. Pure — no JSX, no React.
import { localDateStr } from './date.js';

// The 5–6 week day matrix for a month: leading days from the previous month to
// fill the first row, the month's own days, then trailing days to complete the
// final week. Each entry is { date: Date, isCurrentMonth: boolean }.
export function monthMatrix(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const days = [];
  for (let i = firstDay - 1; i >= 0; i--) days.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false });
  for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  while (days.length % 7 !== 0) { const last = days[days.length - 1].date; days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false }); }
  return days;
}

// Group dated items into Overdue / This Week / Next 30 Days / Later, sorted by
// date ascending. `dateOf(item)` extracts the YYYY-MM-DD; `isOverdue(item)`
// gates the Overdue bucket (the only piece that differs per board — Jobs treats
// only still-`open` past shifts as overdue, the work boards treat any past item
// that isn't Complete/Cancelled). Windows are computed from `now` so the groups
// stay correct across midnight when the caller passes a fresh Date.
export function windowGroups(items, { dateOf, todayStr, isOverdue, now }) {
  const ref = now || new Date();
  const weekEnd = new Date(ref); weekEnd.setDate(ref.getDate() + 7);
  const monthEnd = new Date(ref); monthEnd.setDate(ref.getDate() + 30);
  const weekEndStr = localDateStr(weekEnd);
  const monthEndStr = localDateStr(monthEnd);
  const withDate = items.filter(i => dateOf(i)).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  return [
    { label: 'Overdue', items: withDate.filter(i => dateOf(i) < todayStr && isOverdue(i)) },
    { label: 'This Week', items: withDate.filter(i => dateOf(i) >= todayStr && dateOf(i) <= weekEndStr) },
    { label: 'Next 30 Days', items: withDate.filter(i => dateOf(i) > weekEndStr && dateOf(i) <= monthEndStr) },
    { label: 'Later', items: withDate.filter(i => dateOf(i) > monthEndStr) },
  ];
}
