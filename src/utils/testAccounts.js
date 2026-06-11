// Test/E2E accounts live permanently in the production FXCC church because the
// Playwright E2E suite runs against PROD (see CLAUDE.md → E2E test suite). They
// must exist for the suite, but should never appear in member-facing user lists,
// pickers, or the billable seat count.
//
// All test accounts use the @churchopshub.com email domain (e2e-admin@,
// e2e-member-b@); no real church member uses that domain (real members use
// their own / church domains). Filtering on the domain is therefore exact.
//
// This also hides test accounts from each other during E2E runs. That was an
// accepted risk (owner decision 2026-05-18, "hide everywhere") — but the full
// Playwright suite was run against prod immediately after and came back
// 40 passed / 1 skipped / 0 failed. Roster/announcement specs assert seeded
// signup-entry display names, NOT users-collection lookups, so the filter has
// no effect on them. No spec rework needed. Do not silently revert to surface
// E2E in member-facing lists.

const TEST_EMAIL_DOMAIN = '@churchopshub.com';

// Test accounts that don't use the @churchopshub.com domain and so can't be
// caught by the domain rule. jcvaught@gmail.com is John's secondary "Member A
// Test" account in the FXCC church (his real login is jvaught@fxcc.org); it was
// retired from the E2E suite 2026-05-26 and should not appear in member-facing
// lists, pickers, or the billable seat count. Add future stray test emails here.
const TEST_EMAILS = new Set([
  'jcvaught@gmail.com',
]);

export function isTestAccount(user) {
  const email = (user?.email || '').toLowerCase();
  return email.endsWith(TEST_EMAIL_DOMAIN) || TEST_EMAILS.has(email);
}

export function excludeTestAccounts(users) {
  return (users || []).filter(u => !isTestAccount(u));
}
