"use strict";

const { errReply, successReply } = require("../utils/panel");
const { requireOwner, isOwner } = require("../utils/permissions");
const config = require("../utils/config");

module.exports = {
  name: "addmod",
  description: "(Owner) Add a user as a bot moderator. Usage: @Bot addmod @user",

  async execute(ctx) {
    if (!(await requireOwner(ctx, errReply))) return;
    const user = ctx.options.getUser();
    if (!user) {
      return ctx.reply(errReply("Mention a user to add as mod. Example: @Bot addmod @username"));
    }
    if (isOwner(user.id)) {
      return ctx.reply(errReply("That user is the owner. Use removemod for other users."));
    }
    const added = config.addMod(user.id);
    if (!added) {
      return ctx.reply(errReply(`${user.tag} is already a moderator.`));
    }
    await ctx.reply(successReply(`${user.tag} (${user.id}) has been added as a moderator.`));
  },
};
