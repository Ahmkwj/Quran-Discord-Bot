"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

const EXIT_DELAY_MS = 1500;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("(Owner/Mod) Restart the bot. Use with a process manager (e.g. PM2) for auto-restart."),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errEmbed))) return;
    await interaction.reply({
      embeds: [
        successEmbed(
          "Restarting",
          "The bot is shutting down. If you use a process manager (PM2, systemd, Docker, etc.), it will start again automatically."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    setTimeout(() => process.exit(0), EXIT_DELAY_MS);
  },
};
