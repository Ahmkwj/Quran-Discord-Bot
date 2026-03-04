"use strict";

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
} = require("@discordjs/voice");
const { ActivityType } = require("discord.js");
const { buildUrl, parseSurahList, fetchAudioStream } = require("./api");
const { buildPanel } = require("./panel");
const { getSurah } = require("./surahs");
const log = require("./logger");
const config = require("./config");

// Guild state storage
const guilds = new Map();

// Discord client reference
let discordClient = null;

// Connection locks to prevent race conditions
const connectionLocks = new Map();

/**
 * Set the Discord client reference
 */
function setClient(client) {
  discordClient = client;
}

/**
 * Create default state for a guild
 */
function createDefaultState() {
  return {
    // Connection state
    connection: null,
    voiceChannelId: null,

    // Playback state
    player: null,
    resource: null,
    stream: null,
    playing: false,
    paused: false,

    // Reciter/content state
    reciter: null,
    moshaf: null,

    // Queue state
    queue: [],
    queueIndex: 0,

    // Settings
    volume: parseInt(process.env.DEFAULT_VOLUME) || 80,
    repeat: "none", // none, one, all
    autoNext: true,

    // UI state
    controlChannelId: null,
    controlMsgId: null,

    // Internal state
    idleHandler: null,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    isConnecting: false,
  };
}

/**
 * Get or create guild state
 */
function get(guildId) {
  if (!guilds.has(guildId)) {
    guilds.set(guildId, createDefaultState());
  }
  return guilds.get(guildId);
}

/**
 * Safely destroy a voice connection
 */
function safeDestroyConnection(connection) {
  if (!connection) return;

  try {
    const status = connection.state?.status;
    if (status && status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  } catch (err) {
    // Ignore errors during destruction
    log.warn("SAFE_DESTROY", `Error destroying connection: ${err.message}`);
  }
}

/**
 * Clean up all playback resources for a guild
 */
function cleanupPlayback(guildId) {
  const s = get(guildId);

  // Remove idle handler
  if (s.player && s.idleHandler) {
    try {
      s.player.off(AudioPlayerStatus.Idle, s.idleHandler);
    } catch (_) {}
    s.idleHandler = null;
  }

  // Stop and cleanup player
  if (s.player) {
    try {
      s.player.removeAllListeners();
      s.player.stop(true);
    } catch (_) {}
    s.player = null;
  }

  // Cleanup resource
  if (s.resource) {
    try {
      if (s.resource.playStream) {
        s.resource.playStream.destroy();
      }
    } catch (_) {}
    s.resource = null;
  }

  // Cleanup stream
  if (s.stream) {
    try {
      if (typeof s.stream.destroy === 'function') {
        s.stream.destroy();
      }
    } catch (_) {}
    s.stream = null;
  }

  s.playing = false;
  s.paused = false;
}

/**
 * Acquire connection lock for a guild
 */
async function acquireConnectionLock(guildId) {
  // Wait for any existing connection attempt to complete
  while (connectionLocks.has(guildId)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  connectionLocks.set(guildId, true);
}

/**
 * Release connection lock for a guild
 */
function releaseConnectionLock(guildId) {
  connectionLocks.delete(guildId);
}

/**
 * Connect to a voice channel
 */
async function connect(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  const s = get(guildId);

  // Acquire lock to prevent concurrent connection attempts
  await acquireConnectionLock(guildId);

  try {
    // Check if already connected to same channel
    const existing = getVoiceConnection(guildId);
    if (existing) {
      const existingChannelId = existing.joinConfig?.channelId;

      if (existingChannelId === voiceChannel.id) {
        // Already connected or connecting to same channel
        const status = existing.state?.status;

        if (status === VoiceConnectionStatus.Ready) {
          // Already ready, just update state
          s.connection = existing;
          s.voiceChannelId = voiceChannel.id;
          s.isConnecting = false;
          return;
        }

        if (status === VoiceConnectionStatus.Connecting ||
            status === VoiceConnectionStatus.Signalling) {
          // Wait for existing connection to become ready
          try {
            await entersState(existing, VoiceConnectionStatus.Ready, 15_000);
            s.connection = existing;
            s.voiceChannelId = voiceChannel.id;
            s.isConnecting = false;
            return;
          } catch (err) {
            // Existing connection failed, destroy it and create new
            log.warn("CONNECT", "Existing connection failed, creating new one");
            safeDestroyConnection(existing);
          }
        }
      } else {
        // Different channel, destroy old connection
        safeDestroyConnection(existing);
      }
    }

    s.isConnecting = true;

    // Create new connection
    const conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    // Wait for ready state
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      s.isConnecting = false;
      safeDestroyConnection(conn);
      throw new Error("Failed to connect to voice channel. Please try again.");
    }

    // Setup disconnect handler
    setupDisconnectHandler(guildId, conn);

    // Update state
    s.connection = conn;
    s.voiceChannelId = voiceChannel.id;
    s.isConnecting = false;
    s.reconnectAttempts = 0;

    log.success("CONNECT", `Connected to voice channel: ${voiceChannel.name}`);

  } finally {
    releaseConnectionLock(guildId);
  }
}

/**
 * Setup disconnect handler for automatic reconnection
 */
function setupDisconnectHandler(guildId, conn) {
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    const s = get(guildId);

    try {
      // Try to recover from temporary disconnect
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Recovered, connection is reconnecting
    } catch {
      // Could not recover, need to reconnect
      const bound = config.getBoundChannel(guildId);

      if (bound && discordClient) {
        reconnectWithBackoff(guildId);
      } else {
        destroy(guildId);
      }
    }
  });

  conn.on(VoiceConnectionStatus.Destroyed, () => {
    const s = get(guildId);
    if (s.connection === conn) {
      s.connection = null;
    }
  });
}

