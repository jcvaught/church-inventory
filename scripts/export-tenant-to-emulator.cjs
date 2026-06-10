/**
 * Work Unification — copy one real tenant's data into the emulator.
 *
 * The pre-prod gate (docs/LOCAL-TESTING-AND-REVERT-2026-06-06.md §B/§G) requires
 * the backfill migration to be dry-run + run + verified against a COPY of real
 * tenant data in the emulator — not just the 4-task seed — so real field shapes
 * (odd/missing fields, large comment threads, link backrefs) are exercised
 * before the Thursday window.
 *
 * Two modes, each guarded to its own target so neither can hit the wrong backend:
 *
 *   # 1. EXPORT prod → local JSON (READ-ONLY on prod; refuses if an emulator
 *   #    host is set, so it can't accidentally "export" an empty emulator):
 *   node scripts/export-tenant-to-emulator.cjs --church=<realChurchId>
 *        → writes .tenant-export/<churchId>.json
 *
 *   # 2. IMPORT JSON → emulator (refuses unless FIRESTORE_EMULATOR_HOST is
 *   #    localhost, like seed-emulator.mjs). --with-auth also mints an emulator
 *   #    admin (admin@test.local / Test1234!) pointed at the imported church and
 *   #    forces config/subscription.grandfathered so you can log in + click
 *   #    through the real-data copy in `npm run dev:emulator`:
 *   node scripts/export-tenant-to-emulator.cjs --import --church=<realChurchId> [--with-auth]
 *
 * The export is the whole `churches/{churchId}` subtree (every nested
 * subcollection, discovered via listCollections — comments, signups, waitlist,
 * etc.), serialized as a flat [{ path, data }] list. Firestore Timestamps,
 * GeoPoints, and DocumentReferences are tagged so they round-trip. Local files
 * may contain real names/PII — `.tenant-export/` should be gitignored; this is a
 * local sandbox aid, never committed.
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const IMPORT = process.argv.includes('--import');
const WITH_AUTH = process.argv.includes('--with-auth');
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const churchArg = process.argv.find((a) => a.startsWith('--church='));
const churchId = churchArg ? churchArg.slice('--church='.length) : null;

function die(msg) { console.error(msg); process.exit(1); }
if (!churchId) die('✋ Missing --church=<id>.');

const OUT_DIR = path.resolve(__dirname, '..', '.tenant-export');
const OUT_FILE = path.join(OUT_DIR, `${churchId}.json`);

// ── Firestore value (de)serialization — preserve non-JSON types ──
const { Timestamp, GeoPoint } = admin.firestore;
function encode(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Timestamp) return { __type__: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint) return { __type__: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (v && typeof v === 'object' && typeof v.path === 'string' && v.firestore) return { __type__: 'ref', path: v.path };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k]); return o; }
  return v;
}
function decode(v, db) {
  if (v === null || v === undefined) return v;
  if (v && typeof v === 'object' && v.__type__) {
    if (v.__type__ === 'timestamp') return new Timestamp(v.seconds, v.nanoseconds);
    if (v.__type__ === 'geopoint') return new GeoPoint(v.latitude, v.longitude);
    if (v.__type__ === 'ref') return db.doc(v.path);
  }
  if (Array.isArray(v)) return v.map((x) => decode(x, db));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = decode(v[k], db); return o; }
  return v;
}

async function dumpSubtree(db, docRef, out) {
  const snap = await docRef.get();
  if (snap.exists) out.push({ path: docRef.path, data: encode(snap.data()) });
  const subcols = await docRef.listCollections();
  for (const col of subcols) {
    const docs = await col.get();
    for (const d of docs.docs) {
      out.push({ path: d.ref.path, data: encode(d.data()) });
      await dumpSubtree(db, d.ref, out); // recurse for deeper subcollections (comments live here)
    }
  }
}

async function runExport() {
  if (EMULATOR) die('✋ Export reads PRODUCTION; unset FIRESTORE_EMULATOR_HOST and run without --import.');
  const key = require('./serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(key) });
  const db = admin.firestore();

  const church = await db.doc(`churches/${churchId}`).get();
  if (!church.exists) die(`✋ No church at churches/${churchId} in production.`);

  console.log(`\n🔎 EXPORT (read-only) → churches/${churchId} from PRODUCTION`);
  const out = [];
  await dumpSubtree(db, db.doc(`churches/${churchId}`), out);
  const counts = out.reduce((m, e) => {
    const seg = e.path.split('/'); const col = seg[seg.length - 2];
    m[col] = (m[col] || 0) + 1; return m;
  }, {});
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ churchId, exportedFrom: 'production', docCount: out.length, docs: out }, null, 2));
  console.log(`  ${out.length} docs written → ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log('  by collection:', Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' · '));
  console.log('\nNext: start the emulator, then re-run with --import (and --with-auth to click through).');
}

async function runImport() {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    die(`✋ Refusing to import: FIRESTORE_EMULATOR_HOST="${process.env.FIRESTORE_EMULATOR_HOST}" is not a localhost emulator.`);
  }
  if (!fs.existsSync(OUT_FILE)) die(`✋ No export file at ${OUT_FILE}. Run the export mode first.`);
  admin.initializeApp({ projectId: 'church-inventory-9615c' });
  const db = admin.firestore();

  const { docs } = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`\n✍️  IMPORT → EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})  ·  ${docs.length} docs for churches/${churchId}`);
  let batch = db.batch(); let ops = 0;
  for (const { path: p, data } of docs) {
    batch.set(db.doc(p), decode(data, db));
    if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  console.log(`  wrote ${docs.length} docs.`);

  if (WITH_AUTH) {
    const auth = admin.auth();
    const EMAIL = 'admin@test.local'; const PASSWORD = 'Test1234!';
    let user;
    try { user = await auth.getUserByEmail(EMAIL); }
    catch { user = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: 'Test Admin', emailVerified: true }); }
    await db.doc(`users/${user.uid}`).set({ name: 'Test Admin', email: EMAIL, role: 'admin', churchId, active: true, createdAt: new Date().toISOString() }, { merge: true });
    // Local-only: unlock every hub so the real-data copy is fully clickable.
    await db.doc(`churches/${churchId}/config/subscription`).set({ grandfathered: true, status: 'active' }, { merge: true });
    console.log(`  --with-auth: ${EMAIL} / ${PASSWORD} → churchId ${churchId} (admin, grandfathered).`);
  }
  console.log('\nNow: `npm run dev:emulator`, log in, and/or run `npm run migrate:emulator -- --verify`.');
}

(IMPORT ? runImport() : runExport())
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
