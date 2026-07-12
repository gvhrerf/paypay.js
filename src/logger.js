'use strict';

/**
 * @typedef {object} Logger
 * @property {(...args: any[]) => void} debug
 * @property {(...args: any[]) => void} info
 * @property {(...args: any[]) => void} warn
 * @property {(...args: any[]) => void} error
 */

/** A logger that writes to the console, prefixed with `[paypay.js]`. @returns {Logger} */
function createConsoleLogger({ level = 'info' } = {}) {
  const levels = ['debug', 'info', 'warn', 'error'];
  const threshold = levels.indexOf(level);

  /** @type {Logger} */
  const logger = {};
  for (const [i, lvl] of levels.entries()) {
    logger[lvl] = (...args) => {
      if (i >= threshold) {
        // eslint-disable-next-line no-console
        console[lvl === 'debug' ? 'log' : lvl](`[paypay.js:${lvl}]`, ...args);
      }
    };
  }
  return logger;
}

/** A logger that discards everything. Useful for tests or silent mode. @returns {Logger} */
function createNoopLogger() {
  const noop = () => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

module.exports = { createConsoleLogger, createNoopLogger };
