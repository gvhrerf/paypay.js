'use strict';

/**
 * "Payment Request" resource — sends the user a push notification asking
 * them to approve a payment (a "pending payment"), rather than debiting
 * immediately. Useful for scenarios where the final amount needs user
 * confirmation.
 *
 * Official reference: https://www.paypay.ne.jp/opa/doc/v1.0/paymentrequest
 * (endpoint paths confirmed via PayPay's published SDKs: POST /v1/requestOrder, GET /v1/requestOrder/{merchantPaymentId})
 */
class PaymentRequestResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * Creates a pending payment request that is pushed to the user for approval.
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
    return this.client.post('/v1/requestOrder', body);
  }

  /** @param {string} merchantPaymentId */
  getDetails(merchantPaymentId) {
    return this.client.get(`/v1/requestOrder/${encodeURIComponent(merchantPaymentId)}`);
  }
}

module.exports = { PaymentRequestResource };
