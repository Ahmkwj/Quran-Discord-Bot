"use strict";

const player = require("../utils/player");
const config = require("../utils/config");
const { buildPanel, errReply } = require("../utils/panel");
const log = require("../utils/logger");
const { isOwnerOrMod, getOwnerId } = require("../utils/permissions");

module.exports = {
  name: "play",
  description:
    "Set the bot to this channel, join your voice channel, and send the control panel",

  async execute(ctx) {
    const { guild, channel, member } = ctx;

    if (!isOwnerOrMod(ctx.user.id)) {
      const owner = getOwnerId();
      return ctx.reply(
        errReply(
          owner
            ? "Only the bot owner and moderators can use this command."
            : "Bot owner is not set. Add OWNER_ID to .env so the owner can use the bot.",
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
        errReply(
          "The bot needs Connect and Speak permissions in that voice channel.",
        ),
      );
    }

    try {
      config.setBoundChannel(guild.id, voiceChannel.id, channel.id);
      const s = player.get(guild.id);

      if (s.controlMsg) {
        s.controlMsg.delete().catch(() => {});
        s.controlMsg = null;
      }

      const { embeds, components } = buildPanel(s);
      const sent = await channel.send({ embeds, components });
      s.controlMsg = sent;
      s.controlChannelId = channel.id;
      s.controlMsgId = sent.id;

    } catch (e) {
      log.error("PLAY", e);
      try {
        await ctx.reply(
          errReply(
            "Could not send the panel. Check bot permissions (Send Messages, Embed Links) in this channel.",
          ),
        );
      } catch (_) {}
      return;
    }

    player.connect(voiceChannel).catch((e) => log.error("PLAY", e));
  },
};
