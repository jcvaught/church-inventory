// Backlog #3 (DEC-2026-024) — Shepherd access bound to the elder's own church,
// and revoked the moment an elder leaves the roster.
//
// saveShepherdRoster is the only writer of config/shepherdRoster and derives
// config/shepherdAccess in the same transaction; the rules and every
// elder-gated callable read that list fresh. These assert FINAL STATE in
// Firestore and Auth, not mock calls.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAuth } from 'firebase-admin/auth';
import { loadFunctions, mockCallable, db } from './setup.mjs';

const FXCC = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';
const P = (sub) => `churches/${FXCC}/${sub}`;
const OWNER_EMAIL = 'jvaught@fxcc.org';

let funcs;
before(async () => { funcs = await loadFunctions(); });

async function seedAuth(uid, email, claims) {
  const auth = getAuth();
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, email, emailVerified: true, password: 'Passw0rd!' });
  if (claims) await auth.setCustomUserClaims(uid, claims);
}
async function seedProfile(uid, churchId, extra = {}) {
  await db().doc(`users/${uid}`).set({ churchId, role: 'user', name: uid, active: true, ...extra });
}
const elder = (key, emails, extra = {}) => ({
  key, name: `Elder ${key}`, surname: key[0].toUpperCase() + key.slice(1), emails, match: [key], active: true, sabbatical: false, ...extra,
});
const ownerReq = (data, uid = 'sa-owner') =>
  mockCallable(uid, data, { token: { email: OWNER_EMAIL, email_verified: true } });
const elderReq = (uid, email, data = {}) =>
  mockCallable(uid, data, { token: { email, email_verified: true, elder: true } });

beforeEach(async () => {
  await db().doc(P('config/shepherdRoster')).delete();
  await db().doc(P('config/shepherdAccess')).delete();
  await seedProfile('sa-owner', FXCC, { role: 'admin' });
});

// ── saveShepherdRoster ────────────────────────────────────────────────────
test('saveShepherdRoster writes the roster AND the derived access list together', async () => {
  const roster = {
    elders: [
      elder('alpha', ['Alpha@FXCC.org', 'alpha2@fxcc.org']),
      elder('bravo', ['bravo@fxcc.org'], { sabbatical: true }),
      elder('charlie', ['charlie@fxcc.org'], { active: false }),
      elder('delta', []),
    ],
    former: [{ key: 'old', match: ['old'] }],
  };
  const res = await funcs.saveShepherdRoster.run(ownerReq({ roster }));
  assert.equal(res.ok, true);
  const access = (await db().doc(P('config/shepherdAccess')).get()).data();
  // Lowercased, de-duplicated, sorted; sabbatical kept; inactive and email-less excluded.
  assert.deepEqual(access.emails, ['alpha2@fxcc.org', 'alpha@fxcc.org', 'bravo@fxcc.org']);
  assert.equal(access.version, 1);
  const saved = (await db().doc(P('config/shepherdRoster')).get()).data();
  assert.equal(saved.elders.length, 4);
  assert.deepEqual(saved.former, roster.former);
});

test('saveShepherdRoster rejects a roster that would match everyone, and writes nothing', async () => {
  const roster = { elders: [elder('alpha', ['alpha@fxcc.org'], { match: ['!!'] })] };
  await assert.rejects(funcs.saveShepherdRoster.run(ownerReq({ roster })), /empty match pattern/);
  assert.equal((await db().doc(P('config/shepherdRoster')).get()).exists, false);
  assert.equal((await db().doc(P('config/shepherdAccess')).get()).exists, false);
});

test('saveShepherdRoster rejects an empty roster, duplicate keys and bad emails', async () => {
  await assert.rejects(funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [] } })), /at least one elder/);
  await assert.rejects(funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('a', []), elder('a', [])] } })), /same key/);
  await assert.rejects(funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('a', ['not-an-email'])] } })), /invalid email/);
});

test('saveShepherdRoster is denied to a non-owner, and to the owner email on another church', async () => {
  const roster = { elders: [elder('alpha', ['alpha@fxcc.org'])] };
  await seedProfile('sa-member', FXCC);
  await assert.rejects(funcs.saveShepherdRoster.run(mockCallable('sa-member', { roster }, { token: { email_verified: true } })), /Not authorized/);
  await seedProfile('sa-owner-elsewhere', 'some-other-church', { role: 'admin' });
  await assert.rejects(funcs.saveShepherdRoster.run(ownerReq({ roster }, 'sa-owner-elsewhere')), /Not authorized/);
  await assert.rejects(funcs.saveShepherdRoster.run(mockCallable('sa-owner', { roster }, { token: { email: OWNER_EMAIL, email_verified: false } })), /Not authorized/);
  assert.equal((await db().doc(P('config/shepherdRoster')).get()).exists, false);
});

