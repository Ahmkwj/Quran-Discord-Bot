"use strict";

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const log = require("./utils/logger");

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  log.error("DEPLOY", new Error("Set DISCORD_TOKEN and CLIENT_ID in .env before deploying"));
  process.exit(1);
}

const commands = [];
const dir = path.join(__dirname, "commands");

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(dir, file));
  if (cmd.data) {
    commands.push(cmd.data.toJSON());
    log.info("DEPLOY", `Loaded command: /${cmd.data.name}`);
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    log.info("DEPLOY", `Uploading ${commands.length} command(s)...`);
    let data;
    if (process.env.GUILD_ID) {
      data = await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID,
        ),
        { body: commands },
      );
      log.success("DEPLOY", `Registered ${data.length} command(s) in guild ${process.env.GUILD_ID}`);
    } else {
      data = await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
      log.success("DEPLOY", `Registered ${data.length} command(s) globally`);
    }
    log.info("DEPLOY", "Done. Start the bot with: npm start");
  } catch (err) {
    log.error("DEPLOY", err);
    process.exit(1);
  }
})();
