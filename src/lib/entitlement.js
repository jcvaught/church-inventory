// COH-012 A.4.0a — the entitlement model, in ONE place.
//
// "Does this church have hub X / can it add a member / is it trialing" was
// implemented in four places with three different semantics:
//   • src/hooks/useSubscription.js   hasHub / canAddUser / isTrialing (client)
//   • functions/index.js subHasHub    same logic, hand-copied (server)
//   • src/pages/SettingsPage.jsx      per-hub flags that ignore trials entirely
//   • firestore.rules jobsHubActive   Jobs only, no time check
// This module is the canonical predicate set. The client hook and the server
// twin (functions/lib/entitlement.js) call it; the parity test in
// functions/test/entitlement.test.mjs pins the twin to this file and pins
// the rules' Jobs gate to the same fixture matrix.
//
// A.4.0a is BEHAVIOR-PRESERVING: every function below is the useSubscription.js
// implementation moved verbatim, with `now` made an argument so tests are
// deterministic. The model itself changes in A.4 (flat $5 plan) — in this
// file, once, instead of in four.
//
// PURE + dependency-free so it imports into both the Vite app and node --test.

export const FREE_PLAN_MAX_USERS = 10;

/** Does the subscription document grant hub `name` right now? */
export function hasHub(sub, name, now = new Date()) {
  if (!sub) return false;
  if (sub.grandfathered) return true;
  // Flat "ChurchOpsHub" plan ($15/mo or $150/yr) unlocks every paid hub.
  if (sub.plan === 'pro' || sub.plan === 'all_in') return true;
  // Active 90-day trial — freeHubsSelected is null while trial is running
  if (sub.freeHubsSelected === null && sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
    return (sub.trialHubs || []).includes(name);
  }
  // Post-trial: auto-selected free hubs
  if (Array.isArray(sub.freeHubsSelected) && sub.freeHubsSelected.includes(name)) return true;
  return (sub.hubs || []).includes(name);
}

/** May the church add one more member, given it has `currentUserCount` now? */
export function canAddUser(sub, currentUserCount) {
  if (!sub) return currentUserCount < FREE_PLAN_MAX_USERS;
  if (sub.grandfathered) return true;
  if (sub.plan === 'pro' || sub.plan === 'team_unlimited' || sub.plan === 'all_in') return true;
  return currentUserCount < (sub.maxUsers || FREE_PLAN_MAX_USERS);
}

/** Is hub `hubName` granted only by an in-window trial (as opposed to paid)? */
export function isTrialing(sub, hubName, now = new Date()) {
  if (!sub) return false;
  if (sub.freeHubsSelected !== null) return false;
  if (!sub.trialEndsAt || new Date(sub.trialEndsAt) <= now) return false;
  return (sub.trialHubs || []).includes(hubName);
}

/** Whole days left in the trial window; 0 once expired or processed. */
export function trialDaysRemaining(sub, now = new Date()) {
  if (!sub?.trialEndsAt || sub.freeHubsSelected !== null) return 0;
  const ms = new Date(sub.trialEndsAt) - now;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
