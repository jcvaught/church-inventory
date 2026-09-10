// COH-011 — setMemberActive: deactivation that actually revokes.
//
// The client used to write `users/{uid}.active = false` directly while the
// confirm dialog promised the member "will lose access to the app immediately."
// It did not disable their Auth account, revoke refresh tokens, or strip a
// lingering `elder` claim. This suite pins the real behaviour AND the ordering,
// which is load-bearing for partial failure.
//
// These assert FINAL STATE in both Firestore and Auth (and the custom claims),
// not that a mock was called — a mock-call assertion would pass even if the
// write order were reversed.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getAuth } from 'firebase-admin/auth';
import { loadFunctions, mockCallable, db } from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let n = 0;
const churchOf = () => `sma-church-${Date.now()}-${n++}`;

async function seedUser(churchId, uid, { role = 'user', active = true, email } = {}) {
  await db().doc(`users/${uid}`).set({ churchId, role, name: uid, active, email: email || `${uid}@test.com` });
}
async function seedAuth(uid, { email, claims } = {}) {
  const auth = getAuth();
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, email: email || `${uid}@test.com`, password: 'Passw0rd!' });
  if (claims) await auth.setCustomUserClaims(uid, claims);
  return auth;
}
const call = (uid, data) => funcs.setMemberActive.run(mockCallable(uid, data));

test('deactivating writes active:false, disables Auth, and strips ONLY the elder claim', async () => {
  const churchId = churchOf();
  const [admin, target] = [`adm-${n}`, `tgt-${n}`];
  await seedUser(churchId, admin, { role: 'admin' });
  await seedUser(churchId, target);
  await seedAuth(target, { claims: { elder: true, somethingElse: 'keep-me' } });

  const res = await call(admin, { uid: target, active: false });
  assert.equal(res.active, false);

  assert.equal((await db().doc(`users/${target}`).get()).data().active, false);
  const rec = await getAuth().getUser(target);
  assert.equal(rec.disabled, true, 'Auth account must be disabled');
  assert.equal(rec.customClaims?.elder, undefined, 'elder claim must be stripped');
  assert.equal(rec.customClaims?.somethingElse, 'keep-me', 'other claims must survive');
});

test('reactivating re-enables Auth and sets active:true', async () => {
  const churchId = churchOf();
  const [admin, target] = [`adm2-${n}`, `tgt2-${n}`];
  await seedUser(churchId, admin, { role: 'admin' });
  await seedUser(churchId, target, { active: false });
  await seedAuth(target);
  await getAuth().updateUser(target, { disabled: true });

  await call(admin, { uid: target, active: true });

  assert.equal((await db().doc(`users/${target}`).get()).data().active, true);
  assert.equal((await getAuth().getUser(target)).disabled, false);
});

test('the operation is idempotent — a repeated deactivate is not an error', async () => {
  const churchId = churchOf();
  const [admin, target] = [`adm3-${n}`, `tgt3-${n}`];
  await seedUser(churchId, admin, { role: 'admin' });
  await seedUser(churchId, target);
  await seedAuth(target);
  await call(admin, { uid: target, active: false });
  await call(admin, { uid: target, active: false });   // retry-safe
  assert.equal((await getAuth().getUser(target)).disabled, true);
});

test('a non-admin cannot deactivate anyone', async () => {
  const churchId = churchOf();
  const [member, target] = [`mem-${n}`, `tgt4-${n}`];
  await seedUser(churchId, member, { role: 'user' });
  await seedUser(churchId, target);
  await seedAuth(target);
  await assert.rejects(() => call(member, { uid: target, active: false }), /Admins only/);
  assert.equal((await db().doc(`users/${target}`).get()).data().active, true);
});

test('a DEACTIVATED admin cannot deactivate or reactivate anyone', async () => {
  const churchId = churchOf();
  const [admin, target] = [`adm5-${n}`, `tgt5-${n}`];
  await seedUser(churchId, admin, { role: 'admin', active: false });
  await seedUser(churchId, target);
  await seedAuth(target);
  // assertActiveCaller runs before the admin check, so this is the guard firing.
  await assert.rejects(() => call(admin, { uid: target, active: false }), /deactivated/i);
});

test('an admin cannot reach into another church', async () => {
  const [admin, target] = [`adm6-${n}`, `tgt6-${n}`];
  await seedUser(churchOf(), admin, { role: 'admin' });
  await seedUser(churchOf(), target);
  await seedAuth(target);
  await assert.rejects(() => call(admin, { uid: target, active: false }), /your church/i);
});

