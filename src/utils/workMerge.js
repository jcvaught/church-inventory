// Merging the five constrained workItems listeners into the two arrays the app
// consumes (COH-006 gate 3). Extracted as a pure function because the property
// that matters is easy to get wrong and impossible to see in a rendered board:
//
//   a document must leave the store when it drops out of its LAST qualifying
//   listener.
//
// The tempting implementation — one accumulating map that each snapshot writes
// into — silently keeps a task forever once any listener has seen it. Unshare a
// task, unassign it, or switch it to private, and it would stay visible to
// someone who can no longer read it: the same class of leak COH-006 exists to
// close, reintroduced on the client. Holding each source's results separately
// and rebuilding the union on every snapshot makes removal fall out for free.
//
// Overlap is expected and harmless: a task you created AND are assigned to
// arrives from two listeners. Keyed by document id, so it appears once.

// `sources` is a Map of sourceKey → Map(docId → workItem).
export function mergeWorkSources(sources) {
  const merged = new Map();
  for (const source of sources.values()) {
    for (const [id, data] of source) merged.set(id, data);
  }
  const all = [...merged.values()];
  const byCreatedDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
  return {
    tasks: all.filter(w => w.type === 'task').sort(byCreatedDesc),
    maintenance: all.filter(w => w.type === 'maintenance').sort(byCreatedDesc),
  };
}

// The listener coordinator, extracted so the states that matter can be tested
// without a Firestore connection (gate-3 review H-1).
//
// The distinction it exists to enforce: a source that FAILED is not a source that
// returned nothing. A Firestore listener error callback is terminal — a missing
// index (`failed-precondition`) or a denied query (`permission-denied`) never
// recovers on its own — so counting it as an initial snapshot would let the app
// finish loading and present a task list that is quietly missing everything that
// source alone delivers. On a task whose whole point is who can see what, that is
// the worst possible failure mode: it looks exactly like "you have no shared
// tasks".
//
//   settled  — every source has either delivered or failed. Ends the spinner.
//   complete — every source delivered and none failed. Only then is the store
//              authoritative, and only then may the UI present it as the answer.
//
// A source that fails also has its documents dropped, so a listener that dies
// after delivering cannot leave stale documents on screen indefinitely.
export function createWorkStore(sourceKeys) {
  const data = new Map(sourceKeys.map(k => [k, new Map()]));
  const delivered = new Set();
  const failed = new Map();

  return {
    snapshot(key, docs) {
      data.set(key, docs);
      delivered.add(key);
      failed.delete(key);
    },
    fail(key, code) {
      data.set(key, new Map());
      failed.set(key, code || 'unknown');
      delivered.delete(key);
    },
    read() {
      const merged = mergeWorkSources(data);
      const complete = sourceKeys.every(k => delivered.has(k)) && failed.size === 0;
      return {
        // The authoritative arrays. EMPTY when the store is incomplete, on
        // purpose (gate-3 verification review H-2): partial data must not travel
        // the same contract that Global Search, Event Day, CSV/ICS export and the
        // attention panel treat as "all the tasks". A warning on one board is not
        // enough — those surfaces would report a normal result computed from a
        // silently short list. Better to show nothing and say why than to answer
        // a question about visibility with an answer that is quietly incomplete.
        tasks: complete ? merged.tasks : [],
        maintenance: complete ? merged.maintenance : [],
        // What did arrive, for diagnostics and for a UI that wants to say how
        // much is missing. Deliberately NOT the same field names.
        partial: merged,
        complete,
        settled: sourceKeys.every(k => delivered.has(k) || failed.has(k)),
        error: failed.size
          ? { sources: [...failed.keys()], code: [...failed.values()][0] }
          : null,
      };
    },
  };
}
