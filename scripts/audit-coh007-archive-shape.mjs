// COH-007 — archive-state shape audit. READ-ONLY.
//
// Counts the archive-state shape of every work item in production.
// The transitional rules classify a task as absent / active / frozen and lock
// anything else, so this answers the only question the emulator cannot: is any
// real task already in a shape the new rules would refuse to let its church edit?
//
// Run it at each remaining gate, not just this one:
//   • additive gate  — every task must be `absent`; anything else is locked.
//   • backfill gate  — the coverage baseline, and the delta pass afterwards.
//                      Compare `absent` going to zero and `active` to the task
//                      count, independently of what the backfill script reports
//                      about itself.
//   • reader gate    — `absent` MUST be zero before the final ruleset deploys.
//                      An unbackfilled task failing under the final rules is the
//                      cutover signal, never an acceptable production state.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
const key = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(key) });
const db = getFirestore();

const snap = await db.collectionGroup('workItems').get();
const shape = (d) => {
  const hasA = Object.prototype.hasOwnProperty.call(d, 'archived');
  const hasAt = Object.prototype.hasOwnProperty.call(d, 'archivedAt');
  if (!hasA && !hasAt) return 'absent (legacy — usable)';
  if (hasA && hasAt && d.archived === false && d.archivedAt === null) return 'active (shaped — usable)';
  if (hasA && typeof d.archived === 'boolean' && d.archived === true) return 'frozen (archived)';
  return 'MALFORMED — LOCKED BY THE NEW RULES';
};
const counts = {}, churches = new Set(), bad = [];
for (const d of snap.docs) {
  const data = d.data();
  const s = shape(data);
  counts[s] = (counts[s] || 0) + 1;
  churches.add(d.ref.parent.parent.id);
  if (s.startsWith('MALFORMED')) bad.push(d.ref.path);
}
console.log(`work items: ${snap.size} across ${churches.size} churches`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${v.toString().padStart(4)}  ${k}`);
const byType = {};
for (const d of snap.docs) { const t = d.data().type || '(none)'; byType[t] = (byType[t] || 0) + 1; }
console.log('by type:', byType);
if (bad.length) { console.log('\nLOCKED DOCUMENTS:'); bad.forEach(p => console.log('  ' + p)); process.exit(1); }
console.log('\nNo production work item is in a shape the transitional rules would lock.');
process.exit(0);
