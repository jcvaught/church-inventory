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

test('a target relinked after the delete keeps its newer link', async () => {
  const funcs = await loadFunctions();
  // The observable guarantee behind the transaction: once the target points at
  // a replacement, the older delete's cleanup must not win.
  await set(`churches/${CHURCH}/jobListings/job-relink`, { linkedTaskDocId: 'replacement' });
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'task_stale', { type: 'task', linkedJobDocId: 'job-relink' })
  );
  assert.equal((await get(`churches/${CHURCH}/jobListings/job-relink`)).linkedTaskDocId, 'replacement');
});

test('task_x and mnt_x cannot impersonate each other (N1)', async () => {
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
