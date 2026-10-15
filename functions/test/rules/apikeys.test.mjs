// COH-016 — ChatGPT MCP API keys are Admin-SDK only. No client — member,
// manager, admin, the key's own owner, or anonymous — can touch apiKeys or
// apiKeyUsage. Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8');
const CHURCH = 'church-A';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shepherd-rules',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (e) => { await setDoc(doc(e.firestore(), path), data); });
}

test('apiKeys / apiKeyUsage: no client can read or write them', async () => {
  await seed('users/adminA', { churchId: CHURCH, role: 'admin', name: 'Admin A', active: true });
  await seed('users/memberA', { churchId: CHURCH, role: 'user', name: 'Member A', active: true });
  await seed('apiKeys/abc123hash', { uid: 'adminA', churchId: CHURCH, label: 'ChatGPT', revokedAt: null });
  await seed('apiKeyUsage/abc123hash', { windowStart: 1, count: 1 });
  for (const who of ['adminA', 'memberA', 'someone-else']) {
    for (const path of ['apiKeys/abc123hash', 'apiKeyUsage/abc123hash']) {
      await assertFails(getDoc(doc(ctx(who), path)));
      await assertFails(setDoc(doc(ctx(who), path), { uid: who }));
      await assertFails(updateDoc(doc(ctx(who), path), { revokedAt: null }));
      await assertFails(deleteDoc(doc(ctx(who), path)));
    }
    await assertFails(getDocs(collection(ctx(who), 'apiKeys')));
    await assertFails(getDocs(collection(ctx(who), 'apiKeyUsage')));
  }
  await assertFails(getDoc(doc(anon(), 'apiKeys/abc123hash')));
  await assertFails(setDoc(doc(anon(), 'apiKeys/new'), { uid: 'x' }));
});
