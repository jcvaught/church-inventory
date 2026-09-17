// COH-012 A.4 — the entitlement model, in ONE place.
//
// DEC-2026-021: every church gets 90 days of everything, then $5/month or
// $50/year for everything. No free tier, no per-hub purchase, no seat cap.
// A church that does not pay is LAPSED: it finishes what it started (returns
// equipment, completes tasks, closes reservations) and starts nothing new —
// owner decision #3, "they can't add more". Entitlement is NOT a security
// boundary (AGENTS.md); it is enforced in the client and the callables, and in
// firestore.rules only where a gate already existed (Jobs).
//
// Four states, derived from the subscription document — never stored:
//
//   grandfathered  grandfathered == true                    (FXCC, TrueNorth, e2e)
//   trialing       status == 'trialing' && trialEndsAt > now  (useAuth writes it at signup;
//                  processTrialExpirations flips status to 'active' at 02:00 Central)
//   paid           plan == 'flat' && status in PAID_STATUSES  (stripeWebhook writes it;
//                  'past_due' keeps access through Stripe's dunning window)
//   lapsed         none of the above
//
// Legacy fields (`hubs`, `trialHubs`, `freeHubsSelected`, `plan: 'pro'|'all_in'|
// 'team_*'`) are no longer READ. Documents are not rewritten; legacy Stripe
// events are normalized to the flat shape on arrival (functions/index.js).
//
// The server twin is functions/lib/entitlement.js; functions/test/
// entitlement.test.mjs pins twin ≡ client and pins the rules' Jobs gate to
// the same fixture matrix. PURE + dependency-free.

export const PLAN_FLAT = 'flat';
export const PAID_STATUSES = ['active', 'past_due'];
export const TRIAL_DAYS = 90;
export const PRICE = { monthly: 5, annual: 50 };

/** Every hub, in display order. All included; none free, none extra. */
export const ALL_HUBS = ['inventory', 'reservations', 'maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];
/** @deprecated A.4: kept for callers that still list "paid" hubs; equals ALL_HUBS minus the two that used to be free. */
export const PAID_HUBS = ['maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];

export function isTrialing(sub, now = new Date()) {
  return !!(sub && sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt) > now);
}

export function isPaid(sub) {
  return !!(sub && sub.plan === PLAN_FLAT && PAID_STATUSES.includes(sub.status));
}

/** grandfathered || trialing || paid. The one predicate every gate reduces to. */
export function isEntitled(sub, now = new Date()) {
  if (!sub) return false;
  if (sub.grandfathered === true) return true;
  return isTrialing(sub, now) || isPaid(sub);
}

/** Has a subscription document and is not entitled. */
export function isLapsed(sub, now = new Date()) {
  return !!sub && !isEntitled(sub, now);
}

/** 'grandfathered' | 'trialing' | 'paid' | 'lapsed' | 'none' (no document). */
export function entitlementState(sub, now = new Date()) {
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
export function hasHub(sub, _name, _now = new Date()) {
  return !!sub;
}

/** Day-91 rule: may the church start something new (item, task, reservation, member…)? */
export function canCreate(sub, now = new Date()) {
  return isEntitled(sub, now);
}

/** No seat cap in any state (owner #5); a lapsed church cannot add a member (#3). */
export function canAddUser(sub, _currentUserCount, now = new Date()) {
  return isEntitled(sub, now);
}

/** Seat cap to display: always unlimited now. Kept so Settings reads one source. */
export function maxUsers(_sub) {
  return null;
}

/** Alias kept from A.4.0b; SettingsPage's `isTrialing`. */
export const inTrialWindow = isTrialing;

/** Whole days left in the trial; 0 unless status is 'trialing' and the window is open. */
export function trialDaysRemaining(sub, now = new Date()) {
  if (!isTrialing(sub, now)) return 0;
  const ms = new Date(sub.trialEndsAt) - now;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Human plan name for the Settings billing card. */
export function planLabel(sub, now = new Date()) {
  switch (entitlementState(sub, now)) {
    case 'grandfathered': return 'ChurchOpsHub (included)';
    case 'trialing': return '90-Day Trial';
    case 'paid': return sub.status === 'past_due' ? 'ChurchOpsHub — payment past due' : 'ChurchOpsHub';
    case 'lapsed': return 'None';
    default: return 'None';
  }
}
