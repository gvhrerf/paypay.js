'use strict';

// Example: enroll a user for continuous payments, then charge one billing
// cycle. In a real app, `chargeCycle` would be invoked by your own
// scheduler (cron, queue, etc.) once per billing period.
//
// Run with:
//   PAYPAY_API_KEY=... PAYPAY_API_SECRET=... node examples/subscription.js

const { PayPay } = require('../index');

async function main() {
  const paypay = new PayPay({
    apiKey: process.env.PAYPAY_API_KEY,
    apiSecret: process.env.PAYPAY_API_SECRET,
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    env: 'STAGING',
  });

  // Step 1: enroll — show this QR to the user once to obtain a
  // `userAuthorizationId` (delivered via webhook or the redirect callback).
  const enrollment = await paypay.subscription.startEnrollment({
    nonce: `nonce_${Date.now()}`,
    redirectUrl: 'https://example.com/subscribe/callback',
    referenceId: `user_${Date.now()}`,
  });
  console.log('Show this QR to the user to enroll:', enrollment.data.linkQRCodeURL);

  // Step 2 (later, once you have userAuthorizationId, e.g. from your
  // scheduler): charge one billing cycle.
  const userAuthorizationId = process.env.USER_AUTH_ID;
  if (userAuthorizationId) {
    const charge = await paypay.subscription.chargeCycle({
      merchantPaymentId: `sub_${userAuthorizationId}_${new Date().toISOString().slice(0, 7)}`,
      userAuthorizationId,
      amount: { amount: 980, currency: 'JPY' },
      orderDescription: 'Monthly subscription',
    });
    console.log(JSON.stringify(charge, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
