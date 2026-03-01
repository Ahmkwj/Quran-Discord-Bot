# Quran Discord Bot Migration Complete

## Migration to Slash Commands ✅

The bot has been successfully migrated from mention-based commands to Discord slash commands.

### What Changed

**Before:** `@Bot play`  
**Now:** `/play`

All commands now use Discord's native slash command system for better UX and discoverability.

### Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   
   Make sure your `.env` file has:
   ```env
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_bot_client_id
   OWNER_ID=your_discord_user_id
   DEFAULT_VOLUME=80
   ```

3. **Deploy slash commands:**
   ```bash
   npm run deploy
   ```
   
   This registers all commands globally. Commands may take up to 1 hour to appear everywhere.

4. **Start the bot:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

### Available Slash Commands

#### Playback
- `/play` - Start the Quran bot panel (creates interactive player)

#### Bot Management (Owner/Mod)
- `/settings` - Show current bot configuration
- `/restart` - Restart the bot (requires process manager)
- `/setstatus` - Set bot presence (type and status text)
- `/setname` - Change bot username
- `/setavatar` - Change bot avatar

#### Moderator Management (Owner only)
- `/addmod` - Add a user as moderator
- `/removemod` - Remove a user from moderators
- `/listmods` - List all moderators

#### Other
- `/help` - List all available commands

### Bot Permissions Required

The bot needs these permissions:
- `applications.commands` (for slash commands)
- `Connect` and `Speak` in voice channels
- `Send Messages` and `Embed Links` in text channels
- `Read Message History` (for panel updates)

### Developer Notes

**File Structure Changes:**
- ✅ All commands now use `SlashCommandBuilder`
- ✅ Commands export `data` (slash command definition) and `execute` function
- ✅ Removed old mention-based command handler (`src/handlers/commands.js`)
- ✅ Updated `index.js` to only handle interactions
- ✅ Created `src/deploy-commands.js` for command registration
- ✅ Updated permissions helper for slash command interactions
- ✅ All commands properly validate and use interaction options

**Intents:**
- Removed `GuildMessages` and `MessageContent` (no longer needed)
- Kept `Guilds` and `GuildVoiceStates` (required for voice and slash commands)

**NPM Scripts:**
- `npm start` - Run bot in production
- `npm run dev` - Run with nodemon for development
- `npm run deploy` - Register/update slash commands

### Troubleshooting

**Commands not showing up?**
1. Make sure you ran `npm run deploy`
2. Wait up to 1 hour for global commands to propagate
3. Check console for deployment errors
4. Verify `CLIENT_ID` is correct in `.env`

**Permission errors?**
- Ensure bot has `applications.commands` scope when inviting
- Re-invite bot with updated permissions if needed

**Bot not responding to commands?**
- Check console for errors
- Verify bot is online
- Ensure bot has required channel permissions
