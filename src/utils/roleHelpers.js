// Role helpers for UI-level access control.
// Admin = system owner (full access).
// Manager = operational lead (scoped to managedMinistries[] for items/supplies/reservations;
//           unrestricted for tickets, vendors, audits, bundles, dropdown lists).
// User = day-to-day use only.

export function canManageMinistry(userProfile, ministry) {
  if (!userProfile) return false;
  if (userProfile.role === 'admin') return true;
  if (userProfile.role !== 'manager') return false;
  if (!ministry) return false; // unscoped items are admin-only
  const managed = userProfile.managedMinistries || [];
  return managed.includes(ministry);
}

export function canManageItem(userProfile, item) {
  return canManageMinistry(userProfile, item?.ministry);
}

export function canManageSupply(userProfile, supply) {
  return canManageMinistry(userProfile, supply?.ministry);
}
