'use strict';

/**
 * "Payment Methods" resource — lists the payment methods available to a
 * given (authorized) user, e.g. wallet balance, PayPay card, pay-later.
 *
 * Endpoint confirmed via PayPay's published Java SDK: GET /v4/paymentMethods
 */
class PaymentMethodsResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * @param {object} [params]
   * @param {string} [params.userAuthorizationId]
   */
  list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.client.get(`/v4/paymentMethods${qs ? `?${qs}` : ''}`);
  }
}

module.exports = { PaymentMethodsResource };
