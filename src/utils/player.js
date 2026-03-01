"use strict";

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require("@discordjs/voice");
const { buildUrl, parseSurahList } = require("./api");
const { buildPanel } = require("./panel");
const log = require("./logger");
const config = require("./config");

const guilds = new Map();
let discordClient = null;

function setClient(client) {
  discordClient = client;
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
    if (existing.joinConfig?.channelId === voiceChannel.id) {
      try {
        await entersState(existing, VoiceConnectionStatus.Ready, 10_000);
        s.connection = existing;
        s.voiceChannelId = voiceChannel.id;
        return;
      } catch {
        existing.destroy();
      }
    } else {
      existing.destroy();
    }
  }

  const conn = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  await entersState(conn, VoiceConnectionStatus.Ready, 15_000);
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
        reconnectImmediately(guildId);
      } else {
        destroy(guildId);
      }
    }
  });
}

function reconnectImmediately(guildId) {
  const s = get(guildId);
  const bound = config.getBoundChannel(guildId);
  if (!bound || !discordClient) return;

  const currentSurah = s.queue?.length ? s.queue[s.queueIndex] : null;
  const wasPaused = s.paused;
  const hadPlayback = currentSurah && s.moshaf && (s.playing || s.paused);

  discordClient.channels.fetch(bound.voiceChannelId).then((ch) => {
    if (!ch?.isVoiceBased()) return;

    s.connection = null;
    s.player = null;
    s.playing = false;
    s.paused = false;

    connect(ch)
      .then(() => {
        if (hadPlayback && s.moshaf) {
          return startPlayback(guildId, currentSurah).then(() => {
            if (wasPaused) pause(guildId);
            return updatePanel(guildId);
          });
        }
      })
      .catch((e) => log.error("RECONNECT", e, { stack: false }));
  }).catch((e) => log.error("RECONNECT_FETCH", e, { stack: false }));
}

async function startPlayback(guildId, surahNumber) {
  const s = get(guildId);
  if (!s.connection || !s.moshaf) {
    throw new Error("No connection or moshaf");
  }

  const url = buildUrl(s.moshaf.server, surahNumber);

  if (s.player) {
    s.player.removeAllListeners();
    s.player.stop(true);
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(url, { inlineVolume: true });
  if (resource.volume) resource.volume.setVolume(s.volume / 100);

  s.player = player;
  s.resource = resource;
  s.playing = true;
  s.paused = false;

  s.connection.subscribe(player);
  player.play(resource);

  player.once(AudioPlayerStatus.Idle, () => {
    handleTrackEnd(guildId, surahNumber);
  });

  player.on("error", (err) => {
    log.error("PLAYER", err, { stack: false });
    s.playing = false;
    updatePanel(guildId).catch(() => {});
  });
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
        for (const [, msg] of botMessages) {
          msg.delete().catch(() => {});
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
    }
  }

  s.playing = false;
  updatePanel(guildId).catch(() => {});
}

function pause(guildId) {
  const s = get(guildId);
  if (!s.player || !s.playing || s.paused) return false;
  s.player.pause();
  s.paused = true;
  return true;
}

function resume(guildId) {
  const s = get(guildId);
  if (!s.player || !s.paused) return false;
  s.player.unpause();
  s.paused = false;
  return true;
}

function stopPlayback(guildId) {
  const s = get(guildId);
  if (s.player) {
    s.player.removeAllListeners();
    s.player.stop(true);
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
}

async function disconnect(guildId) {
  const s = get(guildId);
  
  stopPlayback(guildId);
  
  if (s.connection) {
    try {
      s.connection.destroy();
    } catch (_) {}
    s.connection = null;
  }
  
  s.queue = [];
  s.queueIndex = 0;
  s.voiceChannelId = null;
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
  try {
    s.player && s.player.stop(true);
  } catch (_) {}
  try {
    s.connection && s.connection.destroy();
  } catch (_) {}
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
