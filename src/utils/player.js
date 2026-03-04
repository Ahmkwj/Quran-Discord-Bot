"use strict";

/**
 * LEGACY WRAPPER - Exports new PlayerFacade for backward compatibility
 *
 * This file now serves as a compatibility layer between the old monolithic
 * player system and the new modular player-system architecture.
 *
 * All functionality has been migrated to:
 * - src/player-system/PlayerFacade.js (main coordinator)
 * - src/player-system/core/* (core managers)
 * - src/player-system/state-machines/* (state management)
 * - src/player-system/errors/* (error handling)
 * - src/player-system/validators/* (input validation)
 * - src/player-system/strategies/* (cleanup & reconnection)
 */

const PlayerFacade = require("../player-system/PlayerFacade");

// Create singleton instance
const playerInstance = new PlayerFacade();

// Export the instance with all its methods
module.exports = playerInstance;
