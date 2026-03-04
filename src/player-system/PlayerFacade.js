"use strict";

const { ActivityType } = require("discord.js");
const { buildUrl } = require("../utils/api");
const { buildPanel } = require("../utils/panel");
const config = require("../utils/config");
const log = require("../utils/logger");

// Core modules
const EventBus = require("./core/EventBus");
const ConnectionManager = require("./core/ConnectionManager");
const PlaybackManager = require("./core/PlaybackManager");
const StateManager = require("./core/StateManager");
const QueueManager = require("./core/QueueManager");

// Error handling
const ErrorHandler = require("./errors/ErrorHandler");
const { getSurah } = require("../utils/surahs");

/**
 * PlayerFacade - Main public API coordinating all player subsystems
 * Maintains backward compatibility with old player.js API
 */
class PlayerFacade {
  constructor(discordClient = null) {
    this.discordClient = discordClient;
    this.guilds = new Map();
  }

  /**
   * Set Discord client
   * @param {Client} client
   */
  setClient(client) {
    this.discordClient = client;

    // Update all existing connection managers
    for (const [guildId, managers] of this.guilds) {
      managers.connectionManager.discordClient = client;
    }
  }

  /**
   * Get or create managers for a guild
   * @param {string} guildId
   */
  getManagers(guildId) {
    if (!this.guilds.has(guildId)) {
      const eventBus = new EventBus();
      const stateManager = new StateManager(guildId, eventBus);
      const connectionManager = new ConnectionManager(guildId, eventBus, this.discordClient);
      const playbackManager = new PlaybackManager(guildId, eventBus, stateManager);
      const queueManager = new QueueManager(guildId, eventBus, stateManager);
      const errorHandler = new ErrorHandler(eventBus, log);

      // Setup event listeners
      this.setupEventListeners(guildId, eventBus);

      this.guilds.set(guildId, {
        eventBus,
        stateManager,
        connectionManager,
        playbackManager,
        queueManager,
        errorHandler
      });
    }

    return this.guilds.get(guildId);
  }

  /**
   * Setup event listeners for automatic updates
   * @param {string} guildId
   * @param {EventBus} eventBus
   */
  setupEventListeners(guildId, eventBus) {
    // Update panel on playback changes
    eventBus.on('playback.playing', () => {
      this.updatePanel(guildId);
      this.updatePresence();
    });

    eventBus.on('playback.paused', () => {
      this.updatePanel(guildId);
      this.updatePresence();
    });

    eventBus.on('playback.stopped', () => {
      this.updatePanel(guildId);
      this.updatePresence();
    });

    // Handle track end
    eventBus.on('playback.trackEnded', async () => {
      await this.handleTrackEnd(guildId);
    });

    // Handle playback errors
    eventBus.on('playback.error', async () => {
      const { stateManager } = this.getManagers(guildId);
      await this.updatePanel(guildId);
      this.updatePresence();
    });

    // Handle connection ready
    eventBus.on('connection.ready', (data) => {
      log.success("CONNECTION", `Connected to voice in guild ${guildId}`);
    });
  }

  /**
   * Handle track end (auto-advance logic)
   * @param {string} guildId
   */
  async handleTrackEnd(guildId) {
    const { stateManager, queueManager } = this.getManagers(guildId);
    const state = stateManager.getState();
    const currentSurah = queueManager.getCurrentSurah();

    // Handle repeat one
    if (state.repeat === 'one' && currentSurah) {
      await this.startPlayback(guildId, currentSurah);
      return;
    }

    // Try to get next surah
    const nextSurah = queueManager.getNextSurah();

    if (nextSurah) {
      // Auto-advance to next surah
      if (state.repeat !== 'all' && queueManager.getCurrentIndex() < queueManager.getQueueLength() - 1) {
        queueManager.skipToNext();
      } else if (state.repeat === 'all') {
        queueManager.skipToNext();
      } else if (state.autoNext) {
        // Add to queue
        queueManager.addToQueue(nextSurah);
        queueManager.skipToNext();
      }

      await this.startPlayback(guildId, nextSurah);
    } else {
      // No more tracks
      log.info("QUEUE", "Queue finished");
      await this.updatePanel(guildId);
      this.updatePresence();
    }
  }

  /**
   * Connect to voice channel
   * @param {VoiceChannel} voiceChannel
   */
  async connect(voiceChannel) {
    const guildId = voiceChannel.guild.id;
    const { connectionManager, stateManager } = this.getManagers(guildId);

    await connectionManager.connect(voiceChannel);
    stateManager.setVoiceChannelId(voiceChannel.id);
  }

