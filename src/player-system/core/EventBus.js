"use strict";

const { EventEmitter } = require("events");

/**
 * EventBus - Central event communication hub for the player system
 *
 * Events emitted:
 * - connection.connecting: When starting a voice connection
 * - connection.ready: When voice connection is established
 * - connection.disconnected: When voice connection is lost
 * - connection.error: When connection encounters an error
 * - playback.loading: When starting to load audio
 * - playback.playing: When audio starts playing
 * - playback.paused: When playback is paused
 * - playback.stopped: When playback is stopped
 * - playback.trackEnded: When a track finishes naturally
 * - playback.error: When playback encounters an error
 * - state.updated: When guild state changes
 * - queue.changed: When queue is modified
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Prevent memory leak warnings
  }

  /**
   * Emit an event with data
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  emit(event, data = {}) {
    try {
      super.emit(event, data);
    } catch (err) {
      console.error(`[EventBus] Error in listener for event "${event}":`, err);
    }
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {function} handler - Event handler
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    return super.on(event, handler);
  }

  /**
   * Subscribe to an event (one-time)
   * @param {string} event - Event name
   * @param {function} handler - Event handler
   */
  once(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    return super.once(event, handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {function} handler - Event handler
   */
  off(event, handler) {
    return super.off(event, handler);
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name (optional)
   */
  removeAllListeners(event) {
    return super.removeAllListeners(event);
  }
}

module.exports = EventBus;
