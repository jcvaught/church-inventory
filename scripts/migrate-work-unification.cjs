/**
 * Work Unification — Phase 2 backfill (2026-06-08).
 *
 * Copies every `tasks` and `maintenanceTickets` doc (and its `comments`
 * subcollection) into a unified `workItems` collection, adding one field —
 * `type: 'task' | 'maintenance'`. Nothing is renamed: a workItems doc is a
 * verbatim copy of its source plus `type` (see the Work-unification plan §0
 * refinement — "the difference is a type flag, everything else shared"). The
 * read-path flip to workItems happens LATER, in a Thursday maintenance window;
 * this script is the additive backfill that de-risks that window. It never
 * touches the source collections.
 *
 * Idempotent: each target doc id is derived deterministically from its source
 * (`task_<srcId>` / `mnt_<srcId>`), so re-runs upsert in place — safe to run
 * once during prep and again in the window to catch writes that landed between.
 * A run only writes docs that are new or actually changed, so a clean re-run
 * reports 0 writes.
 *
 * Usage:
 *   node scripts/migrate-work-unification.cjs                 → DRY RUN (default; prints what it would do)
 *   node scripts/migrate-work-unification.cjs --execute       → write to the EMULATOR (FIRESTORE_EMULATOR_HOST set)
 *   node scripts/migrate-work-unification.cjs --execute --prod → write to PRODUCTION (guarded — requires --prod)
 *   node scripts/migrate-work-unification.cjs --verify        → verify counts + spot-check + report orphans
 *
 * Against the emulator, prefix with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 * (the `npm run migrate:emulator` script does this for you).
 */
const admin = require('firebase-admin');

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const EXECUTE = process.argv.includes('--execute');
const VERIFY = process.argv.includes('--verify');
const PROD_OK = process.argv.includes('--prod');

// ── Init: emulator (projectId only, like seed-emulator.mjs) vs prod (cert) ──
if (EMULATOR) {
  admin.initializeApp({ projectId: 'church-inventory-9615c' });
} else {
  const key = require('./serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(key) });
}
const db = admin.firestore();

const TARGET = EMULATOR ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION';

// Safety net: writing to prod requires BOTH --execute and --prod, so an
// emulator-intended --execute that forgot to set FIRESTORE_EMULATOR_HOST
// refuses to touch production instead of silently migrating it.
if (EXECUTE && !EMULATOR && !PROD_OK) {
  console.error('✋ Refusing to --execute against PRODUCTION without --prod.');
  console.error('   For the emulator, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (or use `npm run migrate:emulator`).');
  console.error('   For a real prod backfill, re-run with: --execute --prod');
  process.exit(1);
}

// Source collection → (target id prefix, type value).
const SOURCES = [
  { coll: 'tasks', prefix: 'task', type: 'task' },
  { coll: 'maintenanceTickets', prefix: 'mnt', type: 'maintenance' },
];

// Stable stringify (recursively sorted keys) so "is this doc unchanged?" and
// field-for-field spot checks don't false-positive on key ordering.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// A small auto-flushing batch (Firestore caps a batch at 500 ops).
function batcher() {
  let batch = db.batch();
  let ops = 0;
  let writes = 0;
  return {
    set(ref, data) { batch.set(ref, data); writes++; if (++ops >= 400) return this.flush(); return Promise.resolve(); },
    async flush() { if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0; } },
    get writes() { return writes; },
  };
}