  /**
   * Disconnect from voice channel
   * @param {string} guildId
   */
  async disconnect(guildId) {
    const { connectionManager, playbackManager, stateManager } = this.getManagers(guildId);

    // Stop playback
    playbackManager.stop();

    // Disconnect from voice
    await connectionManager.disconnect();

    // Clear queue
    stateManager.setQueue([]);
    stateManager.setVoiceChannelId(null);

    this.updatePresence();
  }

  /**
   * Start playback of a surah
   * @param {string} guildId
   * @param {number} surahNumber
   */
  async startPlayback(guildId, surahNumber) {
    const {
      connectionManager,
      playbackManager,
      stateManager,
      queueManager,
      errorHandler
    } = this.getManagers(guildId);

    // Validate connection
    if (!connectionManager.isReady()) {
      throw new Error("No voice connection established. Please connect to a voice channel first.");
    }

    const state = stateManager.getState();

    // Validate moshaf
    if (!state.moshaf) {
      throw new Error("No moshaf selected. Please select a reciter first.");
    }

    if (!state.moshaf.server) {
      throw new Error("Invalid moshaf - missing server URL");
    }

    // Validate surah number
    if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
      throw new Error(`Invalid surah number: ${surahNumber}`);
    }

    // Build URL
    const url = buildUrl(state.moshaf.server, surahNumber);

    log.info("PLAYBACK", `Starting playback: Surah ${surahNumber} from ${state.reciter?.name || 'Unknown reciter'}`);

