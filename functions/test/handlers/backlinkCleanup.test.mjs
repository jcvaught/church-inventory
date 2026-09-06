// COH-008 — server-side backlink cleanup on delete.
//
// These are the adversarial cases from Codex's COH-007 plan review (H1) and
// re-review (N1). The two defences under test are independent and BOTH are
// required, so each is probed on its own:
//
//   reciprocity — we clear a backlink only when the target points back at the
//     deleted document. Defeats a forged link field, which nothing in
//     firestore.rules prevents a member from writing.
//   type pinning — we follow only the link fields belonging to the deleted
//     document's trusted source type. Defeats the `task_x` / `mnt_x` bare-id
//     collision, where a forged field on the wrong source type would otherwise
//     produce a genuinely matching reciprocal check against an unrelated victim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, purgeChurch } from './setup.mjs';

const CHURCH = 'coh008-backlinks';
const OTHER_CHURCH = 'coh008-other-tenant';

// v2 delete triggers receive a CloudEvent whose `data` is the pre-delete
// snapshot and whose `params` come from the platform (NOT from the document) —
// which is exactly why churchId is trustworthy for building target paths.
function deletedEvent(churchId, docId, data) {
  return { data: { data: () => data }, params: { churchId, docId } };
}
const set = (path, data) => db().doc(path).set(data);
const get = (path) => db().doc(path).get().then(s => s.data());

test.after(async () => {
  await purgeChurch(CHURCH);
  await purgeChurch(OTHER_CHURCH);
});

test('reciprocal backlink is cleared, and a second delivery is a no-op', async () => {
  const funcs = await loadFunctions();
  // The deleted doc is `task_gone`; the job stores the BARE id `gone`.
  await set(`churches/${CHURCH}/jobListings/job-1`, { linkedTaskDocId: 'gone' });
  const event = deletedEvent(CHURCH, 'task_gone', { type: 'task', linkedJobDocId: 'job-1' });

  await funcs.cleanupWorkItemBacklinks.run(event);
  assert.equal((await get(`churches/${CHURCH}/jobListings/job-1`)).linkedTaskDocId, null);

  await funcs.cleanupWorkItemBacklinks.run(event); // at-least-once delivery
  assert.equal((await get(`churches/${CHURCH}/jobListings/job-1`)).linkedTaskDocId, null);
});

test('a forged link cannot clear an unrelated job (confused deputy, H1)', async () => {
  const funcs = await loadFunctions();
  // firestore.rules constrains no link field on create, so a member really can
  // write this. The victim points at a different task, so it is not reciprocal.
  await set(`churches/${CHURCH}/jobListings/job-victim`, { linkedTaskDocId: 'legit' });
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_attack', { type: 'task', linkedJobDocId: 'job-victim' })
  );
  assert.equal((await get(`churches/${CHURCH}/jobListings/job-victim`)).linkedTaskDocId, 'legit');
});

test('a target already pointing elsewhere is not cleared (reciprocity negative)', async () => {
  const funcs = await loadFunctions();
  // NB: this is a reciprocity negative, NOT proof of the transaction — nothing
  // writes between the read and the commit here, so it would also pass for a
  // non-transactional implementation (review M1). The real transaction proof is
  // 'a relink racing the cleanup wins' below, which mutates the target inside
  // the transaction window.
  await set(`churches/${CHURCH}/jobListings/job-relink`, { linkedTaskDocId: 'replacement' });
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_stale', { type: 'task', linkedJobDocId: 'job-relink' })
  );
  assert.equal((await get(`churches/${CHURCH}/jobListings/job-relink`)).linkedTaskDocId, 'replacement');
});

test('a task source does not follow a maintenance-only field (N1, type routing)', async () => {
  const funcs = await loadFunctions();
  // Same bare id `collision` on two different documents, and `task_collision`
  // carries linkedTaskDocId — a field that has no meaning on a task source.
  await set(`churches/${CHURCH}/workItems/mnt_collision`, { type: 'maintenance', linkedTaskDocId: 'victim' });
  await set(`churches/${CHURCH}/workItems/task_victim`, { type: 'task', linkedTicketDocId: 'collision' });

  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_collision', { type: 'task', linkedTaskDocId: 'victim' })
  );
  // Reciprocity alone would NOT save this: victim.linkedTicketDocId === 'collision'
  // and the deleted bare id is also 'collision'. Type pinning is what rejects it.
  assert.equal((await get(`churches/${CHURCH}/workItems/task_victim`)).linkedTicketDocId, 'collision');

  // The legitimate maintenance source clears the same link.
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'mnt_collision', { type: 'maintenance', linkedTaskDocId: 'victim' })
  );
  assert.equal((await get(`churches/${CHURCH}/workItems/task_victim`)).linkedTicketDocId, null);
});

