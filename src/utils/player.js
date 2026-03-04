'use strict';

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
} = require('@discordjs/voice');
const { ActivityType } = require('discord.js');
const { buildUrl, parseSurahList, fetchAudioStream } = require('./api');
const { buildPanel } = require('./panel');
const { getSurah } = require('./surahs');
const config = require('./config');
const log = require('./logger');

// ── State ────────────────────────────────────────────────────────────────────

const guilds = new Map();
let client = null;

function setClient(c) { client = c; }

function defaultState() {
  return {
    connection: null,
    voiceChannelId: null,
    player: null,
    resource: null,
    stream: null,
    playing: false,
    paused: false,
    reciter: null,
    moshaf: null,
    queue: [],
    queueIndex: 0,
    volume: parseInt(process.env.DEFAULT_VOLUME, 10) || 80,
    repeat: 'none',
    autoNext: true,
    controlChannelId: null,
    controlMsgId: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    panelUpdateTimer: null,
  };
}

function get(guildId) {
  if (!guilds.has(guildId)) guilds.set(guildId, defaultState());
  return guilds.get(guildId);
}

// ── Async Lock ───────────────────────────────────────────────────────────────

const locks = new Map();

function withLock(guildId, fn) {
  const prev = locks.get(guildId) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(guildId, next.catch(() => {}));
  return next;
}

// ── Connection helpers ───────────────────────────────────────────────────────

function safeDestroy(conn) {
  if (!conn) return;
  try {
    if (conn.state?.status !== VoiceConnectionStatus.Destroyed) conn.destroy();
  } catch { /* already destroyed */ }
}

function cleanupPlayback(guildId) {
  const s = get(guildId);

  if (s.player) {
    try { s.player.removeAllListeners(); s.player.stop(true); } catch { /* noop */ }
    s.player = null;
  }

  if (s.resource?.playStream) {
    try { s.resource.playStream.destroy(); } catch { /* noop */ }
  }
  s.resource = null;

  if (s.stream && typeof s.stream.destroy === 'function') {
    try { s.stream.destroy(); } catch { /* noop */ }
  }
  s.stream = null;

  s.playing = false;
  s.paused = false;
}

// ── Connect ──────────────────────────────────────────────────────────────────

async function connect(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  return withLock(guildId, async () => {
    const s = get(guildId);
    const existing = getVoiceConnection(guildId);

    if (existing && existing.joinConfig?.channelId === voiceChannel.id) {
      const st = existing.state?.status;
      if (st === VoiceConnectionStatus.Ready) {
        s.connection = existing;
        s.voiceChannelId = voiceChannel.id;
        return;
      }
      if (st === VoiceConnectionStatus.Connecting || st === VoiceConnectionStatus.Signalling) {
        try {
          await entersState(existing, VoiceConnectionStatus.Ready, 20_000);
          s.connection = existing;
          s.voiceChannelId = voiceChannel.id;
          return;
        } catch {
          safeDestroy(existing);
        }
      }
    } else if (existing) {
      safeDestroy(existing);
    }

    const conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      safeDestroy(conn);
      throw new Error('Voice connection timed out. Check bot permissions and try again.');
    }

    setupConnectionHandlers(guildId, conn);
    s.connection = conn;
    s.voiceChannelId = voiceChannel.id;
    s.reconnectAttempts = 0;
    log.success('CONNECT', `Joined voice: ${voiceChannel.name}`);
  });
}

function setupConnectionHandlers(guildId, conn) {
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      const bound = config.getBoundChannel(guildId);
      if (bound && client) {
        reconnectWithBackoff(guildId);
      } else {
        fullDestroy(guildId);
      }
    }
  });

  conn.on(VoiceConnectionStatus.Destroyed, () => {
    const s = guilds.get(guildId);
    if (s && s.connection === conn) s.connection = null;
  });
}

// ── Reconnect ────────────────────────────────────────────────────────────────

