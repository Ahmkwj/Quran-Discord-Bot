"use strict";

const { MessageFlags } = require("discord.js");
const { errEmbed } = require("../utils/panel");
const log = require("../utils/logger");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction);
    } catch (err) {
      log.error(`CMD /${interaction.commandName}`, err);
      const payload = {
        embeds: [errEmbed(`Error: ${err.message}`)],
        flags: MessageFlags.Ephemeral,
      };
      try {
        if (interaction.replied || interaction.deferred)
          await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch (_) {}
    }
  },
};
