// Shared board primitives — the status/priority model, recurrence labels, and
// the small presentational helpers that the Tasks and Maintenance hubs both
// render. These were defined identically in both pages; this is the single
// source of truth (Phase 0 board-engine groundwork). Same values, no behavior
// change — extracting here is what lets a later phase converge the two boards.

import { B, f1 } from '../brand/tokens.js';

export const STATUSES = ['Backlog', 'Planning', 'In Progress', 'On Hold', 'Complete', 'Cancelled'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const RECURRENCE_OPTIONS = [['', 'None'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Annually']];
export const RECURRENCE_LABELS = { weekly: 'Weekly', biweekly: 'Every 2 wks', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' };

// Deterministic avatar color from a uid.
const ASSIGNEE_COLORS = ['#2A7D6E', '#5B6ABF', '#C0592B', '#7B2D8E', '#2E86AB', '#D4A843', '#C44569', '#3D7A4A'];
export function assigneeColor(uid) {
  let h = 0;
  for (let i = 0; i < (uid || '').length; i++) h = ((h << 5) - h + uid.charCodeAt(i)) | 0;
  return ASSIGNEE_COLORS[Math.abs(h) % ASSIGNEE_COLORS.length];
}

// Up to two initials from a name (first + last). Whitespace-robust.
export function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const priorityColors = {
  High:   { bg: '#FEE8E8',    tx: B.red,     dot: '#E87171' },
  Medium: { bg: B.goldLight,  tx: '#96750E', dot: B.gold },
  Low:    { bg: B.warmGray,   tx: B.textMid, dot: B.textLight },
};

export const statusColors = {
  'Backlog':     { bg: B.warmGray,  tx: B.textMid, dot: B.textLight },
  'Planning':    { bg: B.goldLight, tx: '#96750E', dot: B.gold },
  'In Progress': { bg: '#E8F0FE',   tx: '#1A65C7', dot: '#3B82F6' },
  'On Hold':     { bg: '#FEF3E8',   tx: '#9A5E10', dot: '#F59E42' },
  'Complete':    { bg: B.tealPale,  tx: B.teal,    dot: B.tealLight },
  'Cancelled':   { bg: B.warmGray,  tx: B.textMid, dot: B.textLight },
};

export function PriorityBadge({ priority }) {
  const s = priorityColors[priority] || priorityColors.Medium;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.tx, fontSize: 11, fontWeight: 700, fontFamily: f1 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />{priority}
    </span>
  );
}
