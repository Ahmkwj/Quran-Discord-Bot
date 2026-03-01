'use strict';

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection
} = require('@discordjs/voice');

const { buildUrl, parseSurahList } = require('./api');

const guilds = new Map();

function defaultState() {
  return {
    connection:      null,
    player:          null,
    resource:        null,
    reciter:         null,   // full reciter object
    moshaf:          null,   // selected moshaf
    queue:           [],     // array of surah numbers
    queueIndex:      0,
    playing:         false,
    paused:          false,
    volume:          parseInt(process.env.DEFAULT_VOLUME) || 80,
    repeat:          'none', // 'none' | 'one' | 'all'
    autoNext:        true,
    controlMsg:      null,   // the one persistent Message
    voiceChannelId:  null
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
  try { s.connection && s.connection.destroy(); } catch (_) {}
  guilds.delete(guildId);
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
      destroy(guildId);
      refreshPanel(guildId);
    }
  });
}

async function play(guildId, surahNumber) {
  const s = get(guildId);
  if (!s.connection || !s.moshaf) throw new Error('No connection or moshaf not selected');

  const url = buildUrl(s.moshaf.server, surahNumber);

  // Stop old player cleanly
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
    if (s.player !== player) return; // stale listener guard
    handleTrackEnd(guildId, surahNumber);
  });

  player.on('error', err => {
    if (s.player !== player) return;
    console.error(`[Player] guild=${guildId}`, err.message);
    s.playing = false;
    refreshPanel(guildId);
  });

  refreshPanel(guildId);
}

function handleTrackEnd(guildId, finishedSurah) {
  const s = get(guildId);
  if (!s) return;

  if (s.repeat === 'one') {
    play(guildId, finishedSurah).catch(console.error);
    return;
  }

  if (s.queueIndex < s.queue.length - 1) {
    s.queueIndex++;
    play(guildId, s.queue[s.queueIndex]).catch(console.error);
    return;
  }

  if (s.repeat === 'all' && s.queue.length > 0) {
    s.queueIndex = 0;
    play(guildId, s.queue[0]).catch(console.error);
    return;
  }

  if (s.autoNext && s.moshaf) {
    const all = parseSurahList(s.moshaf.surah_list);
    const pos = all.indexOf(finishedSurah);
    if (pos !== -1 && pos < all.length - 1) {
      const next = all[pos + 1];
      s.queue = [next];
      s.queueIndex = 0;
      play(guildId, next).catch(console.error);
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
  if (!s || !s.controlMsg) return;
  const { buildPanel } = require('./panel');
  try {
    const { embeds, components } = buildPanel(s);
    await s.controlMsg.edit({ embeds, components });
  } catch (e) {
    if (e.code !== 10008) console.error('[Panel refresh]', e.message);
  }
}

module.exports = {
  get, destroy, connect, play,
  pause, resume, stop,
  setVolume, cycleRepeat,
  skipNext, skipPrev,
  refreshPanel
};
