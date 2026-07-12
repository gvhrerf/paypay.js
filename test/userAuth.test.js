'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { signPayPayJwt, verifyPayPayJwt } = require('../src/resources/userAuth');

test('signPayPayJwt / verifyPayPayJwt: round-trips a payload', () => {
  const apiSecret = crypto.randomBytes(32).toString('base64');
  const header = { typ: 'JWT', alg: 'HS256' };
  const payload = { aud: 'paypay.ne.jp', iss: 'merchant-org', nonce: 'abc123', scope: 'direct_debit' };

  const token = signPayPayJwt(header, payload, apiSecret);
  const decoded = verifyPayPayJwt(token, apiSecret);

  assert.deepEqual(decoded, payload);
});

test('verifyPayPayJwt: rejects a token signed with a different secret', () => {
  const token = signPayPayJwt({ typ: 'JWT', alg: 'HS256' }, { nonce: 'x' }, Buffer.from('secret-a').toString('base64'));
  assert.throws(() => verifyPayPayJwt(token, Buffer.from('secret-b').toString('base64')), /Invalid PayPay JWT signature/);
});

test('verifyPayPayJwt: rejects a malformed token', () => {
  assert.throws(() => verifyPayPayJwt('not-a-jwt', 'c2VjcmV0'), /Malformed PayPay JWT/);
});
