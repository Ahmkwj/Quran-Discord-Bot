'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('Set DISCORD_TOKEN and CLIENT_ID in .env');
  process.exit(1);
}

const commands = [];
const dir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(dir, file));
  if (cmd.data) {
    commands.push(cmd.data.toJSON());
    console.log('Loaded: /' + cmd.data.name);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('\nUploading ' + commands.length + ' command(s)...');
    let data;
    if (process.env.GUILD_ID) {
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('Registered ' + data.length + ' command(s) on guild ' + process.env.GUILD_ID);
    } else {
      data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('Registered ' + data.length + ' command(s) globally');
    }
    console.log('\nDone. Start the bot with: npm start\n');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
