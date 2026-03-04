"use strict";

const {
  InvalidSurahError,
  InvalidMoshafError,
  ValidationError
} = require("../errors/ErrorTypes");

/**
 * PlaybackValidator - Validates playback operations
 */
class PlaybackValidator {
  /**
   * Validate surah number
   * @param {number} surahNumber - Surah number (1-114)
   * @throws {InvalidSurahError} If surah number is invalid
   */
  validateSurahNumber(surahNumber) {
    if (typeof surahNumber !== 'number') {
      throw new InvalidSurahError("Surah number must be a number", {
        surahNumber,
        type: typeof surahNumber
      });
    }

    if (!Number.isInteger(surahNumber)) {
      throw new InvalidSurahError("Surah number must be an integer", {
        surahNumber
      });
    }

    if (surahNumber < 1 || surahNumber > 114) {
      throw new InvalidSurahError("Surah number must be between 1 and 114", {
        surahNumber
      });
    }

    return true;
  }

  /**
   * Validate moshaf configuration
   * @param {object} moshaf - Moshaf object
   * @throws {InvalidMoshafError} If moshaf is invalid
   */
  validateMoshaf(moshaf) {
    if (!moshaf) {
      throw new InvalidMoshafError("Moshaf is required");
    }

    if (typeof moshaf !== 'object') {
      throw new InvalidMoshafError("Moshaf must be an object", {
        type: typeof moshaf
      });
    }

    if (!moshaf.server) {
      throw new InvalidMoshafError("Moshaf must have a server URL", {
        moshaf
      });
    }

    if (typeof moshaf.server !== 'string') {
      throw new InvalidMoshafError("Moshaf server must be a string", {
        server: moshaf.server,
        type: typeof moshaf.server
      });
    }

    return true;
  }

  /**
   * Validate audio URL
   * @param {string} url - Audio URL
   * @throws {ValidationError} If URL is invalid
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new ValidationError("Valid URL is required", {
        url,
        type: typeof url
      });
    }

    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new ValidationError("URL must start with http:// or https://", {
        url
      });
    }

    return true;
  }
}

module.exports = PlaybackValidator;
