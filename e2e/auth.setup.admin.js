// @ts-check
import { test as setup, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@churchopshub.com';
const PASS  = process.env.E2E_ADMIN_PASSWORD || 'E2eTestPass123!';
const BASE_URL = process.env.E2E_BASE_URL || 'https://churchopshub.com';
const STATE_DIR = join(process.cwd(), 'e2e', '.auth');

setup('authenticate admin', async ({ page }) => {
  mkdirSync(STATE_DIR, { recursive: true });

  await page.goto(BASE_URL);

  // Wait for the sign-in form. The landing page has a "Sign In" button that
  // toggles the auth form OR the auth screen is shown directly. Best signal:
  // an email input field.
  await page.waitForLoadState('domcontentloaded');

  // Click sign-in if we're on the marketing landing page. The landing HTML is
  // pre-rendered, so the Sign In button exists before React hydrates and binds
  // its onClick handler; a click that fires before hydration is silently lost
  // (no exception, no navigation). Retry the click until the AuthScreen's email
  // input appears, which is the real signal that navigation actually happened.
  const signInBtn = page.getByRole('button', { name: /^sign in$/i }).first();
  for (let i = 0; i < 8; i++) {
    if (await page.locator('input[type="email"]').count() > 0) break;
    if (await signInBtn.count() > 0) await signInBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);

  // Submit. The button could say "Sign In" / "Log In".
  await Promise.any([
    page.getByRole('button', { name: /^(sign in|log in)$/i }).click(),
    page.locator('button[type="submit"]').click(),
  ]).catch(() => {});

  // Wait until we're past the auth screen — look for the dashboard / tab bar.
  await page.waitForFunction(() => {
    return !document.querySelector('input[type="password"]');
  }, { timeout: 30_000 });

  // Extract Firebase auth state from IndexedDB
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

  if (idbState.length === 0) {
    throw new Error('No Firebase auth state captured in IndexedDB after sign-in.');
  }

  writeFileSync(join(STATE_DIR, 'firebase-state-admin.json'), JSON.stringify(idbState, null, 2));
});
