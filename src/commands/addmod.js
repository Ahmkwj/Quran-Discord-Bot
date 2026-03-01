"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwner, isOwner } = require("../utils/permissions");
const config = require("../utils/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addmod")
    .setDescription("(Owner) Add a user as a bot moderator")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("User to add as mod")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction, errEmbed))) return;
    const user = interaction.options.getUser("user");
    if (isOwner(user.id)) {
      return interaction.reply({
        embeds: [errEmbed("The owner is already the owner. Use /removemod for others.")],
        flags: MessageFlags.Ephemeral,
      });
    }
    const added = config.addMod(user.id);
    if (!added) {
      return interaction.reply({
        embeds: [errEmbed(`${user.tag} is already a mod.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.reply({
      embeds: [successEmbed("Mod added", `${user.tag} (\`${user.id}\`) has been added as a moderator.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
