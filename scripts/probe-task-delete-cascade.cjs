/**
 * Task-delete cascade production probe (2026-10-01) — a task's creator can
 * delete it once other members have commented, because a comment may be
 * deleted in the same request that deletes its parent task.
 *
 *   node scripts/probe-task-delete-cascade.cjs
 *
 * Mints throwaway verified users in e2e-test-church (creator C, member B) and
 * throwaway team tasks, then drives Firestore over REST with each user's own ID
 * token, one atomic :commit per case — the shape `deleteTask` sends:
 *   C deletes B's comment alone → denied (the task survives)
 *   B deletes C's task with its comments → denied (not the creator)
 *   C deletes B's comment while UPDATING the task → denied
 *   C deletes the task + B's comments → allowed
 *   C deletes a task + 30 comments in one batch → allowed (production
 *     access-call limits, which the emulator does not prove)
 * Everything it creates is deleted in `finally`.
 */
const admin = require('firebase-admin');
const key = require('./serviceAccountKey.json');

const PROJECT = key.project_id;
const API_KEY = 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y'; // public web key, src/firebase.js
const E2E = 'e2e-test-church';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const auth = admin.auth();

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`sign-in failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

// One atomic :commit of several writes, as the user.
async function commit(token, writes) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ writes }),
  });
  return r.status;
}
const del = (path) => ({ delete: `${DOCS}/${path}` });
const rename = (path) => ({
  update: { name: `${DOCS}/${path}`, fields: { name: { stringValue: 'renamed' } } },
  updateMask: { fieldPaths: ['name'] }, currentDocument: { exists: true },
});

(async () => {
  const ts = Date.now();
  const people = { c: { name: 'Probe Creator' }, b: { name: 'Probe Member' } };
  const taskA = `churches/${E2E}/workItems/task_probe-cascade-a-${ts}`;
  const taskBig = `churches/${E2E}/workItems/task_probe-cascade-big-${ts}`;
  const results = [];
  const expect = (label, got, want) => { results.push({ label, got, want, ok: got === want }); };
  const now = () => new Date().toISOString();
  const seedTask = (path) => db.doc(path).set({
    type: 'task', name: 'cascade probe', status: 'Backlog', taskNumber: 'TSK-PROBE', visibility: 'team',
    createdAt: now(), createdBy: people.c.uid, archived: false, archivedAt: null,
    assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
  });
  const seedComment = (path, p) => db.doc(path).set({ text: 'probe', authorId: p.uid, authorName: p.name, createdAt: now() });

  try {
    for (const [k, p] of Object.entries(people)) {
      // The e2e prefix matters: creating these users fires notifyAdminsOfNewMember,
      // and sendEmailSafe skips only /^e2e…@churchopshub.com/.
      p.email = `e2e-cascade-probe-${k}-${ts}@churchopshub.com`;
      ({ uid: p.uid } = await auth.createUser({ email: p.email, emailVerified: true }));
      await db.doc(`users/${p.uid}`).set({ churchId: E2E, role: 'user', active: true, email: p.email, name: p.name });
    }
    await seedTask(taskA);
    await seedComment(`${taskA}/comments/b1`, people.b);
    await seedComment(`${taskA}/comments/b2`, people.b);
    await seedComment(`${taskA}/comments/c1`, people.c);
    await seedTask(taskBig);
    const bigIds = Array.from({ length: 30 }, (_, i) => `x${i}`);
    for (const id of bigIds) await seedComment(`${taskBig}/comments/${id}`, people.b);
    for (const p of Object.values(people)) p.token = await idTokenFor(p.uid);
    const { c, b } = people;
    const allA = ['b1', 'b2', 'c1'].map(id => del(`${taskA}/comments/${id}`));

    expect('C deletes B\'s comment, task stays → denied', await commit(c.token, [del(`${taskA}/comments/b1`)]), 403);
    expect('B deletes C\'s task with its comments → denied', await commit(b.token, [...allA, del(taskA)]), 403);
    expect('C deletes B\'s comment while updating the task → denied', await commit(c.token, [del(`${taskA}/comments/b1`), rename(taskA)]), 403);
    expect('C deletes the task with B\'s comments → allowed', await commit(c.token, [...allA, del(taskA)]), 200);
    expect('…and the task is gone', (await db.doc(taskA).get()).exists, false);
    expect('C deletes a task with 30 comments in one batch → allowed',
      await commit(c.token, [...bigIds.map(id => del(`${taskBig}/comments/${id}`)), del(taskBig)]), 200);
  } finally {
    const steps = [
      ['task A', () => db.recursiveDelete(db.doc(taskA))],
      ['task big', () => db.recursiveDelete(db.doc(taskBig))],
      ...Object.entries(people).filter(([, p]) => p.uid).flatMap(([k, p]) => [
        [`users/${k}`, () => db.doc(`users/${p.uid}`).delete()],
        [`auth/${k}`, () => auth.deleteUser(p.uid)],
      ]),
    ];
    const failed = [];
    for (const [label, fn] of steps) {
      try { await fn(); } catch (e) { failed.push(`${label}: ${e.message}`); }
    }
    console.log(failed.length ? `CLEANUP INCOMPLETE — remove by hand:\n  ${failed.join('\n  ')}` : 'cleanup: complete');
    if (failed.length) process.exitCode = 1;
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (got ${r.got}, want ${r.want})`);
  const ok = results.length === 6 && results.every(r => r.ok);
  console.log(ok ? 'ALL PASS' : 'FAILURES ABOVE');
  process.exit(ok && process.exitCode !== 1 ? 0 : 1);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
