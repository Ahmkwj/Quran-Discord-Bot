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
const log = require("./logger");
const config = require("./config");

const guilds = new Map();
const reconnecting = new Set();
let discordClient = null;

function setClient(client) {
  discordClient = client;
}

async function ensureInBoundChannel(guildId) {
  const bound = config.getBoundChannel(guildId);
  if (!bound || !discordClient) return;
  if (reconnecting.has(guildId)) return;
  const s = get(guildId);
  const existing = getVoiceConnection(guildId);
  if (existing && existing.joinConfig && existing.joinConfig.channelId === bound.voiceChannelId) return;
  const currentSurah = s.queue && s.queue.length ? s.queue[s.queueIndex] : null;
  const wasPaused = s.paused;
  const hadPlayback = currentSurah && s.moshaf && (s.playing || s.paused);
  reconnecting.add(guildId);
  try {
    if (existing) try { existing.destroy(); } catch (_) {}
    clearConnectionState(s);
    await new Promise((r) => setTimeout(r, 600));
    const ch = await discordClient.channels.fetch(bound.voiceChannelId);
    if (!ch || !ch.isVoiceBased()) return;
    await connect(ch);
    if (hadPlayback && s.moshaf) {
      await play(guildId, currentSurah).catch((e) => log.error("PLAYER", e, { stack: false }));
      if (wasPaused) pause(guildId);
    }
    refreshPanel(guildId);
  } catch (e) {
    log.error("PLAYER", e, { stack: false });
  } finally {
    reconnecting.delete(guildId);
  }
}

function clearConnectionState(s) {
  if (!s) return;
  try { s.player && s.player.removeAllListeners(); s.player && s.player.stop(true); } catch (_) {}
  s.connection = null;
  s.voiceChannelId = null;
  s.player = null;
  s.resource = null;
  s.playing = false;
  s.paused = false;
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
    controlMsg: null,
    controlChannelId: null,
    controlMsgId: null,
    voiceChannelId: null,
  };
}

function get(guildId) {
  if (!guilds.has(guildId)) guilds.set(guildId, defaultState());
  return guilds.get(guildId);
}

function destroy(guildId) {
  const s = guilds.get(guildId);
  if (!s) return;
  try { s.player && s.player.stop(true); } catch (_) {}
  s.playing = false;
  s.paused = false;
  s.queue = [];
  s.queueIndex = 0;
  const bound = config.getBoundChannel(guildId);
  if (!bound) {
    try { s.connection && s.connection.destroy(); } catch (_) {}
    guilds.delete(guildId);
  }
  refreshPanel(guildId);
}

function forceLeave(guildId) {
  const s = guilds.get(guildId);
  if (!s) return;
  try { s.player && s.player.stop(true); } catch (_) {}
  try { s.connection && s.connection.destroy(); } catch (_) {}
  guilds.delete(guildId);
  refreshPanel(guildId);
}

async function connect(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  const s = get(guildId);

  const existing = getVoiceConnection(guildId);
  if (existing) {
    if (existing.joinConfig && existing.joinConfig.channelId === voiceChannel.id) {
      s.connection = existing;
      return;
    }
    existing.destroy();
  }

  const conn = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true
  });

  await entersState(conn, VoiceConnectionStatus.Ready, 15000);
  s.connection = conn;
  s.voiceChannelId = voiceChannel.id;

  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5000)
      ]);
    } catch {
      const bound = config.getBoundChannel(guildId);
      if (bound && discordClient && !reconnecting.has(guildId)) {
        reconnecting.add(guildId);
        const s = guilds.get(guildId);
        const currentSurah = s && s.queue && s.queue.length ? s.queue[s.queueIndex] : null;
        const wasPaused = s && s.paused;
        const hadPlayback = currentSurah && s && s.moshaf && (s.playing || s.paused);
        try {
          const existing = getVoiceConnection(guildId);
          if (existing) try { existing.destroy(); } catch (_) {}
          if (s) clearConnectionState(s);
          await new Promise((r) => setTimeout(r, 800));
          const voiceChannel = await discordClient.channels.fetch(bound.voiceChannelId);
          if (voiceChannel && voiceChannel.isVoiceBased()) {
            await connect(voiceChannel);
            const state = get(guildId);
            if (hadPlayback && state.moshaf) {
              await play(guildId, currentSurah).catch((e) => log.error("PLAYER", e, { stack: false }));
              if (wasPaused) pause(guildId);
            }
            refreshPanel(guildId);
          } else {
            refreshPanel(guildId);
          }
        } catch (e) {
          log.error("PLAYER", e, { stack: false });
          refreshPanel(guildId);
        } finally {
          reconnecting.delete(guildId);
        }
        return;
      }
      destroy(guildId);
      refreshPanel(guildId);
    }
  });
}

