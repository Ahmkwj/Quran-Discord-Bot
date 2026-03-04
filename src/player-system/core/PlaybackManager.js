"use strict";

const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType
} = require("@discordjs/voice");

const PlaybackStateMachine = require("../state-machines/PlaybackStateMachine");
const PlaybackValidator = require("../validators/PlaybackValidator");
const ResourceCleanupStrategy = require("../strategies/ResourceCleanupStrategy");
const {
  InvalidStateError,
  StreamFetchError
} = require("../errors/ErrorTypes");

const { fetchAudioStream } = require("../../utils/api");
const log = require("../../utils/logger");

/**
 * PlaybackManager - Manages audio playback
 */
class PlaybackManager {
  constructor(guildId, eventBus, stateManager) {
    this.guildId = guildId;
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.stateMachine = new PlaybackStateMachine();
    this.validator = new PlaybackValidator();
    this.cleanupStrategy = new ResourceCleanupStrategy();

    this.player = null;
    this.resource = null;
    this.stream = null;
    this.idleHandler = null;
  }

  /**
   * Start playing audio from URL
   * @param {string} audioUrl - URL to audio stream
   * @param {object} options - Playback options
   */
  async play(audioUrl, options = {}) {
    // Validate state
    if (!this.stateMachine.can('load')) {
      throw new InvalidStateError(
        `Cannot play from state: ${this.stateMachine.getState()}`,
        { currentState: this.stateMachine.getState() }
      );
    }

    // Validate inputs
    this.validator.validateUrl(audioUrl);

    // Transition to LOADING
    this.stateMachine.transition('load');
    this.eventBus.emit('playback.loading', {
      guildId: this.guildId,
      audioUrl
    });

    log.info("PLAYBACK", `Loading audio: ${audioUrl}`);

    // Clean up old resources
    await this.cleanupStrategy.cleanup(this);

    // Fetch stream with timeout
    let stream;
    try {
      stream = await this.fetchStreamWithTimeout(audioUrl, 120000);
    } catch (err) {
      this.stateMachine.transition('error');
      this.eventBus.emit('playback.error', {
        guildId: this.guildId,
        error: err
      });
      throw new StreamFetchError('Failed to fetch audio stream', {
        audioUrl,
        error: err.message
      });
    }

    // Create player and resource
    const player = createAudioPlayer();
    const resource = createAudioResource(stream, {
      inlineVolume: true,
      inputType: StreamType.Arbitrary
    });

    // Apply volume from state
    const volume = this.stateManager.getVolume();
    if (resource.volume) {
      resource.volume.setVolume(volume / 100);
    }

    // Setup player listeners
    this.setupPlayerListeners(player);

    // Start playback
    player.play(resource);

    // Save references
    this.player = player;
    this.resource = resource;
    this.stream = stream;

    // Transition to PLAYING
    this.stateMachine.transition('play');
    this.eventBus.emit('playback.playing', {
      guildId: this.guildId,
      audioUrl
    });

    log.success("PLAYBACK", `Now playing: ${audioUrl}`);
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this.stateMachine.can('pause')) {
      return false;
    }

    if (!this.player) {
      return false;
    }

    this.player.pause();
    this.stateMachine.transition('pause');

    this.eventBus.emit('playback.paused', {
      guildId: this.guildId
    });

    log.info("PLAYBACK", "Playback paused");
    return true;
  }

  /**
   * Resume playback
   */
  resume() {
    if (!this.stateMachine.can('resume')) {
      return false;
    }

    if (!this.player) {
      return false;
    }

    this.player.unpause();
    this.stateMachine.transition('resume');

    this.eventBus.emit('playback.playing', {
      guildId: this.guildId
    });

    log.info("PLAYBACK", "Playback resumed");
    return true;
  }

  /**
   * Stop playback
   */
  stop() {
    if (!this.stateMachine.can('stop')) {
      // Already stopped or idle
      return false;
    }

    // Cleanup resources
    this.cleanupStrategy.cleanup(this);

    this.stateMachine.transition('stop');

    this.eventBus.emit('playback.stopped', {
      guildId: this.guildId
    });

    log.info("PLAYBACK", "Playback stopped");
    return true;
  }

  /**
   * Set volume
   * @param {number} level - Volume level (0-100)
   */
  setVolume(level) {
    // Update state
    this.stateManager.setVolume(level);

    // Apply to current resource
    if (this.resource?.volume) {
      this.resource.volume.setVolume(level / 100);
    }

    log.info("VOLUME", `Volume set to ${level}%`);
    return level;
  }

  /**
   * Get current state
   */
  getState() {
    return this.stateMachine.getState();
  }

  /**
   * Check if playing
   */
  isPlaying() {
    return this.stateMachine.isPlaying();
  }

  /**
   * Check if paused
   */
  isPaused() {
    return this.stateMachine.isPaused();
  }

  /**
   * Get audio player
   */
  getPlayer() {
    return this.player;
  }

  /**
   * Get audio resource
   */
  getResource() {
    return this.resource;
  }

  /**
   * Fetch stream with timeout
   * @param {string} url - Audio URL
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  async fetchStreamWithTimeout(url, timeoutMs) {
    return Promise.race([
      fetchAudioStream(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Stream fetch timeout")), timeoutMs)
      )
    ]);
  }

  /**
   * Setup player event listeners
   * @param {AudioPlayer} player
   */
  setupPlayerListeners(player) {
    // Track ended (goes to Idle)
    const idleHandler = () => {
      log.info("PLAYBACK", "Track ended");

      if (this.stateMachine.can('stop')) {
        this.stateMachine.transition('stop');
      }

      this.eventBus.emit('playback.trackEnded', {
        guildId: this.guildId
      });
    };

    this.idleHandler = idleHandler;
    player.on(AudioPlayerStatus.Idle, idleHandler);

    // Playback error
    player.on('error', (err) => {
      log.error("PLAYER", err, { stack: false });

      if (this.stateMachine.can('error')) {
        this.stateMachine.transition('error');
      }

      this.eventBus.emit('playback.error', {
        guildId: this.guildId,
        error: err
      });
    });
  }

  /**
   * Reset playback manager
   */
  reset() {
    this.cleanupStrategy.cleanup(this);

    if (this.stateMachine.can('reset')) {
      this.stateMachine.transition('reset');
    }
  }

  /**
   * Destroy playback manager
   */
  destroy() {
    this.cleanupStrategy.cleanup(this);
    this.stateMachine.reset();
  }
}

module.exports = PlaybackManager;
