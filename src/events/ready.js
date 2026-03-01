"use strict";

const { ActivityType } = require("discord.js");
const log = require("../utils/logger");
const config = require("../utils/config");

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

function applyPresence(client) {
  const { type, name } = config.getActivity();
  const activityType = TYPE_MAP[type] || ActivityType.Playing;
  client.user.setPresence({
    activities: [{ name: name || "Use /start to begin", type: activityType }],
    status: "online",
  });
}

module.exports = {
  name: "clientReady",
  once: true,
  execute(client) {
    log.success("READY", `Logged in as ${client.user.tag}`);
    log.info("READY", `Connected to ${client.guilds.cache.size} server(s)`);
    applyPresence(client);
  },
};