async function play(guildId, surahNumber) {
  const s = get(guildId);
  if (!s.connection || !s.moshaf) throw new Error('No connection or moshaf not selected');

  const url = buildUrl(s.moshaf.server, surahNumber);

  if (s.player) {
    s.player.removeAllListeners();
    s.player.stop(true);
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(url, { inlineVolume: true });
  if (resource.volume) resource.volume.setVolume(s.volume / 100);

  s.player   = player;
  s.resource = resource;
  s.playing  = true;
  s.paused   = false;

  s.connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    if (s.player !== player) return;
    handleTrackEnd(guildId, surahNumber);
  });

  player.on("error", (err) => {
    if (s.player !== player) return;
    log.error("PLAYER", err, { stack: false });
    s.playing = false;
    refreshPanel(guildId);
  });

  refreshPanel(guildId);
}

function handleTrackEnd(guildId, finishedSurah) {
  const s = get(guildId);
  if (!s) return;

  if (s.repeat === "one") {
    play(guildId, finishedSurah).catch((err) => log.error("PLAYER", err, { stack: false }));
    return;
  }

  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    play(guildId, s.queue[s.queueIndex]).catch((err) => log.error("PLAYER", err, { stack: false }));
    return;
  }

  if (s.repeat === "all" && s.queue.length > 0) {
    s.queueIndex = 0;
    play(guildId, s.queue[0]).catch((err) => log.error("PLAYER", err, { stack: false }));
    return;
  }

  if (s.autoNext && s.moshaf) {
    const all = parseSurahList(s.moshaf.surah_list);
    const pos = all.indexOf(finishedSurah);
    if (pos !== -1 && pos < all.length - 1) {
      const next = all[pos + 1];
      s.queue = [next];
      s.queueIndex = 0;
      play(guildId, next).catch((err) => log.error("PLAYER", err, { stack: false }));
      return;
    }
  }

  s.playing = false;
  refreshPanel(guildId);
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

function stop(guildId) {
  const s = get(guildId);
  if (s.player) { s.player.removeAllListeners(); s.player.stop(true); }
  s.playing = false;
  s.paused  = false;
}

function setVolume(guildId, vol) {
  const s = get(guildId);
  s.volume = Math.max(0, Math.min(100, vol));
  if (s.resource && s.resource.volume) s.resource.volume.setVolume(s.volume / 100);
  return s.volume;
}

function cycleRepeat(guildId) {
  const s = get(guildId);
  const modes = ['none', 'one', 'all'];
  s.repeat = modes[(modes.indexOf(s.repeat) + 1) % 3];
  return s.repeat;
}

async function skipNext(guildId) {
  const s = get(guildId);
  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    await play(guildId, s.queue[s.queueIndex]);
    return true;
  }
  if (s.repeat === 'all' && s.queue.length) {
    s.queueIndex = 0;
    await play(guildId, s.queue[0]);
    return true;
  }
  return false;
}

async function skipPrev(guildId) {
  const s = get(guildId);
  if (s.queueIndex > 0) {
    s.queueIndex--;
    await play(guildId, s.queue[s.queueIndex]);
    return true;
  }
  return false;
}

async function refreshPanel(guildId) {
  const s = guilds.get(guildId);
  if (!s) return;
  const channelId = s.controlChannelId;
  const msgId = s.controlMsgId;
  if (!channelId || !msgId || !discordClient) return;
  const { buildPanel } = require('./panel');
  try {
    const ch = await discordClient.channels.fetch(channelId);
    if (!ch?.isTextBased?.()) return;
    const msg = await ch.messages.fetch(msgId);
    const { embeds, components } = buildPanel(s);
    await msg.edit({ embeds, components });
  } catch (e) {
    if (e.code === 10003 || e.code === 10008) {
      s.controlMsg = null;
      s.controlChannelId = null;
      s.controlMsgId = null;
    } else {
      log.error("PANEL", e, { stack: false });
    }
  }
}

module.exports = {
  get,
  destroy,
  forceLeave,
  connect,
  setClient,
  ensureInBoundChannel,
  play,
  pause,
  resume,
  stop,
  setVolume,
  cycleRepeat,
  skipNext,
  skipPrev,
  refreshPanel,
};
