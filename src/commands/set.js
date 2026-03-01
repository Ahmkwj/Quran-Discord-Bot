'use strict';

const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const player = require('../utils/player');
const { buildPanel, errEmbed } = require('../utils/panel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Send the Quran bot control panel in this channel'),

  async execute(interaction) {
    const { guild, channel, member } = interaction;

    if (channel.type !== ChannelType.GuildVoice) {
      return interaction.reply({
        embeds: [errEmbed(
          'This command works **only** in the text channel of a voice channel.\n' +
          'Go to a voice channel and run the command in its text channel.'
        )],
        ephemeral: true
      });
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel || voiceChannel.id !== channel.id) {
      return interaction.reply({
        embeds: [errEmbed(
          'You must be in **this** voice channel to use the panel.'
        )],
        ephemeral: true
      });
    }

    const botMember = guild.members.me;
    const perms = voiceChannel.permissionsFor(botMember);
    if (!perms.has('Connect') || !perms.has('Speak')) {
      return interaction.reply({
        embeds: [errEmbed(
          'I need **Connect** and **Speak** permissions in this voice channel.'
        )],
        ephemeral: true
      });
    }

    try {
      await player.connect(voiceChannel);
    } catch (e) {
      console.error('[/set connect]', e);
      return interaction.reply({
        embeds: [errEmbed('Failed to connect to the voice channel. Please try again.')],
        ephemeral: true
      });
    }

    const s = player.get(guild.id);

    // ── If a control message already exists in this channel, delete it ───────
    if (s.controlMsg) {
      try { await s.controlMsg.delete(); } catch (_) {}
      s.controlMsg = null;
    }

    // ── Send the one persistent panel ────────────────────────────────────────
    await interaction.deferReply();
    const { embeds, components } = buildPanel(s);
    const msg = await interaction.editReply({ embeds, components });
    s.controlMsg = msg;
  }
};
