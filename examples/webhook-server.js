'use strict';

// Example: minimal HTTP server that verifies and handles PayPay webhook
// notifications using Node's built-in `http` module (no framework needed).
//
// Run with:
//   PAYPAY_API_SECRET=... node examples/webhook-server.js
// Then point your PayPay webhook URL at http://<host>:3000/webhooks/paypay

const http = require('node:http');
const { verifyWebhookSignature, parseWebhookEvent } = require('../index');

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = '/webhooks/paypay';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== WEBHOOK_PATH) {
    res.writeHead(404).end();
    return;
  }

  let rawBody = '';
  req.on('data', (chunk) => {
    rawBody += chunk;
  });

  req.on('end', () => {
    const valid = verifyWebhookSignature({
      apiSecret: process.env.PAYPAY_API_SECRET,
      method: 'POST',
      path: WEBHOOK_PATH,
      rawBody,
      authorizationHeader: req.headers['authorization'],
    });

    if (!valid) {
      console.warn('Rejected webhook: invalid signature');
      res.writeHead(401).end();
      return;
    }

    const { type, data } = parseWebhookEvent(rawBody);
    console.log('Received webhook:', type, data);

    // Always respond 200 quickly; do slow work asynchronously.
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK');
  });
});

server.listen(PORT, () => {
  console.log(`Listening for PayPay webhooks on http://localhost:${PORT}${WEBHOOK_PATH}`);
});
