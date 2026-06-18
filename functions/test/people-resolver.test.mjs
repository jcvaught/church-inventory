// Foundation F2 — People resolver unit tests. Runs under `npm run test:unit`
// (node --test, no emulator). Imports the PURE src/lib/people.js directly (root
// package.json is type:module, so node loads the .js as ESM).
//
// The PARITY suite pins the resolver's isEligibleFor to a verbatim copy of the
// server's isAccessEligible (functions/index.js) so the two can't drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeRef,
  refKey,
  expiryStatus,
  complianceStatusForTracked,
  getPerson,
  listPeople,
  isEligibleFor,
  shiftReadiness,
  EXPIRY_CRITICAL_DAYS,
  EXPIRY_WARNING_DAYS,
} from '../../src/lib/people.js';

// A fixed "today" so date math is deterministic regardless of when the suite runs.
const TODAY = new Date(2026, 5, 17); // 2026-06-17 (month is 0-indexed)
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ── shiftReadiness (Event-Day ops; built on isEligibleFor + expiryStatus) ────
test('shiftReadiness — null when the shift has no requirements (no gate)', () => {
  assert.equal(shiftReadiness({ linkedTrackedId: 'p1' }, [], [], TODAY), null);
  assert.equal(shiftReadiness(null, undefined, [], TODAY), null);
});

test('shiftReadiness — blocked when unresolved/unlinked, missing, or expired', () => {
  const reqs = ['background_check'];
  assert.equal(shiftReadiness(null, reqs, [], TODAY).level, 'blocked');                     // unresolved person
  assert.equal(shiftReadiness({ linkedTrackedId: null }, reqs, [], TODAY).level, 'blocked'); // no tracked record
  const person = { linkedTrackedId: 'p1' };
  assert.equal(shiftReadiness(person, reqs, [], TODAY).level, 'blocked');                    // no record of the type
  const expired = [{ personId: 'p1', type: 'background_check', expiryDate: ymd(2025, 1, 1) }];
  assert.equal(shiftReadiness(person, reqs, expired, TODAY).level, 'blocked');               // expired record
});

test('shiftReadiness — ok when eligible and nothing expiring', () => {
  const person = { linkedTrackedId: 'p1' };
  const recs = [{ personId: 'p1', type: 'background_check', expiryDate: ymd(2030, 1, 1) }];
  assert.equal(shiftReadiness(person, ['background_check'], recs, TODAY).level, 'ok');
  // a record with no expiry date never lapses → ok
  assert.equal(shiftReadiness(person, ['background_check'], [{ personId: 'p1', type: 'background_check' }], TODAY).level, 'ok');
});

test('shiftReadiness — soon when a required record is inside the expiry window', () => {
  const person = { linkedTrackedId: 'p1' };
  const warn = [{ personId: 'p1', type: 'background_check', expiryDate: ymd(2026, 7, 1) }]; // ~14d out (within 30)
  assert.equal(shiftReadiness(person, ['background_check'], warn, TODAY).level, 'soon');
  // but a second, longer-dated record of the same type clears it back to ok
  const alsoFresh = [...warn, { personId: 'p1', type: 'background_check', expiryDate: ymd(2030, 1, 1) }];
  assert.equal(shiftReadiness(person, ['background_check'], alsoFresh, TODAY).level, 'ok');
});

test('shiftReadiness — multi-requirement: blocked if ANY type missing, soon if any valid-but-expiring', () => {
  const person = { linkedTrackedId: 'p1' };
  const recs = [{ personId: 'p1', type: 'background_check', expiryDate: ymd(2030, 1, 1) }];
  assert.equal(shiftReadiness(person, ['background_check', 'certification'], recs, TODAY).level, 'blocked'); // cert missing
  const both = [...recs, { personId: 'p1', type: 'certification', expiryDate: ymd(2026, 7, 1) }];
  assert.equal(shiftReadiness(person, ['background_check', 'certification'], both, TODAY).level, 'soon'); // cert expiring
});

// ── PersonRef ────────────────────────────────────────────────────────────────
test('refKey is stable and kind-scoped', () => {
  assert.equal(refKey(makeRef('user', 'u1')), 'user:u1');
  assert.equal(refKey(makeRef('tracked', 'p1')), 'tracked:p1');
  assert.notEqual(refKey(makeRef('user', 'x')), refKey(makeRef('tracked', 'x')));
  assert.equal(refKey(null), '');
});

