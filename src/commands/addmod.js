'use strict';

const { errReply, successReply } = require('../utils/panel');
const { requireOwner, isOwner } = require('../utils/permissions');
const config = require('../utils/config');

module.exports = {
  name: 'addmod',
  description: '(Owner) Add a moderator. Usage: @Bot addmod @user',

  async execute(ctx) {
    if (!(await requireOwner(ctx, errReply))) return;

    const user = ctx.options.getUser();
    if (!user) return ctx.reply(errReply('Mention a user. Example: @Bot addmod @username'));
    if (isOwner(user.id)) return ctx.reply(errReply('That user is already the owner.'));

    if (!config.addMod(user.id)) return ctx.reply(errReply(`${user.tag} is already a moderator.`));
    await ctx.reply(successReply(`${user.tag} added as moderator.`));
  },
};
