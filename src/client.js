'use strict';

const crypto = require('crypto');
const { createConsoleLogger, createNoopLogger } = require('./logger');

const BASE_URLS = {
  STAGING: 'https://stg-api.sandbox.paypay.ne.jp',
  PRODUCTION: 'https://api.paypay.ne.jp',
};

/**
 * Generates a random nonce string used in the HMAC authorization header.
 * @returns {string}
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Builds the `Authorization` header value required by the PayPay OPA API.
 *
 * Spec reference: https://www.paypay.ne.jp/opa/doc/jp/v1.0/hmac_authentication
 *
 * authHeader = "hmac OPA-Auth:" + apiKey + ":" + macData + ":" + nonce + ":" + epoch + ":" + hash
 *
 * where:
 *   hash    = base64(sha256(body))   — or the literal string "empty" when there is no body
 *   macData = base64(hmacSha256(apiSecret, hmacInput))
 *   hmacInput = requestUrl + "\n" + httpMethod + "\n" + nonce + "\n" + epoch + "\n" + contentType + "\n" + hash
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.apiSecret
 * @param {string} params.method - HTTP method, e.g. "POST"
 * @param {string} params.path - request path including query string, e.g. "/v2/codes"
 * @param {string} [params.body] - raw JSON request body, omitted for bodiless requests
 * @param {string} [params.contentType] - defaults to "application/json;charset=UTF-8" when a body is present
 * @returns {string} the fully formed Authorization header value
 */
