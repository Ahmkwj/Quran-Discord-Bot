"use strict";

const { parseSurahList } = require("../../utils/api");
const { QueueEmptyError } = require("../errors/ErrorTypes");

/**
 * QueueManager - Manages playback queue operations
 */
class QueueManager {
  constructor(guildId, eventBus, stateManager) {
    this.guildId = guildId;
    this.eventBus = eventBus;
    this.stateManager = stateManager;
  }

  /**
   * Set the entire queue
   * @param {Array<number>} surahs - Array of surah numbers
   */
  setQueue(surahs) {
    this.stateManager.setQueue(surahs);

    this.eventBus.emit('queue.changed', {
      guildId: this.guildId,
      queue: surahs,
      index: 0,
      action: 'set'
    });

    return surahs;
  }

  /**
   * Add surah to queue
   * @param {number} surah - Surah number to add
   */
  addToQueue(surah) {
    const state = this.stateManager.getState();
    const newQueue = [...state.queue, surah];
    this.stateManager.setQueue(newQueue);

    this.eventBus.emit('queue.changed', {
      guildId: this.guildId,
      queue: newQueue,
      index: state.queueIndex,
      action: 'add',
      surah
    });

    return newQueue;
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    this.stateManager.setQueue([]);

    this.eventBus.emit('queue.changed', {
      guildId: this.guildId,
      queue: [],
      index: 0,
      action: 'clear'
    });
  }

  /**
   * Get current surah
   */
  getCurrentSurah() {
    const state = this.stateManager.getState();
    if (state.queue.length === 0) return null;
    if (state.queueIndex >= state.queue.length) return null;
    return state.queue[state.queueIndex];
  }

  /**
   * Get next surah based on queue, repeat mode, and auto-next
   */
  getNextSurah() {
    const state = this.stateManager.getState();
    const currentIndex = state.queueIndex || 0;
    const queue = state.queue || [];

    // Check if has next in queue
    if (currentIndex < queue.length - 1) {
      return queue[currentIndex + 1];
    }

    // Check repeat mode
    if (state.repeat === 'all' && queue.length > 0) {
      return queue[0]; // Loop to beginning
    }

    // Check auto-next
    if (state.autoNext && state.moshaf) {
      const allSurahs = parseSurahList(state.moshaf.surah_list);
      const currentSurah = queue[currentIndex];
      const pos = allSurahs.indexOf(currentSurah);

      if (pos !== -1 && pos < allSurahs.length - 1) {
        return allSurahs[pos + 1];
      }
    }

    // No next surah
    return null;
  }

  /**
   * Get previous surah
   */
  getPreviousSurah() {
    const state = this.stateManager.getState();
    const currentIndex = state.queueIndex || 0;
    const queue = state.queue || [];

    if (currentIndex > 0) {
      return queue[currentIndex - 1];
    }

    return null;
  }

  /**
   * Skip to next surah
   */
  skipToNext() {
    const state = this.stateManager.getState();
    const currentIndex = state.queueIndex || 0;
    const queue = state.queue || [];

    // Can skip to next in queue
    if (currentIndex < queue.length - 1) {
      this.stateManager.setQueueIndex(currentIndex + 1);

      this.eventBus.emit('queue.changed', {
        guildId: this.guildId,
        queue,
        index: currentIndex + 1,
        action: 'skip_next'
      });

      return queue[currentIndex + 1];
    }

    // Repeat all - loop to beginning
    if (state.repeat === 'all' && queue.length > 0) {
      this.stateManager.setQueueIndex(0);

      this.eventBus.emit('queue.changed', {
        guildId: this.guildId,
        queue,
        index: 0,
        action: 'skip_next_loop'
      });

      return queue[0];
    }

    return null;
  }

  /**
   * Skip to previous surah
   */
  skipToPrevious() {
    const state = this.stateManager.getState();
    const currentIndex = state.queueIndex || 0;
    const queue = state.queue || [];

    if (currentIndex > 0) {
      this.stateManager.setQueueIndex(currentIndex - 1);

      this.eventBus.emit('queue.changed', {
        guildId: this.guildId,
        queue,
        index: currentIndex - 1,
        action: 'skip_previous'
      });

      return queue[currentIndex - 1];
    }

    return null;
  }

  /**
   * Check if can skip to next
   */
  canSkipNext() {
    const state = this.stateManager.getState();
    const currentIndex = state.queueIndex || 0;
    const queue = state.queue || [];

    return currentIndex < queue.length - 1 || state.repeat === 'all';
  }

  /**
   * Check if can skip to previous
   */
  canSkipPrevious() {
    const state = this.stateManager.getState();
    const currentIndex = state.queueIndex || 0;

    return currentIndex > 0;
  }

  /**
   * Get queue length
   */
  getQueueLength() {
    const state = this.stateManager.getState();
    return state.queue.length;
  }

  /**
   * Get current queue index
   */
  getCurrentIndex() {
    const state = this.stateManager.getState();
    return state.queueIndex;
  }
}

module.exports = QueueManager;
