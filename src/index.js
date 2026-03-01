'use strict';

require('dotenv').config();
require('libsodium-wrappers'); // must load before @discordjs/voice

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Validate env ─────────────────────────────────────────────────────────────
['DISCORD_TOKEN', 'CLIENT_ID'].forEach(key => {
  if (!process.env[key]) {
    console.error(`Missing ${key} in .env`);
    process.exit(1);
  }
});

// ── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// ── Load commands ─────────────────────────────────────────────────────────────
const cmdDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    console.log('Command loaded: /' + cmd.data.name);
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
const readyEvent = require('./events/ready');
client.once(readyEvent.name, (...a) => readyEvent.execute(...a));

const cmdHandler = require('./handlers/commands');
client.on(cmdHandler.name, i => cmdHandler.execute(i, client));

const intHandler = require('./handlers/interactions');
client.on(intHandler.name, i => intHandler.execute(i));

// ── Error guards ──────────────────────────────────────────────────────────────
client.on('error', err => console.error('[Client Error]', err));
process.on('unhandledRejection', err => console.error('[Unhandled]', err));

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Authenticated with Discord'))
  .catch(err => { console.error('Login failed:', err.message); process.exit(1); });
