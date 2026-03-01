"use strict";

const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");

const EXIT_DELAY_MS = 1500;

module.exports = {
  name: "restart",
  description: "(Owner/Mod) Restart the bot. Use with a process manager (e.g. PM2) for auto-restart.",

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;
    await ctx.reply(
      successReply(
        "Restarting. The bot is shutting down. If you use a process manager (PM2, systemd, Docker), it will start again automatically."
      )
    );
    setTimeout(() => process.exit(0), EXIT_DELAY_MS);
  },
};
