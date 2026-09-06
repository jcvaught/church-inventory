// COH-007 additive gate — the TRANSITIONAL archive ruleset.
//
// Written to the cases Codex wrote in docs/COH-007-PLAN-REVIEW-2026-09-05.md
// (H4's legacy/shaped pair, M1's exact-reopen allowlist) and the reopen actor
// matrix that review asked for. Codex could not execute any of them — it cannot
// bind the emulator ports — so every one arrives here as a proposed case that
// this file integrates and runs.
//
// The property under test is a rollout property, not a steady-state one: this
// ruleset ships BEFORE the backfill, so it must keep a task carrying neither
// archive field fully usable while refusing to let a shaped task corrupt or
// forge its way into the archive. The FINAL ruleset (reader gate) removes the
// legacy tolerance, and the sentinel below is what will prove it.
//
// CAVEAT inherited from COH-006: the emulator fails OPEN on list queries. A
// passing list here is rule-regression coverage, not proof of containment.
//
// Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, addDoc,
  collection, getDocs, serverTimestamp,
} from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8');
const CHURCH = 'church-A';
const OTHER = 'church-B';
const P = (sub) => `churches/${CHURCH}/${sub}`;

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shepherd-rules',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/creator',    { churchId: CHURCH, role: 'user', name: 'Creator', active: true });
  await seed('users/assignee',   { churchId: CHURCH, role: 'user', name: 'Assignee', active: true });
  await seed('users/recipient',  { churchId: CHURCH, role: 'user', name: 'Recipient', active: true });
  await seed('users/teamMember', { churchId: CHURCH, role: 'user', name: 'Member', active: true });
  await seed('users/outsider',   { churchId: CHURCH, role: 'user', name: 'No relation', active: true });
  await seed('users/boss',       { churchId: CHURCH, role: 'admin', name: 'Admin', active: true });
  await seed('users/inactive',   { churchId: CHURCH, role: 'user', name: 'Inactive', active: false });
  await seed('users/foreign',    { churchId: OTHER,  role: 'admin', name: 'Outsider', active: true });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), path), data); });
}
const ref = (uid, id) => doc(as(uid), P(`workItems/${id}`));
const put = (id, data) => seed(P(`workItems/${id}`), data);

// A pre-COH-007 task: shaped for COH-006, carrying NEITHER archive field. This
// is what every one of the 134 production work items looks like at this gate.
const legacy = (over = {}) => ({
  type: 'task', name: 't', status: 'Backlog', taskNumber: 'TSK-001',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'creator', visibility: 'team', completedAt: null,
  assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], ...over,
});
// A task written by the new client writer: active, and shaped.
const active   = (over = {}) => legacy({ archived: false, archivedAt: null, ...over });
// What the daily archiver will produce once the automation gate opens.
const archived = (over = {}) => legacy({
  status: 'Complete', completedAt: '2026-07-01T00:00:00.000Z',
  archived: true, archivedAt: new Date('2026-08-12T00:00:00.000Z'), ...over,
});
// The only write shape the reopen branch admits.
const REOPEN = {
  archived: false, archivedAt: null, status: 'Backlog', completedAt: null,
  updatedAt: '2026-09-06T12:00:00.000Z',
};

// ── H4: the legacy-state transition contract ────────────────────────────────

test('additive rules keep an unbackfilled task and its comments usable', async () => {
  // The whole reason this ruleset is transitional. Written with direct field
  // access instead of get(_, false), every assertion here is a denial and the
  // board freezes for every church until the backfill reaches it.
  await put('task_old', legacy({ visibility: 'private', createdBy: 'creator' }));
  await assertSucceeds(updateDoc(ref('creator', 'task_old'), { name: 'edited', updatedAt: 'now' }));
  await assertSucceeds(addDoc(collection(as('creator'), P('workItems/task_old/comments')),
    { text: 'still active', authorId: 'creator', authorName: 'Creator', createdAt: 'now' }));
});

