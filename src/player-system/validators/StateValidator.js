"use strict";

const { InvalidVolumeError, ValidationError } = require("../errors/ErrorTypes");

/**
 * StateValidator - Validates state management operations
 */
class StateValidator {
  /**
   * Validate volume level
   * @param {number} volume - Volume level (0-100)
   * @throws {InvalidVolumeError} If volume is invalid
   */
  validateVolume(volume) {
    if (typeof volume !== 'number') {
      throw new InvalidVolumeError("Volume must be a number", {
        volume,
        type: typeof volume
      });
    }

    if (!Number.isFinite(volume)) {
      throw new InvalidVolumeError("Volume must be a finite number", {
        volume
      });
    }

    if (volume < 0 || volume > 100) {
      throw new InvalidVolumeError("Volume must be between 0 and 100", {
        volume
      });
    }

    return true;
  }

  /**
   * Validate repeat mode
   * @param {string} mode - Repeat mode ('none', 'one', 'all')
   * @throws {ValidationError} If repeat mode is invalid
   */
  validateRepeatMode(mode) {
    const validModes = ['none', 'one', 'all'];

    if (typeof mode !== 'string') {
      throw new ValidationError("Repeat mode must be a string", {
        mode,
        type: typeof mode
      });
    }

    if (!validModes.includes(mode)) {
      throw new ValidationError(`Repeat mode must be one of: ${validModes.join(', ')}`, {
        mode,
        validModes
      });
    }

    return true;
  }

  /**
   * Validate queue
   * @param {Array} queue - Queue array
   * @throws {ValidationError} If queue is invalid
   */
  validateQueue(queue) {
    if (!Array.isArray(queue)) {
      throw new ValidationError("Queue must be an array", {
        type: typeof queue
      });
    }

    // Validate each item is a valid surah number
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (typeof item !== 'number' || item < 1 || item > 114) {
        throw new ValidationError(`Invalid surah number at queue index ${i}`, {
          index: i,
          value: item
        });
      }
    }

    return true;
  }

  /**
   * Validate queue index
   * @param {number} index - Queue index
   * @param {number} queueLength - Queue length
   * @throws {ValidationError} If index is invalid
   */
  validateQueueIndex(index, queueLength) {
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw new ValidationError("Queue index must be an integer", {
        index,
        type: typeof index
      });
    }

    if (index < 0 || index >= queueLength) {
      throw new ValidationError("Queue index out of bounds", {
        index,
        queueLength
      });
    }

    return true;
  }
}

module.exports = StateValidator;
