'use strict';

const crypto = require('crypto');

/**
 * "User Authorization" resource — the account-linking flow that lets a
 * merchant obtain a `userAuthorizationId` for direct-debit style payments
 * (native payments, pre-auth/capture, payment requests, and continuous
 * ["subscription"] payments all require this).
 *
 * PayPay itself does not have a single dedicated "subscription API" — a
 * recurring/subscription integration is built by requesting the
 * `continuous_payments` scope here, then calling `payment.create()` (or
 * `preauth.create()`) repeatedly with the resulting `userAuthorizationId`.
 * See `subscription.js` for a thin convenience wrapper around that pattern.
 *
 * Official references:
 *   https://www.paypay.ne.jp/opa/doc/v1.0/account_link.html
 *   https://www.paypay.ne.jp/opa/doc/v1.0/link_user_web.html
 *   https://www.paypay.ne.jp/opa/doc/v1.0/preauth_capture
 */
class UserAuthResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * Creates an "Account Link" QR code the user scans with the PayPay app to
   * grant authorization to the merchant.
   *
   * @param {object} payload
   * @param {string[]} payload.scopes - e.g. ["direct_debit"] or ["continuous_payments"]
   * @param {string} payload.nonce - random string, store it to verify the eventual callback
   * @param {string} payload.redirectUrl
   * @param {string} payload.referenceId - your own reference for this user
   * @param {string} [payload.redirectType='WEB_LINK']
   * @param {string} [payload.phoneNumber]
   * @param {string} [payload.deviceId]
   */
  createLinkQrCode(payload) {
    const body = {
      redirectType: 'WEB_LINK',
      ...payload,
    };
    return this.client.post('/v1/qr/sessions', body);
  }

  /**
   * Builds the JWT `requestToken` needed for the *web-based* (non-QR)
   * account linking flow, and the authorization page URL to redirect the
   * user to.
   *
   * Signing: HMAC-SHA256(base64Url(header) + "." + base64Url(payload), base64Decode(apiSecret))
   *
   * @param {object} params
   * @param {string} params.apiSecret
   * @param {string} params.apiKey
   * @param {string} params.merchantOrgId - your merchant organization id (the JWT `iss` claim)
   * @param {string} params.redirectUrl
   * @param {string[]} params.scopes - e.g. ["direct_debit"]
   * @param {string} params.nonce
   * @param {string} params.referenceId
   * @param {number} [params.expiresInSeconds=600]
   * @param {'STAGING'|'PRODUCTION'} [params.env='STAGING']
   * @returns {{ requestToken: string, authorizationUrl: string }}
   */
  buildWebAuthorizationRequest({
    apiSecret,
    apiKey,
    merchantOrgId,
    redirectUrl,
    scopes,
    nonce,
    referenceId,
    expiresInSeconds = 600,
    env = 'STAGING',
  }) {
    const header = { typ: 'JWT', alg: 'HS256' };
    const payload = {
      aud: 'paypay.ne.jp',
      iss: merchantOrgId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      scope: scopes.join(','),
      nonce,
      redirectUrl,
      referenceId,
    };

    const requestToken = signPayPayJwt(header, payload, apiSecret);

    const host =
      env === 'PRODUCTION' ? 'https://www.paypay.ne.jp' : 'https://stg-www.sandbox.paypay.ne.jp';
    const authorizationUrl = `${host}/app/opa/user_authorization?apiKey=${encodeURIComponent(
      apiKey
    )}&requestToken=${encodeURIComponent(requestToken)}`;

    return { requestToken, authorizationUrl };
  }

  /**
   * Decodes and verifies a `responseToken` JWT received back from PayPay
   * after the user has accepted/declined account linking.
   *
   * @param {string} token
   * @param {string} apiSecret
   * @returns {object} the decoded payload (throws if the signature is invalid)
   */
  decodeAuthorizationResponse(token, apiSecret) {
    return verifyPayPayJwt(token, apiSecret);
  }

  /** @param {string} userAuthorizationId */
  getStatus(userAuthorizationId) {
    return this.client.get(`/v2/user/authorizations?userAuthorizationId=${encodeURIComponent(userAuthorizationId)}`);
  }

  /** @param {string} userAuthorizationId */
  unlink(userAuthorizationId) {
    return this.client.delete(`/v2/user/authorizations/${encodeURIComponent(userAuthorizationId)}`);
  }

  /** @param {string} userAuthorizationId */
  getSecureProfile(userAuthorizationId) {
    return this.client.get(`/v2/user/profile/secure?userAuthorizationId=${encodeURIComponent(userAuthorizationId)}`);
  }

  /**
   * Checks whether the user's wallet has sufficient balance for a given amount.
   * @param {object} params
   * @param {string} params.userAuthorizationId
   * @param {number} params.amount
   * @param {string} [params.currency='JPY']
   */
  checkWalletBalance({ userAuthorizationId, amount, currency = 'JPY' }) {
    const qs = `userAuthorizationId=${encodeURIComponent(userAuthorizationId)}&amount=${amount}&currency=${currency}`;
    return this.client.get(`/v2/wallet/check_balance?${qs}`);
  }

  /**
   * @param {object} params
   * @param {string} params.userAuthorizationId
   * @param {'current'|'next'} [params.period='current']
   */
  getCashbackRate({ userAuthorizationId, period = 'current' }) {
    const qs = `userAuthorizationId=${encodeURIComponent(userAuthorizationId)}&period=${period}`;
    return this.client.get(`/v2/user/cashback_rate?${qs}`);
  }
}

/** @private */
function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** @private */
function signPayPayJwt(header, payload, apiSecret) {
  const key = Buffer.from(apiSecret, 'base64');
  const segment = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', key).update(segment).digest('base64url');
  return `${segment}.${signature}`;
}

/** @private */
function verifyPayPayJwt(token, apiSecret) {
  const [headerB64, payloadB64, signature] = token.split('.');
  if (!headerB64 || !payloadB64 || !signature) {
    throw new Error('Malformed PayPay JWT: expected 3 dot-separated segments.');
  }

  const key = Buffer.from(apiSecret, 'base64');
  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const valid =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!valid) {
    throw new Error('Invalid PayPay JWT signature.');
  }

  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}

module.exports = { UserAuthResource, signPayPayJwt, verifyPayPayJwt };
