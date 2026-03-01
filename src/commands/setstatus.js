"use strict";

const { SlashCommandBuilder, ActivityType, MessageFlags } = require("discord.js");
const { errEmbed, successEmbed } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");
const config = require("../utils/config");

const TYPE_CHOICES = [
  { name: "Playing", value: "Playing" },
  { name: "Listening", value: "Listening" },
  { name: "Watching", value: "Watching" },
  { name: "Competing", value: "Competing" },
];

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("(Owner/Mod) Set the bot presence status (Playing, Listening, etc.)")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Activity type")
        .setRequired(true)
        .addChoices(...TYPE_CHOICES)
    )
    .addStringOption((o) =>
      o
        .setName("text")
        .setDescription("Status text (e.g. Use /start to start)")
        .setRequired(true)
        .setMaxLength(128)
    ),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errEmbed))) return;
    const type = interaction.options.getString("type");
    const text = interaction.options.getString("text").trim() || "Use /start to start";
    config.setActivity(type, text);
    const activityType = TYPE_MAP[type] || ActivityType.Playing;
    interaction.client.user.setPresence({
      activities: [{ name: text, type: activityType }],
      status: "online",
    });
    await interaction.reply({
      embeds: [successEmbed("Status updated", `Presence set to **${type}**: \`${text}\`.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
