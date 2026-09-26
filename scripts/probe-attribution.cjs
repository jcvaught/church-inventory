/**
 * Attribution production probe (backlog #7, 2026-09-26) — comments and
 * Shepherd care-thread entries are fixed to the person who wrote them.
 *
 *   node scripts/probe-attribution.cjs
 *
 * Mints throwaway verified users in e2e-test-church (member A, member B, an
 * admin, and an elder on a temporary config/shepherdAccess), plus a throwaway
 * team task, then drives Firestore over REST with each user's own ID token:
 *   comments — own name/uid allowed; someone else's name or uid denied; another
 *   member, and an admin, cannot edit A's comment; A cannot change the
 *   attribution but can change the text; nobody can rename a profile; the
 *   admin can delete.
 *   care thread — the elder posts with own name + server time; someone else's
 *   name denied; nobody can edit an entry, not even its author; a non-elder
 *   admin and a member cannot read it; the author deletes it.
 * Everything it creates is deleted in `finally`. Refuses to run if
 * e2e-test-church already has a shepherdAccess doc (never overwrite).
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

const val = (v) => v === null ? { nullValue: null }
  : typeof v === 'string' ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (() => { throw new Error(`unsupported value ${v}`); })();
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

// One write through :commit, as the user. `mode`: 'create' | 'update' | 'delete'.
async function write(token, path, mode, data = {}, { serverTime } = {}) {
  const name = `${DOCS}/${path}`;
  const w = mode === 'delete' ? { delete: name }
    : {
      update: { name, fields: fields(data) },
      currentDocument: { exists: mode === 'update' },
      ...(mode === 'update' ? { updateMask: { fieldPaths: Object.keys(data) } } : {}),
      ...(serverTime ? { updateTransforms: [{ fieldPath: serverTime, setToServerValue: 'REQUEST_TIME' }] } : {}),
    };
  const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ writes: [w] }),
  });
  return r.status;
}
async function read(token, path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}

(async () => {
  const accessRef = db.doc(`churches/${E2E}/config/shepherdAccess`);
  if ((await accessRef.get()).exists) throw new Error(`${E2E} already has config/shepherdAccess — refusing to overwrite.`);

  const ts = Date.now();
  const people = {
    a:     { name: 'Probe A',     role: 'user' },
    b:     { name: 'Probe B',     role: 'user' },
    admin: { name: 'Probe Admin', role: 'admin' },
    elder: { name: 'Probe Elder', role: 'user', elder: true },
  };
  const taskPath = `churches/${E2E}/workItems/task_probe-attr-${ts}`;
  const personPath = `churches/${E2E}/shepherdPeople/probe-attr-${ts}`;
  let accessCreated = false;
  const results = [];
  const expect = (label, got, want) => { results.push({ label, got, want, ok: got === want }); };
  const now = () => new Date().toISOString();

  try {
    for (const [k, p] of Object.entries(people)) {
      p.email = `attr-probe-${k}-${ts}@churchopshub.com`;
      ({ uid: p.uid } = await auth.createUser({ email: p.email, emailVerified: true }));
      if (p.elder) await auth.setCustomUserClaims(p.uid, { elder: true });
      await db.doc(`users/${p.uid}`).set({ churchId: E2E, role: p.role, active: true, email: p.email, name: p.name });
    }
    await accessRef.create({ emails: [people.elder.email], version: 1, updatedBy: 'probe-attribution' });
    accessCreated = true;
    await db.doc(taskPath).set({
      type: 'task', name: 'attribution probe', status: 'Backlog', taskNumber: 'TSK-PROBE', visibility: 'team',
      createdAt: now(), createdBy: people.a.uid, archived: false, archivedAt: null,
      assignees: [], sharedWith: [], assigneeUids: [], sharedWithUids: [],
    });
    for (const p of Object.values(people)) p.token = await idTokenFor(p.uid);
    const { a, b, admin: adm, elder } = people;
    const c1 = `${taskPath}/comments/c1`;

    // ── Comments ──
    expect('A posts with own uid + name → allowed',
      await write(a.token, c1, 'create', { text: 'hi', authorId: a.uid, authorName: a.name, createdAt: now() }), 200);
    expect('A posts under B\'s name → denied',
      await write(a.token, `${taskPath}/comments/c2`, 'create', { text: 'x', authorId: a.uid, authorName: b.name, createdAt: now() }), 403);
    expect('A posts with B\'s uid → denied',
      await write(a.token, `${taskPath}/comments/c3`, 'create', { text: 'x', authorId: b.uid, authorName: a.name, createdAt: now() }), 403);
    expect('B edits A\'s comment → denied', await write(b.token, c1, 'update', { text: 'edited by B' }), 403);
    expect('admin edits A\'s comment → denied', await write(adm.token, c1, 'update', { text: 'edited by admin' }), 403);
    expect('A re-attributes own comment → denied', await write(a.token, c1, 'update', { authorName: b.name }), 403);
    expect('A edits own text → allowed', await write(a.token, c1, 'update', { text: 'edited', updatedAt: now() }), 200);
    expect('A renames own profile → denied', await write(a.token, `users/${a.uid}`, 'update', { name: b.name }), 403);
    expect('admin renames A → denied', await write(adm.token, `users/${a.uid}`, 'update', { name: b.name }), 403);
    expect('admin deletes A\'s comment → allowed', await write(adm.token, c1, 'delete'), 200);

    // ── Shepherd care thread ──
    const e1 = `${personPath}/careThread/e1`;
    expect('elder posts with own name + server time → allowed',
      await write(elder.token, e1, 'create', { text: 'visited', authorUid: elder.uid, authorName: elder.name }, { serverTime: 'createdAt' }), 200);
    expect('elder posts under another name → denied',
      await write(elder.token, `${personPath}/careThread/e2`, 'create', { text: 'x', authorUid: elder.uid, authorName: a.name }, { serverTime: 'createdAt' }), 403);
    expect('elder edits own entry → denied', await write(elder.token, e1, 'update', { text: 'edited' }), 403);
    expect('non-elder admin reads the entry → denied', await read(adm.token, e1), 403);
    expect('member reads the entry → denied', await read(a.token, e1), 403);
    expect('elder deletes own entry → allowed', await write(elder.token, e1, 'delete'), 200);
  } finally {
    await db.recursiveDelete(db.doc(taskPath));
    await db.recursiveDelete(db.doc(personPath));
    if (accessCreated) await accessRef.delete();
    for (const p of Object.values(people)) {
      if (!p.uid) continue;
      await db.doc(`users/${p.uid}`).delete();
      await auth.deleteUser(p.uid);
    }
    console.log('cleanup: probe task, care entries, access doc and probe users deleted');
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (HTTP ${r.got}, want ${r.want})`);
  const ok = results.length === 16 && results.every(r => r.ok);
  console.log(ok ? 'ALL PASS' : 'FAILURES ABOVE');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
