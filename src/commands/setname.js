"use strict";

const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

module.exports = {
  name: "setname",
  description: "(Owner/Mod) Change the bot username. Usage: @Bot setname NewName",

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;
    const name = ctx.options.getString("name").trim();
    if (!name || name.length < 2 || name.length > 32) {
      return ctx.reply(errReply("Provide a name (2–32 characters). Example: @Bot setname MyBot"));
    }
    try {
      await ctx.client.user.setUsername(name);
      await ctx.reply(successReply(`Username updated. Bot username is now ${name}.`));
    } catch (err) {
      const msg = err.code === 50035
        ? "Username is invalid or was changed too recently. Discord allows 2 username changes per hour."
        : err.message;
      await ctx.reply(errReply(msg)).catch(() => {});
    }
  },
};
