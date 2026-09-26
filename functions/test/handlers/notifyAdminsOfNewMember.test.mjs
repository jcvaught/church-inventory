// notifyAdminsOfNewMember — one "new member joined" notice per member.
//
// Firestore triggers are at-least-once: the platform may deliver the same
// create event twice. The trigger claims `newMemberNotifiedAt` in a
// transaction BEFORE sending, so a redelivery finds the claim and stops. A
// failed send releases the claim; a member deleted before the claim gets no
// notice (the COH-014 / attribution probes create and delete users in seconds).
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, purgeChurch, installFetchStub } from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let n = 0;
const CHURCH = `nanm-${Date.now()}`;
const fresh = () => `nanm-${Date.now()}-${n++}`;
const brevoCalls = (stub) => stub.calls.filter(c => c.url.includes('api.brevo.com'));
const created = [];
test.after(async () => {
  await purgeChurch(CHURCH);
  for (const uid of created) await db().doc(`users/${uid}`).delete().catch(() => {});
});

let stub;
beforeEach(async () => {
  stub = installFetchStub();
  const adminUid = fresh();
  created.push(adminUid);
  await db().doc(`users/${adminUid}`).set({ churchId: CHURCH, role: 'admin', active: true, email: `${adminUid}@example.org`, name: 'Admin' });
});
afterEach(() => { stub.restore(); });

// A member exactly as signup writes it, plus the CloudEvent the platform delivers.
async function seedMember() {
  const uid = fresh();
  created.push(uid);
  const data = { churchId: CHURCH, role: 'user', active: true, email: `${uid}@example.org`, name: 'New Member', allowedHubs: ['jobs'] };
  await db().doc(`users/${uid}`).set(data);
  return { uid, event: { data: { data: () => data, ref: db().doc(`users/${uid}`) }, params: { uid } } };
}
const stampOf = async (uid) => (await db().doc(`users/${uid}`).get()).data()?.newMemberNotifiedAt;

test('a redelivered create event sends one notice, not two', async () => {
  const { uid, event } = await seedMember();
  await funcs.notifyAdminsOfNewMember.run(event);
  await funcs.notifyAdminsOfNewMember.run(event); // same event, delivered again
  assert.equal(brevoCalls(stub).length, 1);
  assert.ok(await stampOf(uid), 'claim recorded');
});

test('two deliveries racing each other still send one notice', async () => {
  const { event } = await seedMember();
  await Promise.all([funcs.notifyAdminsOfNewMember.run(event), funcs.notifyAdminsOfNewMember.run(event)]);
  assert.equal(brevoCalls(stub).length, 1);
});

test('a member deleted before the claim gets no notice, and nothing throws', async () => {
  const { uid, event } = await seedMember();
  await db().doc(`users/${uid}`).delete();
  await funcs.notifyAdminsOfNewMember.run(event);
  assert.equal(brevoCalls(stub).length, 0);
  assert.equal((await db().doc(`users/${uid}`).get()).exists, false, 'the claim must not resurrect the profile');
});

test('a failed send releases the claim, so a later delivery can still notify', async () => {
  const { uid, event } = await seedMember();
  stub.restore();
  stub = installFetchStub((url) => url.includes('api.brevo.com') ? { ok: false, status: 503, text: 'down' } : {});
  await funcs.notifyAdminsOfNewMember.run(event);
  assert.equal(await stampOf(uid), undefined, 'claim released after the failure');

  stub.restore();
  stub = installFetchStub();
  await funcs.notifyAdminsOfNewMember.run(event);
  assert.equal(brevoCalls(stub).length, 1);
  assert.ok(await stampOf(uid));
});
