'use strict';

const { ActivityType } = require('discord.js');
const log = require('../utils/logger');
const config = require('../utils/config');
const player = require('../utils/player');

const TYPE_MAP = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    player.setClient(client);
    log.success('READY', `Logged in as ${client.user.tag}`);

    // Apply configured presence
    const { type, name } = config.getActivity();
    client.user.setPresence({
      activities: [{ name: name || 'Use play to begin', type: TYPE_MAP[type] || ActivityType.Playing }],
      status: 'online',
    });

    // Restore control channel references from config so panel updates work
    // (no auto voice-connect on startup — users run @Bot play to connect)
    const c = config.load();
    for (const guildId of Object.keys(c.boundChannels || {})) {
      const b = c.boundChannels[guildId];
      if (!b?.commandChannelId) continue;
      const s = player.get(guildId);
      s.controlChannelId = b.commandChannelId;
    }
  },
};
