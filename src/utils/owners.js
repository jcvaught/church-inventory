// App-owner allow-list — John only. Gates the Shepherd Hub admin surface and the
// owner-only Settings controls (global banner, email suppressions, etc.).
//
// This is the single CLIENT copy. It is intentionally mirrored — and cannot be
// DRY-shared — with two enforcement layers that don't import app code:
//   • functions/index.js → `OWNER_EMAILS`
//   • firestore.rules    → `isShepherdAdmin()` + the inline owner email checks
// Keep all three in sync. (CQ-1, 2026-06-11.)
export const OWNER_EMAILS = ['jcvaught@gmail.com', 'jvaught@fxcc.org'];

export const isOwnerEmail = (email) => OWNER_EMAILS.includes((email || '').trim().toLowerCase());
