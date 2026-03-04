'use strict';

const { errReply, successReply } = require('../utils/panel');
const { requireOwner } = require('../utils/permissions');
const config = require('../utils/config');

module.exports = {
  name: 'removemod',
  description: '(Owner) Remove a moderator. Usage: @Bot removemod @user',

  async execute(ctx) {
    if (!(await requireOwner(ctx, errReply))) return;

    const user = ctx.options.getUser();
    if (!user) return ctx.reply(errReply('Mention a user. Example: @Bot removemod @username'));

    if (!config.removeMod(user.id)) return ctx.reply(errReply(`${user.tag} is not a moderator.`));
    await ctx.reply(successReply(`${user.tag} removed from moderators.`));
  },
};
