// COH-007 — the daily archiver.
//
// Opens with the MEASUREMENT the plan (A3) requires before implementation:
// whether a `completedAt <= '<iso cutoff>'` range query also returns documents
// whose value is null. Firestore's total value ordering places null before
// strings, so the hypothesis is that it does — and if it does, the handler's
// skip-malformed guard is the only thing standing between a never-properly-
// completed task and automatic archiving, rather than the defensive nicety the
// original plan implied. It is recorded here as an executed result, not a claim.
//
// The rest are Codex's proposed cases from the plan review: the query/write
// race that a blind batch fails, the boundary arithmetic, and the telemetry
// promise narrowed to what the query can actually see (M2/A12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, purgeChurch } from './setup.mjs';

const CHURCH = 'coh007-archiver';
const CUTOFF_NOW = new Date('2026-09-06T00:00:00.000Z');
// archiveCutoffISO(CUTOFF_NOW) — 42 days earlier.
const CUTOFF = '2026-07-26T00:00:00.000Z';

const path = (id) => `churches/${CHURCH}/workItems/${id}`;
const put = (id, data) => db().doc(path(id)).set(data);
const get = (id) => db().doc(path(id)).get().then(s => s.data());
const task = (over = {}) => ({
  type: 'task', name: 't', status: 'Complete', archived: false, archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

async function withClock(funcs, fn) {
  funcs._setClock(() => CUTOFF_NOW);
  try { return await fn(); } finally { funcs._resetClock(); }
}
async function run(funcs, opts = {}) {
  return withClock(funcs, () => funcs._runArchiveCompletedTasks(opts));
}

// loadFunctions() is what calls initializeApp(), so the hooks must go through
// it before touching db() — the suite shares one emulator and no global wipe.
test.beforeEach(async () => { await loadFunctions(); await purgeChurch(CHURCH); });
test.after(async () => { await loadFunctions(); await purgeChurch(CHURCH); });

// ── the measurement ─────────────────────────────────────────────────────────

test('MEASUREMENT: completedAt <= ISO cutoff membership, including null and missing', async () => {
  await loadFunctions();
  await put('eligible',  task({ completedAt: '2026-07-24T23:59:59.999Z' }));
  await put('boundary',  task({ completedAt: CUTOFF }));
  await put('future',    task({ completedAt: '2026-07-26T00:00:00.001Z' }));
  await put('null-date', task({ completedAt: null }));
  const { completedAt: _drop, ...noField } = task();
  await put('missing',   noField);

  const snap = await db().collectionGroup('workItems')
    .where('status', '==', 'Complete')
    .where('archived', '==', false)
    .where('completedAt', '<=', CUTOFF)
    .get();
  const returned = snap.docs.map(d => d.id).sort();

  // RESULT, recorded — and it CONTRADICTS the plan's hypothesis. A3 predicted
  // that Firestore's total value ordering (null sorts before strings) would make
  // `completedAt <= '<iso>'` also match every null, which would have made the
  // skip guard the only thing standing between a never-properly-completed task
  // and automatic archiving. The emulator returns neither the null-valued nor
  // the missing-field document: the range filter admits only same-type values.
  //
  // So on this evidence the guard is defensive rather than load-bearing, and its
  // counter is expected to be ZERO for nulls in production. Two consequences,
  // both deliberate:
  //   • the guard ships anyway, exactly as A3 says it should — what the
  //     measurement decides is the expected counter, not whether to guard;
  //   • this is an EMULATOR result and the emulator is not production. The
  //     archiver's first production dry run re-measures it against real data
  //     before any write is enabled, and that run is the authority. Do not
  //     restate this finding as production behaviour until then.
  assert.deepEqual(returned, ['boundary', 'eligible']);
  assert.equal(returned.includes('null-date'), false);
  assert.equal(returned.includes('missing'), false);
});

// ── eligibility ─────────────────────────────────────────────────────────────

test('the 42-day boundary is strict: exactly 42 days is not archived', async () => {
  const funcs = await loadFunctions();
  await put('boundary', task({ completedAt: CUTOFF }));
  await put('older',    task({ completedAt: '2026-07-25T23:59:59.999Z' }));
  const summary = await run(funcs, { writesEnabled: true });
  assert.equal(summary.eligible, 1);
  assert.equal((await get('older')).archived, true);
  assert.equal((await get('boundary')).archived, false);
});

test('a malformed completion date is skipped, counted, and never guessed', async () => {
  const funcs = await loadFunctions();
  await put('null-date', task({ completedAt: null }));
  await put('bad-low',   task({ completedAt: '!' }));
  await put('date-only', task({ completedAt: '2026-01-05' }));
  const summary = await run(funcs, { writesEnabled: true });

  assert.equal(summary.archived, 0);
  // Two, not three: per the measurement above, the null-valued document never
  // enters the range query, so it is not something this job can count. A
  // date-only string IS in range and IS malformed — reading it as midnight UTC
  // would be exactly the guess A3 forbids.
  assert.equal(summary.malformedReturnedByEligibilityQuery, 2);
  assert.equal(summary.examined, 2);
  for (const id of ['null-date', 'bad-low', 'date-only']) {
    const after = await get(id);
    assert.equal(after.archived, false, id);
  }
  // The date was not reconstructed from updatedAt or createdAt.
  assert.equal((await get('null-date')).completedAt, null);
  assert.equal((await get('bad-low')).completedAt, '!');
});

test('telemetry claims only what the eligibility query examined', async () => {
  const funcs = await loadFunctions();
  const { completedAt: _drop, ...noField } = task();
  await put('missing', noField);
  await put('old',     task({ completedAt: '2026-01-01T00:00:00.000Z' }));
  const summary = await run(funcs, { writesEnabled: true });
  // The missing-field document is not in the range at all, so it is neither
  // examined nor counted as malformed — the M2/A12 narrowing, asserted.
  assert.equal(summary.examined, 1);
  assert.equal(summary.malformedReturnedByEligibilityQuery, 0);
  assert.equal((await get('missing')).archived, false);
});

test('maintenance, incomplete, cancelled and already-archived work is never touched', async () => {
  const funcs = await loadFunctions();
  await put('mnt_1',      { type: 'maintenance', status: 'Complete', completedAt: '2026-01-01T00:00:00.000Z' });
  await put('open',       task({ status: 'In Progress', completedAt: '2026-01-01T00:00:00.000Z' }));
  await put('cancelled',  task({ status: 'Cancelled', completedAt: '2026-01-01T00:00:00.000Z' }));
  await put('done',       task({ archived: true, completedAt: '2026-01-01T00:00:00.000Z' }));
  const summary = await run(funcs, { writesEnabled: true });
  assert.equal(summary.archived, 0);
  assert.equal((await get('mnt_1')).archived ?? null, null);
  assert.equal((await get('open')).archived, false);
  assert.equal((await get('cancelled')).archived, false);
});

// ── writes ──────────────────────────────────────────────────────────────────

test('archiving preserves every other field and its comments', async () => {
  const funcs = await loadFunctions();
  await put('keep', task({
    completedAt: '2026-01-01T00:00:00.000Z', taskNumber: 'TSK-009', visibility: 'shared',
    sharedWithUids: ['r1'], assigneeUids: ['a1'], tags: ['x'], photos: ['p'],
    linkedJobDocId: 'job-1', nextRecurrenceCreatedAt: '2026-02-01T00:00:00.000Z',
  }));
  await db().doc(`${path('keep')}/comments/c1`).set({ text: 'hi', authorId: 'a1' });
  await run(funcs, { writesEnabled: true });

  const after = await get('keep');
  assert.equal(after.archived, true);
  assert.ok(after.archivedAt);
  assert.equal(after.taskNumber, 'TSK-009');
  assert.equal(after.visibility, 'shared');
  assert.deepEqual(after.sharedWithUids, ['r1']);
  assert.deepEqual(after.assigneeUids, ['a1']);
  assert.equal(after.linkedJobDocId, 'job-1');
  assert.equal(after.nextRecurrenceCreatedAt, '2026-02-01T00:00:00.000Z');
  assert.equal(after.completedAt, '2026-01-01T00:00:00.000Z');
  const comment = await db().doc(`${path('keep')}/comments/c1`).get();
  assert.equal(comment.data().text, 'hi');
});

test('a second run is a no-op — idempotent by the archived == false filter', async () => {
  const funcs = await loadFunctions();
  await put('once', task({ completedAt: '2026-01-01T00:00:00.000Z' }));
  await run(funcs, { writesEnabled: true });
  const firstStamp = (await get('once')).archivedAt;
  const second = await run(funcs, { writesEnabled: true });
  assert.equal(second.examined, 0);
  assert.equal(second.archived, 0);
  assert.deepEqual((await get('once')).archivedAt, firstStamp);
});

test('a status reopen between query and write wins over archiving', async () => {
  // Codex's race case. The hook fires after the eligibility snapshot and before
  // the first transaction — the exact window a blind batch gets wrong.
  const funcs = await loadFunctions();
  await put('race', task({ completedAt: '2026-07-01T00:00:00.000Z' }));
  funcs._setArchiverHook(async () => {
    await db().doc(path('race')).update({
      status: 'Backlog', completedAt: null, updatedAt: '2026-09-05T00:00:01.000Z',
    });
  });
  let summary;
  try { summary = await run(funcs, { writesEnabled: true }); }
  finally { funcs._resetArchiverHook(); }

  const after = await get('race');
  assert.equal(after.status, 'Backlog');
  assert.equal(after.completedAt, null);
  assert.equal(after.archived, false);
  assert.equal(after.archivedAt, null);
  assert.equal(summary.archived, 0);
  assert.equal(summary.conflicted, 1);
});

test('a task deleted between query and write is a counted conflict, not a failure', async () => {
  const funcs = await loadFunctions();
  await put('vanish', task({ completedAt: '2026-07-01T00:00:00.000Z' }));
  funcs._setArchiverHook(async () => { await db().doc(path('vanish')).delete(); });
  let summary;
  try { summary = await run(funcs, { writesEnabled: true }); }
  finally { funcs._resetArchiverHook(); }
  assert.equal(summary.conflicted, 1);
  assert.equal(summary.failed, 0);
});

// ── the shipped state ───────────────────────────────────────────────────────

test('the shipped default is a DRY RUN: it reports and writes nothing', async () => {
  // What the additive gate deploys. If this ever passes with archived == true,
  // production data changed at a gate that had no owner approval to change it.
  const funcs = await loadFunctions();
  await put('old', task({ completedAt: '2026-01-01T00:00:00.000Z' }));
  const summary = await run(funcs);
  assert.equal(summary.dryRun, true);
  assert.equal(summary.eligible, 1);
  assert.equal(summary.archived, 0);
  assert.equal((await get('old')).archived, false);
  assert.equal((await get('old')).archivedAt, null);
});
