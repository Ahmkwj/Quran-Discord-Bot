"use strict";

const StateValidator = require("../validators/StateValidator");

/**
 * StateManager - Manages guild state with validation and events
 */
class StateManager {
  constructor(guildId, eventBus) {
    this.guildId = guildId;
    this.eventBus = eventBus;
    this.validator = new StateValidator();
    this.state = this.createDefaultState();
  }

  /**
   * Create default state
   */
  createDefaultState() {
    return {
      guildId: this.guildId,
      reciter: null,
      moshaf: null,
      volume: parseInt(process.env.DEFAULT_VOLUME) || 80,
      repeat: 'none',
      autoNext: true,
      controlChannelId: null,
      controlMsgId: null,
      voiceChannelId: null,
      queue: [],
      queueIndex: 0
    };
  }

  /**
   * Get complete state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Update state with partial updates
   * @param {object} updates - Partial state updates
   */
  updateState(updates) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      oldState,
      newState: this.getState(),
      updates
    });

    return this.getState();
  }

  /**
   * Reset state to defaults
   */
  resetState() {
    const oldState = { ...this.state };
    this.state = this.createDefaultState();

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      oldState,
      newState: this.getState(),
      reset: true
    });

    return this.getState();
  }

  /**
   * Set reciter
   * @param {object} reciter - Reciter object
   */
  setReciter(reciter) {
    const oldValue = this.state.reciter;
    this.state.reciter = reciter;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'reciter',
      oldValue,
      newValue: reciter
    });

    return reciter;
  }

  /**
   * Set moshaf
   * @param {object} moshaf - Moshaf object
   */
  setMoshaf(moshaf) {
    const oldValue = this.state.moshaf;
    this.state.moshaf = moshaf;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'moshaf',
      oldValue,
      newValue: moshaf
    });

    return moshaf;
  }

  /**
   * Set volume with validation
   * @param {number} volume - Volume level (0-100)
   */
  setVolume(volume) {
    this.validator.validateVolume(volume);

    const oldValue = this.state.volume;
    this.state.volume = Math.max(0, Math.min(100, volume));

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'volume',
      oldValue,
      newValue: this.state.volume
    });

    return this.state.volume;
  }

  /**
   * Set repeat mode with validation
   * @param {string} mode - Repeat mode ('none', 'one', 'all')
   */
  setRepeat(mode) {
    this.validator.validateRepeatMode(mode);

    const oldValue = this.state.repeat;
    this.state.repeat = mode;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'repeat',
      oldValue,
      newValue: mode
    });

    return mode;
  }

  /**
   * Cycle through repeat modes
   */
  cycleRepeat() {
    const modes = ['none', 'one', 'all'];
    const currentIndex = modes.indexOf(this.state.repeat);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    return this.setRepeat(nextMode);
  }

  /**
   * Set auto-next
   * @param {boolean} enabled
   */
  setAutoNext(enabled) {
    const oldValue = this.state.autoNext;
    this.state.autoNext = Boolean(enabled);

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'autoNext',
      oldValue,
      newValue: this.state.autoNext
    });

    return this.state.autoNext;
  }

  /**
   * Set control message
   * @param {string} channelId
   * @param {string} msgId
   */
  setControlMessage(channelId, msgId) {
    this.state.controlChannelId = channelId;
    this.state.controlMsgId = msgId;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'controlMessage',
      newValue: { channelId, msgId }
    });

    return { channelId, msgId };
  }

  /**
   * Set voice channel ID
   * @param {string} channelId
   */
  setVoiceChannelId(channelId) {
    const oldValue = this.state.voiceChannelId;
    this.state.voiceChannelId = channelId;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'voiceChannelId',
      oldValue,
      newValue: channelId
    });

    return channelId;
  }

  /**
   * Set queue
   * @param {Array<number>} queue - Array of surah numbers
   */
  setQueue(queue) {
    this.validator.validateQueue(queue);

    const oldValue = this.state.queue;
    this.state.queue = [...queue];
    this.state.queueIndex = 0;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'queue',
      oldValue,
      newValue: this.state.queue
    });

    return this.state.queue;
  }

  /**
   * Set queue index
   * @param {number} index
   */
  setQueueIndex(index) {
    this.validator.validateQueueIndex(index, this.state.queue.length);

    const oldValue = this.state.queueIndex;
    this.state.queueIndex = index;

    this.eventBus.emit('state.updated', {
      guildId: this.guildId,
      field: 'queueIndex',
      oldValue,
      newValue: index
    });

    return index;
  }

  // Getters

  getReciter() {
    return this.state.reciter;
  }

  getMoshaf() {
    return this.state.moshaf;
  }

  getVolume() {
    return this.state.volume;
  }

  getRepeat() {
    return this.state.repeat;
  }

  isAutoNext() {
    return this.state.autoNext;
  }

  getQueue() {
    return [...this.state.queue];
  }

  getQueueIndex() {
    return this.state.queueIndex;
  }

  getControlMessage() {
    return {
      channelId: this.state.controlChannelId,
      msgId: this.state.controlMsgId
    };
  }

  getVoiceChannelId() {
    return this.state.voiceChannelId;
  }
}

module.exports = StateManager;
