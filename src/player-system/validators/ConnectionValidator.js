"use strict";

const { PermissionFlagsBits } = require("discord.js");
const { PermissionError, InvalidChannelError } = require("../errors/ErrorTypes");

/**
 * ConnectionValidator - Validates voice connection operations
 */
class ConnectionValidator {
  /**
   * Validate voice channel
   * @param {VoiceChannel} channel - Voice channel to validate
   * @throws {InvalidChannelError} If channel is invalid
   * @throws {PermissionError} If bot lacks permissions
   */
  validateChannel(channel) {
    if (!channel) {
      throw new InvalidChannelError("Voice channel is required");
    }

    if (!channel.isVoiceBased || !channel.isVoiceBased()) {
      throw new InvalidChannelError("Channel must be a voice channel", {
        channelId: channel.id,
        channelType: channel.type
      });
    }

    // Check permissions
    const permissions = channel.permissionsFor(channel.guild.members.me);

    if (!permissions) {
      throw new PermissionError("Cannot determine bot permissions", {
        channelId: channel.id
      });
    }

    if (!permissions.has(PermissionFlagsBits.Connect)) {
      throw new PermissionError("Missing CONNECT permission", {
        channelId: channel.id,
        channelName: channel.name
      });
    }

    if (!permissions.has(PermissionFlagsBits.Speak)) {
      throw new PermissionError("Missing SPEAK permission", {
        channelId: channel.id,
        channelName: channel.name
      });
    }

    return true;
  }

  /**
   * Validate guild ID
   * @param {string} guildId - Guild ID to validate
   */
  validateGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string') {
      throw new InvalidChannelError("Valid guild ID is required", {
        guildId
      });
    }
    return true;
  }
}

module.exports = ConnectionValidator;
