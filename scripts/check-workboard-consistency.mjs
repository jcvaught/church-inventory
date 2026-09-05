// Guards the one contradiction that actually happened: the COH-006 entry saying
// COMPLETE/deployed while a stale sentence in its history still said NOT
// deployed, in present tense, in the coordination source both agents must trust.
// Codex post-deploy review M-2 (2026-09-05).
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../docs/AI-WORKBOARD.md', import.meta.url), 'utf8');
let failures = 0;

for (const task of text.split(/^### /m).slice(1)) {
  const name = task.split('\n')[0].trim();
  const normalized = task.replace(/\s+/g, ' ');
  if (/Status: \*\*COMPLETE/.test(task) && /Gate \d+ [^.]*NOT deployed/.test(normalized)) {
    console.error(`✗ ${name}: simultaneously COMPLETE/deployed and "NOT deployed"`);
    failures++;
  }
}

if (failures) {
  console.error(`\n❌ workboard is self-contradictory — ${failures} task(s)\n`);
  process.exit(1);
}
console.log('✓ workboard: no task is both complete and not deployed');
