'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { buildAuthorizationHeader, PayPayClient, BASE_URLS } = require('../src/client');

test('buildAuthorizationHeader: bodiless (GET) request uses "empty" hash/content-type', () => {
  const header = buildAuthorizationHeader({
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    method: 'GET',
    path: '/v2/codes/payments/order_1',
  });

  const parts = header.replace('hmac OPA-Auth:', '').split(':');
  assert.equal(parts.length, 5);
  assert.equal(parts[0], 'test-key');
  assert.equal(parts[4], 'empty');
});

test('buildAuthorizationHeader: signature is reproducible/verifiable against manual HMAC', () => {
  const apiKey = 'test-key';
  const apiSecret = 'test-secret';
  const method = 'POST';
  const path = '/v2/codes';
  const body = JSON.stringify({ merchantPaymentId: 'order_1' });
  const contentType = 'application/json;charset=UTF-8';

  const header = buildAuthorizationHeader({ apiKey, apiSecret, method, path, body, contentType });
  const [, payload] = header.split('hmac OPA-Auth:');
  const [key, macData, nonce, epoch, hash] = payload.split(':');

  assert.equal(key, apiKey);

  // Recompute hash and macData independently to verify correctness.
  const expectedHash = crypto.createHash('sha256').update(contentType + body, 'utf8').digest('base64');
  assert.equal(hash, expectedHash);

  const hmacInput = [path, method, nonce, epoch, contentType, hash].join('\n');
  const expectedMacData = crypto.createHmac('sha256', apiSecret).update(hmacInput, 'utf8').digest('base64');
  assert.equal(macData, expectedMacData);
});

test('PayPayClient: throws when constructed without credentials', () => {
  assert.throws(() => new PayPayClient({}), /requires both/);
});

test('PayPayClient: selects the correct base URL per environment', () => {
  const staging = new PayPayClient({ apiKey: 'a', apiSecret: 'b', env: 'STAGING' });
  assert.equal(staging.baseUrl, BASE_URLS.STAGING);

  const prod = new PayPayClient({ apiKey: 'a', apiSecret: 'b', env: 'PRODUCTION' });
  assert.equal(prod.baseUrl, BASE_URLS.PRODUCTION);
});

test('PayPayClient: rejects unknown environments', () => {
  assert.throws(() => new PayPayClient({ apiKey: 'a', apiSecret: 'b', env: 'NOPE' }), /Invalid env/);
});
