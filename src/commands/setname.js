"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setname")
    .setDescription("Change the bot username (Owner/Mod only)")
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("New bot username (2-32 characters)")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errReply))) return;
    const name = interaction.options.getString("name").trim();
    if (!name || name.length < 2 || name.length > 32) {
      return interaction.reply(errReply("Provide a name (2–32 characters)."));
    }
    try {
      await interaction.client.user.setUsername(name);
      await interaction.reply(successReply(`Username updated. Bot username is now ${name}.`));
    } catch (err) {
      const msg = err.code === 50035
        ? "Username is invalid or was changed too recently. Discord allows 2 username changes per hour."
        : err.message;
      await interaction.reply(errReply(msg)).catch(() => {});
    }
  },
};
