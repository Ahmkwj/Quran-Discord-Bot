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

const guilds = new Map();
let discordClient = null;

function setClient(client) {
  discordClient = client;
}

// Helper to safely destroy a connection
function safeDestroyConnection(connection) {
  try {
    if (connection && connection.state?.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  } catch (err) {
    log.error("SAFE_DESTROY", err, { stack: false });
  }
}

function updatePresence() {
  if (!discordClient?.user) return;
  const defaultActivity = config.getActivity();
  const defaultType = { Playing: ActivityType.Playing, Listening: ActivityType.Listening, Watching: ActivityType.Watching, Competing: ActivityType.Competing }[defaultActivity.type] || ActivityType.Playing;

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

  discordClient.user.setPresence({
    activities: [{ name: defaultActivity.name || "Use play to begin", type: defaultType }],
    status: "online",
  });
}

function defaultState() {
  return {
    connection: null,
    player: null,
    resource: null,
    reciter: null,
    moshaf: null,
    queue: [],
    queueIndex: 0,
    playing: false,
    paused: false,
    volume: parseInt(process.env.DEFAULT_VOLUME) || 80,
    repeat: "none",
    autoNext: true,
    controlChannelId: null,
    controlMsgId: null,
    voiceChannelId: null,
    idleHandler: null,
    reconnectAttempts: 0,
    reconnectTimeout: null,
  };
}

function get(guildId) {
  if (!guilds.has(guildId)) guilds.set(guildId, defaultState());
  return guilds.get(guildId);
}

async function connect(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  const s = get(guildId);

  const existing = getVoiceConnection(guildId);
  if (existing) {
    // If connecting to same channel, try to reuse connection
    if (existing.joinConfig?.channelId === voiceChannel.id) {
      try {
        // Check if already ready
        if (existing.state?.status === VoiceConnectionStatus.Ready) {
          s.connection = existing;
          s.voiceChannelId = voiceChannel.id;
          return;
        }
        // Try to wait for ready state
        await entersState(existing, VoiceConnectionStatus.Ready, 10_000);
        s.connection = existing;
        s.voiceChannelId = voiceChannel.id;
        return;
      } catch (err) {
        log.warn("CONNECT", "Existing connection failed, creating new one");
        safeDestroyConnection(existing);
      }
    } else {
      // Different channel, destroy old connection
      safeDestroyConnection(existing);
    }
  }

  const conn = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  try {
    await entersState(conn, VoiceConnectionStatus.Ready, 15_000);
  } catch (err) {
    log.error("CONNECT", err, { stack: false });
    safeDestroyConnection(conn);
    throw new Error("Failed to establish voice connection within 15 seconds");
  }

  s.connection = conn;
  s.voiceChannelId = voiceChannel.id;

  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      const bound = config.getBoundChannel(guildId);
      if (bound && discordClient) {
        reconnectWithBackoff(guildId);
      } else {
        destroy(guildId);
      }
    }
  });
}

