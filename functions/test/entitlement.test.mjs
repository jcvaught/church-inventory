// COH-012 A.4.0a — entitlement parity + pinned semantics.
//
// Two jobs:
//   1. PARITY — functions/lib/entitlement.js (CJS twin) ≡ src/lib/entitlement.js
//      across the full fixture matrix, for every exported predicate.
//   2. PINNED — the CURRENT-shape semantics, written down as a table so that
//      A.4 (flat $5 model) changes them on purpose, in this file, not by
//      accident somewhere else. Every row here is today's behavior, including
//      the two divergences the rules gate has from the client (see
//      functions/test/rules/core-collections.test.mjs, "COH-012 pin").

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as client from '../../src/lib/entitlement.js';
import server from '../lib/entitlement.js'; // CJS twin (default import = module.exports)

const NOW = new Date('2026-09-17T12:00:00Z');
const FUTURE = '2026-12-01T00:00:00Z';
const PAST = '2026-08-12T00:00:00Z';
const ALL = ['maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];

// The current-shape matrix. Names are the states A.4.0 step 2 lists, plus the
// edge shapes the webhook and the missing-doc default can produce.
export const FIXTURES = {
  missing:            null,
  defaultFree:        { plan: 'free', hubs: [], maxUsers: 10, status: 'active', grandfathered: false },
  grandfathered:      { plan: 'all_in', grandfathered: true, status: 'active' },
  pro:                { plan: 'pro', hubs: ALL, freeHubsSelected: ALL, maxUsers: 9999, status: 'active', grandfathered: false },
  allIn:              { plan: 'all_in', hubs: ALL, maxUsers: 9999, status: 'active', grandfathered: false },
  trialingInWindow:   { plan: 'free', hubs: [], trialHubs: ALL, freeHubsSelected: null, trialEndsAt: FUTURE, status: 'trialing', grandfathered: false },
  trialingJobsOnly:   { plan: 'free', hubs: [], trialHubs: ['jobs'], freeHubsSelected: null, trialEndsAt: FUTURE, status: 'trialing', grandfathered: false },
  expiredWithArray:   { plan: 'free', hubs: [], trialHubs: ALL, freeHubsSelected: ['tasks', 'jobs'], trialEndsAt: PAST, status: 'active', grandfathered: false }, // pre-A.3 lapsed
  expiredWithNull:    { plan: 'free', hubs: [], trialHubs: ALL, freeHubsSelected: null, trialEndsAt: PAST, trialExpiredAt: '2026-09-17T07:00:00Z', status: 'active', grandfathered: false }, // post-A.3 lapsed
  perHubOnly:         { plan: 'free', hubs: ['insights'], maxUsers: 10, status: 'active', grandfathered: false },
  team25:             { plan: 'team_25', hubs: [], maxUsers: 25, status: 'active', grandfathered: false },
  teamUnlimited:      { plan: 'team_unlimited', hubs: [], maxUsers: 9999, status: 'active', grandfathered: false },
  canceled:           { plan: 'free', hubs: [], freeHubsSelected: [], maxUsers: 10, status: 'canceled', grandfathered: false },
};

// ── 1. PARITY ────────────────────────────────────────────────────────────────

test('PARITY — FREE_PLAN_MAX_USERS agrees', () => {
  assert.equal(server.FREE_PLAN_MAX_USERS, client.FREE_PLAN_MAX_USERS);
});

test('PARITY — hasHub / isTrialing / trialDaysRemaining / canAddUser agree across the matrix', () => {
  const nows = [NOW, new Date('2026-08-11T00:00:00Z'), new Date('2027-01-01T00:00:00Z')];
  const counts = [0, 9, 10, 11, 25, 26, 500];
  let checked = 0;
  for (const [name, sub] of Object.entries(FIXTURES)) {
    for (const now of nows) {
      for (const hub of [...ALL, 'inventory', 'nope']) {
        assert.equal(server.hasHub(sub, hub, now), client.hasHub(sub, hub, now), `hasHub ${name}/${hub}@${now.toISOString()}`);
        assert.equal(server.isTrialing(sub, hub, now), client.isTrialing(sub, hub, now), `isTrialing ${name}/${hub}`);
        checked += 2;
      }
      assert.equal(server.trialDaysRemaining(sub, now), client.trialDaysRemaining(sub, now), `trialDaysRemaining ${name}`);
      checked++;
    }
    for (const c of counts) {
      assert.equal(server.canAddUser(sub, c), client.canAddUser(sub, c), `canAddUser ${name}/${c}`);
      checked++;
    }
  }
  assert.ok(checked > 800, `matrix exercised (${checked} comparisons)`);
});

// ── 2. PINNED current-shape semantics ────────────────────────────────────────
// hasHub('jobs') per fixture, at NOW. Change this table in A.4, deliberately.

const PINNED_HAS_JOBS = {
  missing: false,
  defaultFree: false,
  grandfathered: true,
  pro: true,
  allIn: true,
  trialingInWindow: true,
  trialingJobsOnly: true,
  expiredWithArray: true,    // 'jobs' was auto-selected — the pre-A.3 free tier
  expiredWithNull: false,    // post-A.3: nothing granted at expiry (client + functions; NOT rules — B14)
  perHubOnly: false,
  team25: false,
  teamUnlimited: false,
  canceled: false,
};

test('PINNED — hasHub("jobs") across the current-shape matrix', () => {
  for (const [name, expected] of Object.entries(PINNED_HAS_JOBS)) {
    assert.equal(client.hasHub(FIXTURES[name], 'jobs', NOW), expected, name);
  }
  assert.deepEqual(Object.keys(PINNED_HAS_JOBS).sort(), Object.keys(FIXTURES).sort(), 'every fixture is pinned');
});

test('PINNED — trial-window edge is exclusive at trialEndsAt', () => {
  const sub = FIXTURES.trialingInWindow;
  const at = new Date(FUTURE);
  assert.equal(client.hasHub(sub, 'jobs', new Date(at.getTime() - 1)), true);
  assert.equal(client.hasHub(sub, 'jobs', at), false);
  assert.equal(client.isTrialing(sub, 'jobs', at), false);
  assert.equal(client.trialDaysRemaining(sub, at), 0);
});

test('PINNED — canAddUser: 10-seat cap unless pro/team_unlimited/all_in/grandfathered', () => {
  assert.equal(client.canAddUser(FIXTURES.defaultFree, 9), true);
  assert.equal(client.canAddUser(FIXTURES.defaultFree, 10), false);
  assert.equal(client.canAddUser(FIXTURES.missing, 10), false);
  assert.equal(client.canAddUser(FIXTURES.team25, 24), true);
  assert.equal(client.canAddUser(FIXTURES.team25, 25), false);
  assert.equal(client.canAddUser(FIXTURES.trialingInWindow, 10), false); // trial does NOT lift the cap today
  for (const n of ['pro', 'teamUnlimited', 'allIn', 'grandfathered']) {
    assert.equal(client.canAddUser(FIXTURES[n], 5000), true, n);
  }
});

test('PINNED — trialDaysRemaining rounds up and is 0 once freeHubsSelected is written', () => {
  const sub = { ...FIXTURES.trialingInWindow, trialEndsAt: '2026-09-20T00:00:00Z' };
  assert.equal(client.trialDaysRemaining(sub, NOW), 3); // 2.5 days → 3
  assert.equal(client.trialDaysRemaining(FIXTURES.expiredWithArray, NOW), 0);
  assert.equal(client.trialDaysRemaining(FIXTURES.expiredWithNull, NOW), 0);
});
