// Shepherd Hub — elder sign-in email allow-list (P2 gate).
//
// Elder status is a server-set custom auth claim (`elder: true`), NOT a
// Firestore-doc role. `claimElderRole` (functions/index.js) grants/revokes the
// claim by matching the signed-in email against this list; the same list drives
// scripts/set-elder-claims.cjs for an immediate force-sync. Single source of
// truth — keep it here, require it from both.
//
// All 8 FXCC elders sign in via @fxcc.org (Google Workspace). Steve Watkins has
// two @fxcc.org addresses; both are allow-listed so either login works. To roll
// an elder off: remove their email here, redeploy claimElderRole, and run
// scripts/set-elder-claims.cjs (the claim is also self-revoked the next time
// that person's app calls claimElderRole). Emails are compared lowercased.
const ELDER_EMAILS = [
  'davidbell@fxcc.org',   // David Bell
  'lboyd@fxcc.org',       // Lance Boyd
  'rbingham@fxcc.org',    // Ray Bingham (on sabbatical — still an elder)
  'steve@fxcc.org',       // Steve Watkins (both his @fxcc.org addresses)
  'swatkins@fxcc.org',    // Steve Watkins
  'preiman@fxcc.org',     // Paul Reiman
  'jreed@fxcc.org',       // Joel Reed
  'imills@fxcc.org',      // Ivan Mills
  'dennis@fxcc.org',      // Dennis Cesone
];

function isElderEmail(email) {
  return ELDER_EMAILS.includes((email || '').trim().toLowerCase());
}

module.exports = { ELDER_EMAILS, isElderEmail };
