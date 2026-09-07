/**
 * COH-007 backfill gate — task archive-state backfill (2026-09-07).
 *
 * Adds the archive pair to every existing `workItems` task:
 *
 *   archived:   false
 *   archivedAt: null
 *
 * Nothing else. No task moves, changes status, or is deleted, and nobody sees a
 * difference the day this runs.
 *
 * WHY IT IS NOT OPTIONAL. At the reader gate the board stops asking "give me my
 * tasks" and starts asking "give me my tasks where archived == false". A task
 * with no `archived` field does not match that filter — it is not false, it is
 * absent — so any task this pass misses would SILENTLY VANISH from its owner's
 * board at cutover. `--verify` reaching zero outstanding is the go/no-go for
 * that gate, and it is checked against an operator-supplied `--baseline` so an
 * unexpectedly small scan cannot pass as a clean one.
 *
 * Maintenance items are untouched, deliberately (plan A1): they carry none of
 * these fields and the maintenance listener must never take the filter.
 *
 * WHAT IT REFUSES TO GUESS. Only a task carrying NEITHER field is written. A
 * task already holding a valid pair is left alone (idempotent). A task holding a
 * malformed or half-written pair — `archived: 'true'`, `archived: false` with a
 * stamped `archivedAt`, one field without the other — is REPORTED and skipped,
 * never repaired: "repairing" `archived: 'true'` to `false` would destroy a real
 * archive state, and the transitional rules already lock those documents rather
 * than letting a client corrupt one further. The production audit at the
 * additive gate found zero of them; if this pass finds any, that is a finding,
 * not a chore.
 *
 * Structure, journal semantics, rollback conditionality and the project guard
 * are carried over verbatim in spirit from scripts/backfill-task-visibility.cjs,
 * which executed cleanly in production at COH-006 gate 2 (90 tasks, 90 applied,
 * 0 skipped, 0 outstanding). Read that file's comments for why each property is
 * shaped the way it is; the reasoning is identical and is not repeated here.
 *
 * Usage:
 *   node scripts/backfill-task-archive.cjs                       → DRY RUN (default)
 *   node scripts/backfill-task-archive.cjs --backup out.json     → pre-migration snapshot (no changes)
 *   node scripts/backfill-task-archive.cjs --execute --prod --manifest m.json   → PRODUCTION (guarded)
 *   node scripts/backfill-task-archive.cjs --verify [--baseline n]              → coverage / delta report
 *   node scripts/backfill-task-archive.cjs --measure-a3                         → the A3 null-ordering measurement
 *   node scripts/backfill-task-archive.cjs --rollback m.json --execute --prod
 *
 * Order for a production run (each step is the product owner's to trigger):
 *   --backup → --verify → --execute --prod --manifest → --verify --baseline <n> → --measure-a3
 */
const fs = require('fs');
const admin = require('firebase-admin');

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const EXECUTE = process.argv.includes('--execute');
const VERIFY = process.argv.includes('--verify');
const MEASURE = process.argv.includes('--measure-a3');
const PROD_OK = process.argv.includes('--prod');
const argAfter = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] || null;
};
const BACKUP_TO = argAfter('--backup');
const ROLLBACK_FROM = argAfter('--rollback');
const MANIFEST_TO = argAfter('--manifest');
const BASELINE = argAfter('--baseline') ? Number(argAfter('--baseline')) : null;

function refuseIfExists(path, what) {
  if (path && fs.existsSync(path)) {
    console.error(`✋ ${what} already exists at ${path}. Refusing to overwrite it — choose a new path.`);
    process.exit(1);
  }
}

// Presence is recorded explicitly: JSON cannot otherwise distinguish "the field
// was absent" from "the field held null", and `archivedAt: null` is a real,
// meaningful value here. Getting that wrong would make rollback unable to
// restore a legacy document to legacy.
const FIELDS = ['archived', 'archivedAt'];
const imageOf = (data) => Object.fromEntries(FIELDS.map(
  (f) => [f, f in data ? { present: true, value: data[f] } : { present: false }],
));
function canonical(v) {
  if (v && typeof v.toDate === 'function') return `TS:${v.toDate().toISOString()}`;
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const sameValue = (a, b) => canonical(a) === canonical(b);
const matchesImage = (data, image) => FIELDS.every((f) => {
  const want = image[f];
  if (!want.present) return !(f in data);
  return f in data && sameValue(data[f], want.value);
});
const applyImage = (image) => Object.fromEntries(FIELDS.map(
  (f) => [f, image[f].present ? image[f].value : admin.firestore.FieldValue.delete()],
));

const PROJECT_ID = 'church-inventory-9615c';

if (EMULATOR) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  const key = require('./serviceAccountKey.json');
  // Five Firebase projects share one Google account. A key for the wrong one
  // would silently migrate a different church's data.
  if (key.project_id !== PROJECT_ID) {
    console.error(`✋ serviceAccountKey.json targets ${key.project_id}, expected ${PROJECT_ID}.`);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(key) });
}
const db = admin.firestore();
const TARGET = EMULATOR ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : `PRODUCTION (${PROJECT_ID})`;

