"use strict";

const { ActivityType } = require("discord.js");
const log = require("../utils/logger");
const config = require("../utils/config");
const player = require("../utils/player");

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
    activities: [{ name: name || "Use play to begin", type: activityType }],
    status: "online",
  });
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    player.setClient(client);
    log.success("READY", `Logged in as ${client.user.tag}`);
    applyPresence(client);
    const c = config.load();
    const boundChannels = c.boundChannels || {};
    for (const guildId of Object.keys(boundChannels)) {
      const b = boundChannels[guildId];
      if (!b || !b.voiceChannelId) continue;

      try {
        const ch = await client.channels.fetch(b.voiceChannelId).catch(() => null);

        if (!ch) {
          log.warn("READY", `Bound voice channel ${b.voiceChannelId} no longer exists in guild ${guildId}`);
          config.clearBoundChannel(guildId);
          continue;
        }

        if (!ch.isVoiceBased()) {
          log.warn("READY", `Bound channel ${b.voiceChannelId} is not a voice channel`);
          config.clearBoundChannel(guildId);
          continue;
        }

        await player.connect(ch);
        log.success("READY", `Connected to voice channel in guild ${guildId}`);
      } catch (err) {
        log.error("READY_CONNECT", err, { stack: false });
      }
    }
  },
};
