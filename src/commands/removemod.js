"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwner } = require("../utils/permissions");
const config = require("../utils/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removemod")
    .setDescription("(Owner) Remove a user from bot moderators")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("User to remove from mods")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction, errEmbed))) return;
    const user = interaction.options.getUser("user");
    const removed = config.removeMod(user.id);
    if (!removed) {
      return interaction.reply({
        embeds: [errEmbed(`${user.tag} is not a mod.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.reply({
      embeds: [successEmbed("Mod removed", `${user.tag} has been removed from moderators.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