/**
 * Reconnect with exponential backoff
 */
function reconnectWithBackoff(guildId) {
  const s = get(guildId);
  const bound = config.getBoundChannel(guildId);

  if (!bound || !discordClient) return;

  // Clear any existing reconnect timeout
  if (s.reconnectTimeout) {
    clearTimeout(s.reconnectTimeout);
    s.reconnectTimeout = null;
  }

  // Check max attempts
  if (s.reconnectAttempts >= 5) {
    log.error("RECONNECT", new Error("Max reconnection attempts reached"), { stack: false });
    destroy(guildId);
    return;
  }

  // Calculate delay: 1s, 2s, 4s, 8s, 16s
  const delay = Math.min(1000 * Math.pow(2, s.reconnectAttempts), 16000);
  s.reconnectAttempts++;

  log.info("RECONNECT", `Attempting reconnect in ${delay}ms (attempt ${s.reconnectAttempts}/5)`);

  s.reconnectTimeout = setTimeout(async () => {
    s.reconnectTimeout = null;

    // Save current playback state
    const currentSurah = s.queue.length ? s.queue[s.queueIndex] : null;
    const wasPaused = s.paused;
    const hadPlayback = currentSurah && s.moshaf && (s.playing || s.paused);

    try {
      const channel = await discordClient.channels.fetch(bound.voiceChannelId);

      if (!channel?.isVoiceBased?.()) {
        log.error("RECONNECT", new Error("Bound channel is not a voice channel"));
        destroy(guildId);
        return;
      }

      // Clean up old state
      cleanupPlayback(guildId);
      if (s.connection) {
        safeDestroyConnection(s.connection);
        s.connection = null;
      }

      // Reconnect
      await connect(channel);

      // Restore playback if needed
      if (hadPlayback && s.moshaf) {
        await startPlayback(guildId, currentSurah);
        if (wasPaused) {
          pause(guildId);
        }
        await updatePanel(guildId);
      }

      log.success("RECONNECT", "Reconnection successful");

    } catch (err) {
      log.error("RECONNECT", err, { stack: false });

      // Try again if under max attempts
      if (s.reconnectAttempts < 5) {
        reconnectWithBackoff(guildId);
      } else {
        destroy(guildId);
      }
    }
  }, delay);
}