    try {
      // Start playback
      await playbackManager.play(url);

      // Subscribe player to connection
      connectionManager.subscribe(playbackManager.getPlayer());

      // Update panel happens automatically via events
    } catch (err) {
      await errorHandler.handle(err, { guildId, surahNumber });
      throw err;
    }
  }

  /**
   * Start new playback and send new panel
   * @param {string} guildId
   * @param {number} surahNumber
   */
  async startNewPlayback(guildId, surahNumber) {
    const { stateManager, queueManager } = this.getManagers(guildId);

    // Set queue
    queueManager.setQueue([surahNumber]);

    // Start playback
    await this.startPlayback(guildId, surahNumber);

    // Delete old messages and send new panel
    const state = stateManager.getState();
    if (state.controlChannelId && this.discordClient) {
      try {
        const ch = await this.discordClient.channels.fetch(state.controlChannelId);
        if (ch?.isTextBased?.()) {
          const recent = await ch.messages.fetch({ limit: 50 });
          const botMessages = recent.filter(m => m.author.id === this.discordClient.user.id);

          for (const [, msg] of botMessages) {
            try {
              await msg.delete();
              await new Promise(r => setTimeout(r, 100));
            } catch (err) {
              if (err.code !== 10008) {
                log.error("DELETE_OLD", err, { stack: false });
              }
            }
          }
        }
      } catch (e) {
        log.error("DELETE_OLD", e, { stack: false });
      }
    }

    await this.sendNewPanel(guildId);
  }

  /**
   * Pause playback
   * @param {string} guildId
   */
  pause(guildId) {
    const { playbackManager } = this.getManagers(guildId);
    return playbackManager.pause();
  }

  /**
   * Resume playback
   * @param {string} guildId
   */
  resume(guildId) {
    const { playbackManager } = this.getManagers(guildId);
    return playbackManager.resume();
  }

  /**
   * Stop playback
   * @param {string} guildId
   */
  stopPlayback(guildId) {
    const { playbackManager } = this.getManagers(guildId);
    playbackManager.stop();
  }

  /**
   * Skip to next track
   * @param {string} guildId
   */
  async skipNext(guildId) {
    const { queueManager } = this.getManagers(guildId);

    const nextSurah = queueManager.skipToNext();
    if (nextSurah) {
      await this.startPlayback(guildId, nextSurah);
      return true;
    }

    return false;
  }

  /**
   * Skip to previous track
   * @param {string} guildId
   */
  async skipPrev(guildId) {
    const { queueManager } = this.getManagers(guildId);

    const prevSurah = queueManager.skipToPrevious();
    if (prevSurah) {
      await this.startPlayback(guildId, prevSurah);
      return true;
    }

    return false;
  }

  /**
   * Set volume
   * @param {string} guildId
   * @param {number} volume
   */
  setVolume(guildId, volume) {
    const { playbackManager } = this.getManagers(guildId);
    return playbackManager.setVolume(volume);
  }

  /**
   * Cycle repeat mode
   * @param {string} guildId
   */
  cycleRepeat(guildId) {
    const { stateManager } = this.getManagers(guildId);
    return stateManager.cycleRepeat();
  }

  /**
   * Get guild state (backward compatible)
   * @param {string} guildId
   */
  get(guildId) {
    const { stateManager, playbackManager, connectionManager } = this.getManagers(guildId);

    // Create a proxy that allows direct property access while maintaining compatibility
    // This allows old code like `s.controlChannelId = channel.id` to work
    const state = stateManager.state; // Direct reference for backward compatibility

    // Add computed properties
    Object.defineProperty(state, 'playing', {
      get: () => playbackManager.isPlaying(),
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(state, 'paused', {
      get: () => playbackManager.isPaused(),
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(state, 'connection', {
      get: () => connectionManager.connection,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(state, 'player', {
      get: () => playbackManager.getPlayer(),
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(state, 'resource', {
      get: () => playbackManager.getResource(),
      enumerable: true,
      configurable: true
    });

    return state;
  }

  /**
   * Reset to welcome state
   * @param {string} guildId
   */
  async resetToWelcome(guildId) {
    const { playbackManager, stateManager } = this.getManagers(guildId);

    // Stop playback
    playbackManager.stop();

    // Reset state
    stateManager.resetState();

    // Delete old message
    const state = stateManager.getState();
    if (state.controlChannelId && state.controlMsgId && this.discordClient) {
      try {
        const ch = await this.discordClient.channels.fetch(state.controlChannelId);
        if (ch?.isTextBased?.()) {
          try {
            const msg = await ch.messages.fetch(state.controlMsgId);
            await msg.delete();
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Send new panel
    await this.sendNewPanel(guildId);
    this.updatePresence();
  }

  /**
   * Destroy guild player
   * @param {string} guildId
   */
  destroy(guildId) {
    const managers = this.guilds.get(guildId);
    if (!managers) return;

    // Cleanup all managers
    managers.playbackManager.destroy();
    managers.connectionManager.destroy();
    managers.eventBus.removeAllListeners();

    // Remove from map
    this.guilds.delete(guildId);

    log.info("DESTROY", `Player destroyed for guild ${guildId}`);
  }

  /**
   * Send new panel
   * @param {string} guildId
   */
  async sendNewPanel(guildId) {
    const { stateManager } = this.getManagers(guildId);
    const state = stateManager.getState();

    if (!state.controlChannelId || !this.discordClient) return;

    try {
      const ch = await this.discordClient.channels.fetch(state.controlChannelId);
      if (!ch?.isTextBased?.()) return;

      const { embeds, components } = buildPanel(this.get(guildId));
      const msg = await ch.send({ embeds, components });

      stateManager.setControlMessage(state.controlChannelId, msg.id);
    } catch (e) {
      log.error("SEND_PANEL", e, { stack: false });
    }
  }

  /**
   * Update panel
   * @param {string} guildId
   */
  async updatePanel(guildId) {
    const { stateManager } = this.getManagers(guildId);
    const state = stateManager.getState();

    if (!state.controlChannelId || !state.controlMsgId || !this.discordClient) return;

    try {
      const ch = await this.discordClient.channels.fetch(state.controlChannelId);
      if (!ch?.isTextBased?.()) return;

      const msg = await ch.messages.fetch(state.controlMsgId);
      const { embeds, components } = buildPanel(this.get(guildId));
      await msg.edit({ embeds, components });
    } catch (e) {
      if (e.code === 10003 || e.code === 10008) {
        stateManager.setControlMessage(state.controlChannelId, null);
        await this.sendNewPanel(guildId);
      } else {
        log.error("UPDATE_PANEL", e, { stack: false });
      }
    }
  }

  /**
   * Update bot presence
   */
  updatePresence() {
    if (!this.discordClient?.user) return;

    const defaultActivity = config.getActivity();
    const defaultType = {
      Playing: ActivityType.Playing,
      Listening: ActivityType.Listening,
      Watching: ActivityType.Watching,
      Competing: ActivityType.Competing
    }[defaultActivity.type] || ActivityType.Playing;

    // Check if any guild is playing
    for (const [guildId, managers] of this.guilds) {
      const { playbackManager, queueManager } = managers;

      if (playbackManager.isPlaying() || playbackManager.isPaused()) {
        const currentSurah = queueManager.getCurrentSurah();
        if (currentSurah) {
          const surah = getSurah(currentSurah);
          const label = surah ? `Surah ${surah.en}` : "Quran";
          const name = playbackManager.isPaused() ? `Paused · ${label}` : label;

          this.discordClient.user.setPresence({
            activities: [{ name, type: ActivityType.Listening }],
            status: "online"
          });
          return;
        }
      }
    }

    // No active playback
    this.discordClient.user.setPresence({
      activities: [{ name: defaultActivity.name || "Use play to begin", type: defaultType }],
      status: "online"
    });
  }
}

module.exports = PlayerFacade;
