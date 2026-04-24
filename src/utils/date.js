export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Computes next recurrence date from a YYYY-MM-DD string. Month-end and Feb-29 safe.
export function calculateNextDue(dueDate, recurrence) {
  const base = dueDate ? new Date(dueDate + 'T12:00:00') : new Date();
  if (recurrence === 'weekly') {
    base.setDate(base.getDate() + 7);
  } else if (recurrence === 'biweekly') {
    base.setDate(base.getDate() + 14);
  } else if (recurrence === 'monthly') {
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + 1);
    base.setDate(Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
  } else if (recurrence === 'quarterly') {
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + 3);
    base.setDate(Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
  } else if (recurrence === 'annually') {
    const day = base.getDate();
    base.setDate(1);
    base.setFullYear(base.getFullYear() + 1);
    base.setDate(Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
  }
  return localDateStr(base);
}

// Returns an array of YYYY-MM-DD strings for a recurrence series (month-end safe).
export function generateRecurrenceDates(startDate, freq, endDate, cap = 100) {
  if (!startDate || !freq || !endDate || endDate < startDate) return [];
  const mi = { monthly: 1, quarterly: 3, annually: 12 }[freq];
  const di = { weekly: 7, biweekly: 14 }[freq];
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const end = parse(endDate);
  const cur = parse(startDate);
  const dates = [];
  while (cur <= end && dates.length < cap) {
    dates.push(localDateStr(cur));
    if (mi) {
      const day = cur.getDate();
      cur.setDate(1);
      cur.setMonth(cur.getMonth() + mi);
      cur.setDate(Math.min(day, new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()));
    } else {
      cur.setDate(cur.getDate() + (di || 7));
    }
  }
  return dates;
}
