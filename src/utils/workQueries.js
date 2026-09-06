// The authorization-shaped task query arms, in ONE place (COH-007).
//
// The active board and the archive reader run the same four arms and differ only
// in the value of `archived`. Written twice they would drift — and a drifted arm
// does not fail loudly, it quietly returns a different set of tasks to a
// different surface, which is the failure mode COH-006 spent four gates closing.
// So both readers build their arms here.
//
// Deliberately pure: an arm is a description (`[field, op, value]` triples), not
// a Firestore `Query`. The caller translates. That keeps the property that
// matters — these are the arms, and nothing else is — assertable in a unit test
// with no emulator and no SDK.
//
// The maintenance listener is NOT here. It has no visibility model and, per plan
// A1, must never take the `archived` filter: maintenance documents do not carry
// the field, and an equality filter on a missing field matches nothing, so
// constraining it would empty the maintenance board for every church.

// `archived`: null leaves the discriminator off entirely (the active board's
//   shape at the additive gate — the filter arrives at the reader gate);
//   true/false adds the equality filter.
// `since`: an ISO lower bound on `completedAt`, ordered newest-first. Bounded
//   reads (DEC-2026-018) — 12 months for the archive view, 90 days for Insights.
// `max`: per-arm document cap.
export function taskQueryArms({ uid, archived = null, since = null, max = null } = {}) {
  const arm = (key, filters) => {
    const q = { key, filters: [...filters] };
    if (archived !== null) q.filters.push(['archived', '==', archived]);
    if (since) {
      q.filters.push(['completedAt', '>=', since]);
      q.order = ['completedAt', 'desc'];
    }
    if (max) q.limit = max;
    return q;
  };
  return [
    // Church-wide. Present with or without a signed-in uid, and the reason the
    // archive is browsable by anyone who could see the task before it aged out —
    // the archive is NOT scoped to tasks the viewer is personally attached to
    // (owner decision, 2026-09-05).
    arm('team', [['visibility', '==', 'team']]),
    ...(uid ? [
      arm('own', [['createdBy', '==', uid]]),
      arm('assigned', [['assigneeUids', 'array-contains', uid]]),
      // BOTH constraints. `sharedWithUids` alone also matches a private task
      // carrying a stale recipient, which the rules do not authorize — the
      // gate-1 review's H-1.
      arm('shared', [['visibility', '==', 'shared'], ['sharedWithUids', 'array-contains', uid]]),
    ] : []),
  ];
}

// Merge one-shot arm results into the archive answer.
//
// `results` is a Map of armKey -> Map(realDocId -> item). Keyed by the REAL
// document id, so a task delivered by three arms appears once.
//
// No second authorization filter runs here, and that is deliberate (A5, review
// H2): Firestore has already decided authorization against the canonical uid
// arrays, and re-deciding it on the client with a different predicate can only
// subtract tasks the rules lawfully returned. The one filter is the `type`
// invariant, which is a data-shape check rather than an access decision.
export function mergeArchiveArms(results) {
  const merged = new Map();
  for (const arm of results.values()) {
    for (const [id, item] of arm) if (item?.type === 'task') merged.set(id, item);
  }
  return [...merged.values()]
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
}

// The Insights join: live active data + a frozen one-shot archive read.
//
// Dedupe by document id closes the overlap; it does not close the state race
// (A20, re-review N4). A task reopened after the archive read settles appears in
// both, and if the stale archived copy won the collision its old `Complete` /
// `completedAt` would keep counting after the live task is back in Backlog. So
// LIVE ALWAYS WINS. The reverse race — a task archived after the read settles —
// cannot be fixed by precedence at all, which is why the caller presents this as
// an explicit as-of snapshot rather than a complete history.
export function mergeInsightTasks(activeTasks, archivedTasks) {
  const byId = new Map();
  for (const t of archivedTasks || []) if (t?._docId) byId.set(t._docId, t);
  for (const t of activeTasks || []) if (t?._docId) byId.set(t._docId, t);
  return [...byId.values()];
}
