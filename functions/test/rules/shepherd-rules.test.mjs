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
beforeEach(async () => {
  await env.clearFirestore();
  // COH-011: isElder() now requires an ACTIVE users/{uid} profile as well as the
  // custom claim, because Rules cannot retract an already-issued ID token — a
  // deactivated elder would otherwise keep `elder:true` (and Shepherd access)
  // for up to an hour. These tests previously seeded no profile at all and
  // passed only because the claim alone was trusted; every one of them needs a
  // real profile now, which also matches production (claimElderRole writes
  // allowedHubs on the user doc at first grant, so an elder always has one).
  await seed('users/elderA', { churchId: CHURCH, role: 'user', name: 'Elder A', active: true });
  await seed('users/elderB', { churchId: CHURCH, role: 'user', name: 'Elder B', active: true });
  await seed('users/member', { churchId: CHURCH, role: 'user', name: 'Member', active: true });
  // Backlog #3: isElderOf() also requires the caller's email on the church's
  // server-written access list, and isShepherdAdminOf() requires membership of
  // the church — so both elders are listed and the owner has an FXCC profile.
  await seed(P('config/shepherdAccess'), { emails: ['a@fxcc.org', 'b@fxcc.org', 'gone@fxcc.org', 'sab@fxcc.org'] });
  await seed('users/owner', { churchId: CHURCH, role: 'admin', name: 'John', active: true });
  await seed('users/owner2', { churchId: CHURCH, role: 'admin', name: 'John (unverified)', active: true });
});

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
  await assertSucceeds(addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'hi', authorUid: 'elderA', authorName: 'Elder A', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'spoof', authorUid: 'elderB', authorName: 'Elder A', createdAt: serverTimestamp() }));
});

// Owner decision 2026-09-26: an entry is fixed to the elder who wrote it.
test('care thread: the displayed name must be the poster\'s own profile name', async () => {
  const add = (data) => addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'hi', authorUid: 'elderA', createdAt: serverTimestamp(), ...data });
  await assertFails(add({ authorName: 'Elder B' }));   // someone else's name
  await assertFails(add({ authorName: null }));        // blanking a name that exists
  await assertFails(add({}));                          // omitted
  await assertSucceeds(add({ authorName: 'Elder A' }));
});

test('care thread: a nameless profile may post with no name, and only that', async () => {
  await seed('users/elderA', { churchId: CHURCH, role: 'user', active: true });
  const add = (data) => addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'hi', authorUid: 'elderA', createdAt: serverTimestamp(), ...data });
  await assertSucceeds(add({ authorName: null }));
  await assertFails(add({ authorName: 'Elder B' }));
  await assertFails(add({}));   // the field is required even with no profile name
});

test('care thread: createdAt must be the server time, and no extra fields', async () => {
  const add = (data) => addDoc(collection(elderA(), P('shepherdPeople/p1/careThread')), { text: 'hi', authorUid: 'elderA', authorName: 'Elder A', createdAt: serverTimestamp(), ...data });
  await assertFails(add({ createdAt: new Date('2020-01-01') }));   // backdated
  await assertFails(add({ authorUid2: 'elderB' }));                // unexpected field
  await assertFails(add({ text: 42 }));
});

