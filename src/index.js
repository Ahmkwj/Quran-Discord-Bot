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
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

const cmdDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
  }
}

const readyEvent = require("./events/ready");
client.once("clientReady", (...a) => readyEvent.execute(...a));

const intHandler = require("./handlers/interactions");
client.on(intHandler.name, (i) => intHandler.execute(i));

client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.member?.id !== client.user?.id || !newState.guild) return;
  const bound = config.getBoundChannel(newState.guild.id);
  if (!bound || newState.channelId === bound.voiceChannelId) return;

  client.channels.fetch(bound.voiceChannelId).then((ch) => {
    if (ch?.isVoiceBased?.()) {
      player.connect(ch).catch((e) => log.error("VOICE_STATE", e));
    }
  }).catch((e) => log.error("VOICE_STATE", e));
});

client.on("error", (err) => log.error("CLIENT", err));
process.on("unhandledRejection", (err) => log.error("UNHANDLED", err));

client
  .login(process.env.DISCORD_TOKEN)
  .catch((err) => {
    log.error("LOGIN", err);
    process.exit(1);
  });
