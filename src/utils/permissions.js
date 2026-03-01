"use strict";

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

async function requireOwner(ctx, errReply) {
  if (isOwner(ctx.user.id)) return true;
  const owner = getOwnerId();
  const msg = owner
    ? "Only the bot owner can use this command."
    : "Owner is not set. Add OWNER_ID to your .env file.";
  await ctx.reply(errReply(msg)).catch(() => {});
  return false;
}

async function requireOwnerOrMod(ctx, errReply) {
  if (isOwnerOrMod(ctx.user.id)) return true;
  const owner = getOwnerId();
  const msg = owner
    ? "Only the bot owner and moderators can use this command."
    : "Owner is not set. Add OWNER_ID to your .env file.";
  await ctx.reply(errReply(msg)).catch(() => {});
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

