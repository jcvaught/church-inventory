// COH-007 — the cutover sentinel (Codex, review Q1).
//
// The rollout deploys two different rulesets at two different gates, and the
// whole safety argument rests on the difference between them:
//
//   TRANSITIONAL (additive gate, live since 2026-09-07)
//     A task carrying NEITHER archive field is legacy and stays fully usable.
//     Without that tolerance, deploying archive rules before the backfill would
//     have frozen every task in every church mid-rollout.
//
//   FINAL (reader gate, ships WITH the `archived == false` reader change)
//     Both fields are required on every task update and create. The tolerance
//     is removed, because a client able to drop the pair could make a task match
//     neither equality-filtered reader and vanish from its own board.
//
// An unbackfilled task succeeding under the first and FAILING under the second
// is the cutover signal. Prose cannot demonstrate that; only running the same
// fixtures against both sources can, which is why the transitional ruleset is
// pinned as a fixture rather than reconstructed. If that snapshot ever drifts
// toward the final rules, this file silently compares the final ruleset with
// itself and passes for the wrong reason — hence the identity check below.
//
// Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, deleteField, addDoc, collection, getDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const TRANSITIONAL = readFileSync(join(here, 'fixtures/transitional-archive-2026-09-07.rules'), 'utf8');
const FINAL = readFileSync(join(here, '../../../firestore.rules'), 'utf8');

const CHURCH = 'church-A';
const P = (sub) => `churches/${CHURCH}/${sub}`;

// Two environments, two project ids, so the emulator keeps them apart.
const envs = {};
before(async () => {
  envs.transitional = await initializeTestEnvironment({
    projectId: 'demo-coh007-transitional',
    firestore: { rules: TRANSITIONAL, host: '127.0.0.1', port: 8080 },
  });
  envs.final = await initializeTestEnvironment({
    projectId: 'demo-coh007-final',
    firestore: { rules: FINAL, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await Promise.all(Object.values(envs).map((e) => e.cleanup())); });
beforeEach(async () => {
  for (const env of Object.values(envs)) {
    await env.clearFirestore();
    await seed(env, 'users/creator', { churchId: CHURCH, role: 'user', name: 'Creator', active: true });
  }
});

async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), path), data); });
}
const as = (env, uid) => env.authenticatedContext(uid).firestore();
const ref = (env, id) => doc(as(env, 'creator'), P(`workItems/${id}`));

const legacy = (over = {}) => ({
  type: 'task', name: 't', status: 'Backlog', taskNumber: 'TSK-001',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'creator', visibility: 'team', completedAt: null,
  assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [], ...over,
});
const active = (over = {}) => legacy({ archived: false, archivedAt: null, ...over });
const archived = (over = {}) => legacy({
  status: 'Complete', completedAt: '2026-07-01T00:00:00.000Z',
  archived: true, archivedAt: new Date('2026-08-12T00:00:00.000Z'), ...over,
});

test('the two rules sources are actually different', () => {
  // Guards the fixture. A drifted snapshot makes every assertion below pass
  // while comparing the final ruleset against itself.
  assert.notEqual(TRANSITIONAL.replace(/^\/\/.*$/gm, '').trim(), FINAL.replace(/^\/\/.*$/gm, '').trim(),
    'the pinned transitional fixture has drifted into the final ruleset');
});

test('THE SENTINEL — an unbackfilled task is usable under transitional and REFUSED under final', async () => {
  // This is the assertion the whole staged rollout turns on. Under the deployed
  // transitional rules a legacy task must keep working, because until the
  // backfill ran that was every task in production. Under the final rules the
  // same document must be refused — an unbackfilled task surviving the cutover
  // would match neither equality-filtered reader and disappear from its board.
  for (const [name, env] of Object.entries(envs)) {
    await seed(env, P('workItems/task_legacy'), legacy());
    const edit = updateDoc(ref(env, 'task_legacy'), { name: 'edited', updatedAt: 'now' });
    if (name === 'transitional') await assertSucceeds(edit);
    else await assertFails(edit);
  }
});

test('a legacy task keeps its comments under transitional, and loses them under final', async () => {
  for (const [name, env] of Object.entries(envs)) {
    await seed(env, P('workItems/task_legacy'), legacy());
    const comment = addDoc(collection(as(env, 'creator'), P('workItems/task_legacy/comments')),
      { text: 'x', authorId: 'creator', authorName: 'Creator', createdAt: 'now' });
    if (name === 'transitional') await assertSucceeds(comment);
    else await assertFails(comment);
  }
});

