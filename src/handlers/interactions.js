'use strict';

const { MessageFlags, EmbedBuilder } = require('discord.js');
const { VoiceConnectionStatus } = require('@discordjs/voice');
const player = require('../utils/player');
const config = require('../utils/config');
const log = require('../utils/logger');
const { isOwnerOrMod } = require('../utils/permissions');
const {
  buildReciterMenu,
  buildReciterSearchModal,
  buildReciterSearchResultsMenu,
  buildMoshafMenu,
  buildSurahMenu,
  errReply,
} = require('../utils/panel');
const { fetchReciters, parseSurahList } = require('../utils/api');

// ── Session store (per-user selection state) ─────────────────────────────────

const sessions = new Map();
const SESSION_TTL = 60 * 60 * 1000;

function getSession(userId) {
  let sess = sessions.get(userId);
  if (!sess || Date.now() - sess.createdAt > SESSION_TTL) {
    sess = { createdAt: Date.now() };
    sessions.set(userId, sess);
  }
  return sess;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
}, 30 * 60 * 1000);

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterReciters(list, query) {
  const q = query.trim().toLowerCase();
  return q ? list.filter(r => r.name.toLowerCase().includes(q)) : list;
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch { /* interaction expired */ }
}

async function ensureVoice(interaction, s) {
  const bound = config.getBoundChannel(interaction.guildId);
  if (!bound) return;

  // Only treat the connection as valid if it is actually Ready
  const isReady = s.connection?.state?.status === VoiceConnectionStatus.Ready;
  if (isReady) return;

  const ch = await interaction.client.channels.fetch(bound.voiceChannelId);
  if (!ch?.isVoiceBased?.()) throw new Error('Voice channel not found.');
  await player.connect(ch);
}

// ── Button handlers ──────────────────────────────────────────────────────────

const buttonHandlers = {
  async btn_pause(interaction, s, guildId) {
    await interaction.deferUpdate();
    await ensureVoice(interaction, s);
    if (!player.pause(guildId)) return safeReply(interaction, errReply('Nothing is playing.'));
    await player.updatePanel(guildId);
  },

  async btn_resume(interaction, s, guildId) {
    await interaction.deferUpdate();
    await ensureVoice(interaction, s);
    if (!player.resume(guildId)) return safeReply(interaction, errReply('Playback is not paused.'));
    await player.updatePanel(guildId);
  },

  async btn_stop(interaction, s, guildId) {
    await interaction.deferUpdate();
    await player.resetToWelcome(guildId);
  },

  async btn_next(interaction, s, guildId) {
    await interaction.deferUpdate();
    await ensureVoice(interaction, s);
    if (!(await player.skipNext(guildId))) return safeReply(interaction, errReply('No next surah.'));
    await player.updatePanel(guildId);
  },

  async btn_prev(interaction, s, guildId) {
    await interaction.deferUpdate();
    await ensureVoice(interaction, s);
    if (!(await player.skipPrev(guildId))) return safeReply(interaction, errReply('No previous surah.'));
    await player.updatePanel(guildId);
  },

  async btn_vol_up(interaction, s, guildId) {
    await interaction.deferUpdate();
    player.setVolume(guildId, s.volume + 10);
    await player.updatePanel(guildId);
  },

  async btn_vol_down(interaction, s, guildId) {
    await interaction.deferUpdate();
    player.setVolume(guildId, s.volume - 10);
    await player.updatePanel(guildId);
  },

  async btn_repeat(interaction, s, guildId) {
    await interaction.deferUpdate();
    player.cycleRepeat(guildId);
    await player.updatePanel(guildId);
  },

  async btn_autonext(interaction, s, guildId) {
    await interaction.deferUpdate();
    s.autoNext = !s.autoNext;
    await player.updatePanel(guildId);
  },

  async btn_disconnect(interaction, s, guildId) {
    await interaction.deferUpdate();
    await player.disconnect(guildId);
    if (s.controlChannelId && s.controlMsgId) {
      try {
        const ch = await interaction.client.channels.fetch(s.controlChannelId);
        const msg = await ch.messages.fetch(s.controlMsgId);
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x1a6b47)
              .setAuthor({ name: 'Disconnected' })
              .setDescription('Use the play command to begin again.')
              .setTimestamp(),
          ],
          components: [],
        });
      } catch { /* message gone */ }
    }
  },

  async btn_play_all(interaction, s, guildId) {
    await interaction.deferUpdate();
    if (!s.moshaf) return safeReply(interaction, errReply('Choose a reciter first.'));
    await ensureVoice(interaction, s);
    const all = parseSurahList(s.moshaf.surah_list);
    if (!all.length) return safeReply(interaction, errReply('No surahs available.'));
    s.queue = all;
    s.queueIndex = 0;
    await player.startNewPlayback(guildId, all[0]);
  },

  async btn_pick_reciter(interaction) {
    const sess = getSession(interaction.user.id);
    let reciters;
    try {
      reciters = await fetchReciters();
    } catch {
      return interaction.reply(errReply('Could not load reciters. Try again later.'));
    }
    sess.reciters = reciters;
    sess.allReciters = reciters;
    const { embeds, components } = buildReciterMenu(reciters);
    return interaction.reply({ embeds, components, flags: MessageFlags.Ephemeral });
  },

  async btn_reciter_search(interaction) {
    return interaction.showModal(buildReciterSearchModal());
  },

  async reciter_cancel(interaction) {
    await interaction.deferUpdate();
    await interaction.deleteReply().catch(() => {});
  },

  async moshaf_cancel(interaction) {
    await interaction.deferUpdate();
    await interaction.deleteReply().catch(() => {});
  },

  async btn_pick_surah(interaction, s) {
    if (!s.moshaf) return interaction.reply(errReply('Choose a reciter first.'));
    const sess = getSession(interaction.user.id);
    sess.reciter = s.reciter;
    sess.moshaf = s.moshaf;
    const { embeds, components } = buildSurahMenu(s.moshaf);
    return interaction.reply({ embeds, components, flags: MessageFlags.Ephemeral });
  },
};

