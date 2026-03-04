'use strict';

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  description: 'List all commands',

  async execute(ctx) {
    const lines = [];
    for (const [, cmd] of ctx.client.commands) {
      if (cmd.name && cmd.description) {
        lines.push(`**${cmd.name}** \u2014 ${cmd.description}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x1a6b47)
      .setTitle('\uD83D\uDCDA Quran Bot \u2014 Commands')
      .setDescription(
        'Mention the bot followed by the command.\nExample: `@Bot play`\n\n' +
        lines.join('\n')
      )
      .setFooter({ text: 'Use @Bot <command> in any channel' })
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
};
