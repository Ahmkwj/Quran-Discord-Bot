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

config.load();

["DISCORD_TOKEN", "CLIENT_ID"].forEach((key) => {
  if (!process.env[key]) {
    log.error("STARTUP", new Error(`Missing required environment variable: ${key}. Add it to .env`));
    process.exit(1);
  }
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

const cmdDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    log.info("COMMANDS", `Loaded slash command: /${cmd.data.name}`);
  }
}

const readyEvent = require("./events/ready");
client.once("clientReady", (...a) => readyEvent.execute(...a));

const cmdHandler = require("./handlers/commands");
client.on(cmdHandler.name, (i) => cmdHandler.execute(i, client));

const intHandler = require("./handlers/interactions");
client.on(intHandler.name, (i) => intHandler.execute(i));

client.on("error", (err) => log.error("CLIENT", err));
process.on("unhandledRejection", (err) => log.error("UNHANDLED", err));

client
  .login(process.env.DISCORD_TOKEN)
  .then(() => log.success("AUTH", "Authenticated with Discord"))
  .catch((err) => {
    log.error("LOGIN", err);
    process.exit(1);
  });
