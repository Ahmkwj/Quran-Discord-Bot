# 🕌 Quran Discord Bot

A fully-featured Discord bot for listening to Quran recitations with beautiful embeds, interactive controls, and a complete audio player experience.

---

## ✨ Features

- 🎙️ **100+ Reciters** from the mp3quran.net API
- 📜 **All 114 Surahs** with Arabic & English names
- 🎵 **Full Audio Player** with pause, resume, skip, repeat, volume
- 🔁 **Repeat Modes** — Off, Repeat One, Repeat All
- 📋 **Queue System** — Play a single surah or all available surahs
- ⚙️ **Settings Panel** — Volume, autoplay, language, repeat mode
- 🌍 **Language Toggle** — Arabic / English reciter names
- 🔀 **Multiple Recitation Styles** — some reciters have Mujawwad, Murattal, etc.
- 🌙 **Beautiful Embeds** with Islamic green color theme
- ▶️ **Auto-play** — automatically plays next surah after current ends
- 🔍 **Surah Search** — search by name in Arabic or English

---

## 📋 Prerequisites

- **Node.js** v18 or higher
- **FFmpeg** (handled by `ffmpeg-static` package)
- A Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

---

## 🚀 Setup

### 1. Clone and Install

```bash
git clone <your-repo>
cd quran-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_guild_id_for_testing   # Remove for global deployment
DEFAULT_VOLUME=80
```

### 3. Deploy Commands

```bash
# Deploy to a specific server (instant, for testing)
npm run deploy

# For global deployment, remove GUILD_ID from .env first
npm run deploy
```

### 4. Start the Bot

```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

---

## 🤖 Discord Bot Permissions

When adding the bot to your server, make sure to grant these permissions:

- ✅ **View Channels**
- ✅ **Send Messages**
- ✅ **Embed Links**
- ✅ **Use Slash Commands**
- ✅ **Connect** (Voice)
- ✅ **Speak** (Voice)
- ✅ **Use Voice Activity**

**OAuth2 Scopes needed:** `bot` + `applications.commands`

**Permission Integer:** `3148800`

---

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `/play` | Browse reciters and select a surah to play |
| `/play surah:<n>` | Play a specific surah with the current reciter |
| `/stop` | Stop playback and disconnect |
| `/volume <0-100>` | Set the volume level |
| `/queue` | View the current playback queue |
| `/settings` | Open the settings panel |
| `/reciter` | View current reciter info |
| `/surah <number>` | Get info about a specific surah |
| `/surah search:<name>` | Search for a surah by name |
| `/help` | Show all commands |

---

## 🎛️ Player Controls (Buttons)

| Button | Action |
|--------|--------|
| ⏮️ Previous | Go to previous surah in queue |
| ⏸️ Pause / ▶️ Resume | Pause or resume playback |
| ⏭️ Next | Skip to next surah |
| ⏹️ Stop | Stop and disconnect |
| 🔁 Repeat | Cycle: Off → One → All |
| 🔉 Vol - | Decrease volume by 10% |
| 🔊 Vol + | Increase volume by 10% |
| 📋 Queue | Show the current queue |
| ⚙️ Settings | Open settings panel |

---

## 🏗️ Project Structure

```
quran-bot/
├── src/
│   ├── commands/
│   │   ├── play.js        # Main play command with reciter/surah selection
│   │   ├── stop.js        # Stop and disconnect
│   │   ├── volume.js      # Set volume
│   │   ├── queue.js       # View queue
│   │   ├── settings.js    # Settings panel
│   │   ├── reciter.js     # Reciter info
│   │   ├── surah.js       # Surah info & search
│   │   └── help.js        # Help command
│   ├── events/
│   │   └── ready.js       # Bot ready event, status rotation
│   ├── handlers/
│   │   ├── commandHandler.js  # Slash command routing
│   │   └── buttonHandler.js   # Button/select menu routing
│   ├── utils/
│   │   ├── quranApi.js    # API calls with caching
│   │   ├── surahNames.js  # All 114 surah names (AR + EN)
│   │   ├── embedBuilder.js # All embeds + button builders
│   │   └── playerManager.js # Voice + audio player management
│   ├── index.js           # Entry point
│   └── deploy-commands.js # Command deployment script
├── .env.example
├── package.json
└── README.md
```

---

## 🌐 API

This bot uses the free [mp3quran.net API v3](https://www.mp3quran.net/api/v3/reciters).

- Reciter data is cached for 1 hour to minimize API calls
- Audio is streamed directly from mp3quran.net servers
- No audio files are stored locally

---

## 🔧 Troubleshooting

**Bot doesn't join voice channel:**
- Check that the bot has Connect + Speak permissions
- Make sure you're in a voice channel when using `/play`

**No sound / audio errors:**
- Ensure `ffmpeg-static` installed correctly: `npm install ffmpeg-static`
- Try `npm rebuild` if you have native dependency issues

**Commands not appearing:**
- Run `npm run deploy` again
- For guild commands: appears instantly
- For global commands: can take up to 1 hour

**`sodium-native` errors on install:**
- Install build tools: `npm install --global windows-build-tools` (Windows)
- Or: `apt-get install build-essential` (Linux)

---

## 💚 Credits

- Quran audio provided by [mp3quran.net](https://www.mp3quran.net)
- Built with [discord.js](https://discord.js.org) and [@discordjs/voice](https://github.com/discordjs/voice)

---

*بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ — May Allah accept this work.*
