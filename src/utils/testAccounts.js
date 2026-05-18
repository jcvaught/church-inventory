// Test/E2E accounts live permanently in the production FXCC church because the
// Playwright E2E suite runs against PROD (see CLAUDE.md → E2E test suite). They
// must exist for the suite, but should never appear in member-facing user lists,
// pickers, or the billable seat count.
//
// All test accounts use the @churchopshub.com email domain (e2e-admin@,
// e2e-member-b@); no real church member uses that domain (real members use
// their own / church domains). Filtering on the domain is therefore exact.
//
// NOTE (accepted trade-off): this also hides test accounts from each other
// during E2E runs, so specs that assert a seeded test member's *name renders*
// in the UI (roster-visibility, announcements) may need rework. This was an
// explicit owner decision (2026-05-18) — "hide everywhere" over the
// real-users-only variant. Do not silently revert to surface E2E.

const TEST_EMAIL_DOMAIN = '@churchopshub.com';

export function isTestAccount(user) {
  const email = (user?.email || '').toLowerCase();
  return email.endsWith(TEST_EMAIL_DOMAIN);
}

export function excludeTestAccounts(users) {
  return (users || []).filter(u => !isTestAccount(u));
}
