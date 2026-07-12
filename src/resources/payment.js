'use strict';

/**
 * "Payments" resource — server-to-server (native) payments that debit a
 * user's wallet directly using a previously obtained `userAuthorizationId`.
 *
 * Official reference: https://www.paypay.ne.jp/opa/doc/v1.0/direct_debit
 */
class PaymentResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * Creates a direct (server-to-server) payment against an authorized user.
   *
   * @param {object} payload
   * @param {string} payload.merchantPaymentId
   * @param {string} payload.userAuthorizationId
   * @param {object} payload.amount - { amount, currency }
   * @param {string} [payload.orderDescription]
   * @param {boolean} [payload.requestedAt]
   */
  create(payload) {
    const body = {
      requestedAt: Math.floor(Date.now() / 1000),
      ...payload,
    };
    return this.client.post('/v2/payments', body);
  }

  /** @param {string} merchantPaymentId */
  getPaymentDetails(merchantPaymentId) {
    return this.client.get(`/v2/payments/${encodeURIComponent(merchantPaymentId)}`);
  }

  /** @param {string} merchantPaymentId */
  cancelPayment(merchantPaymentId) {
    return this.client.post(`/v2/payments/${encodeURIComponent(merchantPaymentId)}/cancel`);
  }
}

module.exports = { PaymentResource };
