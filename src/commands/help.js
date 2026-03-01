"use strict";

const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "help",
  description: "List all commands",

  async execute(ctx) {
    const lines = [];
    for (const [, cmd] of ctx.client.commands) {
      if (cmd.name && cmd.description) {
        lines.push(`**${cmd.name}** — ${cmd.description}`);
      }
    }
    const embed = new EmbedBuilder()
      .setColor(0x2b5f4a)
      .setAuthor({ name: "Quran Bot — Commands" })
      .setTitle("All commands")
      .setDescription("Mention the bot then the command. Example: @Bot play\n\n" + lines.join("\n"))
      .setFooter({ text: "Use @Bot <command> in any channel" })
      .setTimestamp();
    await ctx.reply({ embeds: [embed] });
  },
};
