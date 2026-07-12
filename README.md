# paypay.js

Unofficial, modern Node.js SDK for the [PayPay Open Payment API (OPA)](https://developer.paypay.ne.jp/).

- Pure `async`/`await` — no callbacks.
- **Zero runtime dependencies** — uses Node's built-in `crypto` and `fetch`.
- HMAC request signing implemented per PayPay's official spec, unit tested against a manual re-implementation.
- Built-in retries (exponential backoff on 429/5xx/network errors), pluggable logging, and a plugin hook system.
- Ships with a CLI (`paypay-cli`) for quick sandbox testing, and a bundled `.d.ts` for editor autocomplete — while staying plain JavaScript.
- Node.js >= 18.

> **Note:** PayPay publishes an official SDK (`@paypayopa/paypayopa-sdk-node`). `paypay.js` is an independent,
> unofficial project focused on a smaller, Promise-first API surface, zero runtime dependencies, and a few
> endpoints (webhook signature verification, subscription helper) the official SDK doesn't provide directly.
> It is not affiliated with or endorsed by PayPay.

## Install

```bash
npm install paypay.js
```

## Quick start

```js
const { PayPay } = require('paypay.js');

const paypay = new PayPay({
  apiKey: process.env.PAYPAY_API_KEY,
  apiSecret: process.env.PAYPAY_API_SECRET,
  merchantId: process.env.PAYPAY_MERCHANT_ID, // optional, sets X-ASSUME-MERCHANT
  env: 'STAGING', // 'STAGING' (default, sandbox) or 'PRODUCTION'
});

// 1. Create a QR code / Web Payment link
const qr = await paypay.code.create({
  merchantPaymentId: `order_${Date.now()}`,
  amount: { amount: 1000, currency: 'JPY' },
  orderDescription: 'Coffee x2',
  redirectUrl: 'https://example.com/thanks',
});
console.log(qr.data.url); // send the customer here

// 2. Check payment status
const status = await paypay.code.getPaymentDetails(qr.data.merchantPaymentId);
console.log(status.data.status); // e.g. "COMPLETED"

// 3. Refund if needed
await paypay.refund.create({
  merchantRefundId: `refund_${Date.now()}`,
  paymentId: status.data.paymentId,
  amount: { amount: 1000, currency: 'JPY' },
  reason: 'Customer requested cancellation',
});
```

## API surface

| Resource                | Method                                 | Description                                                |
|--------------------------|-----------------------------------------|--------------------------------------------------------------|
| `paypay.code`            | `create(payload)`                      | Create a QR code / Web Payment link                          |
|                          | `getPaymentDetails(merchantPaymentId)` | Check payment status                                          |
|                          | `cancelPayment(merchantPaymentId)`     | Cancel a not-yet-completed payment                            |
|                          | `deleteQrCode(codeId)`                 | Deactivate a generated QR code                                |
| `paypay.payment`         | `create(payload)`                      | Server-to-server (native) payment                             |
|                          | `getPaymentDetails(merchantPaymentId)` | Check payment status                                          |
|                          | `cancelPayment(merchantPaymentId)`     | Cancel a not-yet-completed payment                            |
| `paypay.refund`          | `create(payload)`                      | Full or partial refund                                        |
|                          | `getDetails(merchantRefundId)`         | Check refund status                                            |
| `paypay.preauth`         | `create(payload)`                      | Pre-authorize (block) an amount                                |
|                          | `capture(payload)`                     | Capture a previously authorized amount (e.g. on shipment)      |
|                          | `revert(payload)`                      | Release a non-captured authorization                           |
| `paypay.paymentRequest`  | `create(payload)`                      | Push a payment approval request to the user                    |
|                          | `getDetails(merchantPaymentId)`        | Check a payment request's status                               |
| `paypay.userAuth`        | `createLinkQrCode(payload)`            | Create an account-link QR code                                 |
|                          | `buildWebAuthorizationRequest(params)` | Build the JWT + URL for web-based account linking              |
|                          | `decodeAuthorizationResponse(token, secret)` | Verify & decode the callback JWT                          |
|                          | `getStatus(userAuthorizationId)`       | Check a user authorization's status                             |
|                          | `unlink(userAuthorizationId)`          | Revoke a user authorization                                     |
|                          | `getSecureProfile(userAuthorizationId)`| Fetch the user's secure profile                                 |
|                          | `checkWalletBalance(params)`           | Check whether the wallet covers an amount                       |
|                          | `getCashbackRate(params)`              | Fetch PayPaySTEP cashback rate details                          |
| `paypay.subscription`    | `startEnrollment(payload)`             | Account-link with `continuous_payments` scope                  |
|                          | `chargeCycle(payload)`                 | Charge one billing cycle (thin wrapper over `payment.create`)  |
|                          | `cancel(userAuthorizationId)`          | Cancel a subscription (revokes authorization)                   |
| `paypay.paymentMethods`  | `list(params)`                         | List a user's available payment methods                         |
| `paypay.reconciliation`  | `download(pathOrUrl)`                  | Download a daily reconciliation CSV file                        |

Top-level exports: `PayPay`, `PayPayClient`, `PayPayError`, `verifyWebhookSignature`, `parseWebhookEvent`,
`createConsoleLogger`, `createNoopLogger`, `BASE_URLS`.

> PayPay Points / Point Code API is intentionally **not yet implemented** — its endpoint contract wasn't
> confirmed against primary sources while building this SDK, and we'd rather leave it out than guess. PRs
> welcome once you have access to that spec.

## Webhooks

```js
const http = require('node:http');
const { verifyWebhookSignature, parseWebhookEvent } = require('paypay.js');

http.createServer((req, res) => {
  let rawBody = '';
  req.on('data', (chunk) => (rawBody += chunk));
  req.on('end', () => {
    const valid = verifyWebhookSignature({
      apiSecret: process.env.PAYPAY_API_SECRET,
      method: 'POST',
      path: '/webhooks/paypay',
      rawBody,
      authorizationHeader: req.headers['authorization'],
    });
    if (!valid) return res.writeHead(401).end();

    const { type, data } = parseWebhookEvent(rawBody);
    console.log('event:', type, data);
    res.writeHead(200).end('OK');
  });
}).listen(3000);
```

See `examples/webhook-server.js` for a runnable version. As PayPay itself recommends, also allowlist PayPay's
source IPs as defense in depth — signature verification alone shouldn't be your only safeguard.

## Subscriptions (continuous payments)

PayPay has no single "subscription" endpoint family — it's built from account-linking with the
`continuous_payments` scope, then repeated native payments on your own billing schedule:

```js
const enrollment = await paypay.subscription.startEnrollment({
  nonce: 'unique-nonce',
  redirectUrl: 'https://example.com/subscribe/callback',
  referenceId: 'user_123',
});
// show enrollment.data.linkQRCodeURL to the user once

// later, on your own cron:
await paypay.subscription.chargeCycle({
  merchantPaymentId: `sub_user_123_${billingMonth}`,
  userAuthorizationId,
  amount: { amount: 980, currency: 'JPY' },
  orderDescription: 'Monthly subscription',
});
```

## Error handling

All API errors are thrown as `PayPayError` instances:

```js
const { PayPayError } = require('paypay.js');

try {
  await paypay.code.create({ /* ... */ });
} catch (err) {
  if (err instanceof PayPayError) {
    console.error(err.statusCode, err.resultInfo);
  }
}
```

Transient failures (HTTP 429/500/502/503/504, or network errors) are retried automatically with exponential
backoff (`maxRetries: 2` by default). Configure via the constructor:

```js
const paypay = new PayPay({ apiKey, apiSecret, maxRetries: 4, retryDelayMs: 500 });
```

## Logging & plugins

A console logger is used by default (quieter — `warn` level — in `PRODUCTION`). Swap it out, or silence it:

```js
const { PayPay, createNoopLogger } = require('paypay.js');
const paypay = new PayPay({ apiKey, apiSecret, logger: createNoopLogger() });
```

The underlying client exposes a small plugin/hook system for cross-cutting concerns (metrics, tracing, caching):

```js
paypay.use((client) => {
  client.onBeforeRequest(({ method, path }) => metrics.increment(`paypay.${method}`));
  client.onAfterResponse(({ path, json }) => metrics.timing(`paypay.${path}.ok`));
  client.onError(({ path, error }) => metrics.increment(`paypay.${path}.error`));
});
```

## CLI

Installed as `paypay-cli` (via the `bin` field) once you `npm install paypay.js`, or run directly:

```bash
PAYPAY_API_KEY=... PAYPAY_API_SECRET=... npx paypay-cli qr:create order_1 500 "Test order"
PAYPAY_API_KEY=... PAYPAY_API_SECRET=... npx paypay-cli qr:status order_1
PAYPAY_API_KEY=... PAYPAY_API_SECRET=... npx paypay-cli refund:create refund_1 <paymentId> 500
PAYPAY_API_KEY=... PAYPAY_API_SECRET=... npx paypay-cli methods:list
```

## Examples

See the [`examples/`](./examples) directory:

- `web-payment.js` — QR code creation + status polling
- `native-payment.js` — server-to-server payment
- `webhook-server.js` — verifying and handling webhook events
- `subscription.js` — continuous payments enrollment + billing cycle

## TypeScript

This package stays plain JavaScript, but ships a generated `index.d.ts` (built from JSDoc comments via
`tsc --allowJs --declaration`) so TypeScript/editor users get full autocomplete:

```bash
npm run build:types   # regenerates all *.d.ts files from JSDoc
```

`*.d.ts` files are git-ignored (generated output) and rebuilt automatically before `npm publish`
(`prepublishOnly`).

## Architecture

```
index.js                  # PayPay facade — wires client + all resources
src/
  client.js                # HMAC signing, retries, logging, plugin hooks, PayPayError
  logger.js                # console / no-op logger factories
  webhook.js                # webhook signature verification + event parsing
  resources/
    code.js                 # QR code / Web Payment
    payment.js               # native (server-to-server) payments
    refund.js                 # refunds
    preauth.js                 # pre-authorize / capture / revert
    paymentRequest.js           # push payment requests ("pending payments")
    userAuth.js                  # account linking, JWT sign/verify, wallet/profile lookups
    subscription.js               # continuous-payments convenience wrapper
    paymentMethods.js              # list available payment methods
    reconciliation.js               # daily reconciliation file download
bin/paypay-cli.js          # CLI entry point
examples/                  # runnable usage examples
test/                      # node:test unit tests (signing, webhook, JWT, wiring)
```

## Development

```bash
npm install
npm test
npm run build:types
```

## Publishing to GitHub / npm

```bash
git remote add origin https://github.com/gvhrerf/paypay.js.git
git branch -M main
git push -u origin main

npm publish   # runs `prepublishOnly` (tests + type generation) automatically
```

## Roadmap

- [x] Phase 1: Web Payment (QR codes), native payments, refunds
- [x] Phase 2: Webhook signature verification, payment requests, pre-auth/capture (shipping flow)
- [x] Phase 3: Continuous payments (subscriptions), user authorization/account linking, payment methods,
      reconciliation file download
- [ ] PayPay Points API / Point Code API — pending confirmed endpoint spec
- [ ] Optional TypeScript-native rewrite (currently JS + generated `.d.ts`)

Contributions and issue reports are welcome.

## License

MIT
