// Firestore rules tests for the Shepherd Hub (audit CQ-4). The whole privacy
// guarantee lives in a handful of rule blocks with no other automated coverage,
// so these lock in: the contact-info/medical write-lock, non-elder denial,
// per-elder note privacy, care-thread author pinning, audit admin-read-only +
// immutability, the SEC-2 email_verified admin gate, and the shepherdCare stamp.
//
// Run against the Firestore emulator:  npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8');
const PROJECT = 'demo-shepherd-rules';
const CHURCH = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';
const P = (sub) => `churches/${CHURCH}/${sub}`;

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// Auth contexts (the `elder` custom claim + email/email_verified standard claims).
const elderA = () => env.authenticatedContext('elderA', { elder: true, email: 'a@fxcc.org', email_verified: true }).firestore();
const elderB = () => env.authenticatedContext('elderB', { elder: true, email: 'b@fxcc.org', email_verified: true }).firestore();
const member = () => env.authenticatedContext('member', { email: 'm@fxcc.org', email_verified: true }).firestore();
const owner = () => env.authenticatedContext('owner', { email: 'jvaught@fxcc.org', email_verified: true }).firestore();
const ownerUnverified = () => env.authenticatedContext('owner2', { email: 'jvaught@fxcc.org', email_verified: false }).firestore();

// Seed a doc bypassing rules (for read/immutability assertions).
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
}

test('REQUIRED: an elder cannot write a person doc (contact-info / medical lock)', async () => {
  await seed(P('shepherdPeople/p1'), { name: 'Jane', medicalNotes: 'sensitive' });
  await assertSucceeds(getDoc(doc(elderA(), P('shepherdPeople/p1'))));                       // read OK
  await assertFails(setDoc(doc(elderA(), P('shepherdPeople/p1')), { name: 'Hacked' }));       // no overwrite
  await assertFails(updateDoc(doc(elderA(), P('shepherdPeople/p1')), { medicalNotes: 'x' })); // no field edit
});

test('a non-elder (and non-admin) is denied reading the congregation cache', async () => {
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertFails(getDoc(doc(member(), P('shepherdPeople/p1'))));
});

test('private notes are owner-only — another elder cannot read or write them', async () => {
  await assertSucceeds(setDoc(doc(elderA(), P('shepherdPeople/p1/privateNotes/elderA')), { text: 'mine' }));
  await assertSucceeds(getDoc(doc(elderA(), P('shepherdPeople/p1/privateNotes/elderA'))));
  await assertFails(getDoc(doc(elderB(), P('shepherdPeople/p1/privateNotes/elderA'))));
  await assertFails(setDoc(doc(elderB(), P('shepherdPeople/p1/privateNotes/elderA')), { text: 'spoof' }));
});

test('care thread is author-pinned on create', async () => {
  await assertSucceeds(addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'hi', authorUid: 'elderA', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'spoof', authorUid: 'elderB', createdAt: serverTimestamp() }));
});

test('audit log: elders write but cannot read; admin reads; rows are immutable', async () => {
  await assertSucceeds(setDoc(doc(elderA(), P('shepherdAudit/a1')), { actorUid: 'elderA', action: 'view_person' }));
  await assertFails(setDoc(doc(elderA(), P('shepherdAudit/a2')), { actorUid: 'someoneElse', action: 'view_person' })); // actorUid pinned
  await assertFails(getDoc(doc(elderA(), P('shepherdAudit/a1'))));   // SEC-6: elders can't read
  await assertSucceeds(getDoc(doc(owner(), P('shepherdAudit/a1')))); // admin can
  await seed(P('shepherdAudit/a3'), { actorUid: 'x', action: 'y' });
  await assertFails(updateDoc(doc(owner(), P('shepherdAudit/a3')), { action: 'z' })); // immutable
  await assertFails(deleteDoc(doc(owner(), P('shepherdAudit/a3'))));
});

test('isShepherdAdmin requires a verified email (SEC-2)', async () => {
  await seed(P('shepherdAudit/a1'), { actorUid: 'x', action: 'y' });
  await assertSucceeds(getDoc(doc(owner(), P('shepherdAudit/a1'))));           // verified owner
  await assertFails(getDoc(doc(ownerUnverified(), P('shepherdAudit/a1'))));    // unverified owner denied
});

test('shepherdCare last-contact stamp: elder read/write, non-elder denied', async () => {
  await assertSucceeds(setDoc(doc(elderA(), P('shepherdCare/p1')), { lastCareAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(elderA(), P('shepherdCare/p1'))));
  await assertFails(setDoc(doc(member(), P('shepherdCare/p1')), { lastCareAt: serverTimestamp() }));
  await assertFails(getDoc(doc(member(), P('shepherdCare/p1'))));
});