/**
 * Start audio playback
 */
async function startPlayback(guildId, surahNumber) {
  const s = get(guildId);

  // Validate state
  if (!s.connection) {
    throw new Error("Not connected to a voice channel. Use the play command first.");
  }

  if (!s.moshaf) {
    throw new Error("No reciter selected. Please select a reciter first.");
  }

  if (!s.moshaf.server) {
    throw new Error("Invalid reciter configuration. Please select a different reciter.");
  }

  if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
    throw new Error(`Invalid surah number: ${surahNumber}. Must be between 1 and 114.`);
  }

  // Ensure connection is ready
  try {
    await entersState(s.connection, VoiceConnectionStatus.Ready, 10_000);
  } catch (err) {
    throw new Error("Voice connection is not ready. Please try again.");
  }

  log.info("PLAYBACK", `Starting playback: Surah ${surahNumber} from ${s.reciter?.name || 'Unknown'}`);

  // Clean up any existing playback
  cleanupPlayback(guildId);

  // Build audio URL
  const url = buildUrl(s.moshaf.server, surahNumber);

  // Fetch audio stream
  let stream;
  try {
    stream = await fetchAudioStream(url);
  } catch (err) {
    log.error("PLAYBACK", err, { stack: false });
    throw new Error("Failed to load audio. Please try again or select a different reciter.");
  }

  // Create player and resource
  const player = createAudioPlayer();
  const resource = createAudioResource(stream, {
    inlineVolume: true,
    inputType: StreamType.Arbitrary,
  });

  // Set volume
  if (resource.volume) {
    resource.volume.setVolume(s.volume / 100);
  }

  // Setup player event handlers
  const idleHandler = () => handleTrackEnd(guildId, surahNumber);
  player.on(AudioPlayerStatus.Idle, idleHandler);

  player.on("error", (err) => {
    log.error("PLAYER", err, { stack: false });
    s.playing = false;
    s.paused = false;
    updatePanel(guildId).catch(() => {});
    updatePresence();
  });

  // Subscribe and play
  s.connection.subscribe(player);
  player.play(resource);

  // Update state
  s.player = player;
  s.resource = resource;
  s.stream = stream;
  s.idleHandler = idleHandler;
  s.playing = true;
  s.paused = false;

  updatePresence();
}

/**
 * Start new playback with panel management
 */
async function startNewPlayback(guildId, surahNumber) {
  const s = get(guildId);

  // Start playback
  await startPlayback(guildId, surahNumber);

  // Delete old bot messages
  if (s.controlChannelId && discordClient) {
    try {
      const channel = await discordClient.channels.fetch(s.controlChannelId);
      if (channel?.isTextBased?.()) {
        const messages = await channel.messages.fetch({ limit: 50 });
        const botMessages = messages.filter(m => m.author.id === discordClient.user.id);

        for (const [, msg] of botMessages) {
          try {
            await msg.delete();
            await new Promise(r => setTimeout(r, 100)); // Rate limit protection
          } catch (err) {
            if (err.code !== 10008) { // Ignore "Unknown Message"
              log.warn("DELETE_MSG", err.message);
            }
          }
        }
      }
    } catch (err) {
      log.warn("DELETE_MSGS", err.message);
    }
  }

  // Send new panel
  await sendNewPanel(guildId);
}

/**
 * Handle track end (auto-advance)
 */