function buildAuthorizationHeader({ apiKey, apiSecret, method, path, body, contentType }) {
  const nonce = generateNonce();
  const epoch = Math.floor(Date.now() / 1000).toString();

  let hash;
  let resolvedContentType;

  if (body === undefined || body === null || body === '') {
    hash = 'empty';
    resolvedContentType = 'empty';
  } else {
    resolvedContentType = contentType || 'application/json;charset=UTF-8';
    const contentForHash = resolvedContentType + body;
    hash = crypto.createHash('sha256').update(contentForHash, 'utf8').digest('base64');
  }

  const hmacInput = [path, method, nonce, epoch, resolvedContentType, hash].join('\n');

  const macData = crypto
    .createHmac('sha256', apiSecret)
    .update(hmacInput, 'utf8')
    .digest('base64');

  return `hmac OPA-Auth:${apiKey}:${macData}:${nonce}:${epoch}:${hash}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Status codes/OPA error codes considered safe to retry (transient/server-side). */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

class PayPayError extends Error {
  constructor(message, { statusCode, resultInfo, raw } = {}) {
    super(message);
    this.name = 'PayPayError';
    this.statusCode = statusCode;
    this.resultInfo = resultInfo;
    this.raw = raw;
  }
}

class PayPayClient {
  /**
   * @param {object} config
   * @param {string} config.apiKey - Your PayPay merchant API key.
   * @param {string} config.apiSecret - Your PayPay merchant API secret.
   * @param {string} [config.merchantId] - Sets the X-ASSUME-MERCHANT header (needed for sub-merchant setups).
   * @param {'STAGING'|'PRODUCTION'} [config.env='STAGING'] - Which environment to call.
   * @param {import('./logger').Logger} [config.logger] - Pluggable logger. Defaults to a console logger.
   * @param {number} [config.maxRetries=2] - Max retry attempts for transient errors (429/5xx/network).
   * @param {number} [config.retryDelayMs=300] - Base delay for exponential backoff between retries.
   */
  constructor({
    apiKey,
    apiSecret,
    merchantId,
    env = 'STAGING',
    logger,
    maxRetries = 2,
    retryDelayMs = 300,
  } = {}) {
    if (!apiKey || !apiSecret) {
      throw new Error('PayPayClient requires both `apiKey` and `apiSecret`.');
    }
    if (!BASE_URLS[env]) {
      throw new Error(`Invalid env "${env}". Expected one of: ${Object.keys(BASE_URLS).join(', ')}`);
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.merchantId = merchantId;
    this.env = env;
    this.baseUrl = BASE_URLS[env];
    this.logger = logger || (env === 'PRODUCTION' ? createConsoleLogger({ level: 'warn' }) : createConsoleLogger());
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;

    /** @type {{beforeRequest: Function[], afterResponse: Function[], onError: Function[]}} */
    this.hooks = { beforeRequest: [], afterResponse: [], onError: [] };
  }

  setAssumeMerchant(merchantId) {
    this.merchantId = merchantId;
  }

  /**
   * Installs a plugin. A plugin is simply a function that receives the
   * client instance and can register hooks or wrap methods. This is the
   * extension point for things like custom metrics, tracing, or caching.
   *
   * @example
   * client.use((client) => {
   *   client.onBeforeRequest(({ method, path }) => console.log('->', method, path));
   * });
   *
   * @param {(client: PayPayClient) => void} plugin
   * @returns {PayPayClient} this, for chaining
   */
  use(plugin) {
    plugin(this);
    return this;
  }

  /** @param {(ctx: {method: string, path: string, body?: object}) => void} fn */
  onBeforeRequest(fn) {
    this.hooks.beforeRequest.push(fn);
    return this;
  }

  /** @param {(ctx: {method: string, path: string, status: number, json: object}) => void} fn */
  onAfterResponse(fn) {
    this.hooks.afterResponse.push(fn);
    return this;
  }

  /** @param {(ctx: {method: string, path: string, error: Error}) => void} fn */
  onError(fn) {
    this.hooks.onError.push(fn);
    return this;
  }

  /**
   * Low-level request method used by all resources. Handles signing, JSON
   * encoding/decoding, and error normalization.
   *
   * @param {string} method - HTTP method
   * @param {string} path - request path including leading slash, e.g. "/v2/codes"
   * @param {object} [body] - request payload; omitted for GET/DELETE without a body
   * @returns {Promise<object>} parsed JSON response body
   */
  async request(method, path, body) {
    for (const hook of this.hooks.beforeRequest) hook({ method, path, body });
    this.logger.debug(`${method} ${path}`, body ? { body } : undefined);

    let attempt = 0;
    // Retries cover network failures and transient server-side errors only;
    // never retried for 4xx client errors other than 429 (rate limit).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const json = await this._doRequest(method, path, body);
        for (const hook of this.hooks.afterResponse) hook({ method, path, status: 200, json });
        return json;
      } catch (err) {
        const isRetryable =
          err instanceof PayPayError
            ? RETRYABLE_STATUS_CODES.has(err.statusCode)
            : true; /* network-level errors (fetch throwing) are retried */

        if (attempt >= this.maxRetries || !isRetryable) {
          for (const hook of this.hooks.onError) hook({ method, path, error: err });
          this.logger.error(`${method} ${path} failed permanently`, err.message);
          throw err;
        }

        const delay = this.retryDelayMs * 2 ** attempt;
        this.logger.warn(`${method} ${path} failed (attempt ${attempt + 1}), retrying in ${delay}ms`, err.message);
        await sleep(delay);
        attempt += 1;
      }
    }
  }

  /**
   * Performs a single HTTP request/response cycle (no retries). Split out
   * from `request` so retry logic stays simple to reason about.
   * @private
   */
  async _doRequest(method, path, body) {
    const rawBody = body !== undefined ? JSON.stringify(body) : undefined;

    const authHeader = buildAuthorizationHeader({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      method,
      path,
      body: rawBody,
    });

    const headers = {
      Authorization: authHeader,
      'Content-Type': 'application/json;charset=UTF-8',
    };
    if (this.merchantId) {
      headers['X-ASSUME-MERCHANT'] = this.merchantId;
    }

    const response = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: rawBody,
    });

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new PayPayError(`Failed to parse PayPay response as JSON: ${err.message}`, {
        statusCode: response.status,
        raw: text,
      });
    }

    if (!response.ok) {
      const message =
        (json.resultInfo && (json.resultInfo.message || json.resultInfo.code)) ||
        `PayPay API request failed with status ${response.status}`;
      throw new PayPayError(message, {
        statusCode: response.status,
        resultInfo: json.resultInfo,
        raw: json,
      });
    }

    return json;
  }

  get(path) {
    return this.request('GET', path);
  }

  /**
   * Like `get`, but returns the raw response text instead of parsing JSON.
   * Useful for endpoints that return CSV, such as reconciliation files.
   * @param {string} path - full path (may be an absolute URL for
   *   PayPay-hosted files notified via webhook; in that case it is fetched
   *   as-is, still signed with the same merchant credentials).
   * @returns {Promise<string>}
   */
  async getRaw(path) {
    const isAbsolute = /^https?:\/\//i.test(path);
    const url = isAbsolute ? path : this.baseUrl + path;
    const signingPath = isAbsolute ? new URL(path).pathname + new URL(path).search : path;

    const authHeader = buildAuthorizationHeader({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      method: 'GET',
      path: signingPath,
    });

    const headers = { Authorization: authHeader };
    if (this.merchantId) headers['X-ASSUME-MERCHANT'] = this.merchantId;

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      throw new PayPayError(`Failed to fetch file: HTTP ${response.status}`, { statusCode: response.status });
    }
    return response.text();
  }

  post(path, body) {
    return this.request('POST', path, body);
  }

  delete(path) {
    return this.request('DELETE', path);
  }
}

module.exports = {
  PayPayClient,
  PayPayError,
  buildAuthorizationHeader,
  generateNonce,
  BASE_URLS,
  createConsoleLogger,
  createNoopLogger,
};
