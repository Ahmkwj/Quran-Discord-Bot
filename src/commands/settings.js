"use strict";

const { EmbedBuilder } = require("discord.js");
const config = require("../utils/config");
const { requireOwnerOrMod, getOwnerId } = require("../utils/permissions");
const { errReply } = require("../utils/panel");

const EMBED_COLOR = 0x2b5f4a;

module.exports = {
  name: "settings",
  description: "(Owner/Mod) Show current bot settings",

  async execute(ctx) {
    if (!(await requireOwnerOrMod(ctx, errReply))) return;

    const guildId = ctx.guild?.id;
    const ownerId = getOwnerId();
    const mods = config.getMods();
    const activity = config.getActivity();
    const bound = guildId ? config.getBoundChannel(guildId) : null;
    const defaultVolume = process.env.DEFAULT_VOLUME || "80";

    let ownerText = "Not set (add OWNER_ID to .env)";
    if (ownerId) {
      try {
        const owner = await ctx.client.users.fetch(ownerId).catch(() => null);
        ownerText = owner ? `${owner.tag} (\`${ownerId}\`)` : `\`${ownerId}\``;
      } catch {
        ownerText = `\`${ownerId}\``;
      }
    }

    let modsText = "None";
    if (mods.length > 0) {
      const modList = await Promise.all(
        mods.map(async (id) => {
          try {
            const u = await ctx.client.users.fetch(id).catch(() => null);
            return u ? `${u.tag} (\`${id}\`)` : `\`${id}\``;
          } catch {
            return `\`${id}\``;
          }
        })
      );
      modsText = modList.join(", ");
    }

    const activityText = `${activity.type || "Playing"}: ${activity.name || "Use play to begin"}`;

    let boundText = "Not set (run play in a channel to set)";
    if (bound && bound.voiceChannelId && bound.commandChannelId) {
      boundText = `Voice: <#${bound.voiceChannelId}>\nCommand channel: <#${bound.commandChannelId}>`;
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("Bot settings")
      .setTimestamp()
      .addFields(
        { name: "Owner", value: ownerText, inline: false },
        { name: "Moderators", value: modsText, inline: false },
        { name: "Activity", value: activityText, inline: true },
        { name: "Default volume", value: `${defaultVolume}%`, inline: true },
        { name: "Bound channel", value: boundText, inline: false }
      );

    await ctx.reply({ embeds: [embed] });
  },
};