// ── expiryStatus thresholds ────────────────────────────────────────────────────
test('expiryStatus classifies against the shared windows', () => {
  assert.equal(expiryStatus(null, TODAY), null);                 // no expiry never lapses
  assert.equal(expiryStatus(ymd(2026, 6, 16), TODAY), 'expired'); // yesterday
  assert.equal(expiryStatus(ymd(2026, 6, 17), TODAY), 'critical'); // today (>= start of day)
  assert.equal(expiryStatus(ymd(2026, 6, 17 + EXPIRY_CRITICAL_DAYS), TODAY), 'critical'); // edge of critical
  assert.equal(expiryStatus(ymd(2026, 6, 25), TODAY), 'warning'); // within 30
  assert.equal(expiryStatus(ymd(2026, 6, 17 + EXPIRY_WARNING_DAYS), TODAY), 'warning'); // edge of warning
  assert.equal(expiryStatus(ymd(2026, 8, 1), TODAY), 'ok');       // far future
});

// ── complianceStatus ───────────────────────────────────────────────────────────
test('complianceStatusForTracked summarizes only that person, classifying each record', () => {
  const records = [
    { personId: 'p1', type: 'background_check', expiryDate: ymd(2026, 6, 10) }, // expired
    { personId: 'p1', type: 'certification', expiryDate: ymd(2026, 6, 20) },    // critical
    { personId: 'p1', type: 'key_assignment', expiryDate: null },               // never lapses
    { personId: 'p2', type: 'background_check', expiryDate: ymd(2026, 6, 1) },   // other person
  ];
  const cs = complianceStatusForTracked('p1', records, TODAY);
  assert.equal(cs.ok, false); // has an expired record
  assert.equal(cs.expired.length, 1);
  assert.equal(cs.expired[0].type, 'background_check');
  assert.equal(cs.expiringSoon.length, 1);
  assert.equal(cs.expiringSoon[0].type, 'certification');
});

test('complianceStatus is ok when nothing is expired (incl. zero records)', () => {
  assert.deepEqual(complianceStatusForTracked('nobody', [], TODAY), { ok: true, expiringSoon: [], expired: [] });
});

// ── getPerson: the link collapse ─────────────────────────────────────────────
const users = [
  { id: 'uAdmin', name: 'Ada Admin', role: 'admin', email: 'ada@x.org' },
  { id: 'uMgr', name: 'Max Manager', role: 'manager', email: 'max@x.org' },
  { id: 'uVol', name: 'Val Volunteer', role: 'user', email: 'val@x.org', phone: '+15551112222' },
  { id: 'uLonelyContractor', name: 'Cory Contractor (user)', role: 'user', email: 'cory@x.org' },
];
const accessPeople = [
  // linked to a user AND a contractor → one person, two roles, a rate
  { _docId: 'pCory', name: 'Cory Contractor', personType: 'contractor', hourlyRate: 42, userId: 'uLonelyContractor', email: 'cory.tracked@x.org', active: true },
  // tracked-only volunteer, no login
  { _docId: 'pNoLogin', name: 'Nora NoLogin', personType: 'volunteer', userId: null, active: true },
  // archived tracked person
  { _docId: 'pArchived', name: 'Old Record', personType: 'member', userId: null, active: false },
];
const accessRecords = [
  { personId: 'pCory', type: 'background_check', expiryDate: ymd(2026, 12, 1) }, // ok
];
const ctx = { users, accessPeople, accessRecords, today: TODAY };

test('getPerson collapses a linked user+contractor into one Person', () => {
  const viaUser = getPerson(makeRef('user', 'uLonelyContractor'), ctx);
  const viaTracked = getPerson(makeRef('tracked', 'pCory'), ctx);
  // Both refs resolve to the SAME logical person, canonically user-keyed.
  assert.equal(viaUser.ref.kind, 'user');
  assert.equal(viaTracked.ref.kind, 'user');
  assert.equal(viaUser.ref.id, viaTracked.ref.id);
  assert.equal(viaUser.linkedUserId, 'uLonelyContractor');
  assert.equal(viaUser.linkedTrackedId, 'pCory');
  // Roles unioned across both sides; contractor rate surfaced.
  assert.ok(viaUser.roles.has('member'));     // role:user → member
  assert.ok(viaUser.roles.has('contractor')); // personType:contractor
  assert.equal(viaUser.hourlyRate, 42);
  // Compliance comes from the tracked side.
  assert.equal(viaUser.complianceStatus.ok, true);
});

