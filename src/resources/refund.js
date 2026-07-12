'use strict';

/**
 * "Refunds" resource — full or partial refunds against a completed payment.
 *
 * Official reference: https://www.paypay.ne.jp/opa/doc/v1.0/refund
 */
class RefundResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * @param {object} payload
   * @param {string} payload.merchantRefundId - Unique ID you generate for this refund.
   * @param {string} payload.paymentId - The `paymentId` of the payment being refunded.
   * @param {object} payload.amount - { amount, currency }
   * @param {string} payload.reason - Free-text reason shown to support staff.
   */
  create(payload) {
    const body = {
      requestedAt: Math.floor(Date.now() / 1000),
      ...payload,
    };
    return this.client.post('/v2/refunds', body);
  }

  /** @param {string} merchantRefundId */
  getDetails(merchantRefundId) {
    return this.client.get(`/v2/refunds/${encodeURIComponent(merchantRefundId)}`);
  }
}

module.exports = { RefundResource };
