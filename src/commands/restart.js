'use strict';

const { errReply, successReply } = require('../utils/panel');
const { requireOwnerOrMod } = require('../utils/permissions');
const player = require('../utils/player');
const config = require('../utils/config');

module.exports = {
  name: 'restart',
  description: '(Owner/Mod) Restart the bot (requires PM2 or similar)',

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;

    await ctx.reply(successReply('Restarting. The bot will come back automatically if running under PM2.'));

    // Graceful cleanup
    player.shutdownAll();
    config.flushSync();

    setTimeout(() => process.exit(0), 1500);
  },
};