function reconnectWithBackoff(guildId) {
  const s = get(guildId);
  const bound = config.getBoundChannel(guildId);
  if (!bound || !client) return;

  if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
  if (s.reconnectAttempts >= 5) {
    log.warn('RECONNECT', `Max attempts reached for guild ${guildId}`);
    fullDestroy(guildId);
    return;
  }

  const delay = Math.min(1000 * Math.pow(2, s.reconnectAttempts), 16_000);
  s.reconnectAttempts++;
  log.info('RECONNECT', `Attempt ${s.reconnectAttempts}/5 in ${delay}ms`);

  s.reconnectTimer = setTimeout(async () => {
    s.reconnectTimer = null;
    const currentSurah = s.queue.length ? s.queue[s.queueIndex] : null;
    const wasPlaying = s.playing && !s.paused;
    const wasPaused = s.paused;
    const hadPlayback = currentSurah && s.moshaf && (s.playing || s.paused);

    try {
      const ch = await client.channels.fetch(bound.voiceChannelId);
      if (!ch?.isVoiceBased?.()) { fullDestroy(guildId); return; }

      cleanupPlayback(guildId);
      if (s.connection) { safeDestroy(s.connection); s.connection = null; }

      await connect(ch);

      if (hadPlayback && s.moshaf) {
        await startPlayback(guildId, currentSurah);
        if (wasPaused) pause(guildId);
        await updatePanel(guildId);
      }
      log.success('RECONNECT', 'Reconnected successfully');
    } catch (err) {
      log.error('RECONNECT', err);
      if (s.reconnectAttempts < 5) reconnectWithBackoff(guildId);
      else fullDestroy(guildId);
    }
  }, delay);
}

// ── Playback ─────────────────────────────────────────────────────────────────

async function startPlayback(guildId, surahNumber) {
  const s = get(guildId);

  const connStatus = s.connection?.state?.status;
  if (!s.connection || connStatus === VoiceConnectionStatus.Destroyed || connStatus === VoiceConnectionStatus.Disconnected) {
    throw new Error('Not connected to voice. Use the play command first.');
  }
  if (!s.moshaf || !s.moshaf.server) {
    throw new Error('No reciter selected. Pick a reciter first.');
  }
  if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
    throw new Error('Invalid surah number.');
  }

  try {
    await entersState(s.connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    throw new Error('Voice connection not ready. Try again.');
  }

  cleanupPlayback(guildId);

  const url = buildUrl(s.moshaf.server, surahNumber);
  let stream;
  try {
    stream = await fetchAudioStream(url);
  } catch (err) {
    log.error('AUDIO_FETCH', err);
    throw new Error('Failed to load audio. Try a different reciter or surah.');
  }

  const audioPlayer = createAudioPlayer();
  const resource = createAudioResource(stream, {
    inlineVolume: true,
    inputType: StreamType.Arbitrary,
  });

  if (resource.volume) resource.volume.setVolume(s.volume / 100);

  audioPlayer.on(AudioPlayerStatus.Idle, () => handleTrackEnd(guildId, surahNumber));
  audioPlayer.on('error', (err) => {
    log.error('PLAYER', err);
    cleanupPlayback(guildId);
    updatePanel(guildId).catch(() => {});
    updatePresence();
  });

  s.connection.subscribe(audioPlayer);
  audioPlayer.play(resource);

  s.player = audioPlayer;
  s.resource = resource;
  s.stream = stream;
  s.playing = true;
  s.paused = false;

  updatePresence();
  log.info('PLAYBACK', `Playing Surah ${surahNumber} — ${s.reciter?.name || 'Unknown'}`);
}

async function startNewPlayback(guildId, surahNumber) {
  const s = get(guildId);
  await startPlayback(guildId, surahNumber);
  await deleteOldBotMessages(guildId);
  await sendNewPanel(guildId);
}

// ── Track end / auto-advance ─────────────────────────────────────────────────

function handleTrackEnd(guildId, finishedSurah) {
  const s = guilds.get(guildId);
  if (!s) return;

  const playNext = (num) => {
    startPlayback(guildId, num)
      .then(() => updatePanel(guildId))
      .catch((err) => {
        log.error('AUTO_PLAY', err);
        s.playing = false;
        s.paused = false;
        updatePanel(guildId).catch(() => {});
        updatePresence();
      });
  };

  if (s.repeat === 'one') { playNext(finishedSurah); return; }

  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    playNext(s.queue[s.queueIndex]);
    return;
  }

  if (s.repeat === 'all' && s.queue.length > 0) {
    s.queueIndex = 0;
    playNext(s.queue[0]);
    return;
  }

  if (s.autoNext && s.moshaf) {
    const allSurahs = parseSurahList(s.moshaf.surah_list);
    const pos = allSurahs.indexOf(finishedSurah);
    if (pos !== -1 && pos < allSurahs.length - 1) {
      const next = allSurahs[pos + 1];
      s.queue = [next];
      s.queueIndex = 0;
      playNext(next);
      return;
    }
  }

  s.playing = false;
  s.paused = false;
  updatePanel(guildId).catch(() => {});
  updatePresence();
}

// ── Controls ─────────────────────────────────────────────────────────────────

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

