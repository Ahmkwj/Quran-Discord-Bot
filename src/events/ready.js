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

    // Reconnect to bound voice channels
    const c = config.load();
    for (const guildId of Object.keys(c.boundChannels || {})) {
      const b = c.boundChannels[guildId];
      if (!b?.voiceChannelId) continue;

      try {
        const ch = await client.channels.fetch(b.voiceChannelId).catch(() => null);
        if (!ch || !ch.isVoiceBased()) {
          log.warn('READY', `Stale bound channel ${b.voiceChannelId}, clearing`);
          config.clearBoundChannel(guildId);
          continue;
        }
        await player.connect(ch);

        // Set control channel for the guild so panel updates work
        const s = player.get(guildId);
        if (b.commandChannelId) s.controlChannelId = b.commandChannelId;

        log.success('READY', `Reconnected voice in guild ${guildId}`);
      } catch (err) {
        log.error('READY_CONNECT', err);
      }
    }
  },
};