if (EXECUTE && !EMULATOR && !PROD_OK && !ROLLBACK_FROM) {
  console.error('✋ Refusing to --execute against PRODUCTION without --prod.');
  process.exit(1);
}

// ── The three shapes, same vocabulary as the transitional rules ─────────────
const has = (d, f) => Object.prototype.hasOwnProperty.call(d, f);
function shapeOf(data) {
  const a = has(data, 'archived');
  const at = has(data, 'archivedAt');
  if (!a && !at) return 'absent';
  if (a && at && data.archived === false && data.archivedAt === null) return 'active';
  if (a && typeof data.archived === 'boolean' && data.archived === true) return 'frozen';
  return 'malformed';
}

// What this document should look like afterwards. Null means leave it alone.
// Only `absent` is written; `malformed` is deliberately not repaired.
function plan(data) {
  return shapeOf(data) === 'absent' ? { archived: false, archivedAt: null } : null;
}

async function eachTask(fn) {
  // listDocuments(), not get(): a church whose parent document was deleted can
  // still hold a workItems subcollection.
  const churches = await db.collection('churches').listDocuments();
  for (const church of churches) {
    const snap = await church.collection('workItems').get();
    await fn(church.id, snap.docs.filter((d) => d.data().type === 'task'), snap.docs);
  }
  return churches.length;
}

async function backup(path) {
  const rows = [];
  const churches = await eachTask(async (churchId, tasks) => {
    for (const d of tasks) rows.push({ churchId, docId: d.id, before: imageOf(d.data()) });
  });
  fs.writeFileSync(path, JSON.stringify({
    kind: 'backup', takenAt: new Date().toISOString(), target: TARGET, churches, count: rows.length, rows,
  }, null, 2));
  console.log(`\n💾 Backup → ${path}`);
  console.log(`   ${rows.length} task(s) across ${churches} church(es) from ${TARGET}.`);
  console.log('   The audit record, with an explicit presence bit per field. --rollback consumes');
  console.log('   the --execute manifest, not this.');
}

async function rollback(path) {
  const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const attempts = new Map();
  let header = null;
  let complete = false;
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.kind === 'manifest-header') { header = row; continue; }
    if (row.kind === 'complete') { complete = true; continue; }
    if (!row.docId || row.attempt === undefined) continue;
    const key = `${row.churchId}/${row.docId}#${row.attempt}`;
    if (row.kind === 'intent') attempts.set(key, { intent: row, status: attempts.get(key)?.status || null });
    else if (row.kind === 'applied' || row.kind === 'superseded') {
      const e = attempts.get(key) || { intent: null, status: null };
      e.status = row.kind;
      attempts.set(key, e);
    }
  }
  const intents = new Map();
  for (const { intent, status } of attempts.values()) {
    if (!intent || status === 'superseded') continue;
    const docKey = `${intent.churchId}/${intent.docId}`;
    const held = intents.get(docKey);
    if (!held || (status === 'applied' && held.status !== 'applied')
        || (status === held.status && intent.attempt > held.intent.attempt)) {
      intents.set(docKey, { intent, status });
    }
  }
  if (!header) {
    console.error(`✋ ${path} has no manifest header, so it is not an --execute journal.`);
    process.exit(1);
  }
  if (header.target !== TARGET) {
    console.error(`✋ Manifest was written against ${header.target}, refusing to apply it to ${TARGET}.`);
    process.exit(1);
  }
  console.log(`\n${EXECUTE ? '↩️  ROLLBACK' : '🔎 ROLLBACK DRY RUN'} → ${TARGET}`);
  console.log(`   From ${path}, written ${header.writtenAt} — ${intents.size} intended change(s)${complete ? '' : ', RUN DID NOT COMPLETE'}.`);

  const skipped = [];
  let restored = 0;
  let missing = 0;
  for (const { intent: row } of intents.values()) {
    const ref = db.doc(`churches/${row.churchId}/workItems/${row.docId}`);
    if (!EXECUTE) {
      const snap = await ref.get();
      if (!snap.exists) { missing++; skipped.push(`${row.churchId}/${row.docId} (deleted)`); continue; }
      if (!matchesImage(snap.data(), row.after)) { skipped.push(`${row.churchId}/${row.docId} (changed since the run, or never written)`); continue; }
      restored++;
      continue;
    }
    const outcome = await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return 'missing';
      if (!matchesImage(snap.data(), row.after)) return 'changed';
      t.update(ref, applyImage(row.before));
      return 'restored';
    });
    if (outcome === 'restored') restored++;
    else if (outcome === 'missing') { missing++; skipped.push(`${row.churchId}/${row.docId} (deleted)`); }
    else skipped.push(`${row.churchId}/${row.docId} (changed since the run, or never written)`);
  }
  console.log(`   ${restored} ${EXECUTE ? 'restored' : 'would be restored'}, ${skipped.length} refused (${missing} deleted).`);
  if (skipped.length) {
    console.log('   REFUSED — these no longer match what the migration wrote, so they were left untouched:');
    for (const line of skipped.slice(0, 20)) console.log(`     ${line}`);
    console.log('⛔ Rollback is INCOMPLETE.');
    process.exitCode = 1;
  }
  if (!EXECUTE) console.log('   Dry run — nothing written.');
}

