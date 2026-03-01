"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setavatar")
    .setDescription("Set the bot avatar (Owner/Mod only)")
    .addAttachmentOption(option =>
      option
        .setName("image")
        .setDescription("Avatar image (must be under 256KB)")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errReply))) return;
    const attachment = interaction.options.getAttachment("image");
    if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
      return interaction.reply(errReply("Please provide an image file."));
    }
    try {
      await interaction.client.user.setAvatar(attachment.url);
      await interaction.reply(successReply("Avatar updated. The bot avatar has been changed."));
    } catch (err) {
      const msg =
        err.code === 50035
          ? "Image is too large or invalid. Avatars must be under 256KB."
          : err.message;
      await interaction.reply(errReply(msg)).catch(() => {});
    }
  },
};
