"use strict";

const { MessageFlags } = require("discord.js");
const config = require("./config");

function getOwnerId() {
  const id = process.env.OWNER_ID;
  return id && id.trim() ? id.trim() : null;
}

function isOwner(userId) {
  const owner = getOwnerId();
  return owner && String(userId) === owner;
}

function isMod(userId) {
  return config.getMods().includes(String(userId));
}

function isOwnerOrMod(userId) {
  return isOwner(userId) || isMod(userId);
}

async function requireOwner(interaction, errEmbed) {
  if (isOwner(interaction.user.id)) return true;
  const owner = getOwnerId();
  await interaction.reply({
    embeds: [
      errEmbed(
        owner
          ? "Only the bot owner can use this command."
          : "Owner is not configured. Set OWNER_ID in your .env file."
      ),
    ],
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
}

async function requireOwnerOrMod(interaction, errEmbed) {
  if (isOwnerOrMod(interaction.user.id)) return true;
  const owner = getOwnerId();
  await interaction.reply({
    embeds: [
      errEmbed(
        owner
          ? "Only the bot owner and moderators can use this command."
          : "Owner is not configured. Set OWNER_ID in your .env file."
      ),
    ],
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
}

module.exports = {
  getOwnerId,
  isOwner,
  isMod,
  isOwnerOrMod,
  requireOwner,
  requireOwnerOrMod,
};
