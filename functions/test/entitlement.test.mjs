// COH-012 A.4 — entitlement parity + pinned semantics for the FLAT model.
//
//   1. PARITY — functions/lib/entitlement.js (CJS twin) ≡ src/lib/entitlement.js
//      across the fixture matrix, for every export.
//   2. PINNED — the flat-model semantics written down as a table. The rules'
//      Jobs gate is pinned to the SAME fixtures in
//      functions/test/rules/core-collections.test.mjs ("COH-012 pin"); the one
//      row where rules and client are allowed to differ is named there.
//
// History: A.4.0a pinned the OLD shape (trialHubs / freeHubsSelected / plan
// 'pro') so A.4 could change it on purpose. This file is that change.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as client from '../../src/lib/entitlement.js';
import server from '../lib/entitlement.js'; // CJS twin (default import = module.exports)

const NOW = new Date('2026-09-17T12:00:00Z');
const FUTURE = '2026-12-01T00:00:00Z';
const PAST = '2026-08-12T00:00:00Z';
const HUBS = client.ALL_HUBS;

// The matrix. New-shape states first, then every legacy / edge shape a real
// document can still have — all of which must read as LAPSED (or grandfathered).
export const FIXTURES = {
  // ── flat model ──
  missing:              null,
  grandfathered:        { plan: 'all_in', grandfathered: true, status: 'active' },                       // FXCC, TrueNorth, e2e
  trialing:             { plan: 'free', status: 'trialing', trialEndsAt: FUTURE, grandfathered: false },  // useAuth at signup
  trialingPastEnd:      { plan: 'free', status: 'trialing', trialEndsAt: PAST, grandfathered: false },    // between trialEndsAt and the 02:00 cron
  lapsedExpired:        { plan: 'free', status: 'active', trialEndsAt: PAST, trialExpiredAt: '2026-08-13T07:00:00Z', grandfathered: false }, // cron output
  paidActive:           { plan: 'flat', status: 'active', grandfathered: false },
  paidPastDue:          { plan: 'flat', status: 'past_due', grandfathered: false },
  paidUnpaid:           { plan: 'flat', status: 'unpaid', grandfathered: false },
  paidCanceled:         { plan: 'free', status: 'canceled', grandfathered: false },                       // webhook cancellation output
  flatButTrialingFlag:  { plan: 'flat', status: 'trialing', trialEndsAt: PAST, grandfathered: false },    // Stripe 'trialing' status on a flat plan, window over
  // ── legacy shapes still on disk or in old fixtures ──
  defaultFree:          { plan: 'free', hubs: [], maxUsers: 10, status: 'active', grandfathered: false },
  legacyPro:            { plan: 'pro', hubs: client.PAID_HUBS, freeHubsSelected: client.PAID_HUBS, status: 'active', grandfathered: false },
  legacyAllIn:          { plan: 'all_in', hubs: client.PAID_HUBS, status: 'active', grandfathered: false },
  legacyTrialOldShape:  { plan: 'free', hubs: [], trialHubs: client.PAID_HUBS, freeHubsSelected: null, trialEndsAt: FUTURE, status: 'trialing', grandfathered: false },
  legacyExpiredArray:   { plan: 'free', hubs: [], trialHubs: client.PAID_HUBS, freeHubsSelected: ['tasks', 'jobs'], trialEndsAt: PAST, status: 'active', grandfathered: false }, // St Olaf today
  legacyExpiredNull:    { plan: 'free', hubs: [], trialHubs: client.PAID_HUBS, freeHubsSelected: null, trialEndsAt: PAST, trialExpiredAt: '2026-09-17T07:00:00Z', status: 'active', grandfathered: false },
  legacyPerHub:         { plan: 'free', hubs: ['insights'], maxUsers: 10, status: 'active', grandfathered: false },
  legacyTeam25:         { plan: 'team_25', hubs: [], maxUsers: 25, status: 'active', grandfathered: false },
};

// ── 1. PARITY ────────────────────────────────────────────────────────────────

test('PARITY — constants agree', () => {
  for (const k of ['PLAN_FLAT', 'PAID_STATUSES', 'TRIAL_DAYS', 'PRICE', 'ALL_HUBS', 'PAID_HUBS']) {
    assert.deepEqual(server[k], client[k], k);
  }
});

test('PARITY — every predicate agrees across the matrix', () => {
  const nows = [NOW, new Date('2026-08-11T00:00:00Z'), new Date('2027-01-01T00:00:00Z')];
  let checked = 0;
  for (const [name, sub] of Object.entries(FIXTURES)) {
    for (const now of nows) {
      for (const fn of ['isTrialing', 'isEntitled', 'isLapsed', 'entitlementState', 'canCreate', 'trialDaysRemaining', 'planLabel', 'inTrialWindow']) {
        assert.equal(server[fn](sub, now), client[fn](sub, now), `${fn} ${name}@${now.toISOString()}`);
        checked++;
      }
      for (const hub of [...HUBS, 'nope']) {
        assert.equal(server.hasHub(sub, hub, now), client.hasHub(sub, hub, now), `hasHub ${name}/${hub}`);
        checked++;
      }
      for (const c of [0, 9, 10, 11, 500]) {
        assert.equal(server.canAddUser(sub, c, now), client.canAddUser(sub, c, now), `canAddUser ${name}/${c}`);
        checked++;
      }
    }
    assert.equal(server.isPaid(sub), client.isPaid(sub), `isPaid ${name}`);
    assert.equal(server.maxUsers(sub), client.maxUsers(sub), `maxUsers ${name}`);
    checked += 2;
  }
  assert.ok(checked > 1000, `matrix exercised (${checked} comparisons)`);
});

