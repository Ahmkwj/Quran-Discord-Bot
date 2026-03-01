"use strict";

const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

module.exports = {
  name: "setavatar",
  description: "(Owner/Mod) Set the bot avatar. Send an image with the command.",

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;
    const attachment = ctx.options.getAttachment();
    if (!attachment) {
      return ctx.reply(errReply("Attach an image to your message. Example: @Bot setavatar (with image attached)"));
    }
    if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
      return ctx.reply(errReply("Please send an image file."));
    }
    try {
      await ctx.client.user.setAvatar(attachment.url);
      await ctx.reply(successReply("Avatar updated. The bot avatar has been changed."));
    } catch (err) {
      const msg =
        err.code === 50035
          ? "Image is too large or invalid. Avatars must be under 256KB."
          : err.message;
      await ctx.reply(errReply(msg)).catch(() => {});
    }
  },
};
