// @ts-check
import { test as base, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Firebase v12 stores auth state in IndexedDB, not localStorage. Playwright's
// `storageState` only captures localStorage/cookies, so we inject IndexedDB
// per-context via this fixture. Pattern mirrors Court Climber's e2e setup.

const STATE_DIR = join(process.cwd(), 'e2e', '.auth');

function loadIDBState(role) {
  const path = join(STATE_DIR, `firebase-state-${role}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function injectAuthIntoPage(page, role) {
  const idbState = loadIDBState(role);
  if (!idbState) throw new Error(`No auth state for ${role}; run the setup project first.`);

  // Inject IndexedDB BEFORE any Firebase code runs. We use addInitScript so
  // the state is restored on every navigation in this context.
  await page.addInitScript((state) => {
    // Restore the firebaseLocalStorageDb IndexedDB store on first page load.
    const installAuthState = () => new Promise((resolve, reject) => {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['firebaseLocalStorage'], 'readwrite');
        const store = tx.objectStore('firebaseLocalStorage');
        for (const entry of state) store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    // Block page boot until auth is in place.
    window.__authSetupPromise = installAuthState();
    const origDOMContentLoaded = document.addEventListener;
    // No-op; just rely on the fact that Firebase reads IndexedDB on init.
  }, idbState);
}

export const test = base.extend({
  // Default `page` fixture signs in the admin account.
  page: async ({ page }, use) => {
    await injectAuthIntoPage(page, 'admin');
    await use(page);
  },
  // Member A page (regular user signed up to jobs hub).
  memberAPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await injectAuthIntoPage(page, 'member-a');
    await use(page);
    await context.close();
  },
  // Member B page (second member, only created when E2E_MEMBER_B_EMAIL set).
  memberBPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await injectAuthIntoPage(page, 'member-b');
    await use(page);
    await context.close();
  },
});

export { expect };
