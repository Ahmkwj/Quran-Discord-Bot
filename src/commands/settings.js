'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const { requireOwnerOrMod, getOwnerId } = require('../utils/permissions');
const { errReply } = require('../utils/panel');

module.exports = {
  name: 'settings',
  description: '(Owner/Mod) Show current bot settings',

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;

    const ownerId = getOwnerId();
    const mods = config.getMods();
    const activity = config.getActivity();
    const bound = ctx.guildId ? config.getBoundChannel(ctx.guildId) : null;

    let ownerText = 'Not set (add OWNER_ID to .env)';
    if (ownerId) {
      const owner = await ctx.client.users.fetch(ownerId).catch(() => null);
      ownerText = owner ? `${owner.tag} (\`${ownerId}\`)` : `\`${ownerId}\``;
    }

    let modsText = 'None';
    if (mods.length > 0) {
      const list = await Promise.all(mods.map(async id => {
        const u = await ctx.client.users.fetch(id).catch(() => null);
        return u ? `${u.tag} (\`${id}\`)` : `\`${id}\``;
      }));
      modsText = list.join(', ');
    }

    let boundText = 'Not set (run play to bind)';
    if (bound) {
      boundText = `Voice: <#${bound.voiceChannelId}>\nCommand: <#${bound.commandChannelId}>`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x1a6b47)
      .setTitle('Bot Settings')
      .setTimestamp()
      .addFields(
        { name: 'Owner', value: ownerText, inline: false },
        { name: 'Moderators', value: modsText, inline: false },
        { name: 'Activity', value: `${activity.type}: ${activity.name}`, inline: true },
        { name: 'Default volume', value: `${process.env.DEFAULT_VOLUME || '80'}%`, inline: true },
        { name: 'Bound channels', value: boundText, inline: false },
      );

    await ctx.reply({ embeds: [embed] });
  },
};
