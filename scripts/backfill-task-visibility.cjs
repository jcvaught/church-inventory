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
 * Rollback is manifest-based, not backup-based (gate-2 review H-1). `--execute`
 * records, for every document it actually writes, the before-image AND the
 * after-image it wrote. `--rollback` restores a document only when its three
 * fields still equal that after-image, transactionally; anything a user has
 * touched since is reported and REFUSED rather than overwritten. Restoring an
 * old value blindly would revert sharing edits made after the run, including on
 * documents the migration never changed.
 *
 * Usage:
 *   node scripts/backfill-task-visibility.cjs                      → DRY RUN (default)
 *   node scripts/backfill-task-visibility.cjs --backup out.json    → full pre-migration snapshot (no changes)
 *   node scripts/backfill-task-visibility.cjs --execute --manifest m.json          → EMULATOR
 *   node scripts/backfill-task-visibility.cjs --execute --prod --manifest m.json   → PRODUCTION (guarded)
 *   node scripts/backfill-task-visibility.cjs --verify [--baseline n]  → validation / delta report
 *   node scripts/backfill-task-visibility.cjs --rollback m.json --execute --prod
 *
 * Order for a production run (each step is the product owner's to trigger):
 *   --backup → --verify → --execute --prod --manifest → --verify --baseline <n>
 *
 * `--verify` proves per-document consistency for the documents it observes. It
 * is NOT by itself proof that coverage will still be complete at cutover: a
 * stale client can create an unprojected task in a church this scan has already
 * passed (gate-2 review H-2). Closing that needs either the gate-4 create-shape
 * rule live before the final scan, or an enforced write freeze. See the workboard.
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
const MANIFEST_TO = argAfter('--manifest');
const BASELINE = argAfter('--baseline') ? Number(argAfter('--baseline')) : null;

// Never clobber a rollback artifact: a second invocation that reused the path
// would destroy the only record of how to undo the first one.
function refuseIfExists(path, what) {
  if (path && fs.existsSync(path)) {
    console.error(`✋ ${what} already exists at ${path}. Refusing to overwrite it — choose a new path.`);
    process.exit(1);
  }
}

// JSON has no way to say "this field was absent" that a stored null cannot also
// mean (gate-2 review L-1), so presence is recorded explicitly.
const FIELDS = ['visibility', 'assigneeUids', 'sharedWithUids'];
const imageOf = (data) => Object.fromEntries(FIELDS.map((f) => [f, f in data ? { present: true, value: data[f] } : { present: false }]));
const sameValue = (a, b) => (Array.isArray(a) || Array.isArray(b) ? sameArray(a, b) : a === b);
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

// listDocuments(), not get(): a church whose parent document was deleted can
// still hold a workItems subcollection, and get() would not return it
// (gate-2 review M-1). listDocuments returns the reference either way.
async function eachTask(fn) {
  const churches = await db.collection('churches').listDocuments();
  for (const church of churches) {
    const snap = await church.collection('workItems').get();
    const tasks = snap.docs.filter((d) => d.data().type === 'task');
    await fn(church.id, tasks);
  }
  return churches.length;
}

// ── Backup — only the three fields this script can change, plus a marker for
// "the field was absent", which is what rollback needs to restore faithfully.
async function backup(path) {
  const rows = [];
  const churches = await eachTask(async (churchId, tasks) => {
    for (const d of tasks) {
      const data = d.data();
      rows.push({ churchId, docId: d.id, before: imageOf(data) });
    }
  });
  fs.writeFileSync(path, JSON.stringify({
    kind: 'backup', takenAt: new Date().toISOString(), target: TARGET, churches, count: rows.length, rows,
  }, null, 2));
  console.log(`\n💾 Backup → ${path}\n   ${rows.length} task(s) across ${churches} church(es) from ${TARGET}.`);
  console.log('   A full pre-migration snapshot of visibility/assigneeUids/sharedWithUids, with an');
  console.log('   explicit presence bit per field. This is the audit record and the input to a');
  console.log('   manual repair; the thing --rollback consumes is the --execute manifest.');
}

// Manifest-based, conditional, and transactional (gate-2 review H-1). A document
// is restored only if its three fields still hold exactly what this migration
// wrote. Anything a user has changed since is reported and left alone: reverting
// a projection while its object array moved on would silently drop or resurrect
// a reader, which is the class of bug this whole task exists to remove.
async function rollback(path) {
  const file = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (file.kind !== 'manifest') {
    console.error(`✋ ${path} is ${file.kind === 'backup' ? 'a --backup snapshot' : 'not a recognised artifact'}, not an --execute manifest.`);
    console.error('   Rollback consumes the manifest written by --execute, so it can tell what this run actually changed.');
    process.exit(1);
  }
  if (file.target !== TARGET) {
    console.error(`✋ Manifest was written against ${file.target}, refusing to apply it to ${TARGET}.`);
    process.exit(1);
  }
  console.log(`\n${EXECUTE ? '↩️  ROLLBACK' : '🔎 ROLLBACK DRY RUN'} → ${TARGET}`);
  console.log(`   From ${path}, written ${file.writtenAt} (${file.rows.length} document(s) changed by that run).`);

  const skipped = [];
  let restored = 0;
  let missing = 0;
  for (const row of file.rows) {
    const ref = db.doc(`churches/${row.churchId}/workItems/${row.docId}`);
    if (!EXECUTE) {
      const snap = await ref.get();
      if (!snap.exists) { missing++; skipped.push(`${row.churchId}/${row.docId} (deleted)`); continue; }
      if (!matchesImage(snap.data(), row.after)) { skipped.push(`${row.churchId}/${row.docId} (changed since the run)`); continue; }
      restored++;
      continue;
    }
    // One transaction per document: read-compare-write cannot interleave with a
    // user's write, and a refusal on one document does not abort the others.
    const outcome = await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return 'missing';
      if (!matchesImage(snap.data(), row.after)) return 'changed';
      t.update(ref, applyImage(row.before));
      return 'restored';
    });
    if (outcome === 'restored') restored++;
    else if (outcome === 'missing') { missing++; skipped.push(`${row.churchId}/${row.docId} (deleted)`); }
    else skipped.push(`${row.churchId}/${row.docId} (changed since the run)`);
  }

  console.log(`   ${restored} ${EXECUTE ? 'restored' : 'would be restored'}, ${skipped.length} refused (${missing} deleted).`);
  if (skipped.length) {
    console.log('   REFUSED — these no longer match what the migration wrote, so they were left untouched:');
    for (const line of skipped.slice(0, 20)) console.log(`     ${line}`);
    if (skipped.length > 20) console.log(`     …and ${skipped.length - 20} more`);
    console.log('   Repair these by hand against the --backup snapshot if they need it.');
  }
  if (!EXECUTE) console.log('   Dry run — nothing written.');
}