test('removing an elder: access gone, claim stripped (other claims kept), private notes purged', async () => {
  await seedAuth('sa-keep', 'keep@fxcc.org', { elder: true });
  await seedAuth('sa-gone', 'gone@fxcc.org', { elder: true, other: 'kept' });
  await db().doc(P('shepherdPeople/p1/privateNotes/sa-gone')).set({ text: 'theirs' });
  await db().doc(P('shepherdPeople/p1/privateNotes/sa-keep')).set({ text: 'mine' });
  await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('keep', ['keep@fxcc.org']), elder('gone', ['gone@fxcc.org'])] } }));

  const res = await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('keep', ['keep@fxcc.org'])] } }));
  assert.deepEqual(res.cleanupFailures, []);
  assert.deepEqual(res.revoked, ['gone@fxcc.org']);
  assert.equal(res.purged, 1);
  assert.deepEqual((await db().doc(P('config/shepherdAccess')).get()).data().emails, ['keep@fxcc.org']);
  const gone = await getAuth().getUser('sa-gone');
  assert.equal(gone.customClaims?.elder, undefined);
  assert.equal(gone.customClaims?.other, 'kept');
  assert.equal((await getAuth().getUser('sa-keep')).customClaims?.elder, true);
  assert.equal((await db().doc(P('shepherdPeople/p1/privateNotes/sa-gone')).get()).exists, false);
  assert.equal((await db().doc(P('shepherdPeople/p1/privateNotes/sa-keep')).get()).exists, true);
});

test('setting an elder INACTIVE removes access and the claim but keeps their notes', async () => {
  await seedAuth('sa-rest', 'rest@fxcc.org', { elder: true });
  await db().doc(P('shepherdPeople/p1/privateNotes/sa-rest')).set({ text: 'kept' });
  await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('keep', ['keep@fxcc.org']), elder('rest', ['rest@fxcc.org'])] } }));
  const res = await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('keep', ['keep@fxcc.org']), elder('rest', ['rest@fxcc.org'], { active: false })] } }));
  assert.deepEqual(res.revoked, ['rest@fxcc.org']);
  assert.equal(res.purged, 0);
  assert.deepEqual((await db().doc(P('config/shepherdAccess')).get()).data().emails, ['keep@fxcc.org']);
  assert.equal((await getAuth().getUser('sa-rest')).customClaims?.elder, undefined);
  assert.equal((await db().doc(P('shepherdPeople/p1/privateNotes/sa-rest')).get()).exists, true);
});

// ── claimElderRole ────────────────────────────────────────────────────────
test('claimElderRole grants only an active FXCC member on the access list', async () => {
  await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('echo', ['echo@fxcc.org', 'far@other.org'])] } }));
  await seedAuth('sa-echo', 'echo@fxcc.org');
  await seedProfile('sa-echo', FXCC);
  const ok = await funcs.claimElderRole.run(mockCallable('sa-echo'));
  assert.equal(ok.elder, true);
  assert.equal((await getAuth().getUser('sa-echo')).customClaims?.elder, true);

  // Rostered email, but the profile belongs to another church: no claim, and
  // an existing one is stripped.
  await seedAuth('sa-far', 'far@other.org', { elder: true });
  await seedProfile('sa-far', 'some-other-church');
  const far = await funcs.claimElderRole.run(mockCallable('sa-far'));
  assert.equal(far.elder, false);
  assert.equal((await getAuth().getUser('sa-far')).customClaims?.elder, undefined);
});

test('claimElderRole has no default-roster fallback: no access doc = no claim', async () => {
  // davidbell@fxcc.org is in DEFAULT_ROSTER; with no roster/access docs the old
  // code granted from that default.
  await seedAuth('sa-default', 'davidbell@fxcc.org');
  await seedProfile('sa-default', FXCC);
  const res = await funcs.claimElderRole.run(mockCallable('sa-default'));
  assert.equal(res.elder, false);
});

// ── elder-gated callables ignore a stale claim ────────────────────────────
test('exportMyShepherdNotes denies an elder removed from the roster despite elder:true', async () => {
  await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('fox', ['fox@fxcc.org'])] } }));
  await seedProfile('sa-fox', FXCC);
  await seedProfile('sa-stale', FXCC);
  const ok = await funcs.exportMyShepherdNotes.run(elderReq('sa-fox', 'fox@fxcc.org'));
  assert.deepEqual(ok.notes, []);
  await assert.rejects(funcs.exportMyShepherdNotes.run(elderReq('sa-stale', 'stale@fxcc.org')), /Elders only/);
});

test('setElderAssignment denies a removed elder and an out-of-church owner before touching PCO', async () => {
  await funcs.saveShepherdRoster.run(ownerReq({ roster: { elders: [elder('golf', ['golf@fxcc.org'])] } }));
  await seedProfile('sa-stale2', FXCC);
  await assert.rejects(
    funcs.setElderAssignment.run(elderReq('sa-stale2', 'stale2@fxcc.org', { personId: 'p1', elderKeys: ['golf'] })),
    /Not authorized/);
  await seedProfile('sa-owner-away', 'some-other-church', { role: 'admin' });
  await assert.rejects(
    funcs.setElderAssignment.run(ownerReq({ personId: 'p1', elderKeys: ['golf'] }, 'sa-owner-away')),
    /Not authorized/);
});
