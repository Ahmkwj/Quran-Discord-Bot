'use strict';

const { ActivityType } = require('discord.js');

const activities = [
  { name: 'The Holy Quran', type: ActivityType.Listening },
  { name: 'Use /set to start', type: ActivityType.Playing },
  { name: '114 surahs', type: ActivityType.Listening },
];

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Logged in: ${client.user.tag}`);
    console.log(`Connected to ${client.guilds.cache.size} server(s)`);
    let i = 0;
    const tick = () => {
      client.user.setPresence({ activities: [activities[i % activities.length]], status: 'online' });
      i++;
    };
    tick();
    setInterval(tick, 30000);
  }
};
