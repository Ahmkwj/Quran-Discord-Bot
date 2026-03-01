"use strict";

const { SlashCommandBuilder, ActivityType } = require("discord.js");
const { errReply, successReply } = require("../utils/panel");
const { requireOwnerOrMod } = require("../utils/permissions");
const config = require("../utils/config");

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("Set the bot presence (Owner/Mod only)")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Activity type")
        .setRequired(true)
        .addChoices(
          { name: "Playing", value: "Playing" },
          { name: "Listening", value: "Listening" },
          { name: "Watching", value: "Watching" },
          { name: "Competing", value: "Competing" }
        )
    )
    .addStringOption(option =>
      option
        .setName("text")
        .setDescription("Status text")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwnerOrMod(interaction, errReply))) return;
    const type = interaction.options.getString("type");
    const text = interaction.options.getString("text");
    const activityType = TYPE_MAP[type] || ActivityType.Playing;
    config.setActivity(type, text);
    interaction.client.user.setPresence({
      activities: [{ name: text, type: activityType }],
      status: "online",
    });
    await interaction.reply(successReply(`Status updated. Presence set to ${type}: ${text}.`));
  },
};
