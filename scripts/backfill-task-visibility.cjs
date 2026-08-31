/**
 * COH-006 gate 2 — task visibility backfill (2026-08-31).
 *
 * Brings every existing `workItems` task up to the shape the gate-3 constrained
 * queries and the gate-4 read rule require:
 *
 *   1. `visibility` — normalised to 'team' when absent or empty. Legacy tasks
 *      predate the field; every reader already treats them as team (canSeeTask,
 *      the current rule's `!keys().hasAny(['visibility'])` arm, digestVisibleTasks),
 *      so this writes down what the app already believes. It matters because the
 *      gate-3 team listener is `where('visibility','==','team')`, and a document
 *      with no field does not match an equality filter.
 *   2. `assigneeUids` / `sharedWithUids` — plain uid arrays projected from the
 *      `[{uid,name}]` arrays, because rules cannot search inside an object array.
 *
 * It does NOT clear stale `sharedWith` on a private task. That shape is inert:
 * the gate-3 shared listener constrains `visibility == 'shared'` precisely
 * because the projection alone must never authorize (gate-1 review H-1).
 * Rewriting user-visible data the app does not need rewritten is out of scope.
 *
 * Maintenance items are untouched — they have no visibility model.
 *
 * Idempotent: a document is written only when at least one of the three fields
 * would actually change, so a clean re-run reports 0 writes. Safe to run during
 * prep and again immediately before the gate-3 cutover to catch documents
 * created in between (the delta pass the plan requires).
 *
 * Usage:
 *   node scripts/backfill-task-visibility.cjs                      → DRY RUN (default)
 *   node scripts/backfill-task-visibility.cjs --backup out.json    → write the rollback file (no changes)
 *   node scripts/backfill-task-visibility.cjs --execute            → write to the EMULATOR
 *   node scripts/backfill-task-visibility.cjs --execute --prod     → write to PRODUCTION (guarded)
 *   node scripts/backfill-task-visibility.cjs --verify             → validation / delta report
 *   node scripts/backfill-task-visibility.cjs --rollback out.json --execute --prod
 *
 * Order for a production run (each step is the product owner's to trigger):
 *   --backup → --verify → --execute --prod → --verify (expect 0 outstanding)
 *
 * Against the emulator, prefix with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
 */
const fs = require('fs');
const admin = require('firebase-admin');

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const EXECUTE = process.argv.includes('--execute');
const VERIFY = process.argv.includes('--verify');
const PROD_OK = process.argv.includes('--prod');
const argAfter = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] || null;
};
const BACKUP_TO = argAfter('--backup');
const ROLLBACK_FROM = argAfter('--rollback');

const PROJECT_ID = 'church-inventory-9615c';

if (EMULATOR) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  const key = require('./serviceAccountKey.json');
  // Five Firebase projects share one Google account, so a key for the wrong one
  // would silently migrate the wrong church data. Refuse before touching a doc.
  if (key.project_id !== PROJECT_ID) {
    console.error(`✋ serviceAccountKey.json targets ${key.project_id}, expected ${PROJECT_ID}.`);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(key) });
}
const db = admin.firestore();
const TARGET = EMULATOR ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : `PRODUCTION (${PROJECT_ID})`;

// Same safety net as migrate-work-unification.cjs: an --execute that forgot to
// set FIRESTORE_EMULATOR_HOST refuses production rather than silently writing it.
if (EXECUTE && !EMULATOR && !PROD_OK) {
  console.error('✋ Refusing to --execute against PRODUCTION without --prod.');
  console.error('   Emulator: set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080');
  console.error('   Production: re-run with --execute --prod');
  process.exit(1);
}

// The projection, character-for-character the same policy as uidsOf() in
// src/utils/taskVisibility.js and uidProjection() in functions/index.js: dedupe,
// drop entries with no uid, sort. A backfill that disagreed with the writers
// would show up as permanent churn in --verify.
function uidsOf(people) {
  if (!Array.isArray(people)) return [];
  return [...new Set(people.map((p) => p && p.uid).filter(Boolean))].sort();
}

