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
