"use strict";

const { SlashCommandBuilder, ChannelType, MessageFlags } = require("discord.js");
const player = require("../utils/player");
const { buildPanel, errEmbed } = require("../utils/panel");
const log = require("../utils/logger");
const { isOwnerOrMod, getOwnerId } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("start")
    .setDescription("Send the Quran bot control panel in this channel"),

  async execute(interaction) {
    const { guild, channel, member } = interaction;

    if (!isOwnerOrMod(interaction.user.id)) {
      const owner = getOwnerId();
      return interaction.reply({
        embeds: [
          errEmbed(
            owner
              ? "Only the bot owner and moderators can use this command."
              : "Bot owner is not configured. Set OWNER_ID in .env so the owner can use the bot."
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (channel.type !== ChannelType.GuildVoice) {
      return interaction.reply({
        embeds: [errEmbed(
          'This command works **only** in the text channel of a voice channel.\n' +
          'Go to a voice channel and run the command in its text channel.'
        )],
        flags: MessageFlags.Ephemeral
      });
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel || voiceChannel.id !== channel.id) {
      return interaction.reply({
        embeds: [errEmbed(
          'You must be in **this** voice channel to use the panel.'
        )],
        flags: MessageFlags.Ephemeral
      });
    }

    const botMember = guild.members.me;
    const perms = voiceChannel.permissionsFor(botMember);
    if (!perms.has('Connect') || !perms.has('Speak')) {
      return interaction.reply({
        embeds: [errEmbed(
          'I need **Connect** and **Speak** permissions in this voice channel.'
        )],
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await player.connect(voiceChannel);
    } catch (e) {
      log.error("SET", e);
      return interaction.reply({
        embeds: [errEmbed('Failed to connect to the voice channel. Please try again.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const s = player.get(guild.id);

    if (s.controlMsg) {
      try { await s.controlMsg.delete(); } catch (_) {}
      s.controlMsg = null;
    }

    await interaction.deferReply();
    const { embeds, components } = buildPanel(s);
    const msg = await interaction.editReply({ embeds, components });
    s.controlMsg = msg;
  }
};
