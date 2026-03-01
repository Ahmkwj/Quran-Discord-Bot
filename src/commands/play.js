"use strict";

const player = require("../utils/player");
const config = require("../utils/config");
const { buildPanel, errReply } = require("../utils/panel");
const log = require("../utils/logger");
const { isOwnerOrMod, getOwnerId } = require("../utils/permissions");

module.exports = {
  name: "play",
  description: "Start the Quran bot panel",

  async execute(ctx) {
    const { guild, channel, member } = ctx;

    if (!isOwnerOrMod(ctx.user.id)) {
      const owner = getOwnerId();
      return ctx.reply(
        errReply(
          owner
            ? "Only the bot owner and moderators can use this command."
            : "Bot owner is not set. Add OWNER_ID to .env",
        ),
      );
    }

    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel || !voiceChannel.isVoiceBased()) {
      return ctx.reply(errReply("You must be in a voice channel to use play."));
    }

    if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
      return ctx.reply(errReply("Use this command in a server text channel."));
    }

    const botMember = guild.members.me;
    const perms = voiceChannel.permissionsFor(botMember);
    if (!perms?.has("Connect") || !perms?.has("Speak")) {
      return ctx.reply(
        errReply("The bot needs Connect and Speak permissions in that voice channel."),
      );
    }

    const s = player.get(guild.id);
    s.controlChannelId = channel.id;
    s.controlMsgId = null;

    try {
      const { embeds, components } = buildPanel(s);
      const sent = await channel.send({ embeds, components });
      s.controlMsgId = sent.id;

      config.setBoundChannel(guild.id, voiceChannel.id, channel.id);

      player.connect(voiceChannel).catch((e) => log.error("VOICE_CONNECT", e));
    } catch (e) {
      log.error("PLAY", e);
      try {
        await ctx.reply(errReply("Could not send the panel. Check bot permissions."));
      } catch (_) {}
    }
  },
};
