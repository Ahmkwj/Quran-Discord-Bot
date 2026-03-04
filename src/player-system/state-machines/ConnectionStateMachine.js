"use strict";

/**
 * ConnectionStateMachine - Manages voice connection state transitions
 *
 * States: DISCONNECTED → CONNECTING → READY → DESTROYED
 *                     ↓           ↑
 *                     ERROR → RECONNECTING
 *
 * Valid transitions:
 * - DISCONNECTED → CONNECTING (connect)
 * - CONNECTING → READY (ready)
 * - CONNECTING → ERROR (error)
 * - READY → DISCONNECTED (disconnect)
 * - READY → ERROR (error)
 * - ERROR → RECONNECTING (reconnect)
 * - RECONNECTING → CONNECTING (retry)
 * - ANY → DESTROYED (destroy)
 */
class ConnectionStateMachine {
  static STATES = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    READY: 'READY',
    ERROR: 'ERROR',
    RECONNECTING: 'RECONNECTING',
    DESTROYED: 'DESTROYED'
  };

  static TRANSITIONS = {
    connect: {
      from: ['DISCONNECTED', 'ERROR'],
      to: 'CONNECTING'
    },
    ready: {
      from: ['CONNECTING'],
      to: 'READY'
    },
    disconnect: {
      from: ['READY', 'CONNECTING'],
      to: 'DISCONNECTED'
    },
    error: {
      from: ['CONNECTING', 'READY', 'RECONNECTING'],
      to: 'ERROR'
    },
    reconnect: {
      from: ['ERROR', 'DISCONNECTED'],
      to: 'RECONNECTING'
    },
    retry: {
      from: ['RECONNECTING'],
      to: 'CONNECTING'
    },
    destroy: {
      from: ['DISCONNECTED', 'CONNECTING', 'READY', 'ERROR', 'RECONNECTING'],
      to: 'DESTROYED'
    }
  };

  constructor(initialState = ConnectionStateMachine.STATES.DISCONNECTED) {
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
    const rule = ConnectionStateMachine.TRANSITIONS[transition];
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

    const rule = ConnectionStateMachine.TRANSITIONS[transition];
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
   * Check if ready to handle connections
   */
  isReady() {
    return this.currentState === ConnectionStateMachine.STATES.READY;
  }

  /**
   * Check if destroyed
   */
  isDestroyed() {
    return this.currentState === ConnectionStateMachine.STATES.DESTROYED;
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
    this.currentState = ConnectionStateMachine.STATES.DISCONNECTED;
    this.history = [this.currentState];
  }
}

module.exports = ConnectionStateMachine;
