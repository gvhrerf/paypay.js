'use strict';

// Example: server-to-server native payment against an already-authorized user.
//
// Run with:
//   PAYPAY_API_KEY=... PAYPAY_API_SECRET=... USER_AUTH_ID=... node examples/native-payment.js

const { PayPay } = require('../index');

async function main() {
  const paypay = new PayPay({
    apiKey: process.env.PAYPAY_API_KEY,
    apiSecret: process.env.PAYPAY_API_SECRET,
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    env: 'STAGING',//user data
  });

  const result = await paypay.payment.create({
    merchantPaymentId: `order_${Date.now()}`,
    userAuthorizationId: process.env.USER_AUTH_ID,
    amount: { amount: 500, currency: 'JPY' },
    orderDescription: 'paypay.js native payment example',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