function handleTrackEnd(guildId, finishedSurah) {
  const s = get(guildId);
  if (!s) return;

  const playNext = (surahNum) => {
    startPlayback(guildId, surahNum)
      .then(() => updatePanel(guildId))
      .catch((err) => {
        log.error("AUTO_PLAY", err, { stack: false });
        s.playing = false;
        s.paused = false;
        updatePanel(guildId).catch(() => {});
        updatePresence();
      });
  };

  // Repeat one: replay same track
  if (s.repeat === "one") {
    playNext(finishedSurah);
    return;
  }

  // Check if there's a next track in queue
  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    playNext(s.queue[s.queueIndex]);
    return;
  }

  // Repeat all: loop back to start
  if (s.repeat === "all" && s.queue.length > 0) {
    s.queueIndex = 0;
    playNext(s.queue[0]);
    return;
  }

  // Auto-next: continue to next surah from moshaf
  if (s.autoNext && s.moshaf) {
    const allSurahs = parseSurahList(s.moshaf.surah_list);
    const currentPos = allSurahs.indexOf(finishedSurah);

    if (currentPos !== -1 && currentPos < allSurahs.length - 1) {
      const nextSurah = allSurahs[currentPos + 1];
      s.queue = [nextSurah];
      s.queueIndex = 0;
      playNext(nextSurah);
      return;
    }

    // Reached end of available surahs
    log.info("AUTO_NEXT", "Reached end of available surahs");
  }

  // No more tracks to play
  s.playing = false;
  s.paused = false;
  updatePanel(guildId).catch(() => {});
  updatePresence();
}

/**
 * Pause playback
 */
function pause(guildId) {
  const s = get(guildId);

  if (!s.player || !s.playing || s.paused) {
    return false;
  }

  s.player.pause();
  s.paused = true;
  updatePresence();
  return true;
}

/**
 * Resume playback
 */
function resume(guildId) {
  const s = get(guildId);

  if (!s.player || !s.paused) {
    return false;
  }

  s.player.unpause();
  s.paused = false;
  updatePresence();
  return true;
}

/**
 * Stop playback
 */
function stopPlayback(guildId) {
  cleanupPlayback(guildId);
  updatePresence();
}

/**
 * Set volume
 */
function setVolume(guildId, vol) {
  const s = get(guildId);
  s.volume = Math.max(0, Math.min(100, vol));

  if (s.resource?.volume) {
    s.resource.volume.setVolume(s.volume / 100);
  }

  return s.volume;
}

/**
 * Cycle repeat mode
 */
function cycleRepeat(guildId) {
  const s = get(guildId);
  const modes = ["none", "one", "all"];
  const currentIndex = modes.indexOf(s.repeat);
  s.repeat = modes[(currentIndex + 1) % 3];
  return s.repeat;
}

/**
 * Skip to next track
 */
async function skipNext(guildId) {
  const s = get(guildId);

  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    await startPlayback(guildId, s.queue[s.queueIndex]);
    return true;
  }

  if (s.repeat === "all" && s.queue.length > 0) {
    s.queueIndex = 0;
    await startPlayback(guildId, s.queue[0]);
    return true;
  }

  return false;
}

/**
 * Skip to previous track
 */
async function skipPrev(guildId) {
  const s = get(guildId);

  if (s.queueIndex > 0) {
    s.queueIndex--;
    await startPlayback(guildId, s.queue[s.queueIndex]);
    return true;
  }

  return false;
}

/**
 * Reset to welcome state
 */
