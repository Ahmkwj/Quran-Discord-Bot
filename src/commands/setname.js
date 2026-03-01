"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setname")
    .setDescription("(Owner/Mod) Change the bot username")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("New username (2–32 characters)")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(32)
    ),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errEmbed))) return;
    const name = interaction.options.getString("name").trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await interaction.client.user.setUsername(name);
      await interaction.editReply({
        embeds: [successEmbed("Username updated", `Bot username is now **${name}**.`)],
      });
    } catch (err) {
      const msg = err.code === 50035
        ? "Username may be invalid or changed too often (max 2 changes per hour)."
        : err.message;
      await interaction.editReply({ embeds: [errEmbed(msg)] }).catch(() => {});
    }
  },
};
