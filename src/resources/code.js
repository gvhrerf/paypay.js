'use strict';

/**
 * "Codes" resource — covers QR-code based flows (Web Payment / dynamic QR),
 * the most common integration for online checkout.
 *
 * Official reference: https://www.paypay.ne.jp/opa/doc/v1.0/qr_code
 */
class CodeResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * Creates a dynamic QR code / Web Payment link for a purchase.
   *
   * @param {object} payload
   * @param {string} payload.merchantPaymentId - Unique ID you generate for this order.
   * @param {number} payload.amount.amount - Payment amount.
   * @param {string} [payload.amount.currency='JPY']
   * @param {string} [payload.codeType='ORDER_QR']
   * @param {string} [payload.redirectUrl] - Where to send the user after payment.
   * @param {string} [payload.redirectType='WEB_LINK']
   * @param {string} [payload.orderDescription]
   * @param {Array<object>} [payload.orderItems]
   * @returns {Promise<object>} PayPay response, includes `data.url` to redirect the user to.
   */
  create(payload) {
    const body = {
      codeType: 'ORDER_QR',
      redirectType: 'WEB_LINK',
      requestedAt: Math.floor(Date.now() / 1000),
      ...payload,
    };
    return this.client.post('/v2/codes', body);
  }

  /**
   * Fetches the current status/details of a payment created via a QR code.
   * @param {string} merchantPaymentId
   */
  getPaymentDetails(merchantPaymentId) {
    return this.client.get(`/v2/codes/payments/${encodeURIComponent(merchantPaymentId)}`);
  }

  /**
   * Cancels a payment. Only valid while the payment has not yet completed.
   * @param {string} merchantPaymentId
   */
  cancelPayment(merchantPaymentId) {
    return this.client.post(`/v2/codes/payments/${encodeURIComponent(merchantPaymentId)}/cancel`);
  }

  /**
   * Deletes/deactivates a previously generated QR code so it can no longer be scanned.
   * @param {string} codeId
   */
  deleteQrCode(codeId) {
    return this.client.delete(`/v2/codes/${encodeURIComponent(codeId)}`);
  }
}

module.exports = { CodeResource };