async function run() {
  console.log(`\n${EXECUTE ? '✍️  EXECUTE' : '🔎 DRY RUN'} → ${TARGET}`);
  if (EXECUTE && !MANIFEST_TO) {
    console.error('✋ --execute requires --manifest <path>. Without the manifest of what this run');
    console.error('   actually changed, --rollback cannot tell a migration write from a user edit.');
    process.exit(1);
  }
  const manifest = [];
  let grand = { tasks: 0, changed: 0, vis: 0, asg: 0, shr: 0 };
  const churches = await eachTask(async (churchId, tasks) => {
    const b = batcher();
    const per = { tasks: tasks.length, changed: 0, vis: 0, asg: 0, shr: 0 };
    for (const d of tasks) {
      const data = d.data();
      const updates = plan(data);
      if (!updates) continue;
      per.changed++;
      if ('visibility' in updates) per.vis++;
      if ('assigneeUids' in updates) per.asg++;
      if ('sharedWithUids' in updates) per.shr++;
      if (EXECUTE) {
        manifest.push({ churchId, docId: d.id, before: imageOf(data), after: imageOf({ ...data, ...updates }) });
        await b.update(d.ref, updates);
      }
    }
    if (EXECUTE) await b.flush();
    console.log(`  ${churchId}: ${per.tasks} task(s), ${per.changed} ${EXECUTE ? 'written' : 'to write'} ` +
      `(visibility ${per.vis}, assigneeUids ${per.asg}, sharedWithUids ${per.shr})`);
    for (const k of Object.keys(grand)) grand[k] += per[k];
  });
  if (EXECUTE) {
    fs.writeFileSync(MANIFEST_TO, JSON.stringify({
      kind: 'manifest', writtenAt: new Date().toISOString(), target: TARGET,
      churches, scanned: grand.tasks, rows: manifest,
    }, null, 2));
    console.log(`\n📝 Manifest → ${MANIFEST_TO} (${manifest.length} document(s) changed by this run).`);
    console.log('   Keep it. --rollback consumes it and refuses anything edited since.');
  }
  console.log(`\nTotal across ${churches} church(es): ${grand.tasks} task(s), ${grand.changed} ${EXECUTE ? 'written' : 'to write'}.`);
  if (!EXECUTE) console.log('Dry run — nothing written. Re-run with --execute --manifest <path> (emulator) or --execute --prod --manifest <path>.');
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
  // A baseline the operator approves out of band turns "nonempty" into "the size
  // I expected" (gate-2 review M-1). Without it, an unexpectedly small scan — a
  // wrong but populated target, a partial read — still looks green.
  if (BASELINE !== null && grand.tasks !== BASELINE) {
    console.log(`⛔ Expected ${BASELINE} task(s) from --baseline, scanned ${grand.tasks}. Population does not match.`);
    process.exitCode = 1;
    return;
  }
  if (grand.outstanding !== 0) {
    console.log('⛔ Do NOT cut the readers over. Re-run the backfill, then verify again.');
    process.exitCode = 1;
    return;
  }
  console.log('✅ Every task this scan observed is fully projected.');
  if (BASELINE === null) console.log('   Re-run with --baseline <expected task count> to also check the population size.');
  // Stated every time, because this is the sentence an operator is most likely
  // to over-read (gate-2 review H-2).
  console.log('\n⚠️  This is NOT proof that coverage will still be complete at cutover.');
  console.log('   The scan walks churches in sequence, so a stale client can create an unprojected');
  console.log('   task in a church already passed, and a write immediately after the last snapshot');
  console.log('   has the same effect. Closing that race needs the gate-4 create-shape rule live');
  console.log('   before this scan, or an enforced write freeze through the reader cutover.');
}

(async () => {
  try {
    refuseIfExists(BACKUP_TO, 'A backup');
    refuseIfExists(MANIFEST_TO, 'A manifest');
    if (BACKUP_TO) await backup(BACKUP_TO);
    else if (ROLLBACK_FROM) await rollback(ROLLBACK_FROM);
    else if (VERIFY) await verify();
    else await run();
  } catch (err) {
    console.error('\n✋ Failed:', err.message);
    process.exit(1);
  }
})();