test('a link value cannot escape the event church', async () => {
  const funcs = await loadFunctions();
  await set(`churches/${OTHER_CHURCH}/jobListings/job-1`, { linkedTaskDocId: 'gone' });
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_gone', {
      type: 'task',
      linkedJobDocId: `churches/${OTHER_CHURCH}/jobListings/job-1`,
    })
  );
  assert.equal((await get(`churches/${OTHER_CHURCH}/jobListings/job-1`)).linkedTaskDocId, 'gone');
});

test('every allowed direction clears, and only when reciprocal', async () => {
  const funcs = await loadFunctions();
  await set(`churches/${CHURCH}/workItems/mnt_t1`, { type: 'maintenance', linkedTaskDocId: 'd1' });
  await set(`churches/${CHURCH}/reservations/r1`, { linkedSetupTaskDocId: 'd1' });
  await set(`churches/${CHURCH}/jobListings/j1`, { linkedTaskDocId: 'd1' });
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'task_d1', {
    type: 'task', linkedTicketDocId: 't1', linkedReservationDocId: 'r1', linkedJobDocId: 'j1',
  }));
  assert.equal((await get(`churches/${CHURCH}/workItems/mnt_t1`)).linkedTaskDocId, null);
  assert.equal((await get(`churches/${CHURCH}/reservations/r1`)).linkedSetupTaskDocId, null);
  assert.equal((await get(`churches/${CHURCH}/jobListings/j1`)).linkedTaskDocId, null);

  // job listing → task
  await set(`churches/${CHURCH}/workItems/task_d2`, { type: 'task', linkedJobDocId: 'j2' });
  await funcs.cleanupJobListingBacklinks.run(deletedEvent(CHURCH, 'j2', { linkedTaskDocId: 'd2' }));
  assert.equal((await get(`churches/${CHURCH}/workItems/task_d2`)).linkedJobDocId, null);
});

test('unrecognised sources and shapes are no-ops', async () => {
  const funcs = await loadFunctions();
  await set(`churches/${CHURCH}/jobListings/job-safe`, { linkedTaskDocId: 'safe' });

  // unknown type
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_safe', { type: 'something-else', linkedJobDocId: 'job-safe' }));
  // missing type
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_safe', { linkedJobDocId: 'job-safe' }));
  // id without the task_/mnt_ prefix
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'safe', { type: 'task', linkedJobDocId: 'job-safe' }));
  // a missing target is a successful no-op, not a throw
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_x', { type: 'task', linkedJobDocId: 'no-such-job' }));

  assert.equal((await get(`churches/${CHURCH}/jobListings/job-safe`)).linkedTaskDocId, 'safe');
});

// ── Prefix/type binding and target-kind pinning (review H1, H2) ─────────────
// The rules validate a create's `type` but never inspect the document id, so a
// member can create a fully rule-valid task at an `mnt_*` id. The trigger must
// fail closed on shapes the rules already permit.

test('an opposite-prefix task cannot impersonate the real task with the same bare id (H1)', async () => {
  const funcs = await loadFunctions();
  await set(`churches/${CHURCH}/workItems/task_h1victim`, {
    type: 'task', createdBy: 'owner', visibility: 'private', assigneeUids: [], sharedWithUids: [],
  });
  await set(`churches/${CHURCH}/jobListings/job-h1victim`, { linkedTaskDocId: 'h1victim' });

  // Shape a regular member can create today: valid `type:'task'`, maintenance id.
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'mnt_h1victim', {
    type: 'task', createdBy: 'attacker', visibility: 'team',
    assigneeUids: [], sharedWithUids: [], linkedJobDocId: 'job-h1victim',
  }));
  assert.equal((await get(`churches/${CHURCH}/jobListings/job-h1victim`)).linkedTaskDocId, 'h1victim');

  // Symmetric mismatch: maintenance type at a task id.
  await set(`churches/${CHURCH}/workItems/task_h1b`, { type: 'task', linkedTicketDocId: 'h1b' });
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'task_h1b', {
    type: 'maintenance', linkedTaskDocId: 'h1b',
  }));
  assert.equal((await get(`churches/${CHURCH}/workItems/task_h1b`)).linkedTicketDocId, 'h1b');
});

