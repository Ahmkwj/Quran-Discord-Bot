'use strict';

const { errReply, successReply } = require('../utils/panel');
const { requireOwnerOrMod } = require('../utils/permissions');

module.exports = {
  name: 'setname',
  description: '(Owner/Mod) Change bot username. Usage: @Bot setname NewName',

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;

    const name = ctx.options.getString('name').trim();
    if (!name || name.length < 2 || name.length > 32) {
      return ctx.reply(errReply('Provide a name (2\u201332 characters).'));
    }

    try {
      await ctx.client.user.setUsername(name);
      await ctx.reply(successReply(`Username changed to ${name}.`));
    } catch (err) {
      const msg = err.code === 50035
        ? 'Invalid or rate-limited. Discord allows 2 username changes per hour.'
        : err.message;
      ctx.reply(errReply(msg)).catch(() => {});
    }
  },
};
