'use strict';

const crypto = require('crypto');

/**
 * Webhook helpers.
 *
 * PayPay POSTs event notifications to your configured webhook URL and signs
 * them using the same HMAC scheme used for outgoing API requests (see
 * `src/client.js` / https://www.paypay.ne.jp/opa/doc/jp/v1.0/hmac_authentication),
 * with the `Authorization` header set to the same
 * `hmac OPA-Auth:apiKey:macData:nonce:epoch:hash` format.
 *
 * IMPORTANT: PayPay's exact webhook signing details are part of your
 * merchant contract/onboarding documentation and can differ by product.
 * Treat this verifier as a starting point, confirm the header name and
 * hashing details against your own dashboard docs, and — as PayPay itself
 * recommends — also allowlist PayPay's source IPs as defense in depth.
 *
 * @param {object} params
 * @param {string} params.apiSecret
 * @param {string} params.method - usually "POST"
 * @param {string} params.path - the path your webhook route is mounted at
 * @param {string} params.rawBody - the *raw*, unparsed request body string
 * @param {string} params.authorizationHeader - the incoming `Authorization` header value
 * @param {string} [params.contentType='application/json;charset=UTF-8']
 * @returns {boolean} whether the signature is valid
 */
function verifyWebhookSignature({ apiSecret, method, path, rawBody, authorizationHeader, contentType }) {
  if (!authorizationHeader || !authorizationHeader.startsWith('hmac OPA-Auth:')) {
    return false;
  }

  const [, apiKey, macData, nonce, epoch, hash] = authorizationHeader.replace('hmac OPA-Auth:', '').match(
    /^([^:]*):([^:]*):([^:]*):([^:]*):(.*)$/
  ) || [];

  if (!macData) return false;

  const resolvedContentType = contentType || 'application/json;charset=UTF-8';
  const expectedHash = rawBody
    ? crypto.createHash('sha256').update(resolvedContentType + rawBody, 'utf8').digest('base64')
    : 'empty';

  if (hash !== expectedHash) return false;

  const hmacInput = [path, method, nonce, epoch, resolvedContentType, hash].join('\n');
  const expectedMacData = crypto.createHmac('sha256', apiSecret).update(hmacInput, 'utf8').digest('base64');

  const a = Buffer.from(macData);
  const b = Buffer.from(expectedMacData);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Parses a webhook JSON body and returns the event type + payload, without
 * throwing on malformed input (returns `{ type: null }` instead).
 * @param {string} rawBody
 * @returns {{ type: string|null, data: object|null }}
 */
function parseWebhookEvent(rawBody) {
  try {
    const json = JSON.parse(rawBody);
    return { type: json.notification_type || null, data: json };
  } catch {
    return { type: null, data: null };
  }
}

module.exports = { verifyWebhookSignature, parseWebhookEvent };