function setVolume(guildId, vol) {
  const s = get(guildId);
  s.volume = Math.max(0, Math.min(100, vol));
  if (s.resource?.volume) s.resource.volume.setVolume(s.volume / 100);
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
    await startPlayback(guildId, s.queue[s.queueIndex]);
    return true;
  }
  if (s.repeat === 'all' && s.queue.length > 0) {
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

async function resetToWelcome(guildId) {
  const s = get(guildId);
  cleanupPlayback(guildId);
  s.queue = [];
  s.queueIndex = 0;
  s.reciter = null;
  s.moshaf = null;
  s.repeat = 'none';
  s.autoNext = true;

  if (s.controlChannelId && s.controlMsgId && client) {
    try {
      const ch = await client.channels.fetch(s.controlChannelId);
      const msg = await ch.messages.fetch(s.controlMsgId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    } catch { /* channel or message gone */ }
  }
  s.controlMsgId = null;
  await sendNewPanel(guildId);
  updatePresence();
}

async function disconnect(guildId) {
  const s = get(guildId);
  cleanupPlayback(guildId);
  if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
  if (s.connection) { safeDestroy(s.connection); s.connection = null; }
  s.queue = [];
  s.queueIndex = 0;
  s.voiceChannelId = null;
  updatePresence();
}

function fullDestroy(guildId) {
  const s = guilds.get(guildId);
  if (!s) return;
  cleanupPlayback(guildId);
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
  if (s.panelUpdateTimer) clearTimeout(s.panelUpdateTimer);
  if (s.connection) safeDestroy(s.connection);
  guilds.delete(guildId);
  locks.delete(guildId);
  updatePresence();
}

// ── Panel management ─────────────────────────────────────────────────────────

async function deleteOldBotMessages(guildId) {
  const s = get(guildId);
  if (!s.controlChannelId || !client) return;
  try {
    const ch = await client.channels.fetch(s.controlChannelId);
    if (!ch?.isTextBased?.()) return;
    const msgs = await ch.messages.fetch({ limit: 30 });
    const botMsgs = msgs.filter(m => m.author.id === client.user.id);
    for (const [, msg] of botMsgs) {
      await msg.delete().catch(() => {});
    }
  } catch { /* channel gone or no perms */ }
}

async function sendNewPanel(guildId) {
  const s = get(guildId);
  if (!s.controlChannelId || !client) return;
  try {
    const ch = await client.channels.fetch(s.controlChannelId);
    if (!ch?.isTextBased?.()) return;
    const { embeds, components } = buildPanel(s);
    const msg = await ch.send({ embeds, components });
    s.controlMsgId = msg.id;
  } catch (err) {
    log.error('SEND_PANEL', err);
  }
}

async function updatePanel(guildId) {
  const s = get(guildId);
  if (!s.controlChannelId || !s.controlMsgId || !client) return;
  try {
    const ch = await client.channels.fetch(s.controlChannelId);
    if (!ch?.isTextBased?.()) return;
    const msg = await ch.messages.fetch(s.controlMsgId);
    const { embeds, components } = buildPanel(s);
    await msg.edit({ embeds, components });
  } catch (err) {
    if (err.code === 10003 || err.code === 10008) {
      s.controlMsgId = null;
      await sendNewPanel(guildId);
    } else {
      log.error('UPDATE_PANEL', err);
    }
  }
}

// ── Presence ─────────────────────────────────────────────────────────────────

function updatePresence() {
  if (!client?.user) return;

  for (const [, s] of guilds) {
    if ((s.playing || s.paused) && s.queue.length > 0) {
      const surah = getSurah(s.queue[s.queueIndex]);
      const name = s.paused ? `Paused \u00B7 Surah ${surah.en}` : `Surah ${surah.en}`;
      client.user.setPresence({
        activities: [{ name, type: ActivityType.Listening }],
        status: 'online',
      });
      return;
    }
  }

  const act = config.getActivity();
  const typeMap = { Playing: ActivityType.Playing, Listening: ActivityType.Listening, Watching: ActivityType.Watching, Competing: ActivityType.Competing };
  client.user.setPresence({
    activities: [{ name: act.name || 'Use play to begin', type: typeMap[act.type] || ActivityType.Playing }],
    status: 'online',
  });
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

function shutdownAll() {
  for (const [guildId] of guilds) {
    const s = guilds.get(guildId);
    if (!s) continue;
    cleanupPlayback(guildId);
    if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
    if (s.panelUpdateTimer) clearTimeout(s.panelUpdateTimer);
    if (s.connection) safeDestroy(s.connection);
  }
  guilds.clear();
  locks.clear();
}

module.exports = {
  setClient,
  get,
  connect,
  startPlayback,
  startNewPlayback,
  pause,
  resume,
  setVolume,
  cycleRepeat,
  skipNext,
  skipPrev,
  resetToWelcome,
  disconnect,
  fullDestroy,
  updatePanel,
  updatePresence,
  shutdownAll,
};
