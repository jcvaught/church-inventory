// Postbuild guard — fails the build if dist/assets contains the React dev
// JSX transform (`jsxDEV`). Mirrors the MH S124 fix; see the matching
// pattern in MH's docs/build-sessions.md S124 walkthrough findings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_ASSETS = path.join(ROOT, 'dist', 'assets');

if (!fs.existsSync(DIST_ASSETS)) {
  console.error(`verify-prod-bundle: dist/assets not found at ${DIST_ASSETS}`);
  process.exit(1);
}

const files = fs.readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js'));
const offenders = [];

// Detect ONLY React's dev JSX runtime usage, not false positives like
// react-markdown's `options.jsxDEV` property name. React dev calls always
// look like `X.jsxDEV(` or `(0,X.jsxDEV)(` — a property access followed by
// an open paren. Property assignments (`options.jsxDEV = ...`) and string
// constants (`"jsxDEV"`) are NOT React's call site.
const REACT_DEV_CALL = /[a-zA-Z_$][a-zA-Z0-9_$]*\.jsxDEV\(/;

for (const file of files) {
  const content = fs.readFileSync(path.join(DIST_ASSETS, file), 'utf-8');
  if (REACT_DEV_CALL.test(content)) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error('');
  console.error('✗ verify-prod-bundle: DEV-MODE BUNDLE DETECTED');
  console.error('');
  console.error(`  Found React's dev JSX runtime (jsxDEV) in ${offenders.length} chunk(s):`);
  for (const f of offenders.slice(0, 5)) {
    console.error(`    - ${f}`);
  }
  if (offenders.length > 5) {
    console.error(`    ... and ${offenders.length - 5} more`);
  }
  console.error('');
  console.error('  Production builds must use the `jsx` transform, not `jsxDEV`.');
  console.error('  This usually means NODE_ENV was not "production" at build time,');
  console.error('  or Vite\'s pre-bundle cache (node_modules/.vite/) has stale deps.');
  console.error('  See MH docs/build-sessions.md S124 for the original investigation.');
  console.error('');
  process.exit(1);
}

console.log(`verify-prod-bundle: ✓ checked ${files.length} JS chunks, 0 jsxDEV — production build clean`);