function reconnectWithBackoff(guildId) {
  const s = get(guildId);
  const bound = config.getBoundChannel(guildId);
  if (!bound || !discordClient) return;

  // Clear existing timeout
  if (s.reconnectTimeout) {
    clearTimeout(s.reconnectTimeout);
    s.reconnectTimeout = null;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
  const delay = Math.min(1000 * Math.pow(2, s.reconnectAttempts), 16000);
  s.reconnectAttempts++;

  log.info("RECONNECT", `Attempting reconnect in ${delay}ms (attempt ${s.reconnectAttempts})`);

  s.reconnectTimeout = setTimeout(() => {
    const currentSurah = s.queue?.length ? s.queue[s.queueIndex] : null;
    const wasPaused = s.paused;
    const hadPlayback = currentSurah && s.moshaf && (s.playing || s.paused);

    discordClient.channels.fetch(bound.voiceChannelId).then((ch) => {
      if (!ch?.isVoiceBased()) return;

      // Clean up old connection before reconnecting
      if (s.connection) {
        safeDestroyConnection(s.connection);
      }
      if (s.player) {
        try {
          if (s.idleHandler) {
            s.player.off(AudioPlayerStatus.Idle, s.idleHandler);
          }
          s.player.removeAllListeners();
          s.player.stop(true);
        } catch (_) {}
      }

      s.connection = null;
      s.player = null;
      s.playing = false;
      s.paused = false;

      connect(ch)
        .then(() => {
          s.reconnectAttempts = 0; // Reset on success

          if (hadPlayback && s.moshaf) {
            return startPlayback(guildId, currentSurah).then(() => {
              if (wasPaused) pause(guildId);
              return updatePanel(guildId);
            });
          }
        })
        .catch((e) => {
          log.error("RECONNECT", e, { stack: false });

          // Retry if under max attempts (5 = ~31s total)
          if (s.reconnectAttempts < 5) {
            reconnectWithBackoff(guildId);
          } else {
            log.error("RECONNECT_MAX", new Error("Max reconnection attempts reached"));
            destroy(guildId);
          }
        });
    }).catch((e) => log.error("RECONNECT_FETCH", e, { stack: false }));
  }, delay);
}

async function startPlayback(guildId, surahNumber) {
  const s = get(guildId);

  // Validate required state
  if (!s.connection) {
    throw new Error("No voice connection established");
  }
  if (!s.moshaf) {
    throw new Error("No moshaf selected");
  }
  if (!s.moshaf.server) {
    throw new Error("Invalid moshaf - missing server URL");
  }
  if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
    throw new Error(`Invalid surah number: ${surahNumber}`);
  }

  // Validate connection is ready
  try {
    await entersState(s.connection, VoiceConnectionStatus.Ready, 5_000);
  } catch (err) {
    log.error("PLAYBACK_CONN", new Error("Voice connection not ready"), { stack: false });
    throw new Error("Voice connection is not ready. Please try again.");
  }

  log.info("PLAYBACK", `Starting playback: Surah ${surahNumber} from ${s.reciter?.name || 'Unknown reciter'}`);
  const url = buildUrl(s.moshaf.server, surahNumber);

  // Clean up old player and listener
  if (s.player) {
    if (s.idleHandler) {
      s.player.off(AudioPlayerStatus.Idle, s.idleHandler);
      s.idleHandler = null;
    }
    s.player.removeAllListeners();
    s.player.stop(true);
  }

  // Destroy old resource
  if (s.resource) {
    try {
      if (s.resource.playStream) {
        s.resource.playStream.destroy();
      }
    } catch (err) {
      log.error("RESOURCE_CLEANUP", err, { stack: false });
    }
    s.resource = null;
  }

  let stream;
  try {
    stream = await fetchAudioStream(url);
  } catch (err) {
    log.error("PLAYBACK", err, { stack: false });
    throw err;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(stream, {
    inlineVolume: true,
    inputType: StreamType.Arbitrary,
  });
  if (resource.volume) resource.volume.setVolume(s.volume / 100);

  s.player = player;
  s.resource = resource;
  s.playing = true;
  s.paused = false;

  s.connection.subscribe(player);
  player.play(resource);

  // Use .on() instead of .once() to ensure listener persists
  const idleHandler = () => handleTrackEnd(guildId, surahNumber);
  s.idleHandler = idleHandler;
  player.on(AudioPlayerStatus.Idle, idleHandler);

  player.on("error", (err) => {
    log.error("PLAYER", err, { stack: false });
    s.playing = false;
    updatePanel(guildId).catch(() => {});
  });

  updatePresence();
}

async function startNewPlayback(guildId, surahNumber) {
  const s = get(guildId);
  await startPlayback(guildId, surahNumber);

  if (s.controlChannelId && discordClient) {
    try {
      const ch = await discordClient.channels.fetch(s.controlChannelId);
      if (ch?.isTextBased?.()) {
        const recent = await ch.messages.fetch({ limit: 50 });
        const botMessages = recent.filter(m => m.author.id === discordClient.user.id);
        // Await deletions to prevent race condition
        for (const [, msg] of botMessages) {
          try {
            await msg.delete();
            await new Promise(r => setTimeout(r, 100)); // Avoid rate limit
          } catch (err) {
            if (err.code !== 10008) { // Ignore "Unknown Message"
              log.error("DELETE_OLD", err, { stack: false });
            }
          }
        }
      }
    } catch (e) {
      log.error("DELETE_OLD", e, { stack: false });
    }
  }

  await sendNewPanel(guildId);
}

async function sendNewPanel(guildId) {
  const s = get(guildId);
  if (!s.controlChannelId || !discordClient) return;

  try {
    const ch = await discordClient.channels.fetch(s.controlChannelId);
    if (!ch?.isTextBased?.()) return;

    const { embeds, components } = buildPanel(s);
    const msg = await ch.send({ embeds, components });
    
    s.controlMsgId = msg.id;
  } catch (e) {
    log.error("SEND_PANEL", e, { stack: false });
  }
}

async function updatePanel(guildId) {
  const s = get(guildId);
  if (!s.controlChannelId || !s.controlMsgId || !discordClient) return;

  try {
    const ch = await discordClient.channels.fetch(s.controlChannelId);
    if (!ch?.isTextBased?.()) return;

    const msg = await ch.messages.fetch(s.controlMsgId);
    const { embeds, components } = buildPanel(s);
    await msg.edit({ embeds, components });
  } catch (e) {
    if (e.code === 10003 || e.code === 10008) {
      s.controlMsgId = null;
      await sendNewPanel(guildId);
    } else {
      log.error("UPDATE_PANEL", e, { stack: false });
    }
  }
}

function handleTrackEnd(guildId, finishedSurah) {
  const s = get(guildId);
  if (!s) return;

  const playNext = (surahNum) => {
    startPlayback(guildId, surahNum)
      .then(() => updatePanel(guildId))
      .catch((err) => {
        log.error("AUTO_PLAY", err, { stack: false });
        s.playing = false;
        updatePanel(guildId).catch(() => {});
      });
  };

  if (s.repeat === "one") {
    playNext(finishedSurah);
    return;
  }

  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    playNext(s.queue[s.queueIndex]);
    return;
  }

  if (s.repeat === "all" && s.queue.length > 0) {
    s.queueIndex = 0;
    playNext(s.queue[0]);
    return;
  }

  if (s.autoNext && s.moshaf) {
    const all = parseSurahList(s.moshaf.surah_list);
    const pos = all.indexOf(finishedSurah);
    if (pos !== -1 && pos < all.length - 1) {
      const next = all[pos + 1];
      s.queue = [next];
      s.queueIndex = 0;
      playNext(next);
      return;
    } else if (pos !== -1 && pos === all.length - 1) {
      // Reached end of available surahs
      log.info("AUTO_NEXT", "Reached end of available surahs for this reciter");
      s.playing = false;
      updatePanel(guildId).catch(() => {});
      updatePresence();
      return;
    }
  }

  s.playing = false;
  updatePanel(guildId).catch(() => {});
  updatePresence();
}

