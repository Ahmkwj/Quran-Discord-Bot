"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setavatar")
    .setDescription("(Owner/Mod) Set the bot avatar from an image attachment")
    .addAttachmentOption((o) =>
      o
        .setName("image")
        .setDescription("Image file for the new avatar")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errEmbed))) return;
    const attachment = interaction.options.getAttachment("image");
    if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
      return interaction.reply({
        embeds: [errEmbed("Please provide an image file (PNG, JPG, or GIF).")],
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await interaction.client.user.setAvatar(attachment.url);
      await interaction.editReply({
        embeds: [successEmbed("Avatar updated", "The bot avatar has been changed.")],
      });
    } catch (err) {
      const msg = err.code === 50035 ? "Image may be too large or invalid. Max 256KB for avatars." : err.message;
      await interaction.editReply({ embeds: [errEmbed(msg)] }).catch(() => {});
    }
  },
};
