"use strict";

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const EMBED_COLOR = 0x3d3d3d;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all commands and their descriptions"),

  async execute(interaction) {
    const commands = interaction.client.commands;
    const lines = [];
    for (const [, cmd] of commands) {
      if (cmd.data && cmd.data.description) {
        const name = cmd.data.name;
        const desc = cmd.data.description;
        lines.push(`**/${name}** — ${desc}`);
      }
    }
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({
        name: "Quran Bot",
        iconURL: "https://i.imgur.com/8sEvHGj.png",
      })
      .setTitle("Commands")
      .setDescription(lines.join("\n"))
      .setTimestamp();
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