const sameArray = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((v, i) => v === b[i]);

// What this document should look like afterwards, and whether that differs from
// what it looks like now. Returns null when nothing would change.
function plan(data) {
  const updates = {};
  if (!data.visibility) updates.visibility = 'team';

  const assigneeUids = uidsOf(data.assignees);
  if (!sameArray(data.assigneeUids, assigneeUids)) updates.assigneeUids = assigneeUids;

  const sharedWithUids = uidsOf(data.sharedWith);
  if (!sameArray(data.sharedWithUids, sharedWithUids)) updates.sharedWithUids = sharedWithUids;

  return Object.keys(updates).length ? updates : null;
}

function batcher() {
  let batch = db.batch();
  let ops = 0;
  let writes = 0;
  return {
    async update(ref, data) { batch.update(ref, data); writes++; if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } },
    async flush() { if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0; } },
    get writes() { return writes; },
  };
}

async function eachTask(fn) {
  const churches = await db.collection('churches').get();
  for (const church of churches.docs) {
    const snap = await db.collection(`churches/${church.id}/workItems`).get();
    const tasks = snap.docs.filter((d) => d.data().type === 'task');
    await fn(church.id, tasks);
  }
  return churches.size;
}

// ── Backup — only the three fields this script can change, plus a marker for
// "the field was absent", which is what rollback needs to restore faithfully.
async function backup(path) {
  const rows = [];
  const churches = await eachTask(async (churchId, tasks) => {
    for (const d of tasks) {
      const data = d.data();
      rows.push({
        churchId,
        docId: d.id,
        visibility: 'visibility' in data ? data.visibility : null,
        assigneeUids: 'assigneeUids' in data ? data.assigneeUids : null,
        sharedWithUids: 'sharedWithUids' in data ? data.sharedWithUids : null,
      });
    }
  });
  fs.writeFileSync(path, JSON.stringify({
    takenAt: new Date().toISOString(), target: TARGET, churches, count: rows.length, rows,
  }, null, 2));
  console.log(`\n💾 Backup → ${path}\n   ${rows.length} task(s) across ${churches} church(es) from ${TARGET}.`);
  console.log('   Contains the pre-migration value of visibility/assigneeUids/sharedWithUids only');
  console.log('   (null = the field was absent, which --rollback restores by deleting it).');
}

async function rollback(path) {
  const file = JSON.parse(fs.readFileSync(path, 'utf8'));
  console.log(`\n${EXECUTE ? '↩️  ROLLBACK' : '🔎 ROLLBACK DRY RUN'} → ${TARGET}`);
  console.log(`   From ${path}, taken ${file.takenAt} against ${file.target} (${file.count} rows).`);
  if (file.target !== TARGET) {
    console.error(`✋ Backup was taken against ${file.target}, refusing to restore it into ${TARGET}.`);
    process.exit(1);
  }
  const b = batcher();
  let restored = 0;
  for (const row of file.rows) {
    const ref = db.doc(`churches/${row.churchId}/workItems/${row.docId}`);
    const del = admin.firestore.FieldValue.delete();
    const updates = {
      visibility: row.visibility === null ? del : row.visibility,
      assigneeUids: row.assigneeUids === null ? del : row.assigneeUids,
      sharedWithUids: row.sharedWithUids === null ? del : row.sharedWithUids,
    };
    restored++;
    if (EXECUTE) await b.update(ref, updates);
  }
  if (EXECUTE) await b.flush();
  console.log(`   ${restored} task(s) ${EXECUTE ? 'restored' : 'would be restored'}.`);
  if (!EXECUTE) console.log('   Dry run — nothing written.');
}

