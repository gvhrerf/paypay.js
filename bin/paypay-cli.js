#!/usr/bin/env node
'use strict';

/**
 * Minimal CLI for quick manual testing against the PayPay sandbox, reading
 * credentials from environment variables (see `.env.example`).
 *
 * Usage:
 *   paypay-cli qr:create <merchantPaymentId> <amount> [description]
 *   paypay-cli qr:status <merchantPaymentId>
 *   paypay-cli refund:create <merchantRefundId> <paymentId> <amount> [reason]
 *   paypay-cli methods:list
 */

const { PayPay } = require('../index');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function buildClient() {
  return new PayPay({
    apiKey: requireEnv('PAYPAY_API_KEY'),
    apiSecret: requireEnv('PAYPAY_API_SECRET'),
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    env: process.env.PAYPAY_ENV === 'PRODUCTION' ? 'PRODUCTION' : 'STAGING',
  });
}

async function main() {
  const [, , command, ...args] = process.argv;
  const paypay = buildClient();

  switch (command) {
    case 'qr:create': {
      const [merchantPaymentId, amount, description] = args;
      const result = await paypay.code.create({
        merchantPaymentId,
        amount: { amount: Number(amount), currency: 'JPY' },
        orderDescription: description || 'paypay.js CLI test',
        redirectUrl: 'https://example.com/thanks',
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'qr:status': {
      const [merchantPaymentId] = args;
      const result = await paypay.code.getPaymentDetails(merchantPaymentId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'refund:create': {
      const [merchantRefundId, paymentId, amount, reason] = args;
      const result = await paypay.refund.create({
        merchantRefundId,
        paymentId,
        amount: { amount: Number(amount), currency: 'JPY' },
        reason: reason || 'CLI refund',
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'methods:list': {
      const result = await paypay.paymentMethods.list();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default: {
      console.log(
        [
          'paypay-cli — quick manual testing against the PayPay sandbox',
          '',
          'Commands:',
          '  qr:create <merchantPaymentId> <amount> [description]',
          '  qr:status <merchantPaymentId>',
          '  refund:create <merchantRefundId> <paymentId> <amount> [reason]',
          '  methods:list',
        ].join('\n')
      );
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
