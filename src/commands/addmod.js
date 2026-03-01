"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { errReply, successReply } = require("../utils/panel");
const { requireOwner, isOwner } = require("../utils/permissions");
const config = require("../utils/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addmod")
    .setDescription("Add a user as a bot moderator (Owner only)")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The user to add as moderator")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction, errReply))) return;
    const user = interaction.options.getUser("user");
    if (isOwner(user.id)) {
      return interaction.reply(errReply("That user is the owner."));
    }
    const added = config.addMod(user.id);
    if (!added) {
      return interaction.reply(errReply(`${user.tag} is already a moderator.`));
    }
    await interaction.reply(successReply(`${user.tag} (${user.id}) has been added as a moderator.`));
  },
};
