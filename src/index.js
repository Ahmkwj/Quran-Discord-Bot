'use strict';

require('dotenv').config();
require('libsodium-wrappers');

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const log = require('./utils/logger');
const config = require('./utils/config');
const player = require('./utils/player');

// ── Validate environment ─────────────────────────────────────────────────────

config.load();

if (!process.env.DISCORD_TOKEN) {
  log.error('STARTUP', new Error('Missing DISCORD_TOKEN in .env'));
  process.exit(1);
}

// ── Create client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ── Load commands ────────────────────────────────────────────────────────────

client.commands = new Collection();

const cmdDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.name && cmd.execute) client.commands.set(cmd.name, cmd);
}

// ── Register events ──────────────────────────────────────────────────────────

const readyEvent = require('./events/ready');
client.once('clientReady', (...args) => readyEvent.execute(...args));

const cmdHandler = require('./handlers/commands');
client.on(cmdHandler.name, m => cmdHandler.execute(m, client));

const intHandler = require('./handlers/interactions');
client.on(intHandler.name, i => intHandler.execute(i));

// Reconnect bot to bound voice channel if moved
client.on('voiceStateUpdate', (oldState, newState) => {
  if (newState.member?.id !== client.user?.id || !newState.guild) return;
  const bound = config.getBoundChannel(newState.guild.id);
  if (!bound || newState.channelId === bound.voiceChannelId) return;

  client.channels.fetch(bound.voiceChannelId)
    .then(ch => { if (ch?.isVoiceBased?.()) player.connect(ch).catch(e => log.error('VOICE_STATE', e)); })
    .catch(e => log.error('VOICE_STATE', e));
});

// ── Error handling ───────────────────────────────────────────────────────────

client.on('error', err => log.error('CLIENT', err));
process.on('unhandledRejection', err => log.error('UNHANDLED', err));
process.on('uncaughtException', err => {
  log.error('UNCAUGHT', err);
  gracefulShutdown('uncaughtException');
});

// ── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('SHUTDOWN', `Received ${signal}, shutting down...`);

  player.shutdownAll();
  config.flushSync();

  client.destroy();
  log.info('SHUTDOWN', 'Cleanup complete.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Login ────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN).catch(err => {
  log.error('LOGIN', err);
  process.exit(1);
});
