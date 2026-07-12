'use strict';

/**
 * "PreAuth / Capture" resource — pre-authorize an amount on a user's wallet,
 * then capture (settle) it later, e.g. once an order has shipped. Also
 * supports reverting (cancelling) an authorization that was never captured.
 *
 * Official reference: https://www.paypay.ne.jp/opa/doc/v1.0/preauth_capture
 */
class PreAuthResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * Creates a payment with `requestedAmount` blocked on the user's wallet
   * but not yet captured. Equivalent to `payment.create()` with
   * `agreeSimilarTransaction`/`preAuthorize` semantics on the PayPay side —
   * this is a thin, explicit alias kept separate from `payment.create` for
   * discoverability.
   *
   * @param {object} payload
   * @param {string} payload.merchantPaymentId
   * @param {string} payload.userAuthorizationId
   * @param {object} payload.amount - { amount, currency }
   * @param {string} [payload.orderDescription]
   */
  create(payload) {
    const body = {
      requestedAt: Math.floor(Date.now() / 1000),
      ...payload,
    };
    return this.client.post('/v2/payments', body);
  }

  /**
   * Captures (settles) a previously created pre-authorization.
   * @param {object} payload
   * @param {string} payload.merchantCaptureId - Unique ID you generate for this capture.
   * @param {string} payload.merchantPaymentId - The original pre-authorized payment's ID.
   * @param {object} payload.amount - { amount, currency }; may be less than the authorized amount.
   * @param {string} [payload.orderDescription]
   */
  capture(payload) {
    const body = {
      requestedAt: Math.floor(Date.now() / 1000),
      ...payload,
    };
    return this.client.post('/v2/payments/capture', body);
  }

  /**
   * Reverts (cancels) a pre-authorization that has not been captured yet,
   * releasing the blocked funds back to the user.
   * @param {object} payload
   * @param {string} payload.merchantRevertId - Unique ID you generate for this revert.
   * @param {string} payload.paymentId - The `paymentId` returned when the pre-authorization was created.
   * @param {string} [payload.reason]
   */
  revert(payload) {
    const body = {
      requestedAt: Math.floor(Date.now() / 1000),
      ...payload,
    };
    return this.client.post('/v2/payments/preauthorize/revert', body);
  }
}

module.exports = { PreAuthResource };
