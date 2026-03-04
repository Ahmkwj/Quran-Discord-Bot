"use strict";

/**
 * Base error class for all player errors
 */
class PlayerError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Connection Errors
 */
class ConnectionError extends PlayerError {}

class ConnectionTimeoutError extends ConnectionError {
  constructor(message = "Connection timed out", context = {}) {
    super(message, context);
  }
}

class ConnectionLostError extends ConnectionError {
  constructor(message = "Connection lost", context = {}) {
    super(message, context);
  }
}

class PermissionError extends ConnectionError {
  constructor(message = "Missing required permissions", context = {}) {
    super(message, context);
  }
}

class InvalidStateError extends ConnectionError {
  constructor(message = "Invalid state for operation", context = {}) {
    super(message, context);
  }
}

/**
 * Playback Errors
 */
class PlaybackError extends PlayerError {}

class StreamFetchError extends PlaybackError {
  constructor(message = "Failed to fetch audio stream", context = {}) {
    super(message, context);
  }
}

class StreamCorruptedError extends PlaybackError {
  constructor(message = "Audio stream is corrupted", context = {}) {
    super(message, context);
  }
}

class PlaybackAbortedError extends PlaybackError {
  constructor(message = "Playback was aborted", context = {}) {
    super(message, context);
  }
}

/**
 * Validation Errors
 */
class ValidationError extends PlayerError {}

class InvalidSurahError extends ValidationError {
  constructor(message = "Invalid surah number", context = {}) {
    super(message, context);
  }
}

class InvalidMoshafError extends ValidationError {
  constructor(message = "Invalid moshaf configuration", context = {}) {
    super(message, context);
  }
}

class InvalidVolumeError extends ValidationError {
  constructor(message = "Invalid volume level", context = {}) {
    super(message, context);
  }
}

class InvalidChannelError extends ValidationError {
  constructor(message = "Invalid voice channel", context = {}) {
    super(message, context);
  }
}

/**
 * Queue Errors
 */
class QueueError extends PlayerError {}

class QueueEmptyError extends QueueError {
  constructor(message = "Queue is empty", context = {}) {
    super(message, context);
  }
}

class InvalidQueueIndexError extends QueueError {
  constructor(message = "Invalid queue index", context = {}) {
    super(message, context);
  }
}

module.exports = {
  PlayerError,
  // Connection errors
  ConnectionError,
  ConnectionTimeoutError,
  ConnectionLostError,
  PermissionError,
  InvalidStateError,
  // Playback errors
  PlaybackError,
  StreamFetchError,
  StreamCorruptedError,
  PlaybackAbortedError,
  // Validation errors
  ValidationError,
  InvalidSurahError,
  InvalidMoshafError,
  InvalidVolumeError,
  InvalidChannelError,
  // Queue errors
  QueueError,
  QueueEmptyError,
  InvalidQueueIndexError
};
