'use strict';

const { errReply, successReply } = require('../utils/panel');
const { requireOwnerOrMod } = require('../utils/permissions');

module.exports = {
  name: 'setavatar',
  description: '(Owner/Mod) Set bot avatar. Attach an image.',

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;

    const att = ctx.options.getAttachment();
    if (!att) return ctx.reply(errReply('Attach an image to your message.'));
    if (!att.contentType?.startsWith('image/')) return ctx.reply(errReply('Please send an image file.'));

    try {
      await ctx.client.user.setAvatar(att.url);
      await ctx.reply(successReply('Avatar updated.'));
    } catch (err) {
      const msg = err.code === 50035 ? 'Image too large or invalid (max 256KB).' : err.message;
      ctx.reply(errReply(msg)).catch(() => {});
    }
  },
};
