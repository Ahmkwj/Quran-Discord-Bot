"use strict";

/**
 * PlaybackStateMachine - Manages audio playback state transitions
 *
 * States: IDLE → LOADING → PLAYING → STOPPED
 *                  ↓          ↕
 *                ERROR     PAUSED
 *
 * Valid transitions:
 * - IDLE → LOADING (load)
 * - LOADING → PLAYING (play)
 * - LOADING → ERROR (error)
 * - PLAYING → PAUSED (pause)
 * - PLAYING → STOPPED (stop)
 * - PLAYING → ERROR (error)
 * - PAUSED → PLAYING (resume)
 * - PAUSED → STOPPED (stop)
 * - STOPPED → IDLE (reset)
 * - ERROR → IDLE (reset)
 */
class PlaybackStateMachine {
  static STATES = {
    IDLE: 'IDLE',
    LOADING: 'LOADING',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED',
    ERROR: 'ERROR'
  };

  static TRANSITIONS = {
    load: {
      from: ['IDLE', 'STOPPED'],
      to: 'LOADING'
    },
    play: {
      from: ['LOADING'],
      to: 'PLAYING'
    },
    pause: {
      from: ['PLAYING'],
      to: 'PAUSED'
    },
    resume: {
      from: ['PAUSED'],
      to: 'PLAYING'
    },
    stop: {
      from: ['LOADING', 'PLAYING', 'PAUSED'],
      to: 'STOPPED'
    },
    error: {
      from: ['LOADING', 'PLAYING', 'PAUSED'],
      to: 'ERROR'
    },
    reset: {
      from: ['STOPPED', 'ERROR'],
      to: 'IDLE'
    }
  };

  constructor(initialState = PlaybackStateMachine.STATES.IDLE) {
    this.currentState = initialState;
    this.history = [initialState];
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if a transition is valid
   * @param {string} transition - Transition name
   */
  can(transition) {
    const rule = PlaybackStateMachine.TRANSITIONS[transition];
    if (!rule) return false;
    return rule.from.includes(this.currentState);
  }

  /**
   * Attempt a state transition
   * @param {string} transition - Transition name
   * @throws {Error} If transition is invalid
   */
  transition(transition) {
    if (!this.can(transition)) {
      throw new Error(
        `Invalid transition "${transition}" from state "${this.currentState}"`
      );
    }

    const rule = PlaybackStateMachine.TRANSITIONS[transition];
    const previousState = this.currentState;
    this.currentState = rule.to;
    this.history.push(this.currentState);

    return {
      from: previousState,
      to: this.currentState,
      transition
    };
  }

  /**
   * Check if in a specific state
   * @param {string} state - State to check
   */
  is(state) {
    return this.currentState === state;
  }

  /**
   * Check if currently playing
   */
  isPlaying() {
    return this.currentState === PlaybackStateMachine.STATES.PLAYING;
  }

  /**
   * Check if paused
   */
  isPaused() {
    return this.currentState === PlaybackStateMachine.STATES.PAUSED;
  }

  /**
   * Check if idle
   */
  isIdle() {
    return this.currentState === PlaybackStateMachine.STATES.IDLE;
  }

  /**
   * Check if in an active state (not idle or stopped)
   */
  isActive() {
    return [
      PlaybackStateMachine.STATES.LOADING,
      PlaybackStateMachine.STATES.PLAYING,
      PlaybackStateMachine.STATES.PAUSED
    ].includes(this.currentState);
  }

  /**
   * Get state history
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.currentState = PlaybackStateMachine.STATES.IDLE;
    this.history = [this.currentState];
  }
}

module.exports = PlaybackStateMachine;
