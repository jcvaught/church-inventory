// COH-012 A.4 — entitlement model, SERVER TWIN of src/lib/entitlement.js.
// Cloud Functions are CommonJS and the deploy package only contains functions/,
// so this cannot import the ESM module at runtime — it carries the same code.
//
// ⚠️ GENERATED from src/lib/entitlement.js by scripts/entitlement-twin.py
// (export keywords stripped, module.exports appended). KEEP IN SYNC:
// functions/test/entitlement.test.mjs imports BOTH and asserts identical output
// across the fixture matrix. Any drift fails the test.

const PLAN_FLAT = 'flat';
const PAID_STATUSES = ['active', 'past_due'];
const TRIAL_DAYS = 90;
const PRICE = { monthly: 5, annual: 50 };

/** Every hub, in display order. All included; none free, none extra. */
const ALL_HUBS = ['inventory', 'reservations', 'maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];
/** @deprecated A.4: kept for callers that still list "paid" hubs; equals ALL_HUBS minus the two that used to be free. */
const PAID_HUBS = ['maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];

function isTrialing(sub, now = new Date()) {
  return !!(sub && sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt) > now);
}

function isPaid(sub) {
  return !!(sub && sub.plan === PLAN_FLAT && PAID_STATUSES.includes(sub.status));
}

/** grandfathered || trialing || paid. The one predicate every gate reduces to. */
function isEntitled(sub, now = new Date()) {
  if (!sub) return false;
  if (sub.grandfathered === true) return true;
  return isTrialing(sub, now) || isPaid(sub);
}

/** Has a subscription document and is not entitled. */
function isLapsed(sub, now = new Date()) {
  return !!sub && !isEntitled(sub, now);
}

/** 'grandfathered' | 'trialing' | 'paid' | 'lapsed' | 'none' (no document). */
function entitlementState(sub, now = new Date()) {
  if (!sub) return 'none';
  if (sub.grandfathered === true) return 'grandfathered';
  if (isTrialing(sub, now)) return 'trialing';
  if (isPaid(sub)) return 'paid';
  return 'lapsed';
}

/**
 * Does the church HAVE hub `name`? Under the flat model every hub is included
 * and a lapsed church keeps every hub — it finishes what it started (owner
 * decision #3). So this is true whenever a subscription document exists; it
 * is NOT the billing state. Billing is isEntitled(); "may it start something
 * new" is canCreate(). `name` is accepted for call-site stability. The one
 * server consumer that CREATES records (generateRecurringTemplateTasks) uses
 * canCreate, not this.
 */
function hasHub(sub, _name, _now = new Date()) {
  return !!sub;
}

/** Day-91 rule: may the church start something new (item, task, reservation, member…)? */
function canCreate(sub, now = new Date()) {
  return isEntitled(sub, now);
}

/** No seat cap in any state (owner #5); a lapsed church cannot add a member (#3). */
function canAddUser(sub, _currentUserCount, now = new Date()) {
  return isEntitled(sub, now);
}

/** Seat cap to display: always unlimited now. Kept so Settings reads one source. */
function maxUsers(_sub) {
  return null;
}

/** Alias kept from A.4.0b; SettingsPage's `isTrialing`. */
const inTrialWindow = isTrialing;

/** Whole days left in the trial; 0 unless status is 'trialing' and the window is open. */
function trialDaysRemaining(sub, now = new Date()) {
  if (!isTrialing(sub, now)) return 0;
  const ms = new Date(sub.trialEndsAt) - now;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Human plan name for the Settings billing card. */
function planLabel(sub, now = new Date()) {
  switch (entitlementState(sub, now)) {
    case 'grandfathered': return 'ChurchOpsHub (included)';
    case 'trialing': return '90-Day Trial';
    case 'paid': return sub.status === 'past_due' ? 'ChurchOpsHub — payment past due' : 'ChurchOpsHub';
    case 'lapsed': return 'None';
    default: return 'None';
  }
}

module.exports = { PLAN_FLAT, PAID_STATUSES, TRIAL_DAYS, PRICE, ALL_HUBS, PAID_HUBS, isTrialing, isPaid, isEntitled, isLapsed, entitlementState, hasHub, canCreate, canAddUser, maxUsers, inTrialWindow, trialDaysRemaining, planLabel };
