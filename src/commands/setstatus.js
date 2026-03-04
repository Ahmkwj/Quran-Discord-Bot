'use strict';

const { ActivityType } = require('discord.js');
const { errReply, successReply } = require('../utils/panel');
const { requireOwnerOrMod } = require('../utils/permissions');
const config = require('../utils/config');

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

module.exports = {
  name: 'setstatus',
  description: '(Owner/Mod) Set bot presence. Usage: @Bot setstatus Playing Quran',

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;

    const type = ctx.options.getString('type') || ctx.args[0] || 'Playing';
    const text = (ctx.options.getString('text') || ctx.rest || 'Use play to begin').trim() || 'Use play to begin';

    config.setActivity(type, text);
    ctx.client.user.setPresence({
      activities: [{ name: text, type: TYPE_MAP[type] || ActivityType.Playing }],
      status: 'online',
    });

    await ctx.reply(successReply(`Status set to ${type}: ${text}`));
  },
};
