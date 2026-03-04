'use strict';

const { EmbedBuilder } = require('discord.js');
const { errReply } = require('../utils/panel');
const { requireOwner, getOwnerId } = require('../utils/permissions');
const config = require('../utils/config');

module.exports = {
  name: 'listmods',
  description: '(Owner) List owner and moderators',

  async execute(ctx) {
    if (!(await requireOwner(ctx, errReply))) return;

    const ownerId = getOwnerId();
    const mods = config.getMods();

    let ownerLine = 'Not set';
    if (ownerId) {
      const owner = await ctx.client.users.fetch(ownerId).catch(() => null);
      ownerLine = owner ? `${owner.tag} (\`${ownerId}\`)` : `\`${ownerId}\``;
    }

    let modsLine = 'None. Use `addmod` to add moderators.';
    if (mods.length > 0) {
      const list = await Promise.all(mods.map(async id => {
        const u = await ctx.client.users.fetch(id).catch(() => null);
        return u ? `${u.tag} (\`${id}\`)` : `\`${id}\``;
      }));
      modsLine = list.join('\n');
    }

    const embed = new EmbedBuilder()
      .setColor(0x1a6b47)
      .setTitle('Owner & Moderators')
      .addFields(
        { name: 'Owner', value: ownerLine, inline: false },
        { name: 'Moderators', value: modsLine, inline: false },
      )
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
};
