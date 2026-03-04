'use strict';

const player = require('../utils/player');
const config = require('../utils/config');
const { buildPanel, errReply } = require('../utils/panel');
const log = require('../utils/logger');
const { isOwnerOrMod, getOwnerId } = require('../utils/permissions');

module.exports = {
  name: 'play',
  description: 'Start the Quran bot panel',

  async execute(ctx) {
    if (!isOwnerOrMod(ctx.user.id)) {
      return ctx.reply(errReply(
        getOwnerId()
          ? 'Only the bot owner and moderators can use this command.'
          : 'Bot owner is not set. Add OWNER_ID to .env'
      ));
    }

    const vc = ctx.member?.voice?.channel;
    if (!vc || !vc.isVoiceBased()) {
      return ctx.reply(errReply('You must be in a voice channel to use play.'));
    }

    if (!ctx.channel?.isTextBased?.() || ctx.channel.isDMBased?.()) {
      return ctx.reply(errReply('Use this command in a server text channel.'));
    }

    const perms = vc.permissionsFor(ctx.guild.members.me);
    if (!perms?.has('Connect') || !perms?.has('Speak')) {
      return ctx.reply(errReply('The bot needs Connect and Speak permissions in that voice channel.'));
    }

    const s = player.get(ctx.guild.id);
    s.controlChannelId = ctx.channel.id;
    s.controlMsgId = null;

    try {
      const { embeds, components } = buildPanel(s);
      const sent = await ctx.channel.send({ embeds, components });
      s.controlMsgId = sent.id;
      config.setBoundChannel(ctx.guild.id, vc.id, ctx.channel.id);
      player.connect(vc).catch(e => log.error('VOICE_CONNECT', e));
    } catch (e) {
      log.error('PLAY', e);
      ctx.reply(errReply('Could not send the panel. Check bot permissions.')).catch(() => {});
    }
  },
};
