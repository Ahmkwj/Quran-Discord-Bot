"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all commands"),

  async execute(interaction) {
    const lines = [];
    for (const [, cmd] of interaction.client.commands) {
      if (cmd.data?.name && cmd.data?.description) {
        lines.push(`**/${cmd.data.name}** — ${cmd.data.description}`);
      }
    }
    const embed = new EmbedBuilder()
      .setColor(0x2b5f4a)
      .setAuthor({ name: "Quran Bot — Commands" })
      .setTitle("All commands")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Use slash commands: /command" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
