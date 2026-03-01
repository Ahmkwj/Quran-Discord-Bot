"use strict";

require("dotenv").config();
require("libsodium-wrappers");

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const log = require("./utils/logger");
const config = require("./utils/config");
const player = require("./utils/player");

config.load();

if (!process.env.DISCORD_TOKEN) {
  log.error("STARTUP", new Error("Missing DISCORD_TOKEN. Add it to .env"));
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

const cmdDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.name && cmd.execute) {
    client.commands.set(cmd.name, cmd);
  }
}

const readyEvent = require("./events/ready");
client.once("clientReady", (...a) => readyEvent.execute(...a));

const cmdHandler = require("./handlers/commands");
client.on(cmdHandler.name, (m) => cmdHandler.execute(m, client));

const intHandler = require("./handlers/interactions");
client.on(intHandler.name, (i) => intHandler.execute(i));

client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.member?.id !== client.user?.id || !newState.guild) return;
  const bound = config.getBoundChannel(newState.guild.id);
  if (!bound || newState.channelId === bound.voiceChannelId) return;
  player.ensureInBoundChannel(newState.guild.id);
});

client.on("error", (err) => log.error("CLIENT", err));
process.on("unhandledRejection", (err) => log.error("UNHANDLED", err));

client
  .login(process.env.DISCORD_TOKEN)
  .then(() => log.success("AUTH", "Authenticated with Discord"))
  .catch((err) => {
    log.error("LOGIN", err);
    process.exit(1);
  });
