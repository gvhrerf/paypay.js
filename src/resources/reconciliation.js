'use strict';

/**
 * "Reconciliation" resource — PayPay generates a daily transaction
 * reconciliation file and notifies its location via webhook. This resource
 * just wraps the authenticated download of that file (CSV).
 *
 * Official reference: mentioned in https://www.paypay.ne.jp/opa/doc/v1.0/continuous_payments
 * ("PayPay generates a transaction file by daily processing and notifies it by Webhook").
 */
class ReconciliationResource {
  /** @param {import('../client').PayPayClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * Downloads a reconciliation file from the path/URL notified via webhook.
   * @param {string} pathOrUrl
   * @returns {Promise<string>} raw CSV text
   */
  download(pathOrUrl) {
    return this.client.getRaw(pathOrUrl);
  }
}

module.exports = { ReconciliationResource };
