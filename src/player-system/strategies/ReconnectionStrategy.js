"use strict";

const log = require("../../utils/logger");

/**
 * ReconnectionStrategy - Handle voice connection reconnection with exponential backoff
 */
class ReconnectionStrategy {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.maxAttempts = 5;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 16000; // 16 seconds
  }

  /**
   * Attempt to reconnect with exponential backoff
   * @param {ConnectionManager} connectionManager
   * @param {number} attemptNumber - Current attempt number (0-indexed)
   */
  async attempt(connectionManager, attemptNumber = 0) {
    if (attemptNumber >= this.maxAttempts) {
      log.error("RECONNECT_MAX", new Error("Max reconnection attempts reached"), {
        attempts: attemptNumber
      });

      this.eventBus.emit('connection.error', {
        error: 'MAX_RECONNECT_ATTEMPTS',
        attempts: attemptNumber
      });

      return { success: false, maxAttemptsReached: true };
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.baseDelay * Math.pow(2, attemptNumber),
      this.maxDelay
    );

    log.info("RECONNECT", `Attempting reconnect in ${delay}ms (attempt ${attemptNumber + 1}/${this.maxAttempts})`);

    // Wait before reconnecting
    await this.delay(delay);

    try {
      // Emit reconnecting event
      this.eventBus.emit('connection.reconnecting', {
        attempt: attemptNumber + 1,
        maxAttempts: this.maxAttempts,
        delay
      });

      // Attempt reconnection
      // Note: The actual reconnection logic is handled by the caller
      return {
        success: true,
        attempt: attemptNumber + 1,
        delay
      };
    } catch (err) {
      log.error("RECONNECT", err, {
        attempt: attemptNumber + 1,
        stack: false
      });

      // Retry with next attempt
      return await this.attempt(connectionManager, attemptNumber + 1);
    }
  }

  /**
   * Reset reconnection state
   */
  reset() {
    // Can be used to reset attempt counters if needed
    log.info("RECONNECT", "Reconnection state reset");
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate next delay
   * @param {number} attemptNumber
   */
  calculateDelay(attemptNumber) {
    return Math.min(
      this.baseDelay * Math.pow(2, attemptNumber),
      this.maxDelay
    );
  }
}

module.exports = ReconnectionStrategy;
