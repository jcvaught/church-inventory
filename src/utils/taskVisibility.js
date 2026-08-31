// Task visibility predicate — the ONE place that decides whether a work item is
// visible to a given user. Extracted from WorkBoard's inline filter so the store
// and the board cannot drift (DEC-2026-010, Codex review finding M-3).
//
// ⚠️ This is NOT authorization. Until COH-006 deploys, `src/useFirestore.js`
// subscribes to the whole `workItems` collection and Firestore delivers other
// members' private tasks over that unconstrained listener (DEC-2026-009), so
// every member's browser still receives them. Filtering here keeps them out of
// the store — and therefore out of Global Search, Event Day, exports, and the
// attention panel — but the data is still on the client. The authorization
// boundary is COH-006's constrained queries plus the rules that back them.
//
// Maintenance items have no visibility model; callers filter tasks only.

// True when `uid` may see task `t`. Mirrors the visibility options the Tasks UI
// offers: team (or unset, i.e. legacy) is church-wide; private is the creator
// plus assignees; shared adds the people the creator selected.
export function canSeeTask(t, uid) {
  if (!t) return false;
  if (t.visibility === 'team' || !t.visibility) return true;
  if (t.createdBy === uid) return true;
  if (t.assignees?.some(a => a.uid === uid)) return true;
  if (t.visibility === 'shared' && t.sharedWith?.some(s => s.uid === uid)) return true;
  return false;
}

// Rules cannot search inside the `[{uid, name}]` object arrays the UI stores, so
// every task also carries plain uid arrays — `assigneeUids` and `sharedWithUids`
// — as a projection of `assignees` and `sharedWith`. COH-006 gate 1 writes them
// on every creation and update path; gate 3's constrained queries and gate 4's
// read rule are what finally make them load-bearing. Until then they are inert
// extra fields.
//
// Deduped and sorted so the value is stable for a given membership: two writes of
// the same people produce the same array, which keeps diffs and any future
// rules-side comparison meaningful.
export function uidsOf(people) {
  if (!Array.isArray(people)) return [];
  return [...new Set(people.map(p => p?.uid).filter(Boolean))].sort();
}