function journal(path) {
  const fd = fs.openSync(path, 'a');
  return {
    append(row) { fs.writeSync(fd, JSON.stringify(row) + '\n'); fs.fsyncSync(fd); },
    close() { fs.closeSync(fd); },
  };
}

async function run() {
  console.log(`\n${EXECUTE ? '✍️  EXECUTE' : '🔎 DRY RUN'} → ${TARGET}`);
  if (EXECUTE && !MANIFEST_TO) {
    console.error('✋ --execute requires --manifest <path>.');
    process.exit(1);
  }
  const jrnl = EXECUTE ? journal(MANIFEST_TO) : null;
  if (jrnl) jrnl.append({ kind: 'manifest-header', writtenAt: new Date().toISOString(), target: TARGET });

  const grand = { tasks: 0, maint: 0, changed: 0, applied: 0, skipped: 0, alreadyActive: 0, frozen: 0, malformed: 0 };
  const skippedIds = [];
  const malformedIds = [];
  const byStatus = {};

  const churches = await eachTask(async (churchId, tasks, all) => {
    const per = { tasks: tasks.length, maint: all.length - tasks.length, changed: 0, applied: 0, skipped: 0, alreadyActive: 0, frozen: 0, malformed: 0 };
    for (const d of tasks) {
      const data = d.data();
      const shape = shapeOf(data);
      if (shape === 'active') per.alreadyActive++;
      if (shape === 'frozen') per.frozen++;
      if (shape === 'malformed') { per.malformed++; malformedIds.push(`${churchId}/${d.id}`); }
      const updates = plan(data);
      if (!updates) continue;
      per.changed++;
      byStatus[data.status || '(none)'] = (byStatus[data.status || '(none)'] || 0) + 1;
      if (!EXECUTE) continue;

      const MAX_ATTEMPTS = 4;
      let outcome = { state: 'exhausted' };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const fresh = await d.ref.get();
        if (!fresh.exists) { outcome = { state: 'gone' }; break; }
        const cur = fresh.data();
        const curUpdates = plan(cur);
        if (!curUpdates) { outcome = { state: 'already-current' }; break; }
        const before = imageOf(cur);
        const after = imageOf({ ...cur, ...curUpdates });
        jrnl.append({ kind: 'intent', churchId, docId: d.id, attempt, before, after });
        const res = await db.runTransaction(async (t) => {
          const snap = await t.get(d.ref);
          if (!snap.exists) return 'gone';
          if (!matchesImage(snap.data(), before)) return 'stale';
          t.update(d.ref, applyImage(after));
          return 'applied';
        });
        if (res === 'applied') {
          jrnl.append({ kind: 'applied', churchId, docId: d.id, attempt });
          outcome = { state: 'applied' };
          break;
        }
        if (res === 'gone') { outcome = { state: 'gone' }; break; }
        jrnl.append({ kind: 'superseded', churchId, docId: d.id, attempt });
      }
      if (outcome.state === 'applied') per.applied++;
      else {
        per.skipped++;
        skippedIds.push(`${churchId}/${d.id} (${outcome.state})`);
        jrnl.append({ kind: 'skipped', churchId, docId: d.id, reason: outcome.state });
      }
    }
    console.log(`  ${churchId}: ${per.tasks} task(s) + ${per.maint} maintenance (untouched), ` +
      `${per.changed} ${EXECUTE ? `to write → ${per.applied} applied, ${per.skipped} skipped` : 'to write'}` +
      ` [already active ${per.alreadyActive}, archived ${per.frozen}, malformed ${per.malformed}]`);
    for (const k of Object.keys(grand)) grand[k] += per[k];
  });

  if (jrnl) {
    jrnl.append({ kind: 'complete', churches, scanned: grand.tasks, applied: grand.applied, skipped: grand.skipped });
    jrnl.close();
    console.log(`\n📝 Manifest → ${MANIFEST_TO} (${grand.applied} applied, ${grand.skipped} skipped).`);
  }
  console.log(`\nTotal across ${churches} church(es): ${grand.tasks} task(s), ${grand.maint} maintenance untouched, ` +
    `${grand.changed} needing the pair` + (EXECUTE ? `, ${grand.applied} applied, ${grand.skipped} skipped.` : ' to write.'));
  if (Object.keys(byStatus).length) {
    console.log('  Of those, by status: ' + Object.entries(byStatus).sort().map(([k, v]) => `${k} ${v}`).join(', '));
  }
  if (grand.malformed) {
    console.log(`\n⛔ ${grand.malformed} task(s) hold a MALFORMED archive pair. Not repaired — repairing one`);
    console.log('   would mean guessing at a real archive state. These are locked by the transitional');
    console.log('   rules and need a decision, not a re-run:');
    for (const line of malformedIds.slice(0, 20)) console.log(`     ${line}`);
    process.exitCode = 1;
  }
  if (skippedIds.length) {
    console.log('   SKIPPED — changed or deleted between the scan and the write; re-run to pick them up:');
    for (const line of skippedIds.slice(0, 20)) console.log(`     ${line}`);
    process.exitCode = 1;
  }
  if (!EXECUTE) console.log('\nDry run — nothing written. Re-run with --execute --prod --manifest <path>.');
}