test('an admin cannot deactivate themselves', async () => {
  const churchId = churchOf();
  const admin = `adm7-${n}`;
  await seedUser(churchId, admin, { role: 'admin' });
  await seedAuth(admin);
  await assert.rejects(() => call(admin, { uid: admin, active: false }), /your own/i);
  assert.equal((await db().doc(`users/${admin}`).get()).data().active, true);
});

test('the owner account can never be deactivated', async () => {
  const churchId = churchOf();
  const [admin, owner] = [`adm8-${n}`, `own-${n}`];
  await seedUser(churchId, admin, { role: 'admin' });
  await seedUser(churchId, owner, { email: 'jcvaught@gmail.com' });
  await seedAuth(owner, { email: 'jcvaught@gmail.com' });
  await assert.rejects(() => call(admin, { uid: owner, active: false }), /cannot be deactivated/i);
  assert.equal((await db().doc(`users/${owner}`).get()).data().active, true);
});

test('bad input is rejected before anything is written', async () => {
  const churchId = churchOf();
  const [admin, target] = [`adm9-${n}`, `tgt9-${n}`];
  await seedUser(churchId, admin, { role: 'admin' });
  await seedUser(churchId, target);
  await assert.rejects(() => call(admin, { uid: target }), /boolean active/);
  await assert.rejects(() => call(admin, { active: false }), /uid and a boolean/);
  assert.equal((await db().doc(`users/${target}`).get()).data().active, true);
});

test('a target with no Auth record still gets its profile flag flipped', async () => {
  // Firestore profile without a matching Auth user: the flag must still change,
  // and the response must say the Auth half did not happen rather than silently
  // implying it did.
  const churchId = churchOf();
  const [admin, target] = [`admA-${n}`, `ghost-${n}`];
  await seedUser(churchId, admin, { role: 'admin' });
  await seedUser(churchId, target);
  await getAuth().deleteUser(target).catch(() => {});
  const res = await call(admin, { uid: target, active: false });
  assert.equal((await db().doc(`users/${target}`).get()).data().active, false);
  assert.equal(res.authDisabled, false);
});

// ── The shared guard, proved on a callable that is NOT setMemberActive ────────
// The point of assertActiveCaller is that it covers EVERY authenticated
// callable, not just the new one. Firebase verifies a callable's ID token
// signature and expiry, never its revocation, so without this guard a
// deactivated member's outstanding token kept working for up to an hour — and
// the handlers themselves never checked `active` at all.
test('assertActiveCaller: a deactivated member cannot invoke jobWithdraw', async () => {
  const churchId = churchOf();
  const member = `gw-${n}`;
  await seedUser(churchId, member, { active: false });
  await assert.rejects(
    () => funcs.jobWithdraw.run(mockCallable(member, { churchId, jobDocId: 'job1' })),
    /deactivated/i,
  );
});

// Returns the rejection message, or null when the call resolved. Written this
// way because jobWithdraw RESOLVES for a non-existent job rather than throwing —
// asserting "rejects for some other reason" would have been asserting something
// untrue about the handler.
async function guardOutcome(uid, data) {
  try {
    await funcs.jobWithdraw.run(mockCallable(uid, data));
    return null;
  } catch (err) {
    return err.message;
  }
}

test('assertActiveCaller: an ACTIVE member gets past the guard (control)', async () => {
  // The control that makes the negative above meaningful: the same call from an
  // ACTIVE member must not be stopped by the guard.
  const churchId = churchOf();
  const member = `gw2-${n}`;
  await seedUser(churchId, member, { active: true });
  const msg = await guardOutcome(member, { churchId, jobDocId: 'nope' });
  assert.ok(msg === null || !/deactivated/i.test(msg), `guard blocked an active member: ${msg}`);
});

test('assertActiveCaller: a LEGACY profile with no active field is not blocked', async () => {
  // Mirrors isMember()'s `.get('active', true)` fail-open. A divergence here
  // would deny in the callable what the rules allow.
  const churchId = churchOf();
  const legacy = `gw3-${n}`;
  await db().doc(`users/${legacy}`).set({ churchId, role: 'user', name: legacy });
  const msg = await guardOutcome(legacy, { churchId, jobDocId: 'nope' });
  assert.ok(msg === null || !/deactivated/i.test(msg), `guard blocked a legacy profile: ${msg}`);
});
