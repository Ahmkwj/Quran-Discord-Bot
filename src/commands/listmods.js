"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwner, getOwnerId } = require("../utils/permissions");
const config = require("../utils/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("listmods")
    .setDescription("(Owner) List bot owner and moderators"),

  async execute(interaction) {
    if (!(await requireOwner(interaction, errEmbed))) return;
    const ownerId = getOwnerId();
    const mods = config.getMods();
    const lines = [];
    if (ownerId) {
      try {
        const owner = await interaction.client.users.fetch(ownerId).catch(() => null);
        lines.push(`**Owner:** ${owner ? owner.tag : "Unknown"} (\`${ownerId}\`)`);
      } catch {
        lines.push(`**Owner:** \`${ownerId}\``);
      }
    } else {
      lines.push("**Owner:** Not set (add OWNER_ID to .env)");
    }
    if (mods.length === 0) {
      lines.push("**Mods:** None. Use /addmod to add moderators.");
    } else {
      const modList = await Promise.all(
        mods.map(async (id) => {
          try {
            const u = await interaction.client.users.fetch(id).catch(() => null);
            return u ? `${u.tag} (\`${id}\`)` : `\`${id}\``;
          } catch {
            return `\`${id}\``;
          }
        })
      );
      lines.push("**Mods:** " + modList.join(", "));
    }
    await interaction.reply({
      embeds: [successEmbed("Owner and moderators", lines.join("\n"))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