// ── Verify / delta — the go/no-go for the reader gate ──────────────────────
async function verify() {
  console.log(`\n✅ VERIFY → ${TARGET}`);
  const grand = { tasks: 0, maint: 0, outstanding: 0, absent: 0, malformed: 0, active: 0, frozen: 0, maintWithFields: 0 };
  const samples = [];
  const churches = await eachTask(async (churchId, tasks, all) => {
    const per = { tasks: tasks.length, maint: all.length - tasks.length, outstanding: 0, absent: 0, malformed: 0, active: 0, frozen: 0, maintWithFields: 0 };
    for (const d of tasks) {
      const shape = shapeOf(d.data());
      per[shape === 'absent' ? 'absent' : shape]++;
      if (shape === 'absent' || shape === 'malformed') {
        per.outstanding++;
        if (samples.length < 10) samples.push(`${churchId}/${d.id} (${shape})`);
      }
    }
    // A1 in reverse: a maintenance item that somehow acquired the pair would be
    // caught by a constrained arm it must never be subject to.
    for (const d of all) {
      if (d.data().type !== 'task' && shapeOf(d.data()) !== 'absent') {
        per.maintWithFields++;
        if (samples.length < 10) samples.push(`${churchId}/${d.id} (maintenance carrying archive fields)`);
      }
    }
    console.log(`  ${churchId}: ${per.tasks} task(s) — active ${per.active}, archived ${per.frozen}, ` +
      `NOT BACKFILLED ${per.absent}, malformed ${per.malformed}; ${per.maint} maintenance (${per.maintWithFields} wrongly carrying fields)`);
    for (const k of Object.keys(grand)) grand[k] += per[k];
  });
  console.log(`\nTotal across ${churches} church(es): ${grand.tasks} task(s), ${grand.outstanding} outstanding.`);
  if (samples.length) console.log(`First outstanding: ${samples.join(', ')}`);

  // An empty read must never print the green light: wrong project, wrong
  // credential and a partial read all look like "0 outstanding" otherwise.
  if (churches === 0 || grand.tasks === 0) {
    console.log(`⛔ Found ${churches} church(es) and ${grand.tasks} task(s) — that is an empty read, not a pass.`);
    process.exitCode = 1;
    return;
  }
  if (BASELINE !== null && grand.tasks !== BASELINE) {
    console.log(`⛔ Expected ${BASELINE} task(s) from --baseline, scanned ${grand.tasks}. Population does not match.`);
    process.exitCode = 1;
    return;
  }
  if (grand.maintWithFields !== 0) {
    console.log('⛔ Maintenance items are carrying archive fields. A1 says they must not.');
    process.exitCode = 1;
    return;
  }
  if (grand.outstanding !== 0) {
    console.log('⛔ Do NOT cut the readers over. A task without the pair matches neither');
    console.log('   equality-filtered reader and would vanish from its board at cutover.');
    process.exitCode = 1;
    return;
  }
  console.log('✅ Every task this scan observed carries a valid archive pair.');
  if (BASELINE === null) console.log('   Re-run with --baseline <expected task count> to also check the population size.');
  console.log('\n⚠️  Re-run this immediately before the reader cutover.');
  console.log('   The create rule requires both fields or neither, so a stale tab can still create a');
  console.log('   legacy-shaped task behind this scan. That is the delta pass, and it is why the');
  console.log('   final ruleset — which requires the pair on every update — ships WITH the cutover.');
}

