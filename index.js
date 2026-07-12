'use strict';

const { PayPayClient, PayPayError, BASE_URLS, createConsoleLogger, createNoopLogger } = require('./src/client');
const { CodeResource } = require('./src/resources/code');
const { PaymentResource } = require('./src/resources/payment');
const { RefundResource } = require('./src/resources/refund');
const { PreAuthResource } = require('./src/resources/preauth');
const { PaymentRequestResource } = require('./src/resources/paymentRequest');
const { UserAuthResource } = require('./src/resources/userAuth');
const { SubscriptionResource } = require('./src/resources/subscription');
const { PaymentMethodsResource } = require('./src/resources/paymentMethods');
const { ReconciliationResource } = require('./src/resources/reconciliation');
const { verifyWebhookSignature, parseWebhookEvent } = require('./src/webhook');

/**
 * Main SDK entry point. Instantiate once per merchant credential set.
 *
 * @example
 * const { PayPay } = require('paypay.js');
 *
 * const paypay = new PayPay({
 *   apiKey: process.env.PAYPAY_API_KEY,
 *   apiSecret: process.env.PAYPAY_API_SECRET,
 *   merchantId: process.env.PAYPAY_MERCHANT_ID, // optional
 *   env: 'STAGING', // or 'PRODUCTION'
 * });
 *
 * const qr = await paypay.code.create({
 *   merchantPaymentId: 'order_1234',
 *   amount: { amount: 1000, currency: 'JPY' },
 *   orderDescription: 'Coffee x2',
 *   redirectUrl: 'https://example.com/thanks',
 * });
 * console.log(qr.data.url);
 */
class PayPay {
  /**
   * @param {object} config
   * @param {string} config.apiKey
   * @param {string} config.apiSecret
   * @param {string} [config.merchantId]
   * @param {'STAGING'|'PRODUCTION'} [config.env='STAGING']
   * @param {import('./src/logger').Logger} [config.logger]
   * @param {number} [config.maxRetries]
   * @param {number} [config.retryDelayMs]
   */
  constructor(config) {
    this.client = new PayPayClient(config);

    // Core payment flows (Phase 1)
    this.code = new CodeResource(this.client);
    this.payment = new PaymentResource(this.client);
    this.refund = new RefundResource(this.client);

    // Extended flows (Phase 2/3)
    this.preauth = new PreAuthResource(this.client);
    this.paymentRequest = new PaymentRequestResource(this.client);
    this.userAuth = new UserAuthResource(this.client);
    this.subscription = new SubscriptionResource(this.client, this.userAuth, this.payment);
    this.paymentMethods = new PaymentMethodsResource(this.client);
    this.reconciliation = new ReconciliationResource(this.client);
  }

  setAssumeMerchant(merchantId) {
    this.client.setAssumeMerchant(merchantId);
  }

  /**
   * Registers a plugin on the underlying client. See `PayPayClient#use`.
   * @param {(client: PayPayClient) => void} plugin
   */
  use(plugin) {
    this.client.use(plugin);
    return this;
  }
}

module.exports = {
  PayPay,
  PayPayClient,
  PayPayError,
  BASE_URLS,
  createConsoleLogger,
  createNoopLogger,
  verifyWebhookSignature,
  parseWebhookEvent,
};
