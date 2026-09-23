// Where churchName comes from.
//
// churchName and churchCode live on BOTH the parent churches/{id} and on
// config/main, and nothing keeps them in step. The parent is authoritative --
// it is what lookupChurchByCode resolves joins against, and the only one of the
// two that cannot be removed. Four server paths used to read config/main
// instead, so an admin who changed the name would see it everywhere except
// those four emails.
//
// Each test below seeds the name ONLY on the parent and leaves a DIFFERENT
// value on config/main, so a handler still reading config/main renders the
// wrong church rather than merely failing to find one. Confirmed to fail
// against the pre-fix code.
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFunctions, db, purgeChurch, installFetchStub, mockCallable } from './setup.mjs';

let funcs;
before(async () => { funcs = await loadFunctions(); });

let fetchStub;
beforeEach(() => { fetchStub = installFetchStub(); });
afterEach(() => { fetchStub.restore(); });

const TRUE_NAME = 'Hopeful Trails';
const STALE_NAME = 'Stale Copy Church';

let n = 0;
const fresh = () => `cns-${Date.now()}-${n++}`;
const created = [];
test.after(async () => { for (const id of created) await purgeChurch(id); });

async function seedChurch() {
  const churchId = `${fresh()}-church`;
  created.push(churchId);
  await db().doc(`churches/${churchId}`).set({ churchName: TRUE_NAME, churchCode: 'HOPEFUL' });
  // Deliberately divergent: a handler reading here renders the wrong church.
  await db().doc(`churches/${churchId}/config/main`).set({ churchName: STALE_NAME });
  await db().doc(`churches/${churchId}/config/subscription`).set({
    plan: 'free', status: 'trialing', trialEndsAt: '2027-01-01T00:00:00Z', grandfathered: false,
  });
  return churchId;
}
async function seedUser(churchId, extra = {}) {
  const uid = fresh();
  await db().doc(`users/${uid}`).set({
    name: 'Javid Workman', email: `${uid}@test.com`, role: 'admin',
    churchId, active: true, ...extra,
  });
  return uid;
}
const emails = () => fetchStub.calls.filter((c) => /brevo|smtp\/email/.test(c.url)).map((c) => JSON.parse(c.options.body));

test('sendTaskMentionEmail names the church from the PARENT, not config/main', async () => {
  const churchId = await seedChurch();
  const author = await seedUser(churchId);
  const mentioned = await seedUser(churchId);

  const out = await funcs.sendTaskMentionEmail.run(mockCallable(author, {
    churchId, mentionedUids: [mentioned], taskNumber: 'T-1', taskName: 'Fix the sound board',
    commentText: 'can you look at this?', commentAuthorName: 'Javid',
  }));

  assert.equal(out.sent, 1);
  const [body] = emails();
  assert.match(body.htmlContent, new RegExp(TRUE_NAME));
  assert.doesNotMatch(body.htmlContent, new RegExp(STALE_NAME));
  assert.match(body.textContent, new RegExp(TRUE_NAME));
  assert.doesNotMatch(body.textContent, new RegExp(STALE_NAME));
});

// The other three repointed reads (sendJobCancelledEmails,
// sendJobPosterNotification, sendWaitlistPromotionNotifications) need a job,
// a roster, consent state and hub entitlement to reach their send, which is a
// lot of scaffolding for what is the same one-line path swap. They are covered
// structurally instead: no handler may take these two fields from config/main.
// This is a weaker guarantee than the behavioural test above -- it proves the
// read site, not the rendered email -- but it covers all four permanently and
// fails the moment someone reintroduces the split.
test('no handler reads churchName/churchCode from config/main', () => {
  const src = readFileSync(new URL('../../index.js', import.meta.url), 'utf8').split('\n');
  const offenders = [];
  src.forEach((line, i) => {
    if (!/config\/main/.test(line)) return;
    // The read's field access may be a few lines below the .get().
    const window = src.slice(i, i + 6).join('\n');
    if (/churchName|churchCode/.test(window)) offenders.push(`${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(offenders, [], 'config/main is not authoritative for these fields:\n' + offenders.join('\n'));
});