// ── The A3 measurement (review Q2) ─────────────────────────────────────────
async function measureA3() {
  console.log(`\n🔬 A3 MEASUREMENT → ${TARGET}`);
  console.log('   Does a `completedAt <= <iso>` range filter also return documents whose');
  console.log('   completedAt is explicitly null? The emulator said NO. Production is the authority.\n');
  const cutoff = new Date().toISOString();

  // The independent baseline. Without it, an empty range result cannot be told
  // apart from "there were no null-dated documents to find" (review Q2).
  const baseline = await db.collectionGroup('workItems')
    .where('status', '==', 'Complete').where('archived', '==', false)
    .where('completedAt', '==', null).get();
  const baselineIds = baseline.docs.map((d) => d.ref.path).sort();

  const ranged = await db.collectionGroup('workItems')
    .where('status', '==', 'Complete').where('archived', '==', false)
    .where('completedAt', '<=', cutoff).get();
  const rangedIds = new Set(ranged.docs.map((d) => d.ref.path));

  console.log(`   explicit completedAt == null : ${baselineIds.length} document(s)`);
  console.log(`   completedAt <= "${cutoff}" : ${ranged.size} document(s)`);

  if (baselineIds.length === 0) {
    console.log('\n⚠️  UNMEASURED. The baseline is empty, so this run cannot distinguish "production');
    console.log('   excludes nulls from the range" from "there were no null-dated documents to find".');
    console.log('   Record it as unmeasured, not as a pass. The skip guard ships either way.');
    return;
  }
  const included = baselineIds.filter((p) => rangedIds.has(p));
  console.log(`\n   of the null-dated baseline, ${included.length}/${baselineIds.length} appear in the range result.`);
  if (included.length === 0) {
    console.log('   ✅ MEASURED: production EXCLUDES explicit nulls from the range, matching the emulator.');
    console.log('      The skip guard is defensive; its null counter is expected to stay zero.');
  } else if (included.length === baselineIds.length) {
    console.log('   ⚠️  MEASURED: production INCLUDES explicit nulls — the emulator did NOT predict this,');
    console.log('      and A3\'s original hypothesis was right after all. The skip guard is LOAD-BEARING:');
    console.log('      it is the only thing standing between a never-properly-completed task and');
    console.log('      automatic archiving. Expect a non-zero malformed counter in production.');
  } else {
    console.log('   ⛔ MEASURED: production returns SOME of them. Neither hypothesis holds; stop and');
    console.log('      investigate before enabling any write.');
    process.exitCode = 1;
  }
  console.log('\n   Missing-field documents are a separate population and no equality-to-null query');
  console.log('   can reach them. They are invisible to the archiver by construction (A12).');
}

(async () => {
  try {
    refuseIfExists(BACKUP_TO, 'A backup');
    refuseIfExists(MANIFEST_TO, 'A manifest');
    if (BACKUP_TO) await backup(BACKUP_TO);
    else if (ROLLBACK_FROM) await rollback(ROLLBACK_FROM);
    else if (MEASURE) await measureA3();
    else if (VERIFY) await verify();
    else await run();
  } catch (err) {
    console.error('\n✋ Failed:', err.message);
    process.exit(1);
  }
})();