test('care thread: entries are never edited — not by the author, not by anyone', async () => {
  await seed(P('shepherdPeople/p1/careThread/c1'), { text: 'orig', authorUid: 'elderA', authorName: 'Elder A', createdAt: 1 });
  const ref = (fs) => doc(fs, P('shepherdPeople/p1/careThread/c1'));
  await assertFails(updateDoc(ref(elderA()), { text: 'edited' }));
  await assertFails(updateDoc(ref(elderA()), { authorUid: 'elderB', authorName: 'Elder B' }));  // reassigning your own entry
  await assertFails(updateDoc(ref(elderB()), { text: 'edited' }));
  await assertFails(updateDoc(ref(owner()), { text: 'edited' }));
  await assertFails(setDoc(ref(elderB()), { text: 'mine now', authorUid: 'elderB', authorName: 'Elder B', createdAt: serverTimestamp() })); // overwrite = update
  await assertFails(setDoc(ref(elderA()), { text: 'orig', authorUid: 'elderA', authorName: 'Elder A', createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(ref(elderB())));                     // another elder cannot delete it
  await assertFails(deleteDoc(ref(owner())));                      // nor can the admin
  await assertSucceeds(deleteDoc(ref(elderA())));                  // the author can
});

test('care thread: admins cannot read it; members cannot read it', async () => {
  await seed(P('shepherdPeople/p1/careThread/c1'), { text: 'orig', authorUid: 'elderA', authorName: 'Elder A', createdAt: 1 });
  await assertFails(getDoc(doc(owner(), P('shepherdPeople/p1/careThread/c1'))));
  await assertFails(getDoc(doc(member(), P('shepherdPeople/p1/careThread/c1'))));
  await assertSucceeds(getDoc(doc(elderB(), P('shepherdPeople/p1/careThread/c1'))));
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

// ══ COH-011 — a deactivated elder loses Shepherd access immediately ═══════════
// isElder() used to trust `request.auth.token.elder` alone. Revoking refresh
// tokens does not retract an ID token already in a browser, so a deactivated
// elder kept full pastoral access for up to an hour: reading every person
// (incl. medicalNotes), writing private notes and care threads, and appending
// audit rows. The profile check is re-evaluated on every request, so it closes
// that window at once.
//
// The context below is deliberately REALISTIC — `elder:true` AND a real
// users/{uid} doc with active:false. An inactive-elder test with no profile at
// all would pass for the wrong reason (a missing doc denies regardless).
const inactiveElder = () => env.authenticatedContext('elderGone', { elder: true, email: 'gone@fxcc.org', email_verified: true }).firestore();
async function seedInactiveElder() {
  await seed('users/elderGone', { churchId: CHURCH, role: 'user', name: 'Former Elder', active: false });
}

test('COH-011: a deactivated elder cannot read the congregation cache', async () => {
  await seedInactiveElder();
  await seed(P('shepherdPeople/p1'), { name: 'Jane', medicalNotes: 'sensitive' });
  await assertSucceeds(getDoc(doc(elderA(), P('shepherdPeople/p1'))));   // control: active elder still can
  await assertFails(getDoc(doc(inactiveElder(), P('shepherdPeople/p1'))));
});

test('COH-011: a deactivated elder cannot write a private note or a care thread', async () => {
  await seedInactiveElder();
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertFails(setDoc(doc(inactiveElder(), P('shepherdPeople/p1/privateNotes/elderGone')), { text: 'still here' }));
  await assertFails(setDoc(doc(inactiveElder(), P('shepherdPeople/p1/careThread/c1')), { text: 'still here', authorUid: 'elderGone' }));
});

test('COH-011: a deactivated elder cannot append an audit row', async () => {
  await seedInactiveElder();
  await assertFails(setDoc(doc(inactiveElder(), P('shepherdAudit/a1')), { actorUid: 'elderGone', action: 'view' }));
});

test('COH-011: a deactivated elder cannot read a private note they previously wrote', async () => {
  await seedInactiveElder();
  await seed(P('shepherdPeople/p1/privateNotes/elderGone'), { text: 'written while active' });
  await assertFails(getDoc(doc(inactiveElder(), P('shepherdPeople/p1/privateNotes/elderGone'))));
});

// ══ Backlog #3 (DEC-2026-024) — own church only; roster removal revokes now ════
// Owner decision 2026-09-23: every elder sees the whole directory of their OWN
// church and nothing of any other church; John's admin access likewise. And
// removing an elder from the roster (which rewrites config/shepherdAccess in
// the same transaction) must deny them at once, while their token still says
// elder:true — so every context below carries the claim.
const OTHER = 'other-church';
const O = (sub) => `churches/${OTHER}/${sub}`;
const ctx = (uid, email, extra = {}) =>
  env.authenticatedContext(uid, { elder: true, email, email_verified: true, ...extra }).firestore();
const removedElder = () => ctx('elderRemoved', 'removed@fxcc.org');
const otherElder = () => ctx('elderOther', 'o@other.org');

// Every elder-gated operation, at every rule site, for one context. Returns
// [label, promise-factory] pairs so each can be asserted either way.
const ELDER_NAMES = { elderA: 'Elder A', elderRemoved: 'Removed', elderOther: 'Other Elder' };
function elderOps(fs, base, uid) {
  return [
    ['read shepherdSync',      () => getDoc(doc(fs, `${base}/config/shepherdSync`))],
    ['read shepherdRoster',    () => getDoc(doc(fs, `${base}/config/shepherdRoster`))],
    ['read shepherdPeople',    () => getDoc(doc(fs, `${base}/shepherdPeople/p1`))],
    ['read own private note',  () => getDoc(doc(fs, `${base}/shepherdPeople/p1/privateNotes/${uid}`))],
    ['write own private note', () => setDoc(doc(fs, `${base}/shepherdPeople/p1/privateNotes/${uid}`), { text: 'x' })],
    ['read care thread',       () => getDoc(doc(fs, `${base}/shepherdPeople/p1/careThread/mine`))],
    ['create care entry',      () => setDoc(doc(fs, `${base}/shepherdPeople/p1/careThread/new1`), { text: 'x', authorUid: uid, authorName: ELDER_NAMES[uid], createdAt: serverTimestamp() })],
    ['delete own care entry',  () => deleteDoc(doc(fs, `${base}/shepherdPeople/p1/careThread/mine2`))],
    ['read shepherdCare',      () => getDoc(doc(fs, `${base}/shepherdCare/p1`))],
    ['write shepherdCare',     () => setDoc(doc(fs, `${base}/shepherdCare/p1`), { lastCareAt: serverTimestamp() })],
    ['append audit row',       () => setDoc(doc(fs, `${base}/shepherdAudit/a-${uid}`), { actorUid: uid, action: 'view' })],
  ];
}
async function seedShepherd(base, uid) {
  await seed(`${base}/config/shepherdSync`, { lastRun: 1 });
  await seed(`${base}/config/shepherdRoster`, { elders: [] });
  await seed(`${base}/shepherdPeople/p1`, { name: 'Jane', medicalNotes: 'sensitive' });
  await seed(`${base}/shepherdPeople/p1/privateNotes/${uid}`, { text: 'mine' });
  await seed(`${base}/shepherdPeople/p1/careThread/mine`, { text: 'c', authorUid: uid });
  await seed(`${base}/shepherdPeople/p1/careThread/mine2`, { text: 'c', authorUid: uid });
  await seed(`${base}/shepherdCare/p1`, { lastCareAt: 1 });
}

test('#3 control: a listed, active FXCC elder passes every elder-gated operation', async () => {
  await seedShepherd(`churches/${CHURCH}`, 'elderA');
  for (const [label, op] of elderOps(elderA(), `churches/${CHURCH}`, 'elderA')) {
    await assertSucceeds(op(), label);
  }
});

test('#3: an elder REMOVED from the roster is denied every operation while still holding elder:true', async () => {
  await seed('users/elderRemoved', { churchId: CHURCH, role: 'user', name: 'Removed', active: true });
  await seedShepherd(`churches/${CHURCH}`, 'elderRemoved');
  for (const [label, op] of elderOps(removedElder(), `churches/${CHURCH}`, 'elderRemoved')) {
    await assertFails(op(), label);
  }
});

test('#3: an FXCC elder cannot reach another church — even one whose access list names them', async () => {
  await seedShepherd(`churches/${OTHER}`, 'elderA');
  await seed(O('config/shepherdAccess'), { emails: ['a@fxcc.org'] });
  for (const [label, op] of elderOps(elderA(), `churches/${OTHER}`, 'elderA')) {
    await assertFails(op(), label);
  }
});

test('#3: another church\'s elder cannot reach FXCC, but can reach their own church', async () => {
  await seed('users/elderOther', { churchId: OTHER, role: 'user', name: 'Other Elder', active: true });
  await seed(O('config/shepherdAccess'), { emails: ['o@other.org'] });
  await seedShepherd(`churches/${CHURCH}`, 'elderOther');
  await seedShepherd(`churches/${OTHER}`, 'elderOther');
  // Listed on FXCC's list too, so the ONLY thing denying them is church binding.
  await seed(P('config/shepherdAccess'), { emails: ['a@fxcc.org', 'o@other.org'] });
  for (const [label, op] of elderOps(otherElder(), `churches/${CHURCH}`, 'elderOther')) {
    await assertFails(op(), `FXCC: ${label}`);
  }
  for (const [label, op] of elderOps(otherElder(), `churches/${OTHER}`, 'elderOther')) {
    await assertSucceeds(op(), `own church: ${label}`);
  }
});

test('#3: no access doc = no elder access (fail closed)', async () => {
  await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), P('config/shepherdAccess'))); });
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertFails(getDoc(doc(elderA(), P('shepherdPeople/p1'))));
});