async function run() {
  console.log(`\n${EXECUTE ? '✍️  EXECUTE' : '🔎 DRY RUN'} → ${TARGET}`);
  let grand = { tasks: 0, changed: 0, vis: 0, asg: 0, shr: 0 };
  const churches = await eachTask(async (churchId, tasks) => {
    const b = batcher();
    const per = { tasks: tasks.length, changed: 0, vis: 0, asg: 0, shr: 0 };
    for (const d of tasks) {
      const updates = plan(d.data());
      if (!updates) continue;
      per.changed++;
      if ('visibility' in updates) per.vis++;
      if ('assigneeUids' in updates) per.asg++;
      if ('sharedWithUids' in updates) per.shr++;
      if (EXECUTE) await b.update(d.ref, updates);
    }
    if (EXECUTE) await b.flush();
    console.log(`  ${churchId}: ${per.tasks} task(s), ${per.changed} ${EXECUTE ? 'written' : 'to write'} ` +
      `(visibility ${per.vis}, assigneeUids ${per.asg}, sharedWithUids ${per.shr})`);
    for (const k of Object.keys(grand)) grand[k] += per[k];
  });
  console.log(`\nTotal across ${churches} church(es): ${grand.tasks} task(s), ${grand.changed} ${EXECUTE ? 'written' : 'to write'}.`);
  if (!EXECUTE) console.log('Dry run — nothing written. Re-run with --execute (emulator) or --execute --prod.');
}

// ── Verify / delta — the gate before the reader cutover. Anything outstanding
// here is a task the gate-3 listeners would fail to deliver to its recipients.
async function verify() {
  console.log(`\n✅ VERIFY → ${TARGET}`);
  let grand = { tasks: 0, outstanding: 0, noVis: 0, badAsg: 0, badShr: 0, notList: 0 };
  const samples = [];
  const churches = await eachTask(async (churchId, tasks) => {
    const per = { tasks: tasks.length, outstanding: 0, noVis: 0, badAsg: 0, badShr: 0, notList: 0 };
    for (const d of tasks) {
      const data = d.data();
      let bad = false;
      if (!data.visibility) { per.noVis++; bad = true; }
      if (!sameArray(data.assigneeUids, uidsOf(data.assignees))) { per.badAsg++; bad = true; }
      if (!sameArray(data.sharedWithUids, uidsOf(data.sharedWith))) { per.badShr++; bad = true; }
      // Gate 4 enforces the list type on create; a map here would authorize a
      // direct get that the array-contains listener could never deliver.
      for (const f of ['assigneeUids', 'sharedWithUids']) {
        if (f in data && !Array.isArray(data[f])) { per.notList++; bad = true; }
      }
      if (bad) { per.outstanding++; if (samples.length < 10) samples.push(`${churchId}/${d.id}`); }
    }
    console.log(`  ${churchId}: ${per.tasks} task(s), ${per.outstanding} outstanding ` +
      `(no visibility ${per.noVis}, assigneeUids drift ${per.badAsg}, sharedWithUids drift ${per.badShr}, not a list ${per.notList})`);
    for (const k of Object.keys(grand)) grand[k] += per[k];
  });
  console.log(`\nTotal across ${churches} church(es): ${grand.tasks} task(s), ${grand.outstanding} outstanding.`);
  if (samples.length) console.log(`First outstanding: ${samples.join(', ')}`);
  // An empty read must not print the green light. Wrong project, wrong emulator,
  // or a credential that can see nothing all look like "0 outstanding" otherwise,
  // and this report is the gate on cutting the readers over.
  if (churches === 0 || grand.tasks === 0) {
    console.log(`⛔ Found ${churches} church(es) and ${grand.tasks} task(s) — that is not a pass, it is an empty read.`);
    console.log('   Check the target, the credential, and that you meant to run against ' + TARGET + '.');
    process.exitCode = 1;
    return;
  }
  if (grand.outstanding === 0) {
    console.log('✅ Projection coverage is complete. Safe to proceed to the gate-3 reader cutover.');
  } else {
    console.log('⛔ Do NOT cut the readers over. Re-run the backfill, then verify again.');
    process.exitCode = 1;
  }
}

(async () => {
  try {
    if (BACKUP_TO) await backup(BACKUP_TO);
    else if (ROLLBACK_FROM) await rollback(ROLLBACK_FROM);
    else if (VERIFY) await verify();
    else await run();
  } catch (err) {
    console.error('\n✋ Failed:', err.message);
    process.exit(1);
  }
})();
