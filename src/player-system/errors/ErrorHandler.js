"use strict";

const {
  ConnectionTimeoutError,
  StreamFetchError,
  ConnectionLostError
} = require("./ErrorTypes");

/**
 * ErrorHandler - Centralized error handling with retry/recovery logic
 */
class ErrorHandler {
  constructor(eventBus, logger) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.retryDelays = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
  }

  /**
   * Handle an error with appropriate logging and recovery
   * @param {Error} error - The error to handle
   * @param {object} context - Additional context
   */
  async handle(error, context = {}) {
    // Log with full context
    this.logger.error(error.name, error, {
      stack: true,
      context: error.context || {},
      additionalContext: context
    });

    // Emit error event
    this.eventBus.emit('error', {
      error,
      context,
      timestamp: Date.now()
    });

    // Determine recovery strategy
    if (this.isRetryable(error)) {
      return await this.retry(error, context);
    }

    return await this.recover(error, context);
  }

  /**
   * Check if error is retryable
   * @param {Error} error
   */
  isRetryable(error) {
    return (
      error instanceof ConnectionTimeoutError ||
      error instanceof StreamFetchError ||
      error instanceof ConnectionLostError
    );
  }

  /**
   * Retry operation with exponential backoff
   * @param {Error} error
   * @param {object} context
   */
  async retry(error, context = {}) {
    const attempt = context.retryAttempt || 0;

    if (attempt >= this.retryDelays.length) {
      this.logger.warn("MAX_RETRIES", "Maximum retry attempts reached", {
        error: error.name,
        attempts: attempt
      });
      return { success: false, error, maxRetriesReached: true };
    }

    const delay = this.retryDelays[attempt];
    this.logger.info("RETRY", `Retrying after ${delay}ms (attempt ${attempt + 1}/${this.retryDelays.length})`);

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          success: false,
          error,
          shouldRetry: true,
          nextAttempt: attempt + 1,
          delay
        });
      }, delay);
    });
  }

  /**
   * Attempt to recover from error
   * @param {Error} error
   * @param {object} context
   */
  async recover(error, context = {}) {
    this.logger.warn("RECOVERY", "Attempting error recovery", {
      error: error.name,
      context
    });

    return {
      success: false,
      error,
      recovered: false
    };
  }

  /**
   * Wrap async operation with error handling
   * @param {function} operation - Async operation to execute
   * @param {object} context - Context for error handling
   */
  async wrap(operation, context = {}) {
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      return await this.handle(error, context);
    }
  }

  /**
   * Create a timeout wrapper for promises
   * @param {Promise} promise - Promise to wrap
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} timeoutMessage - Error message on timeout
   */
  withTimeout(promise, timeoutMs, timeoutMessage = "Operation timed out") {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new ConnectionTimeoutError(timeoutMessage)), timeoutMs)
      )
    ]);
  }
}

module.exports = ErrorHandler;