test('#3: a listed elder with an UNVERIFIED email is denied', async () => {
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertFails(getDoc(doc(ctx('elderA', 'a@fxcc.org', { email_verified: false }), P('shepherdPeople/p1'))));
});

test('#3: the email match is case-insensitive (the list is lowercased)', async () => {
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertSucceeds(getDoc(doc(ctx('elderA', 'A@FXCC.org'), P('shepherdPeople/p1'))));
});

test('#3: a sabbatical elder (on the access list) keeps access', async () => {
  await seed('users/elderSab', { churchId: CHURCH, role: 'user', name: 'Sabbatical', active: true });
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertSucceeds(getDoc(doc(ctx('elderSab', 'sab@fxcc.org'), P('shepherdPeople/p1'))));
});

test('#3: John\'s admin access works at FXCC and nowhere else', async () => {
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await seed(O('shepherdPeople/p1'), { name: 'Elsewhere' });
  await seed(O('shepherdAudit/a1'), { actorUid: 'x', action: 'y' });
  await seed(O('config/shepherdRoster'), { elders: [] });
  await assertSucceeds(getDoc(doc(owner(), P('shepherdPeople/p1'))));
  await assertFails(getDoc(doc(owner(), O('shepherdPeople/p1'))));
  await assertFails(getDoc(doc(owner(), O('shepherdAudit/a1'))));
  await assertFails(getDoc(doc(owner(), O('config/shepherdRoster'))));
});

