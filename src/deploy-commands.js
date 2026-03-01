"use strict";

require("dotenv").config();

const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

if (!process.env.DISCORD_TOKEN) {
  console.error("[DEPLOY] Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

const commands = [];
const cmdDir = path.join(__dirname, "commands");

for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.data) {
    commands.push(cmd.data.toJSON());
    console.log(`[DEPLOY] Loaded command: ${cmd.data.name}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

async function getApplicationId() {
  const res = await fetch("https://discord.com/api/v10/applications/@me", {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to get application (${res.status})`);
  }
  const data = await res.json();
  return data.id;
}

(async () => {
  try {
    const clientId = await getApplicationId();
    const guildId = process.env.GUILD_ID || process.env.guild_id;

    if (guildId) {
      console.log(`[DEPLOY] Registering ${commands.length} commands to guild ${guildId} (instant)...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      );
      console.log(`[DEPLOY] Successfully registered ${data.length} commands to guild. They are available immediately.`);
    } else {
      console.log(`[DEPLOY] Registering ${commands.length} commands globally (may take up to 1 hour to appear)...`);
      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      console.log(`[DEPLOY] Successfully registered ${data.length} commands globally.`);
    }
  } catch (error) {
    console.error("[DEPLOY] Error:", error);
    process.exit(1);
  }
})();
