"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { errReply, successReply } = require("../utils/panel");
const { requireOwner } = require("../utils/permissions");
const config = require("../utils/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removemod")
    .setDescription("Remove a user from bot moderators (Owner only)")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The user to remove from moderators")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction, errReply))) return;
    const user = interaction.options.getUser("user");
    const removed = config.removeMod(user.id);
    if (!removed) {
      return interaction.reply(errReply(`${user.tag} is not a moderator.`));
    }
    await interaction.reply(successReply(`${user.tag} has been removed from moderators.`));
  },
};
