// Time format helpers for job scheduledTime field.
//
// As of 2026-05-12 (H-5 migration), new jobs store time as canonical HH:MM
// (24-hour, what <input type="time"> produces). Legacy jobs may have free-text
// values like "2:00 PM", "2pm", "14:00", etc. Both formats are accepted on
// read; new writes always use HH:MM.

/**
 * Parse a free-text time string into canonical HH:MM (24-hour) form.
 * Returns null if the input doesn't look like a time.
 *
 * Accepts: "14:00", "2:00 PM", "2:00pm", "2 PM", "2pm", "2:00", "14:30:45".
 * Rejects: "", "evening", "TBD", anything without a digit.
 */
export function parseTimeToHHMM(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match: optional hour digits + optional :minutes + optional am/pm
  const m = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] || '').toLowerCase();

  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (min < 0 || min > 59) return null;

  if (ampm === 'pm' && h < 12) h += 12;
  else if (ampm === 'am' && h === 12) h = 0;

  if (h < 0 || h > 23) return null;

  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Format a stored scheduledTime value for display.
 * - Accepts canonical HH:MM and renders as "2:00 PM".
 * - Accepts legacy free-text and returns as-is (so existing "2:00 PM" /
 *   "evening" / etc. keep displaying naturally until migrated).
 * - Empty/null → empty string.
 */
export function formatTimeForDisplay(value) {
  if (!value) return '';
  const hhmm = value.match(/^(\d{2}):(\d{2})$/);
  if (!hhmm) return value; // legacy free-text, pass through
  const h24 = parseInt(hhmm[1], 10);
  const min = hhmm[2];
  if (Number.isNaN(h24) || h24 < 0 || h24 > 23) return value;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${ampm}`;
}
