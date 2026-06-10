/**
 * Shepherd Hub P2 — force-sync elder custom claims (immediate grant/revoke).
 *
 * `claimElderRole` (functions/index.js) already grants/revokes the `elder: true`
 * custom claim on each elder's sign-in. This script is the out-of-band twin:
 * it reconciles claims against the allow-list (functions/lib/elders.js) RIGHT
 * NOW without waiting for a sign-in — use it for an immediate roll-off
 * (revoke) or to confirm the current state.
 *
 *   node scripts/set-elder-claims.cjs          # dry-run report
 *   node scripts/set-elder-claims.cjs --apply  # actually set/clear claims
 *
 * It (a) grants the claim to any allow-listed email that has an Auth account
 * but isn't yet flagged, and (b) revokes the claim from any account that has it
 * but is NOT on the allow-list. Elders who have never signed into COH have no
 * Auth account yet — reported as "no account" and granted automatically on
 * their first sign-in via claimElderRole. After setting a claim, that user must
 * refresh their ID token (re-login or the app's force-refresh) for it to apply.
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');
const { ELDER_EMAILS } = require('../functions/lib/elders');

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(key) });
const auth = admin.auth();
const allow = new Set(ELDER_EMAILS.map(e => e.toLowerCase()));

(async () => {
  console.log(`Elder allow-list (${allow.size}): ${[...allow].join(', ')}`);
  console.log(APPLY ? '\nMODE: APPLY (claims will be changed)\n' : '\nMODE: dry-run (no changes; pass --apply to write)\n');

  // (a) Grant — walk the allow-list, find each by email.
  for (const email of allow) {
    let user;
    try { user = await auth.getUserByEmail(email); }
    catch { console.log(`  GRANT  ${email} — no Auth account yet (claim auto-grants on first sign-in)`); continue; }
    const has = user.customClaims?.elder === true;
    if (has) { console.log(`  ok     ${email} — already elder`); continue; }
    if (APPLY) {
      await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), elder: true });
      console.log(`  GRANTED ${email} (uid ${user.uid})`);
    } else {
      console.log(`  GRANT  ${email} (uid ${user.uid}) — would set elder:true`);
    }
  }

  // (b) Revoke — scan all Auth users for an elder claim not on the allow-list.
  console.log('\nScanning for stale elder claims to revoke...');
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) {
      if (u.customClaims?.elder === true && !allow.has((u.email || '').toLowerCase())) {
        if (APPLY) {
          const c = { ...u.customClaims }; delete c.elder;
          await auth.setCustomUserClaims(u.uid, c);
          console.log(`  REVOKED ${u.email || u.uid} — not on allow-list`);
        } else {
          console.log(`  REVOKE ${u.email || u.uid} — would clear elder claim`);
        }
      }
    }
    pageToken = res.pageToken;
  } while (pageToken);

  console.log('\nDone.');
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