function pause(guildId) {
  const s = get(guildId);
  if (!s.player || !s.playing || s.paused) return false;
  s.player.pause();
  s.paused = true;
  updatePresence();
  return true;
}

function resume(guildId) {
  const s = get(guildId);
  if (!s.player || !s.paused) return false;
  s.player.unpause();
  s.paused = false;
  updatePresence();
  return true;
}

function stopPlayback(guildId) {
  const s = get(guildId);
  if (s.player) {
    if (s.idleHandler) {
      s.player.off(AudioPlayerStatus.Idle, s.idleHandler);
      s.idleHandler = null;
    }
    s.player.removeAllListeners();
    s.player.stop(true);
  }
  if (s.resource) {
    try {
      if (s.resource.playStream) s.resource.playStream.destroy();
    } catch (_) {}
    s.resource = null;
  }
  s.playing = false;
  s.paused = false;
}

async function resetToWelcome(guildId) {
  const s = get(guildId);
  
  stopPlayback(guildId);
  
  s.queue = [];
  s.queueIndex = 0;
  s.reciter = null;
  s.moshaf = null;
  s.repeat = "none";
  s.autoNext = true;

  if (s.controlChannelId && s.controlMsgId && discordClient) {
    try {
      const ch = await discordClient.channels.fetch(s.controlChannelId);
      if (ch?.isTextBased?.()) {
        try {
          const msg = await ch.messages.fetch(s.controlMsgId);
          await msg.delete();
        } catch (_) {}
      }
    } catch (_) {}
  }

  s.controlMsgId = null;
  await sendNewPanel(guildId);
  updatePresence();
}

async function disconnect(guildId) {
  const s = get(guildId);

  stopPlayback(guildId);

  if (s.connection) {
    safeDestroyConnection(s.connection);
    s.connection = null;
  }

  s.queue = [];
  s.queueIndex = 0;
  s.voiceChannelId = null;
  updatePresence();
}

function setVolume(guildId, vol) {
  const s = get(guildId);
  s.volume = Math.max(0, Math.min(100, vol));
  if (s.resource?.volume) s.resource.volume.setVolume(s.volume / 100);
  return s.volume;
}

function cycleRepeat(guildId) {
  const s = get(guildId);
  const modes = ["none", "one", "all"];
  s.repeat = modes[(modes.indexOf(s.repeat) + 1) % 3];
  return s.repeat;
}

async function skipNext(guildId) {
  const s = get(guildId);
  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    await startPlayback(guildId, s.queue[s.queueIndex]);
    return true;
  }
  if (s.repeat === "all" && s.queue.length) {
    s.queueIndex = 0;
    await startPlayback(guildId, s.queue[0]);
    return true;
  }
  return false;
}

async function skipPrev(guildId) {
  const s = get(guildId);
  if (s.queueIndex > 0) {
    s.queueIndex--;
    await startPlayback(guildId, s.queue[s.queueIndex]);
    return true;
  }
  return false;
}

function destroy(guildId) {
  const s = guilds.get(guildId);
  if (!s) return;

  // Clean up player
  if (s.player) {
    try {
      if (s.idleHandler) {
        s.player.off(AudioPlayerStatus.Idle, s.idleHandler);
      }
      s.player.removeAllListeners();
      s.player.stop(true);
    } catch (err) {
      log.error("DESTROY_PLAYER", err, { stack: false });
    }
  }

  // Clean up resource
  if (s.resource) {
    try {
      if (s.resource.playStream) {
        s.resource.playStream.destroy();
      }
    } catch (err) {
      log.error("DESTROY_RESOURCE", err, { stack: false });
    }
  }

  // Clean up connection
  if (s.connection) {
    safeDestroyConnection(s.connection);
  }

  // Clear any pending timeouts
  if (s.reconnectTimeout) {
    clearTimeout(s.reconnectTimeout);
  }

  guilds.delete(guildId);
}

module.exports = {
  get,
  destroy,
  connect,
  setClient,
  startNewPlayback,
  pause,
  resume,
  stopPlayback,
  resetToWelcome,
  disconnect,
  setVolume,
  cycleRepeat,
  skipNext,
  skipPrev,
  updatePanel,
};
