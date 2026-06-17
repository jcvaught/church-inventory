// twilioInbound SMS webhook — HELP/INFO auto-reply, STOP/START opt-out sync,
// and signature gating. Signature verification is REAL: we sign each request
// with the twilio library's own getExpectedTwilioSignature using the same auth
// token + URL the handler validates against (mirrors the Stripe approach).
//
// Env is set at module load — BEFORE index.js is imported — so the handler's
// runtime reads of TWILIO_AUTH_TOKEN / TWILIO_INBOUND_URL see these values.
import Module from 'node:module';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_abc123';
process.env.TWILIO_INBOUND_URL = 'https://example.test/twilioInbound';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, db, mockRes } from './setup.mjs';

const require = Module.createRequire(import.meta.url);
const twilio = require('twilio');
const URL = process.env.TWILIO_INBOUND_URL;

function sign(params) {
  return twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, URL, params);
}
function signedReq(params, { badSig = false } = {}) {
  return {
    method: 'POST',
    headers: { 'x-twilio-signature': badSig ? 'deadbeef==' : sign(params), host: 'x.run.app' },
    body: params,
  };
}

let funcs;
before(async () => { funcs = await loadFunctions(); });

let n = 0;
const phone = () => `+1555${String(Date.now()).slice(-6)}${n++}`;

test('no TWILIO_AUTH_TOKEN configured → 503, empty TwiML', async () => {
  const saved = process.env.TWILIO_AUTH_TOKEN;
  // Sign while the token still exists; the handler 503s before validating, so
  // the signature is never checked — it just needs to be a well-formed request.
  const req = signedReq({ From: phone(), Body: 'HELP' });
  delete process.env.TWILIO_AUTH_TOKEN;
  try {
    const res = mockRes();
    await funcs.twilioInbound(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body, '<Response/>');
  } finally {
    process.env.TWILIO_AUTH_TOKEN = saved;
  }
});

test('invalid signature → 403 Forbidden', async () => {
  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: phone(), Body: 'HELP' }, { badSig: true }), res);
  assert.equal(res.statusCode, 403);
  assert.match(String(res.body), /Forbidden/);
});

test('HELP → 200 with the program help message', async () => {
  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: phone(), Body: 'HELP' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.contentType, 'text/xml');
  assert.match(res.body, /<Message>/);
  assert.match(res.body, /Reply STOP to opt out/);
});

test('INFO is treated as HELP → help message', async () => {
  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: phone(), Body: 'info' }), res);   // case-insensitive
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /ChurchOpsHub/);
});

test('STOP → opts out every account on the number + logs an smsOptOuts row', async () => {
  const from = phone();
  await db().doc('users/stop-a').set({ phone: from, smsRemindersEnabled: true, smsConsentAt: 'x', churchId: 'c1' });
  await db().doc('users/stop-b').set({ phone: from, smsRemindersEnabled: true, churchId: 'c2' });

  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: from, Body: 'STOP' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '<Response/>');

  assert.equal((await db().doc('users/stop-a').get()).data().smsRemindersEnabled, false);
  assert.equal((await db().doc('users/stop-b').get()).data().smsRemindersEnabled, false);
  const opt = await db().collection('smsOptOuts').where('phone', '==', from).get();
  assert.equal(opt.size, 1);
  assert.equal(opt.docs[0].data().action, 'opt_out');
});

test('START re-opts-in ONLY accounts with a prior consent record (recycled-number guard)', async () => {
  const from = phone();
  await db().doc('users/start-consented').set({ phone: from, smsRemindersEnabled: false, smsConsentAt: '2026-01-01', churchId: 'c1' });
  await db().doc('users/start-noconsent').set({ phone: from, smsRemindersEnabled: false, churchId: 'c2' });

  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: from, Body: 'START' }), res);
  assert.equal(res.statusCode, 200);

  assert.equal((await db().doc('users/start-consented').get()).data().smsRemindersEnabled, true);
  assert.equal((await db().doc('users/start-noconsent').get()).data().smsRemindersEnabled, false);  // never consented → not revived
  const opt = await db().collection('smsOptOuts').where('phone', '==', from).get();
  assert.equal(opt.docs[0].data().action, 'opt_in');
});

test('a non-keyword body → 200 empty TwiML, no opt-out row', async () => {
  const from = phone();
  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: from, Body: 'what are these texts' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '<Response/>');
  const opt = await db().collection('smsOptOuts').where('phone', '==', from).get();
  assert.equal(opt.empty, true);
});

test('empty From → 200 empty TwiML', async () => {
  const res = mockRes();
  await funcs.twilioInbound(signedReq({ From: '', Body: 'STOP' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '<Response/>');
});
