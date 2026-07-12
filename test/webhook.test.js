'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAuthorizationHeader } = require('../src/client');
const { verifyWebhookSignature, parseWebhookEvent } = require('../src/webhook');

test('verifyWebhookSignature: accepts a signature built with the same HMAC scheme', () => {
  const apiSecret = 'test-secret';
  const method = 'POST';
  const path = '/webhooks/paypay';
  const rawBody = JSON.stringify({ notification_type: 'PAYMENT_COMPLETED', merchantPaymentId: 'order_1' });

  const authorizationHeader = buildAuthorizationHeader({
    apiKey: 'test-key',
    apiSecret,
    method,
    path,
    body: rawBody,
  });

  const valid = verifyWebhookSignature({ apiSecret, method, path, rawBody, authorizationHeader });
  assert.equal(valid, true);
});

test('verifyWebhookSignature: rejects a tampered body', () => {
  const apiSecret = 'test-secret';
  const method = 'POST';
  const path = '/webhooks/paypay';
  const rawBody = JSON.stringify({ notification_type: 'PAYMENT_COMPLETED', merchantPaymentId: 'order_1' });

  const authorizationHeader = buildAuthorizationHeader({
    apiKey: 'test-key',
    apiSecret,
    method,
    path,
    body: rawBody,
  });

  const tamperedBody = JSON.stringify({ notification_type: 'PAYMENT_COMPLETED', merchantPaymentId: 'order_2' });
  const valid = verifyWebhookSignature({ apiSecret, method, path, rawBody: tamperedBody, authorizationHeader });
  assert.equal(valid, false);
});

test('verifyWebhookSignature: rejects a missing/malformed Authorization header', () => {
  const valid = verifyWebhookSignature({
    apiSecret: 'test-secret',
    method: 'POST',
    path: '/webhooks/paypay',
    rawBody: '{}',
    authorizationHeader: 'Bearer not-hmac',
  });
  assert.equal(valid, false);
});

test('parseWebhookEvent: extracts notification_type and tolerates malformed JSON', () => {
  const ok = parseWebhookEvent(JSON.stringify({ notification_type: 'PAYMENT_COMPLETED' }));
  assert.equal(ok.type, 'PAYMENT_COMPLETED');

  const bad = parseWebhookEvent('{not json');
  assert.equal(bad.type, null);
  assert.equal(bad.data, null);
});
