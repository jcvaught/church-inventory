// @ts-check
import { test as setup } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const EMAIL = process.env.E2E_MEMBER_A_EMAIL || 'jcvaught@gmail.com';
const PASS  = process.env.E2E_MEMBER_A_PASSWORD || 'testpass123';
const BASE_URL = process.env.E2E_BASE_URL || 'https://churchopshub.com';
const STATE_DIR = join(process.cwd(), 'e2e', '.auth');

setup('authenticate member A', async ({ page }) => {
  mkdirSync(STATE_DIR, { recursive: true });
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  const signInBtn = page.getByRole('button', { name: /^sign in$/i }).first();
  if (await signInBtn.count() > 0) await signInBtn.click().catch(() => {});

  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await Promise.any([
    page.getByRole('button', { name: /^(sign in|log in)$/i }).click(),
    page.locator('button[type="submit"]').click(),
  ]).catch(() => {});

  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 30_000 });

  const idbState = await page.evaluate(async () => {
    const out = [];
    await new Promise((resolve) => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['firebaseLocalStorage'], 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        const getAll = store.getAll();
        getAll.onsuccess = () => { out.push(...getAll.result); resolve(); };
        getAll.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
    return out;
  });
  if (idbState.length === 0) throw new Error('No Firebase auth state captured after sign-in.');
  writeFileSync(join(STATE_DIR, 'firebase-state-member-a.json'), JSON.stringify(idbState, null, 2));
});
