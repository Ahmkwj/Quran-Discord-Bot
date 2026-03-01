"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

const EXIT_DELAY_MS = 1500;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Restart the bot (Owner/Mod only) - requires process manager"),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errReply))) return;
    await interaction.reply(
      successReply(
        "Restarting. The bot will shut down and restart automatically if using a process manager."
      )
    );
    setTimeout(() => process.exit(0), EXIT_DELAY_MS);
  },
};