// ── 2. PINNED flat-model semantics ───────────────────────────────────────────

const PINNED_STATE = {
  missing: 'none',
  grandfathered: 'grandfathered',
  trialing: 'trialing',
  trialingPastEnd: 'lapsed',       // client/functions: window over. Rules still allow until the cron flips status (≤1 day, accepted)
  lapsedExpired: 'lapsed',
  paidActive: 'paid',
  paidPastDue: 'paid',             // dunning window keeps access
  paidUnpaid: 'lapsed',
  paidCanceled: 'lapsed',
  flatButTrialingFlag: 'lapsed',   // 'trialing' status + expired window is not paid, whatever the plan says
  defaultFree: 'lapsed',
  legacyPro: 'lapsed',             // legacy plan values are no longer read; nobody is on them (0 Stripe customers)
  legacyAllIn: 'lapsed',
  legacyTrialOldShape: 'trialing', // status+trialEndsAt carry the trial; trialHubs/freeHubsSelected are ignored
  legacyExpiredArray: 'lapsed',    // St Olaf: the two auto-selected hubs are gone (owner #7, no grace)
  legacyExpiredNull: 'lapsed',
  legacyPerHub: 'lapsed',
  legacyTeam25: 'lapsed',
};

test('PINNED — entitlementState across the matrix', () => {
  for (const [name, expected] of Object.entries(PINNED_STATE)) {
    assert.equal(client.entitlementState(FIXTURES[name], NOW), expected, name);
  }
  assert.deepEqual(Object.keys(PINNED_STATE).sort(), Object.keys(FIXTURES).sort(), 'every fixture is pinned');
});

test('PINNED — hasHub is the same answer for every hub; canCreate and canAddUser follow it', () => {
  for (const [name, sub] of Object.entries(FIXTURES)) {
    const entitled = ['grandfathered', 'trialing', 'paid'].includes(PINNED_STATE[name]);
    for (const hub of HUBS) assert.equal(client.hasHub(sub, hub, NOW), entitled, `${name}/${hub}`);
    assert.equal(client.isEntitled(sub, NOW), entitled, `isEntitled ${name}`);
    assert.equal(client.canCreate(sub, NOW), entitled, `canCreate ${name}`);
    assert.equal(client.canAddUser(sub, 10, NOW), entitled, `canAddUser@10 ${name}`);
    assert.equal(client.canAddUser(sub, 5000, NOW), entitled, `canAddUser@5000 ${name} (no seat cap)`);
    assert.equal(client.maxUsers(sub), null, `maxUsers ${name} (unlimited)`);
    assert.equal(client.isLapsed(sub, NOW), !!sub && !entitled, `isLapsed ${name}`);
  }
});

test('PINNED — trial window edge is exclusive at trialEndsAt', () => {
  const sub = FIXTURES.trialing;
  const at = new Date(FUTURE);
  assert.equal(client.isEntitled(sub, new Date(at.getTime() - 1)), true);
  assert.equal(client.isEntitled(sub, at), false);
  assert.equal(client.trialDaysRemaining(sub, at), 0);
});

test('PINNED — trialDaysRemaining rounds up, and is 0 for every non-trialing state', () => {
  assert.equal(client.trialDaysRemaining({ ...FIXTURES.trialing, trialEndsAt: '2026-09-20T00:00:00Z' }, NOW), 3);
  for (const [name, sub] of Object.entries(FIXTURES)) {
    if (PINNED_STATE[name] !== 'trialing') assert.equal(client.trialDaysRemaining(sub, NOW), 0, name);
  }
});

test('PINNED — planLabel', () => {
  const expected = {
    missing: 'Trial ended', grandfathered: 'ChurchOpsHub (included)', trialing: '90-Day Trial',
    trialingPastEnd: 'Trial ended', lapsedExpired: 'Trial ended', paidActive: 'ChurchOpsHub',
    paidPastDue: 'ChurchOpsHub — payment past due', paidUnpaid: 'Trial ended', paidCanceled: 'Canceled',
    flatButTrialingFlag: 'Trial ended', defaultFree: 'Trial ended', legacyPro: 'Trial ended',
    legacyAllIn: 'Trial ended', legacyTrialOldShape: '90-Day Trial', legacyExpiredArray: 'Trial ended',
    legacyExpiredNull: 'Trial ended', legacyPerHub: 'Trial ended', legacyTeam25: 'Trial ended',
  };
  for (const [name, label] of Object.entries(expected)) assert.equal(client.planLabel(FIXTURES[name], NOW), label, name);
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(FIXTURES).sort());
});

test('PINNED — grandfathered wins over everything, including a canceled status', () => {
  assert.equal(client.isEntitled({ grandfathered: true, plan: 'free', status: 'canceled' }, NOW), true);
  assert.equal(client.isEntitled({ grandfathered: 'true', plan: 'free', status: 'active' }, NOW), false, 'strict boolean, as in the rules');
});
