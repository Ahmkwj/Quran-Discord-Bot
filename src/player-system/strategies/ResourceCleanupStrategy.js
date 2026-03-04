"use strict";

const log = require("../../utils/logger");

/**
 * ResourceCleanupStrategy - Safely cleanup audio resources
 */
class ResourceCleanupStrategy {
  constructor() {
    this.defaultTimeout = 2000; // 2 second timeout for cleanup operations
  }

  /**
   * Cleanup all playback resources
   * @param {PlaybackManager} playbackManager - Playback manager instance
   */
  async cleanup(playbackManager) {
    const tasks = [];

    // Stop and remove player
    if (playbackManager.player) {
      tasks.push(this.cleanupPlayer(playbackManager.player));
    }

    // Destroy resource
    if (playbackManager.resource) {
      tasks.push(this.cleanupResource(playbackManager.resource));
    }

    // Destroy stream
    if (playbackManager.stream) {
      tasks.push(this.cleanupStream(playbackManager.stream));
    }

    // Execute all with timeout and handle failures gracefully
    await Promise.allSettled(
      tasks.map(task => this.withTimeout(task, this.defaultTimeout))
    );

    // Clear references
    playbackManager.player = null;
    playbackManager.resource = null;
    playbackManager.stream = null;
    playbackManager.idleHandler = null;
  }

  /**
   * Cleanup audio player
   * @param {AudioPlayer} player
   */
  async cleanupPlayer(player) {
    try {
      if (!player) return;

      // Remove all event listeners first
      player.removeAllListeners();

      // Stop playback
      player.stop(true);

      log.info("CLEANUP", "Audio player cleaned up successfully");
    } catch (err) {
      log.warn("CLEANUP_PLAYER", err, { stack: false });
    }
  }

  /**
   * Cleanup audio resource
   * @param {AudioResource} resource
   */
  async cleanupResource(resource) {
    try {
      if (!resource) return;

      // Destroy the playback stream
      if (resource.playStream && typeof resource.playStream.destroy === 'function') {
        resource.playStream.destroy();
      }

      log.info("CLEANUP", "Audio resource cleaned up successfully");
    } catch (err) {
      log.warn("CLEANUP_RESOURCE", err, { stack: false });
    }
  }

  /**
   * Cleanup audio stream
   * @param {Stream} stream
   */
  async cleanupStream(stream) {
    try {
      if (!stream) return;

      if (typeof stream.destroy === 'function') {
        stream.destroy();
      }

      log.info("CLEANUP", "Audio stream cleaned up successfully");
    } catch (err) {
      log.warn("CLEANUP_STREAM", err, { stack: false });
    }
  }

  /**
   * Wrap a promise with a timeout
   * @param {Promise} promise
   * @param {number} timeoutMs
   */
  withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Cleanup timeout")), timeoutMs)
      )
    ]).catch(err => {
      log.warn("CLEANUP_TIMEOUT", err, { stack: false });
    });
  }
}

module.exports = ResourceCleanupStrategy;
