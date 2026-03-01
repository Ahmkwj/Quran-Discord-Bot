# Quran Discord Bot

A self-hosted Discord bot for listening to the Holy Quran. Stream recitations from 100+ reciters, control playback with an interactive panel, and manage the bot with owner and moderator roles.

---

## What it does

- **Voice playback** – Join a voice channel, open the control panel, pick a reciter and surah. Audio is streamed from [mp3quran.net](https://www.mp3quran.net).
- **Control panel** – One message with buttons: pause, resume, next, previous, stop, volume, repeat (off / one surah / full queue), auto-next, pick reciter, pick surah, play all, disconnect.
- **Reciters and surahs** – All 114 surahs; many reciters with different recitation styles (e.g. Murattal, Mujawwad). Search reciters by name.
- **Owner and mods** – You set one owner in `.env`. The owner can add moderators. Only owner and mods can open the panel and use bot settings; only the owner can add or remove mods.

---

## Requirements

- **Node.js** 18+
- **FFmpeg** (the project uses `ffmpeg-static`; you may need FFmpeg on the system for voice)
- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/your-username/Quran-Discord-Bot.git
cd Quran-Discord-Bot
npm install
```

### 2. Environment variables

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Edit `.env`:

| Variable       | Required | Description |
|----------------|----------|-------------|
| `DISCORD_TOKEN`| Yes      | Bot token from the Discord Developer Portal |
| `CLIENT_ID`    | Yes      | Application ID (same portal, General Information) |
| `OWNER_ID`     | Yes      | Your Discord user ID (only this user and added mods can use the bot) |
| `GUILD_ID`     | No       | If set, slash commands are deployed to this server only (faster for testing) |
| `DEFAULT_VOLUME` | No     | Default volume 0–100 (default: 80) |

To get your user ID: enable Developer Mode in Discord (Settings > App Settings > Advanced), then right‑click your username and click "Copy User ID".

### 3. Deploy slash commands

Register the bot’s slash commands with Discord:

```bash
npm run deploy
```

- With `GUILD_ID` set: commands appear in that server right away.
- With `GUILD_ID` unset: commands are global and can take up to an hour to show everywhere.

### 4. Start the bot

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

---

## Commands

| Command       | Who can use   | Description |
|---------------|---------------|-------------|
| `/start`      | Owner, Mods   | Send the Quran control panel in this channel (use in a voice channel’s text channel). |
| `/setavatar`  | Owner, Mods   | Change the bot’s avatar (attachment: image file). |
| `/setname`    | Owner, Mods   | Change the bot’s username. |
| `/setstatus`  | Owner, Mods   | Set the bot’s presence (Playing / Listening / Watching / Competing + custom text). |
| `/restart`    | Owner, Mods   | Restart the bot (process exits; use with PM2 or similar to auto-restart). |
| `/addmod`     | Owner only    | Add a user as a moderator (they can use the panel and settings, but not add/remove mods). |
| `/removemod`  | Owner only    | Remove a user from the moderator list. |
| `/listmods`   | Owner only    | List the owner and all moderators. |

Only the owner and moderators can use `/start` and the panel buttons. Everyone else will see an error if they try.

---

## Permissions

- **Owner** – Set in `.env` as `OWNER_ID`. Can do everything: use the panel, change avatar/name/status, restart the bot, and add or remove moderators.
- **Moderators** – Added with `/addmod` by the owner. Can use the panel, change avatar/name/status, and restart the bot. Cannot add or remove mods.

Moderator IDs are stored in `config.json` (created on first run). The owner is not stored in config; only `OWNER_ID` in `.env` defines the owner.

---

## Config file

At first run, the bot creates `config.json` in the project root. It stores:

- **mods** – Array of Discord user IDs that are moderators.
- **activity** – Current presence (e.g. "Playing" with "Use /start to begin"). Used on startup and when you run `/setstatus`.

You can edit `config.json` by hand, but using `/addmod` and `/removemod` is safer. Do not commit `config.json` if it contains your mod list; it is in `.gitignore` by default.

---

## Restarting the bot

`/restart` makes the bot process exit. To have it come back automatically, run it under a process manager:

**PM2 (recommended):**

```bash
npm install -g pm2
pm2 start src/index.js --name quran-bot
pm2 save
pm2 startup
```

After that, when you use `/restart`, PM2 will start the bot again.

---

## Inviting the bot

In the Discord Developer Portal, open your application, go to OAuth2 > URL Generator, and select:

- **Scopes:** `bot`, `applications.commands`
- **Bot permissions:** View Channels, Send Messages, Embed Links, Use Application Commands, Connect, Speak

Use the generated URL to invite the bot to your server. Ensure the bot has Connect and Speak in the voice channel you use.

### Required permissions (exact list)

The bot needs these permissions to work. Each has a permission bit; the combined integer is below.

| Permission | Purpose | Permission code |
|------------|---------|-----------------|
| View Channels | See channels and respond in them | 1024 |
| Send Messages | Send the control panel and command replies | 2048 |
| Embed Links | Send embeds (panel, help, errors) | 16384 |
| Use Application Commands | Let users use slash commands | 2147483648 |
| Connect | Join voice channels | 1048576 |
| Speak | Play audio in voice | 2097152 |

**Combined permission integer (use in OAuth2 URL):** `2150648832`

You can append `&permissions=2150648832` to your invite URL to request exactly these permissions. In the URL Generator, ticking the six permissions above gives the same result.

---

## Project structure

```
Quran-Discord-Bot/
  src/
    index.js           # Entry point, loads commands and events
    deploy.js          # Registers slash commands with Discord
    commands/          # Slash commands (start, setavatar, setname, setstatus, restart, addmod, removemod, listmods)
    events/
      ready.js         # Sets presence from config on startup
    handlers/
      commands.js      # Runs slash command handlers
      interactions.js  # Handles panel buttons and menus
    utils/
      api.js           # mp3quran.net API and caching
      config.js        # config.json read/write (mods, activity)
      logger.js        # Console logging
      panel.js         # Embeds and buttons for the control panel
      permissions.js   # Owner/mod checks
      player.js        # Voice connection and audio playback
      surahs.js        # Surah names (Arabic and English)
  .env.example
  config.json          # Created at runtime; mods and activity
  package.json
  README.md
```

---

## API and data

- Recitations and metadata come from [mp3quran.net API v3](https://www.mp3quran.net/api/v3). Reciter list is cached for 1 hour. Audio is streamed; nothing is stored locally.
- Surah names (Arabic and English) are bundled in the bot for the panel and menus.

---

## Troubleshooting

**"Only the bot owner and moderators can use this command"**  
Set `OWNER_ID` in `.env` to your Discord user ID. Only that user and users added with `/addmod` can use the panel and related commands.

**Commands do not appear**  
Run `npm run deploy`. If you use `GUILD_ID`, commands show up in that server immediately. Without `GUILD_ID`, global commands can take up to an hour.

**Bot does not join voice / no sound**  
Check the bot has Connect and Speak in the voice channel. You must run `/start` from the **text channel attached to that voice channel** (the one you see when you click the voice channel). You must be in the same voice channel.

**Restart does nothing after exit**  
`/restart` only exits the process. Use a process manager (e.g. PM2) so the bot is started again automatically.

**Avatar or username change fails**  
Discord limits username changes to 2 per hour. Avatar must be a valid image (e.g. PNG, JPG) and under 256 KB.

---

## License

This project is open source. Quran audio is provided by [mp3quran.net](https://www.mp3quran.net). Built with [discord.js](https://discord.js.org) and [@discordjs/voice](https://github.com/discordjs/voice).