async function resetToWelcome(guildId) {
  const s = get(guildId);

  // Stop playback
  cleanupPlayback(guildId);

  // Reset state
  s.queue = [];
  s.queueIndex = 0;
  s.reciter = null;
  s.moshaf = null;
  s.repeat = "none";
  s.autoNext = true;

  // Delete old panel message
  if (s.controlChannelId && s.controlMsgId && discordClient) {
    try {
      const channel = await discordClient.channels.fetch(s.controlChannelId);
      if (channel?.isTextBased?.()) {
        const msg = await channel.messages.fetch(s.controlMsgId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
    } catch (_) {}
  }

  s.controlMsgId = null;

  // Send new panel
  await sendNewPanel(guildId);
  updatePresence();
}

/**
 * Disconnect from voice channel
 */
async function disconnect(guildId) {
  const s = get(guildId);

  // Stop playback
  cleanupPlayback(guildId);

  // Clear reconnect timeout
  if (s.reconnectTimeout) {
    clearTimeout(s.reconnectTimeout);
    s.reconnectTimeout = null;
  }

  // Destroy connection
  if (s.connection) {
    safeDestroyConnection(s.connection);
    s.connection = null;
  }

  // Clear queue
  s.queue = [];
  s.queueIndex = 0;
  s.voiceChannelId = null;

  updatePresence();
}

/**
 * Destroy guild state completely
 */
function destroy(guildId) {
  const s = guilds.get(guildId);
  if (!s) return;

  // Cleanup playback
  cleanupPlayback(guildId);

  // Clear reconnect timeout
  if (s.reconnectTimeout) {
    clearTimeout(s.reconnectTimeout);
  }

  // Destroy connection
  if (s.connection) {
    safeDestroyConnection(s.connection);
  }

  // Remove from map
  guilds.delete(guildId);
  connectionLocks.delete(guildId);

  updatePresence();
}

/**
 * Send new panel message
 */
async function sendNewPanel(guildId) {
  const s = get(guildId);

  if (!s.controlChannelId || !discordClient) return;

  try {
    const channel = await discordClient.channels.fetch(s.controlChannelId);
    if (!channel?.isTextBased?.()) return;

    const { embeds, components } = buildPanel(s);
    const msg = await channel.send({ embeds, components });
    s.controlMsgId = msg.id;
  } catch (err) {
    log.error("SEND_PANEL", err, { stack: false });
  }
}

/**
 * Update existing panel message
 */
async function updatePanel(guildId) {
  const s = get(guildId);

  if (!s.controlChannelId || !s.controlMsgId || !discordClient) return;

  try {
    const channel = await discordClient.channels.fetch(s.controlChannelId);
    if (!channel?.isTextBased?.()) return;

    const msg = await channel.messages.fetch(s.controlMsgId);
    const { embeds, components } = buildPanel(s);
    await msg.edit({ embeds, components });
  } catch (err) {
    if (err.code === 10003 || err.code === 10008) {
      // Channel or message not found, send new panel
      s.controlMsgId = null;
      await sendNewPanel(guildId);
    } else {
      log.error("UPDATE_PANEL", err, { stack: false });
    }
  }
}

/**
 * Update bot presence based on playback state
 */
function updatePresence() {
  if (!discordClient?.user) return;

  const defaultActivity = config.getActivity();
  const typeMap = {
    Playing: ActivityType.Playing,
    Listening: ActivityType.Listening,
    Watching: ActivityType.Watching,
    Competing: ActivityType.Competing,
  };
  const defaultType = typeMap[defaultActivity.type] || ActivityType.Playing;

  // Check if any guild is playing
  for (const [, s] of guilds) {
    if ((s.playing || s.paused) && s.queue.length > 0) {
      const surah = getSurah(s.queue[s.queueIndex]);
      const label = surah ? `Surah ${surah.en}` : "Quran";
      const name = s.paused ? `Paused · ${label}` : label;

      discordClient.user.setPresence({
        activities: [{ name, type: ActivityType.Listening }],
        status: "online",
      });
      return;
    }
  }

  // No active playback
  discordClient.user.setPresence({
    activities: [{ name: defaultActivity.name || "Use play to begin", type: defaultType }],
    status: "online",
  });
}

module.exports = {
  setClient,
  get,
  connect,
  startPlayback,
  startNewPlayback,
  pause,
  resume,
  stopPlayback,
  setVolume,
  cycleRepeat,
  skipNext,
  skipPrev,
  resetToWelcome,
  disconnect,
  destroy,
  updatePanel,
};