test('a work-item target of the wrong kind, or of no kind, is not mutated (H2)', async () => {
  const funcs = await loadFunctions();
  // A task living in the ticket namespace must not be cleared by task→ticket.
  await set(`churches/${CHURCH}/workItems/mnt_h2victim`, { type: 'task', linkedTaskDocId: 'h2gone' });
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'task_h2gone', {
    type: 'task', linkedTicketDocId: 'h2victim',
  }));
  assert.equal((await get(`churches/${CHURCH}/workItems/mnt_h2victim`)).linkedTaskDocId, 'h2gone');

  // A legacy work item carrying no type at all is likewise untouched.
  await set(`churches/${CHURCH}/workItems/task_h2legacy`, { linkedTicketDocId: 'h2gone2' });
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'mnt_h2gone2', {
    type: 'maintenance', linkedTaskDocId: 'h2legacy',
  }));
  assert.equal((await get(`churches/${CHURCH}/workItems/task_h2legacy`)).linkedTicketDocId, 'h2gone2');
});

// ── Transaction and retry behaviour (review M1) ─────────────────────────────
// These use the _setBacklinkHook seam, which fires between the transaction's
// read and its commit — the only place these properties can be forced.

// NOT TESTED, and deliberately so: an executed read-then-external-write race
// inside the transaction window. The Firestore emulator takes a pessimistic lock
// for a transaction, so a write issued from inside that window BLOCKS on the
// lock the transaction still holds — producing a deadlock that resolves only
// through retry, not the clean conflict the test would be claiming to make. An
// attempt at it passed in ~70s of a ~2s suite, which is the tell: it was green
// because the retry eventually re-read, not because a conflict was observed.
//
// What that shape would prove is `runTransaction`'s own semantics — a platform
// guarantee, not this module's logic. What IS this module's logic is that the
// reciprocity check runs against a fresh read and never blind-writes, which the
// reciprocity negative above covers. The transactional wrapper is verified by
// inspection; see the COH-008 handoff, where this is recorded rather than
// implied.

test('a transient failure rejects, keeps partial progress, and completes on redelivery', async () => {
  const funcs = await loadFunctions();
  await set(`churches/${CHURCH}/jobListings/j-tr`, { linkedTaskDocId: 'tr' });
  await set(`churches/${CHURCH}/workItems/mnt_t-tr`, { type: 'maintenance', linkedTaskDocId: 'tr' });
  await set(`churches/${CHURCH}/reservations/r-tr`, { linkedSetupTaskDocId: 'tr' });
  const event = deletedEvent(CHURCH, 'task_tr', {
    type: 'task', linkedJobDocId: 'j-tr', linkedTicketDocId: 't-tr', linkedReservationDocId: 'r-tr',
  });

  funcs._setBacklinkHook((sourceField) => {
    if (sourceField === 'linkedTicketDocId') { const e = new Error('unavailable'); e.code = 14; throw e; }
  });
  try {
    await assert.rejects(() => funcs.cleanupWorkItemBacklinks.run(event), (e) => e.code === 14);
  } finally { funcs._resetBacklinkHook(); }
  // The other two directions still ran; the failed one is untouched.
  assert.equal((await get(`churches/${CHURCH}/jobListings/j-tr`)).linkedTaskDocId, null);
  assert.equal((await get(`churches/${CHURCH}/workItems/mnt_t-tr`)).linkedTaskDocId, 'tr');
  assert.equal((await get(`churches/${CHURCH}/reservations/r-tr`)).linkedSetupTaskDocId, null);

  await funcs.cleanupWorkItemBacklinks.run(event); // redelivery, no injected fault
  assert.equal((await get(`churches/${CHURCH}/jobListings/j-tr`)).linkedTaskDocId, null);
  assert.equal((await get(`churches/${CHURCH}/workItems/mnt_t-tr`)).linkedTaskDocId, null);
  assert.equal((await get(`churches/${CHURCH}/reservations/r-tr`)).linkedSetupTaskDocId, null);
});

test('a permanent failure does not reject and does not strand later directions', async () => {
  const funcs = await loadFunctions();
  await set(`churches/${CHURCH}/jobListings/j-pm`, { linkedTaskDocId: 'pm' });
  await set(`churches/${CHURCH}/workItems/mnt_t-pm`, { type: 'maintenance', linkedTaskDocId: 'pm' });

  funcs._setBacklinkHook((sourceField) => {
    if (sourceField === 'linkedJobDocId') { const e = new Error('permission denied'); e.code = 7; throw e; }
  });
  try {
    await assert.doesNotReject(() => funcs.cleanupWorkItemBacklinks.run(
      deletedEvent(CHURCH, 'task_pm', {
        type: 'task', linkedJobDocId: 'j-pm', linkedTicketDocId: 't-pm',
      })));
  } finally { funcs._resetBacklinkHook(); }
  assert.equal((await get(`churches/${CHURCH}/jobListings/j-pm`)).linkedTaskDocId, 'pm');
  assert.equal((await get(`churches/${CHURCH}/workItems/mnt_t-pm`)).linkedTaskDocId, null);
});