test('#3: an owner email whose profile is in ANOTHER church is not a Shepherd admin at FXCC', async () => {
  await seed('users/ownerElsewhere', { churchId: OTHER, role: 'admin', name: 'John elsewhere', active: true });
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  const fs = env.authenticatedContext('ownerElsewhere', { email: 'jcvaught@gmail.com', email_verified: true }).firestore();
  await assertFails(getDoc(doc(fs, P('shepherdPeople/p1'))));
});

test('#3: nobody writes the roster from a client — saveShepherdRoster is the only writer', async () => {
  await assertFails(setDoc(doc(owner(), P('config/shepherdRoster')), { elders: [] }));
  await assertFails(setDoc(doc(elderA(), P('config/shepherdRoster')), { elders: [] }));
});

test('#3: the access list is invisible and unwritable to clients', async () => {
  for (const fs of [owner(), elderA(), member()]) {
    await assertFails(getDoc(doc(fs, P('config/shepherdAccess'))));
    await assertFails(setDoc(doc(fs, P('config/shepherdAccess')), { emails: ['m@fxcc.org'] }));
  }
});

test('#3: a MAP-shaped access list grants nothing (rules `in` tests map keys)', async () => {
  await seed(P('config/shepherdAccess'), { emails: { 'a@fxcc.org': true } });
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  await assertFails(getDoc(doc(elderA(), P('shepherdPeople/p1'))));
});

test('#3: an elder token with NO email is denied', async () => {
  await seed(P('shepherdPeople/p1'), { name: 'Jane' });
  const fs = env.authenticatedContext('elderA', { elder: true, email_verified: true }).firestore();
  await assertFails(getDoc(doc(fs, P('shepherdPeople/p1'))));
});
