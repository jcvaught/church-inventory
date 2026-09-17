// lookupChurchByCode — the join-by-code resolver, and (COH-012 A.4.4) the
// server-side half of "a lapsed church can't add more": joining IS adding a
// member, so a lapsed church's code resolves to failed-precondition with a
// message that says who can fix it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, mockCallable } from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let n = 0;
const fresh = () => `lc-${Date.now()}-${n++}`;
const freshCode = () => `C${(Date.now() % 100000).toString(36)}${(n++).toString(36)}`.toUpperCase();
async function seedChurch(code, sub) {
  const churchId = `${fresh()}-church`;
  await db().doc(`churches/${churchId}`).set({ name: 'LC', churchCode: code });
  if (sub) await db().doc(`churches/${churchId}/config/subscription`).set(sub);
  return churchId;
}
async function caller() {
  const u = fresh();
  await db().doc(`users/${u}`).set({ role: 'user', churchId: 'elsewhere', email: `${u}@test.com`, active: true });
  return u;
}
const FUTURE = '2026-12-01T00:00:00Z';
const PAST = '2026-08-12T00:00:00Z';

test('unknown code → { found: false }', async () => {
  const out = await funcs.lookupChurchByCode.run(mockCallable(await caller(), { code: 'NOPE' + fresh() }));
  assert.deepEqual(out, { found: false });
});

for (const [label, sub] of [
  ['trialing', { plan: 'free', status: 'trialing', trialEndsAt: FUTURE, grandfathered: false }],
  ['paid', { plan: 'flat', status: 'active', grandfathered: false }],
  ['grandfathered', { plan: 'all_in', status: 'active', grandfathered: true }],
]) {
  test(`${label} church → resolves`, async () => {
    const code = freshCode();
    const churchId = await seedChurch(code, sub);
    const out = await funcs.lookupChurchByCode.run(mockCallable(await caller(), { code: code.toLowerCase() }));
    assert.deepEqual(out, { found: true, churchId });
  });
}

for (const [label, sub] of [
  ['expired trial', { plan: 'free', status: 'active', trialEndsAt: PAST, trialExpiredAt: PAST, grandfathered: false }],
  ['canceled', { plan: 'free', status: 'canceled', grandfathered: false }],
  ['no subscription document', null],
]) {
  test(`${label} church → failed-precondition, code not leaked as "invalid"`, async () => {
    const code = freshCode();
    await seedChurch(code, sub);
    const u = await caller();
    await assert.rejects(
      () => funcs.lookupChurchByCode.run(mockCallable(u, { code })),
      (e) => e.code === 'failed-precondition' && /90 days are up/.test(e.message),
    );
  });
}
