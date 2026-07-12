'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PayPay } = require('../index');

test('PayPay facade wires up all resources', () => {
  const paypay = new PayPay({ apiKey: 'k', apiSecret: 's', env: 'STAGING' });

  for (const resource of [
    'code',
    'payment',
    'refund',
    'preauth',
    'paymentRequest',
    'userAuth',
    'subscription',
    'paymentMethods',
    'reconciliation',
  ]) {
    assert.ok(paypay[resource], `expected paypay.${resource} to be defined`);
  }
});

test('PayPay#use installs a plugin on the underlying client', () => {
  const paypay = new PayPay({ apiKey: 'k', apiSecret: 's' });
  let called = false;
  paypay.use((client) => {
    client.onBeforeRequest(() => {
      called = true;
    });
  });

  paypay.client.hooks.beforeRequest[0]();
  assert.equal(called, true);
});