test('getPerson resolves a user with no tracked record', () => {
  const p = getPerson(makeRef('user', 'uAdmin'), ctx);
  assert.ok(p.roles.has('admin'));
  assert.equal(p.linkedTrackedId, null);
  assert.equal(p.complianceStatus, null);
  assert.equal(p.hourlyRate, undefined);
});

test('getPerson resolves a tracked person with no login', () => {
  const p = getPerson(makeRef('tracked', 'pNoLogin'), ctx);
  assert.equal(p.ref.kind, 'tracked');
  assert.equal(p.linkedUserId, null);
  assert.ok(p.roles.has('volunteer'));
});

test('getPerson returns null for an unknown ref', () => {
  assert.equal(getPerson(makeRef('user', 'ghost'), ctx), null);
  assert.equal(getPerson(null, ctx), null);
});

// ── listPeople: dedup ──────────────────────────────────────────────────────────
test('listPeople collapses linked pairs and emits each human exactly once', () => {
  const people = listPeople(ctx);
  // 4 users + 3 tracked, but pCory collapses into uLonelyContractor → 6 distinct.
  assert.equal(people.length, 6);
  const keys = people.map(p => refKey(p.ref));
  assert.equal(new Set(keys).size, keys.length, 'no duplicate refs');
  // The linked contractor appears once, user-keyed, never as tracked:pCory.
  assert.ok(keys.includes('user:uLonelyContractor'));
  assert.ok(!keys.includes('tracked:pCory'));
  // Tracked-only people still appear.
  assert.ok(keys.includes('tracked:pNoLogin'));
  assert.ok(keys.includes('tracked:pArchived'));
  const archived = people.find(p => refKey(p.ref) === 'tracked:pArchived');
  assert.equal(archived.active, false);
});

// ── PARITY: isEligibleFor must match the server's isAccessEligible ─────────────
// Verbatim copy of functions/index.js isAccessEligible (~line 3038). If the server
// rule changes, this copy must change too — and this test will catch a resolver
// that drifts from it.
function serverIsAccessEligible(uid, requiredTypes, accessPeopleArr, accessRecordsArr, todayS) {
  if (!requiredTypes || requiredTypes.length === 0) return true;
  const linkedIds = new Set(accessPeopleArr.filter(p => p.userId === uid).map(p => p._docId));
  if (linkedIds.size === 0) return false;
  const myRecords = accessRecordsArr.filter(r => linkedIds.has(r.personId));
  return requiredTypes.every(reqType =>
    myRecords.some(r => r.type === reqType && (!r.expiryDate || r.expiryDate >= todayS))
  );
}

test('isEligibleFor matches the server isAccessEligible across cases', () => {
  const todayS = '2026-06-17';
  const people = [
    { _docId: 'pA', userId: 'uA' },
    { _docId: 'pB', userId: 'uB' },
  ];
  const records = [
    { personId: 'pA', type: 'background_check', expiryDate: ymd(2026, 12, 1) }, // valid
    { personId: 'pA', type: 'certification', expiryDate: ymd(2026, 6, 1) },     // expired
    { personId: 'pB', type: 'background_check', expiryDate: null },             // never expires
  ];
  const cases = [
    ['uA', []],                                          // no requirements → eligible
    ['uA', ['background_check']],                        // holds valid → eligible
    ['uA', ['certification']],                           // only expired → NOT
    ['uA', ['background_check', 'certification']],       // one expired → NOT
    ['uB', ['background_check']],                        // null-expiry record → eligible
    ['uGhost', ['background_check']],                    // no tracked record → NOT
  ];
  const resolverCtx = { users: [{ id: 'uA' }, { id: 'uB' }], accessPeople: people, accessRecords: records, today: TODAY };
  for (const [uid, req] of cases) {
    const expected = serverIsAccessEligible(uid, req, people, records, todayS);
    const person = getPerson(makeRef('user', uid), resolverCtx);
    const actual = isEligibleFor(person, req, records, TODAY);
    assert.equal(actual, expected, `eligibility parity failed for uid=${uid} req=[${req}]`);
  }
});
