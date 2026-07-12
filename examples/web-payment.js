'use strict';

// Example: create a QR code / Web Payment link, then poll for completion.
//
// Run with:
//   PAYPAY_API_KEY=... PAYPAY_API_SECRET=... node examples/web-payment.js

const { PayPay } = require('../index');

async function main() {
  const paypay = new PayPay({
    apiKey: process.env.PAYPAY_API_KEY,
    apiSecret: process.env.PAYPAY_API_SECRET,
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    env: 'STAGING',
  });

  const merchantPaymentId = `order_${Date.now()}`;

  const qr = await paypay.code.create({
    merchantPaymentId,
    amount: { amount: 100, currency: 'JPY' },
    orderDescription: 'paypay.js example purchase',
    redirectUrl: 'https://example.com/thanks',
  });

  console.log('Scan/open this URL in the PayPay sandbox app:');
  console.log(qr.data.url);

  console.log('\nPolling for payment completion (Ctrl+C to stop)...');
  // In a real app you'd rely on the webhook rather than polling.
  const interval = setInterval(async () => {
    const status = await paypay.code.getPaymentDetails(merchantPaymentId);
    console.log('status:', status.data.status);
    if (status.data.status === 'COMPLETED') {
      clearInterval(interval);
      console.log('Payment complete! paymentId:', status.data.paymentId);
    }
  }, 3000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
