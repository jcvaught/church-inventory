// Storage rules tests — item-photo uploads. The rules enforce tenant isolation
// (your users/{uid}.churchId must match the path), an active account, image-only
// content type, and a 5MB cap. Cross-service: storage.rules calls
// firestore.get(users/{uid}), so this boots BOTH emulators (see test:rules).
//
// Run against the emulators:  npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT = 'demo-shepherd-rules';
const CHURCH = 'church-A';
const OTHER = 'church-B';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(join(here, '../../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(join(here, '../../../storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await env.clearStorage(); });

async function seedUser(uid, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), `users/${uid}`), data); });
}
const png = (bytes = 100) => new Uint8Array(bytes); // body is irrelevant; metadata drives the rules
const meta = { contentType: 'image/png' };
const path = (church) => `churches/${church}/items/photo.png`;

test('an active member can upload a small image to their own church', async () => {
  await seedUser('memberA', { churchId: CHURCH, role: 'user', active: true });
  const storage = env.authenticatedContext('memberA').storage();
  await assertSucceeds(uploadBytes(ref(storage, path(CHURCH)), png(), meta));
});

test('a member cannot upload to another church (tenant isolation)', async () => {
  await seedUser('memberA', { churchId: CHURCH, role: 'user', active: true });
  const storage = env.authenticatedContext('memberA').storage();
  await assertFails(uploadBytes(ref(storage, path(OTHER)), png(), meta));
});

test('an inactive member cannot upload', async () => {
  await seedUser('memberA', { churchId: CHURCH, role: 'user', active: false });
  const storage = env.authenticatedContext('memberA').storage();
  await assertFails(uploadBytes(ref(storage, path(CHURCH)), png(), meta));
});

test('a non-image content type is rejected', async () => {
  await seedUser('memberA', { churchId: CHURCH, role: 'user', active: true });
  const storage = env.authenticatedContext('memberA').storage();
  await assertFails(uploadBytes(ref(storage, `churches/${CHURCH}/items/doc.pdf`), png(), { contentType: 'application/pdf' }));
});

test('an over-5MB upload is rejected', async () => {
  await seedUser('memberA', { churchId: CHURCH, role: 'user', active: true });
  const storage = env.authenticatedContext('memberA').storage();
  await assertFails(uploadBytes(ref(storage, path(CHURCH)), png(5 * 1024 * 1024 + 1), meta));
});

test('an unauthenticated user cannot read or upload', async () => {
  await seedUser('memberA', { churchId: CHURCH, role: 'user', active: true });
  const storage = env.unauthenticatedContext().storage();
  await assertFails(uploadBytes(ref(storage, path(CHURCH)), png(), meta));
});