test('a shaped active task cannot delete or corrupt archive state', async () => {
  await put('task_new', active());
  await assertFails(updateDoc(ref('creator', 'task_new'), { archived: deleteField() }));
  await assertFails(updateDoc(ref('creator', 'task_new'), { archivedAt: deleteField() }));
  await assertFails(updateDoc(ref('creator', 'task_new'), { archived: false, archivedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref('creator', 'task_new'), { archivedAt: '2026-08-12T00:00:00.000Z' }));
  // A non-boolean smuggled into the discriminator would satisfy a naive
  // `!= true` check and match neither equality-filtered reader.
  await assertFails(updateDoc(ref('creator', 'task_new'), { archived: 'false' }));
  await assertSucceeds(updateDoc(ref('creator', 'task_new'), { name: 'edited', updatedAt: 'now' }));
});

test('malformed archive discriminators fail closed for content, comments and delete', async () => {
  // Codex, review H1. The first implementation asked only `archived == true`
  // and read every other value as active, so a malformed pair stayed
  // commentable and permanently DELETABLE — the one that cannot be undone.
  // Reachable through an Admin SDK defect, a botched migration, or an import;
  // not through these rules, which is why the create arm below stays tolerant
  // of absence but not of a half-written pair.
  const malformed = [
    ['string-true',   { archived: 'true', archivedAt: new Date('2026-08-12T00:00:00.000Z') }],
    ['number-one',    { archived: 1, archivedAt: new Date('2026-08-12T00:00:00.000Z') }],
    ['false-stamped', { archived: false, archivedAt: new Date('2026-08-12T00:00:00.000Z') }],
    ['partial',       { archived: false }],
    ['stamp-only',    { archivedAt: null }],
  ];
  for (const [id, shape] of malformed) {
    await put(`task_${id}`, legacy({ visibility: 'private', ...shape }));
    await seed(P(`workItems/task_${id}/comments/c1`), {
      text: 'before', authorId: 'creator', authorName: 'Creator', createdAt: 'then',
    });
    await assertFails(updateDoc(ref('creator', `task_${id}`), { name: 'edited', updatedAt: 'now' }));
    await assertFails(addDoc(collection(as('creator'), P(`workItems/task_${id}/comments`)), {
      text: 'after', authorId: 'creator', authorName: 'Creator', createdAt: 'now',
    }));
    await assertFails(updateDoc(doc(as('creator'), P(`workItems/task_${id}/comments/c1`)), { text: 'edited' }));
    await assertFails(deleteDoc(ref('creator', `task_${id}`)));
    await assertFails(deleteDoc(ref('boss', `task_${id}`)));
    // Reading is never withheld: the task and its history stay visible to
    // everyone the COH-006 predicate authorizes, whatever shape the flags are in.
    await assertSucceeds(getDoc(ref('creator', `task_${id}`)));
  }
});

test('a legacy task with BOTH fields absent stays fully usable — the compatibility boundary', async () => {
  // The companion to the case above: fail-closed repair must not freeze the
  // live unbackfilled board, which is every task in production today.
  await put('task_legacy', legacy({ visibility: 'private' }));
  await seed(P('workItems/task_legacy/comments/c1'),
    { text: 'before', authorId: 'creator', authorName: 'Creator', createdAt: 'then' });
  await assertSucceeds(updateDoc(ref('creator', 'task_legacy'), { name: 'edited', updatedAt: 'now' }));
  await assertSucceeds(addDoc(collection(as('creator'), P('workItems/task_legacy/comments')),
    { text: 'after', authorId: 'creator', authorName: 'Creator', createdAt: 'now' }));
  await assertSucceeds(updateDoc(doc(as('creator'), P('workItems/task_legacy/comments/c1')), { text: 'edited' }));
  // A legacy task may also be brought forward to the shaped active pair.
  await assertSucceeds(updateDoc(ref('creator', 'task_legacy'), { archived: false, archivedAt: null, updatedAt: 'now' }));
  await assertSucceeds(deleteDoc(ref('creator', 'task_legacy')));
});

test('create refuses a half-written pair, which would be locked on arrival', async () => {
  const base = { ...legacy(), createdBy: 'creator' };
  await assertFails(setDoc(ref('creator', 'task_half1'), { ...base, archived: false }));
  await assertFails(setDoc(ref('creator', 'task_half2'), { ...base, archivedAt: null }));
  await assertFails(setDoc(ref('creator', 'task_half3'), { ...base, archived: 'false', archivedAt: null }));
});

test('no client may archive a task — that transition is the scheduled job alone', async () => {
  await put('task_new', active({ status: 'Complete', completedAt: '2026-07-01T00:00:00.000Z' }));
  await assertFails(updateDoc(ref('creator', 'task_new'), { archived: true, archivedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref('boss', 'task_new'), { archived: true, archivedAt: serverTimestamp() }));
  await put('task_legacy', legacy());
  await assertFails(updateDoc(ref('creator', 'task_legacy'), { archived: true, archivedAt: serverTimestamp() }));
});

// ── create ──────────────────────────────────────────────────────────────────

test('create: a task is born active, and a stale client that omits the pair still works', async () => {
  const base = { ...legacy(), createdBy: 'creator' };
  const { archived: _a, archivedAt: _b, ...noPair } = base;
  await assertSucceeds(setDoc(ref('creator', 'task_c1'), { ...base, archived: false, archivedAt: null }));
  // A browser tab still running the pre-COH-007 bundle. Denying this would
  // break task creation for every user who has not reloaded.
  await assertSucceeds(setDoc(ref('creator', 'task_c2'), noPair));
  await assertFails(setDoc(ref('creator', 'task_c3'), { ...base, archived: true, archivedAt: null }));
  await assertFails(setDoc(ref('creator', 'task_c4'), { ...base, archived: false, archivedAt: serverTimestamp() }));
});

// ── M1: reopen is an exact allowlist ────────────────────────────────────────

test('reopen is exact and cannot smuggle a content or recurrence-marker edit', async () => {
  const fixture = () => put('task_old', archived({ nextRecurrenceCreatedAt: '2026-07-01T00:00:00.000Z' }));
  await fixture();
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, name: 'rewritten' }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, nextRecurrenceCreatedAt: deleteField() }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, sharedWithUids: ['recipient'] }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, assigneeUids: ['assignee'] }));
  // Still archived — every attempt above was rejected whole.
  await env.withSecurityRulesDisabled(async (e) => {
    const snap = await getDoc(doc(e.firestore(), P('workItems/task_old')));
    if (snap.data().archived !== true) throw new Error('fixture mutated by a denied write');
  });
  await assertSucceeds(updateDoc(ref('creator', 'task_old'), REOPEN));
});

