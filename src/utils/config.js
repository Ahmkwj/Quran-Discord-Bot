"use strict";

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(process.cwd(), "config.json");

const DEFAULTS = {
  mods: [],
  activity: { type: "Playing", name: "Use play to begin" },
  boundChannels: {},
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    if (e.code === "ENOENT") {
      cache = { ...DEFAULTS };
      save();
    } else throw e;
  }
  if (!Array.isArray(cache.mods)) cache.mods = [];
  if (!cache.activity || typeof cache.activity.name !== "string") cache.activity = { ...DEFAULTS.activity };
  if (typeof cache.boundChannels !== "object" || cache.boundChannels === null) cache.boundChannels = {};
  return cache;
}

function getBoundChannel(guildId) {
  const c = load();
  const b = c.boundChannels[String(guildId)];
  return b && b.voiceChannelId && b.commandChannelId ? b : null;
}

function setBoundChannel(guildId, voiceChannelId, commandChannelId) {
  const c = load();
  c.boundChannels[String(guildId)] = { voiceChannelId: String(voiceChannelId), commandChannelId: String(commandChannelId) };
  save();
  return c.boundChannels[String(guildId)];
}

function clearBoundChannel(guildId) {
  const c = load();
  if (!c.boundChannels[String(guildId)]) return false;
  delete c.boundChannels[String(guildId)];
  save();
  return true;
}

function save() {
  const data = cache || load();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

function getMods() {
  return [...load().mods];
}

function addMod(userId) {
  const c = load();
  const id = String(userId);
  if (c.mods.includes(id)) return false;
  c.mods.push(id);
  save();
  return true;
}

function removeMod(userId) {
  const c = load();
  const id = String(userId);
  const i = c.mods.indexOf(id);
  if (i === -1) return false;
  c.mods.splice(i, 1);
  save();
  return true;
}

function getActivity() {
  return { ...load().activity };
}

function setActivity(type, name) {
  const c = load();
  c.activity = { type: type || "Playing", name: name || "Use play to begin" };
  save();
  return c.activity;
}

module.exports = {
  load,
  save,
  getMods,
  addMod,
  removeMod,
  getActivity,
  setActivity,
  getBoundChannel,
  setBoundChannel,
  clearBoundChannel,
  CONFIG_PATH,
  DEFAULTS,
};
