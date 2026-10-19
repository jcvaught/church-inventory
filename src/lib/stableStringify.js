// Deterministic JSON for comparing Firestore snapshot data (2026-10-18): object
// keys sorted at every level, arrays kept in order, values with a toJSON()
// (Firestore Timestamp, Date) serialised through it, undefined-valued keys
// omitted. Two snapshots of the same document compare equal regardless of the
// order the SDK delivered their fields in. Pure; functions/test/stable-stringify.test.mjs.
export function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

function normalize(v) {
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') return normalize(v.toJSON());
  if (Array.isArray(v)) return v.map(x => (x === undefined ? null : normalize(x)));
  const out = {};
  for (const k of Object.keys(v).sort()) {
    if (v[k] !== undefined) out[k] = normalize(v[k]);
  }
  return out;
}