test('reopen must land in Backlog with the completion and archive clocks cleared', async () => {
  await put('task_old', archived());
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, status: 'Complete' }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, status: 'In Progress' }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, completedAt: '2026-07-01T00:00:00.000Z' }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { ...REOPEN, archivedAt: serverTimestamp() }));
  // Clearing the flag without the rest of the transition is not a reopen.
  await assertFails(updateDoc(ref('creator', 'task_old'), { archived: false, updatedAt: 'now' }));
});

test('reopen: creator, assignee, recipient and a team member may; nobody else can', async () => {
  const seedFour = async () => {
    await put('task_priv',   archived({ visibility: 'private' }));
    await put('task_assign', archived({ visibility: 'private', assigneeUids: ['assignee'] }));
    await put('task_share',  archived({ visibility: 'shared',  sharedWithUids: ['recipient'] }));
    await put('task_team',   archived({ visibility: 'team' }));
  };
  await seedFour();
  await assertSucceeds(updateDoc(ref('creator',    'task_priv'),   REOPEN));
  await assertSucceeds(updateDoc(ref('assignee',   'task_assign'), REOPEN));
  await assertSucceeds(updateDoc(ref('recipient',  'task_share'),  REOPEN));
  await assertSucceeds(updateDoc(ref('teamMember', 'task_team'),   REOPEN));

  await seedFour();
  // Reopen inherits the COH-006 pre-state check, so role is not preauthorization:
  // an admin who could not read the private task cannot reopen it either.
  await assertFails(updateDoc(ref('outsider', 'task_priv'),  REOPEN));
  await assertFails(updateDoc(ref('boss',     'task_priv'),  REOPEN));
  await assertFails(updateDoc(ref('outsider', 'task_share'), REOPEN));
  await assertFails(updateDoc(ref('inactive', 'task_team'),  REOPEN));
  await assertFails(updateDoc(ref('foreign',  'task_team'),  REOPEN));
});

// ── the freeze ──────────────────────────────────────────────────────────────

test('an archived task is read-only and undeletable until it is reopened', async () => {
  await put('task_old', archived());
  await assertSucceeds(getDoc(ref('creator', 'task_old')));
  await assertFails(updateDoc(ref('creator', 'task_old'), { name: 'edited', updatedAt: 'now' }));
  await assertFails(updateDoc(ref('creator', 'task_old'), { status: 'In Progress', updatedAt: 'now' }));
  await assertFails(updateDoc(ref('boss', 'task_old'), { visibility: 'private', updatedAt: 'now' }));
  await assertFails(deleteDoc(ref('creator', 'task_old')));
  await assertFails(deleteDoc(ref('boss', 'task_old')));
});

test('an archived task keeps its discussion readable and freezes every comment write', async () => {
  await put('task_old', archived());
  await seed(P('workItems/task_old/comments/c1'),
    { text: 'from before', authorId: 'creator', authorName: 'Creator', createdAt: 'then' });
  await assertSucceeds(getDoc(doc(as('creator'), P('workItems/task_old/comments/c1'))));
  await assertSucceeds(getDocs(collection(as('creator'), P('workItems/task_old/comments'))));
  await assertFails(addDoc(collection(as('creator'), P('workItems/task_old/comments')),
    { text: 'after', authorId: 'creator', authorName: 'Creator', createdAt: 'now' }));
  await assertFails(updateDoc(doc(as('creator'), P('workItems/task_old/comments/c1')), { text: 'edited' }));
  await assertFails(deleteDoc(doc(as('creator'), P('workItems/task_old/comments/c1'))));
  await assertFails(deleteDoc(doc(as('boss'), P('workItems/task_old/comments/c1'))));
});

test('reopening restores the ordinary edit, comment and delete authorization', async () => {
  await put('task_old', archived());
  await assertSucceeds(updateDoc(ref('creator', 'task_old'), REOPEN));
  await assertSucceeds(updateDoc(ref('creator', 'task_old'), { name: 'edited', updatedAt: 'now' }));
  await assertSucceeds(addDoc(collection(as('creator'), P('workItems/task_old/comments')),
    { text: 'work resumed', authorId: 'creator', authorName: 'Creator', createdAt: 'now' }));
  await assertSucceeds(deleteDoc(ref('creator', 'task_old')));
});

// ── maintenance is outside the lifecycle entirely (A1) ──────────────────────

test('maintenance keeps its any-member workflow and never carries the archive pair', async () => {
  await put('mnt_1', { type: 'maintenance', title: 'Boiler', status: 'Backlog' });
  await assertSucceeds(updateDoc(ref('teamMember', 'mnt_1'), { status: 'In Progress' }));
  await assertSucceeds(deleteDoc(ref('boss', 'mnt_1')));
});