test('a stale client that creates without the pair works under transitional, not under final', async () => {
  // The final ruleset ships alongside the reader change, so from that moment a
  // browser tab running the pre-COH-007 bundle can no longer mint a task that
  // would be invisible to the new readers. That is the point, not a regression.
  for (const [name, env] of Object.entries(envs)) {
    const create = setDoc(ref(env, 'task_new'), legacy());
    if (name === 'transitional') await assertSucceeds(create);
    else await assertFails(create);
  }
});

test('a SHAPED active task behaves identically under both rulesets', async () => {
  // The new client generation is compatible with either, which is what makes
  // the cutover orderly rather than a flag day.
  for (const env of Object.values(envs)) {
    await seed(env, P('workItems/task_shaped'), active());
    await assertSucceeds(updateDoc(ref(env, 'task_shaped'), { name: 'edited', updatedAt: 'now' }));
    await assertSucceeds(addDoc(collection(as(env, 'creator'), P('workItems/task_shaped/comments')),
      { text: 'x', authorId: 'creator', authorName: 'Creator', createdAt: 'now' }));
    await assertSucceeds(setDoc(ref(env, 'task_born'), active({ taskNumber: 'TSK-002' })));
    await assertSucceeds(deleteDoc(ref(env, 'task_shaped')));
  }
});

test('an archived task stays frozen under both rulesets, and reopen works under both', async () => {
  const REOPEN = {
    archived: false, archivedAt: null, status: 'Backlog', completedAt: null,
    updatedAt: '2026-09-07T12:00:00.000Z',
  };
  for (const env of Object.values(envs)) {
    await seed(env, P('workItems/task_old'), archived());
    await assertSucceeds(getDoc(ref(env, 'task_old')));
    await assertFails(updateDoc(ref(env, 'task_old'), { name: 'edited', updatedAt: 'now' }));
    await assertFails(deleteDoc(ref(env, 'task_old')));
    await assertSucceeds(updateDoc(ref(env, 'task_old'), REOPEN));
  }
});

test('under FINAL, a client still cannot drop or corrupt the pair', async () => {
  // The reason the legacy tolerance had to go: a task with neither field
  // matches neither equality-filtered reader, so a client able to reach that
  // shape could delete itself from its own board.
  const env = envs.final;
  await seed(env, P('workItems/task_shaped'), active());
  await assertFails(updateDoc(ref(env, 'task_shaped'), { archived: deleteField(), updatedAt: 'now' }));
  await assertFails(updateDoc(ref(env, 'task_shaped'), { archivedAt: deleteField(), updatedAt: 'now' }));
  await assertFails(updateDoc(ref(env, 'task_shaped'), { archived: deleteField(), archivedAt: deleteField(), updatedAt: 'now' }));
  await assertFails(updateDoc(ref(env, 'task_shaped'), { archived: 'false', updatedAt: 'now' }));
  await assertFails(updateDoc(ref(env, 'task_shaped'), { archived: true, archivedAt: new Date(), updatedAt: 'now' }));
});

test('maintenance is untouched by either ruleset', async () => {
  for (const env of Object.values(envs)) {
    await seed(env, 'users/boss', { churchId: CHURCH, role: 'admin', name: 'Admin', active: true });
    await seed(env, P('workItems/mnt_1'), { type: 'maintenance', title: 'Boiler', status: 'Backlog' });
    await assertSucceeds(updateDoc(doc(as(env, 'creator'), P('workItems/mnt_1')), { status: 'In Progress' }));
    // The one that nearly slipped through. A maintenance item carries neither
    // archive field by design, so tightening the comment gate to the task shape
    // would have denied every maintenance comment in every church — collateral
    // from a narrowing change, with nothing to warn about it.
    await assertSucceeds(addDoc(collection(as(env, 'creator'), P('workItems/mnt_1/comments')),
      { text: 'boiler serviced', authorId: 'creator', authorName: 'Creator', createdAt: 'now' }));
    await assertSucceeds(deleteDoc(doc(as(env, 'boss'), P('workItems/mnt_1'))));
  }
});