// ── Menu handlers ────────────────────────────────────────────────────────────

const menuHandlers = {
  async menu_reciter(interaction, s) {
    const sess = getSession(interaction.user.id);
    const rid = parseInt(interaction.values[0], 10);
    const reciter = (sess.reciters || []).find(r => r.id === rid);
    if (!reciter) return interaction.reply(errReply('Reciter not found.'));

    sess.reciter = reciter;
    await interaction.deferUpdate();

    if (reciter.moshaf.length === 1) {
      sess.moshaf = reciter.moshaf[0];
      const { embeds, components } = buildSurahMenu(sess.moshaf);
      await interaction.editReply({ embeds, components });
    } else {
      const { embeds, components } = buildMoshafMenu(reciter);
      await interaction.editReply({ embeds, components });
    }
  },

  async menu_moshaf(interaction) {
    const sess = getSession(interaction.user.id);
    const mid = parseInt(interaction.values[0], 10);
    const moshaf = (sess.reciter?.moshaf || []).find(m => m.id === mid);
    if (!moshaf) return interaction.reply(errReply('Recitation not found.'));

    sess.moshaf = moshaf;
    await interaction.deferUpdate();
    const { embeds, components } = buildSurahMenu(moshaf);
    await interaction.editReply({ embeds, components });
  },
};

async function handleSurahMenu(interaction, s, guildId) {
  const value = interaction.values[0];

  if (value === 'surah_cancel') {
    await interaction.deferUpdate();
    await interaction.deleteReply().catch(() => {});
    return;
  }

  const surahNum = parseInt(value, 10);
  if (!Number.isFinite(surahNum)) { await interaction.deferUpdate(); return; }

  const sess = getSession(interaction.user.id);
  if (!sess.reciter || !sess.moshaf) {
    await interaction.deferUpdate();
    return safeReply(interaction, errReply('Selection expired. Click Pick Reciter again.'));
  }

  const available = parseSurahList(sess.moshaf.surah_list);
  if (!available.includes(surahNum)) {
    await interaction.deferUpdate();
    return safeReply(interaction, errReply(`Surah ${surahNum} is not available in this recitation.`));
  }

  await interaction.deferUpdate();

  s.reciter = sess.reciter;
  s.moshaf = sess.moshaf;

  await ensureVoice(interaction, s);

  s.queue = [surahNum];
  s.queueIndex = 0;

  await interaction.deleteReply().catch(() => {});
  await player.startNewPlayback(guildId, surahNum);
}

// ── Modal handlers ───────────────────────────────────────────────────────────

async function handleModal(interaction) {
  if (interaction.customId !== 'modal_reciter_search') return;

  const query = interaction.fields.getTextInputValue('reciter_search_query').trim();
  const sess = getSession(interaction.user.id);
  const fullList = sess.allReciters || sess.reciters || [];
  const matches = filterReciters(fullList, query);

  if (matches.length === 0) {
    return interaction.reply(errReply(`No reciters found for "${query}".`));
  }

  sess.reciters = matches;
  const { embeds, components } = buildReciterSearchResultsMenu(matches, query);
  return interaction.reply({ embeds, components, flags: MessageFlags.Ephemeral });
}

// ── Main handler ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!isOwnerOrMod(userId)) {
      return safeReply(interaction, errReply('Only the bot owner and moderators can use the panel.'));
    }

    // Bound channel check
    const bound = config.getBoundChannel(guildId);
    if (bound && String(interaction.channelId) !== String(bound.commandChannelId)) {
      // Allow modals through (they don't have a channel context restriction)
      if (!interaction.isModalSubmit()) {
        return safeReply(interaction, errReply('Use the panel in the channel where you ran the play command.'));
      }
    }

    const s = player.get(guildId);

    try {
      // Modal submissions
      if (interaction.isModalSubmit()) {
        return await handleModal(interaction);
      }

      // Buttons
      if (interaction.isButton()) {
        const handler = buttonHandlers[interaction.customId];
        if (handler) return await handler(interaction, s, guildId);
        return;
      }

      // Select menus
      if (interaction.isStringSelectMenu()) {
        // Surah menus
        if (interaction.customId.startsWith('menu_surah_')) {
          return await handleSurahMenu(interaction, s, guildId);
        }

        const handler = menuHandlers[interaction.customId];
        if (handler) return await handler(interaction, s, guildId);
        return;
      }
    } catch (err) {
      log.error('INTERACTION', err);
      let msg = 'Something went wrong. Please try again.';
      if (err.message?.includes('Voice') || err.message?.includes('voice') || err.message?.includes('connect')) {
        msg = 'Failed to connect to voice channel. Check bot permissions and try again.';
      } else if (err.message?.includes('timed out') || err.message?.includes('timeout')) {
        msg = 'Voice connection timed out. Try again.';
      }
      await safeReply(interaction, errReply(msg));
    }
  },
};
