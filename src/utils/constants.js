// ── Item statuses ────────────────────────────────────────────────────────
export const ITEM_STATUS = {
  AVAILABLE:    'Available',
  CHECKED_OUT:  'Checked Out',
  IN_USE:       'In Use',
  UNDER_REPAIR: 'Under Repair',
  DISPOSED:     'Disposed',
};

// ── Reservation statuses ─────────────────────────────────────────────────
export const RES_STATUS = {
  PENDING:     'Pending',
  APPROVED:    'Approved',
  DENIED:      'Denied',
  CHECKED_OUT: 'Checked Out',
  RETURNED:    'Returned',
  CANCELLED:   'Cancelled',
};

// ── Maintenance ticket statuses ───────────────────────────────────────────
export const TICKET_STATUS = {
  BACKLOG:     'Backlog',
  PLANNING:    'Planning',
  IN_PROGRESS: 'In Progress',
  ON_HOLD:     'On Hold',
  COMPLETE:    'Complete',
  CANCELLED:   'Cancelled',
};
