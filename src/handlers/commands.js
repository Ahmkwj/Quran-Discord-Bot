'use strict';

const { errEmbed } = require('../utils/panel');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[Command /${interaction.commandName}]`, err);
      const payload = { embeds: [errEmbed(`Error: ${err.message}`)], ephemeral: true };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch (_) {}
    }
  }
};
