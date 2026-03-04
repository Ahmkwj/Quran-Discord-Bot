"use strict";

const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection
} = require("@discordjs/voice");

const ConnectionStateMachine = require("../state-machines/ConnectionStateMachine");
const ConnectionValidator = require("../validators/ConnectionValidator");
const ReconnectionStrategy = require("../strategies/ReconnectionStrategy");
const {
  ConnectionTimeoutError,
  InvalidStateError
} = require("../errors/ErrorTypes");

const log = require("../../utils/logger");
const config = require("../../utils/config");

/**
 * ConnectionManager - Manages voice connection lifecycle
 */
class ConnectionManager {
  constructor(guildId, eventBus, discordClient) {
    this.guildId = guildId;
    this.eventBus = eventBus;
    this.discordClient = discordClient;
    this.stateMachine = new ConnectionStateMachine();
    this.validator = new ConnectionValidator();
    this.reconnectionStrategy = new ReconnectionStrategy(eventBus);

    this.connection = null;
    this.channelId = null;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
  }

  /**
   * Connect to a voice channel
   * @param {VoiceChannel} voiceChannel - Discord voice channel
   */
  async connect(voiceChannel) {
    // Validate can transition to CONNECTING
    if (!this.stateMachine.can('connect')) {
      throw new InvalidStateError(
        `Cannot connect from state: ${this.stateMachine.getState()}`,
        { currentState: this.stateMachine.getState() }
      );
    }

    // Validate channel permissions
    this.validator.validateChannel(voiceChannel);

    // Transition state
    this.stateMachine.transition('connect');
    this.eventBus.emit('connection.connecting', {
      guildId: this.guildId,
      channelId: voiceChannel.id
    });

    log.info("CONNECT", `Connecting to voice channel: ${voiceChannel.name}`);

    // Safely destroy existing connection if any
    await this.safeDestroyExisting();

    // Create new connection
    const conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    // Wait for ready with timeout
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 15_000);
    } catch (err) {
      this.stateMachine.transition('error');
      this.safeDestroy(conn);
      throw new ConnectionTimeoutError(
        "Failed to establish voice connection within 15 seconds",
        { channelId: voiceChannel.id }
      );
    }

    // Setup disconnect handler
    this.setupDisconnectHandler(conn);

    // Success
    this.connection = conn;
    this.channelId = voiceChannel.id;
    this.reconnectAttempts = 0; // Reset attempts on successful connection
    this.stateMachine.transition('ready');

    this.eventBus.emit('connection.ready', {
      guildId: this.guildId,
      channelId: voiceChannel.id
    });

    log.success("CONNECT", `Connected to voice channel: ${voiceChannel.name}`);
  }

  /**
   * Disconnect from voice channel
   */
  async disconnect() {
    if (!this.connection) return;

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Destroy connection
    await this.safeDestroy(this.connection);

    this.connection = null;
    this.channelId = null;
    this.reconnectAttempts = 0;

    if (this.stateMachine.can('disconnect')) {
      this.stateMachine.transition('disconnect');
    }

    this.eventBus.emit('connection.disconnected', {
      guildId: this.guildId
    });

    log.info("DISCONNECT", `Disconnected from voice channel`);
  }

  /**
   * Destroy connection manager and cleanup
   */
  destroy() {
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Destroy connection
    if (this.connection) {
      this.safeDestroy(this.connection);
      this.connection = null;
    }

    this.channelId = null;
    this.reconnectAttempts = 0;

    if (this.stateMachine.can('destroy')) {
      this.stateMachine.transition('destroy');
    }

    log.info("DESTROY", `Connection manager destroyed for guild ${this.guildId}`);
  }

  /**
   * Subscribe audio player to connection
   * @param {AudioPlayer} audioPlayer
   */
  subscribe(audioPlayer) {
    if (!this.connection) {
      throw new InvalidStateError("No active connection to subscribe to");
    }

    if (!this.isReady()) {
      throw new InvalidStateError("Connection is not ready");
    }

    return this.connection.subscribe(audioPlayer);
  }

  /**
   * Unsubscribe from connection
   */
  unsubscribe() {
    if (this.connection) {
      this.connection.subscribe(null);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return this.stateMachine.getState();
  }

  /**
   * Check if ready
   */
  isReady() {
    return this.stateMachine.isReady();
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connection !== null && !this.stateMachine.isDestroyed();
  }

  /**
   * Get channel ID
   */
  getChannelId() {
    return this.channelId;
  }

  /**
   * Safely destroy existing connection
   */
  async safeDestroyExisting() {
    const existing = getVoiceConnection(this.guildId);
    if (existing) {
      this.safeDestroy(existing);
    }
  }

  /**
   * Safely destroy a connection
   * @param {VoiceConnection} connection
   */
  safeDestroy(connection) {
    try {
      if (connection?.state?.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    } catch (err) {
      log.error("SAFE_DESTROY", err, { stack: false });
    }
  }

  /**
   * Setup disconnect handler for reconnection
   * @param {VoiceConnection} conn
   */
  setupDisconnectHandler(conn) {
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Try quick reconnect
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5_000)
        ]);
        // Successfully reconnected quickly
      } catch {
        // Network disconnect - need to reconnect
        log.warn("DISCONNECT", "Voice connection lost, attempting reconnection");

        if (this.stateMachine.can('reconnect')) {
          this.stateMachine.transition('reconnect');
        }

        this.eventBus.emit('connection.disconnected', {
          guildId: this.guildId,
          willReconnect: true
        });

        // Attempt reconnection if bound channel exists
        const bound = config.getBoundChannel(this.guildId);
        if (bound && this.discordClient) {
          await this.attemptReconnection();
        } else {
          this.destroy();
        }
      }
    });
  }

  /**
   * Attempt reconnection with backoff
   */
  async attemptReconnection() {
    if (this.reconnectAttempts >= 5) {
      log.error("RECONNECT_MAX", new Error("Max reconnection attempts reached"));
      this.destroy();
      return;
    }

    const result = await this.reconnectionStrategy.attempt(this, this.reconnectAttempts);

    if (result.maxAttemptsReached) {
      this.destroy();
      return;
    }

    this.reconnectAttempts++;

    // Get bound channel and attempt connection
    const bound = config.getBoundChannel(this.guildId);
    if (!bound || !this.discordClient) {
      this.destroy();
      return;
    }

    try {
      const channel = await this.discordClient.channels.fetch(bound.voiceChannelId);
      if (!channel?.isVoiceBased()) {
        log.error("RECONNECT", new Error("Bound channel is not voice-based"));
        this.destroy();
        return;
      }

      // Clean up old connection
      await this.safeDestroyExisting();

      // Reset state machine for new connection
      if (this.stateMachine.can('retry')) {
        this.stateMachine.transition('retry');
      }

      // Attempt connection
      await this.connect(channel);

      log.success("RECONNECT", "Successfully reconnected to voice channel");
    } catch (err) {
      log.error("RECONNECT", err, { stack: false });

      // Retry if under max attempts
      if (this.reconnectAttempts < 5) {
        await this.attemptReconnection();
      } else {
        this.destroy();
      }
    }
  }
}

module.exports = ConnectionManager;