async function migrate() {
  const churches = await db.collection('churches').get();
  console.log(`\n${EXECUTE ? '✍️  EXECUTE' : '🔎 DRY RUN'} → ${TARGET}`);
  console.log(`Found ${churches.size} church(es).\n`);

  let grand = { items: 0, written: 0, unchanged: 0, comments: 0, commentsWritten: 0 };

  for (const church of churches.docs) {
    const churchId = church.id;
    const b = batcher();
    let per = { items: 0, written: 0, unchanged: 0, comments: 0, commentsWritten: 0 };

    for (const { coll, prefix, type } of SOURCES) {
      const src = await db.collection(`churches/${churchId}/${coll}`).get();
      for (const doc of src.docs) {
        per.items++;
        const targetId = `${prefix}_${doc.id}`;
        const targetRef = db.doc(`churches/${churchId}/workItems/${targetId}`);
        const data = { ...doc.data(), type };

        const existing = await targetRef.get();
        const changed = !existing.exists || stable(existing.data()) !== stable(data);
        if (changed) { per.written++; if (EXECUTE) await b.set(targetRef, data); }
        else per.unchanged++;

        // Comments subcollection — preserve comment doc ids verbatim.
        const comments = await doc.ref.collection('comments').get();
        for (const c of comments.docs) {
          per.comments++;
          const cRef = targetRef.collection('comments').doc(c.id);
          const cExisting = await cRef.get();
          if (!cExisting.exists || stable(cExisting.data()) !== stable(c.data())) {
            per.commentsWritten++;
            if (EXECUTE) await b.set(cRef, c.data());
          }
        }
      }
    }

    if (EXECUTE) await b.flush();
    console.log(
      `  ${churchId}: ${per.items} work items (${per.written} ${EXECUTE ? 'written' : 'to write'}, ${per.unchanged} unchanged) · ` +
      `${per.comments} comments (${per.commentsWritten} ${EXECUTE ? 'written' : 'to write'})`
    );
    for (const k of Object.keys(grand)) grand[k] += per[k];
  }

  console.log(
    `\nTotal: ${grand.items} work items (${grand.written} ${EXECUTE ? 'written' : 'to write'}, ${grand.unchanged} unchanged) · ` +
    `${grand.comments} comments (${grand.commentsWritten} ${EXECUTE ? 'written' : 'to write'}).`
  );
  if (!EXECUTE) console.log('Dry run — nothing written. Re-run with --execute (emulator) or --execute --prod (production).');
}

async function verify() {
  const churches = await db.collection('churches').get();
  console.log(`\n✅ VERIFY → ${TARGET}\nChecking ${churches.size} church(es).\n`);
  let problems = 0;

  for (const church of churches.docs) {
    const churchId = church.id;
    const tasks = await db.collection(`churches/${churchId}/tasks`).get();
    const tickets = await db.collection(`churches/${churchId}/maintenanceTickets`).get();
    const work = await db.collection(`churches/${churchId}/workItems`).get();
    const byType = { task: 0, maintenance: 0, other: 0 };
    for (const d of work.docs) byType[d.data().type || 'other']++;

    const okTask = byType.task === tasks.size;
    const okMnt = byType.maintenance === tickets.size;
    if (!okTask) problems++;
    if (!okMnt) problems++;

    // Orphans: a workItems doc whose source no longer exists.
    let orphans = 0;
    const srcIds = new Set([
      ...tasks.docs.map((d) => `task_${d.id}`),
      ...tickets.docs.map((d) => `mnt_${d.id}`),
    ]);
    for (const d of work.docs) if (!srcIds.has(d.id)) orphans++;
    if (orphans) problems++;

    // Spot-check up to 3 of each: every source field present + equal on target.
    let mismatches = 0;
    const spot = [
      ...tasks.docs.slice(0, 3).map((d) => ({ d, id: `task_${d.id}` })),
      ...tickets.docs.slice(0, 3).map((d) => ({ d, id: `mnt_${d.id}` })),
    ];
    for (const { d, id } of spot) {
      const t = await db.doc(`churches/${churchId}/workItems/${id}`).get();
      if (!t.exists) { mismatches++; continue; }
      const s = d.data(); const td = t.data();
      for (const k of Object.keys(s)) if (stable(s[k]) !== stable(td[k])) mismatches++;
    }
    if (mismatches) problems++;

    const mark = (ok) => (ok ? '✓' : '✗');
    console.log(
      `  ${churchId}: tasks ${mark(okTask)} ${byType.task}/${tasks.size} · ` +
      `maintenance ${mark(okMnt)} ${byType.maintenance}/${tickets.size} · ` +
      `orphans ${mark(orphans === 0)} ${orphans} · spot-check ${mark(mismatches === 0)} ${mismatches} mismatch(es)`
    );
  }

  console.log(problems === 0 ? '\n✅ All checks passed.' : `\n❌ ${problems} problem(s) — do NOT flip the read path.`);
  process.exitCode = problems === 0 ? 0 : 2;
}

(VERIFY ? verify() : migrate())
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => { console.error(err); process.exit(1); });
