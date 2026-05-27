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

// Volunteer-only = a 'user' role whose only allowedHub is 'jobs'.
// Used by the app shell to swap to a jobs-first mobile layout (4-tab nav,
// VolunteerHome landing, Calendar-first JobsPage default). Deliberately
// narrow: allowedHubs:null (full access) and ['jobs','tasks'] both fall
// back to the standard admin-shaped shell.
export function isVolunteerOnly(userProfile) {
  return userProfile?.role === 'user'
    && Array.isArray(userProfile?.allowedHubs)
    && userProfile.allowedHubs.length === 1
    && userProfile.allowedHubs[0] === 'jobs';
}
