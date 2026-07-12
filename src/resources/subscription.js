'use strict';

/**
 * "Subscription" convenience wrapper. PayPay has no dedicated subscription
 * endpoint family; a recurring integration is just:
 *   1. Account-link the user with the `continuous_payments` scope.
 *   2. Repeatedly call the Payments API with the resulting `userAuthorizationId`
 *      on your own billing schedule.
 *
 * This resource wires those two pieces together so callers don't have to
 * rediscover the pattern.
 *
 * Official reference: https://www.paypay.ne.jp/opa/doc/v1.0/continuous_payments
 */
class SubscriptionResource {
  /**
   * @param {import('../client').PayPayClient} client
   * @param {import('./userAuth').UserAuthResource} userAuth
   * @param {import('./payment').PaymentResource} payment
   */
  constructor(client, userAuth, payment) {
    this.client = client;
    this.userAuth = userAuth;
    this.payment = payment;
  }

  /**
   * Starts a subscription by creating an account-link QR code scoped for
   * continuous payments. Store the returned `userAuthorizationId` (once the
   * user completes linking) against your own subscription record.
   *
   * @param {object} payload - same shape as `userAuth.createLinkQrCode`, minus `scopes`.
   */
  startEnrollment(payload) {
    return this.userAuth.createLinkQrCode({ ...payload, scopes: ['continuous_payments'] });
  }

  /**
   * Charges the subscriber for one billing cycle. Call this on your own
   * cron/scheduler.
   *
   * @param {object} payload
   * @param {string} payload.merchantPaymentId - unique per billing cycle, e.g. `sub_123_2026-08`
   * @param {string} payload.userAuthorizationId
   * @param {object} payload.amount - { amount, currency }
   * @param {string} [payload.orderDescription]
   */
  chargeCycle(payload) {
    return this.payment.create(payload);
  }

  /**
   * Cancels the subscription by revoking the user's authorization. Future
   * `chargeCycle` calls with this `userAuthorizationId` will fail.
   * @param {string} userAuthorizationId
   */
  cancel(userAuthorizationId) {
    return this.userAuth.unlink(userAuthorizationId);
  }
}

module.exports = { SubscriptionResource };
