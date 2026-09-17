// COH-012 A.4.0a — entitlement model, SERVER TWIN of src/lib/entitlement.js.
// Cloud Functions are CommonJS and the deploy package only contains functions/,
// so this cannot import the ESM module at runtime — it carries the same code.
//
// ⚠️ KEEP IN SYNC with src/lib/entitlement.js. functions/test/entitlement.test.mjs
// imports BOTH and asserts identical output across the fixture matrix. Any
// drift fails the test. (Same pattern as attention.js / occurrences.js.)

const FREE_PLAN_MAX_USERS = 10;

function hasHub(sub, name, now = new Date()) {
  if (!sub) return false;
  if (sub.grandfathered) return true;
  if (sub.plan === 'pro' || sub.plan === 'all_in') return true;
  if (sub.freeHubsSelected === null && sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
    return (sub.trialHubs || []).includes(name);
  }
  if (Array.isArray(sub.freeHubsSelected) && sub.freeHubsSelected.includes(name)) return true;
  return (sub.hubs || []).includes(name);
}

function canAddUser(sub, currentUserCount) {
  if (!sub) return currentUserCount < FREE_PLAN_MAX_USERS;
  if (sub.grandfathered) return true;
  if (sub.plan === 'pro' || sub.plan === 'team_unlimited' || sub.plan === 'all_in') return true;
  return currentUserCount < (sub.maxUsers || FREE_PLAN_MAX_USERS);
}

function isTrialing(sub, hubName, now = new Date()) {
  if (!sub) return false;
  if (sub.freeHubsSelected !== null) return false;
  if (!sub.trialEndsAt || new Date(sub.trialEndsAt) <= now) return false;
  return (sub.trialHubs || []).includes(hubName);
}

function trialDaysRemaining(sub, now = new Date()) {
  if (!sub?.trialEndsAt || sub.freeHubsSelected !== null) return 0;
  const ms = new Date(sub.trialEndsAt) - now;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

module.exports = { FREE_PLAN_MAX_USERS, hasHub, canAddUser, isTrialing, trialDaysRemaining };
