'use strict';

const player = require('../utils/player');
const {
  buildPanel,
  buildReciterMenu,
  buildReciterSearchModal,
  buildReciterSearchResultsMenu,
  buildMoshafMenu,
  buildSurahMenu,
  errEmbed
} = require('../utils/panel');
const { fetchReciters, parseSurahList } = require('../utils/api');

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}

function filterRecitersByName(reciters, query) {
  const q = query.trim().toLowerCase();
  if (!q) return reciters;
  return reciters.filter(r => r.name.toLowerCase().includes(q));
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const s = player.get(guildId);
    const sess = getSession(userId);

    // Modal submit: reciter search
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_reciter_search') {
          const query = interaction.fields.getTextInputValue('reciter_search_query').trim();
          const fullList = sess.allReciters || sess.reciters || [];
          const matches = filterRecitersByName(fullList, query);
        try {
          if (matches.length === 0) {
            return interaction.reply({
              embeds: [errEmbed(`No results for "${query}". Try different keywords.`)],
              ephemeral: true
            });
          }
          const payload = buildReciterSearchResultsMenu(matches, query);
          sess.reciters = matches;
          return interaction.reply({ ...payload, ephemeral: true });
        } catch (err) {
          console.error('[Interaction] modal', err);
          return interaction.reply({
            embeds: [errEmbed('Something went wrong. Please try again.')],
            ephemeral: true
          }).catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    // Helper: update the main panel silently
    async function refreshMain() {
      const { embeds, components } = buildPanel(s);
      if (s.controlMsg) {
        try { await s.controlMsg.edit({ embeds, components }); } catch (_) {}
      }
    }

    // Helper: ephemeral error reply
    async function epErr(msg) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errEmbed(msg)], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [errEmbed(msg)], ephemeral: true });
        }
      } catch (_) {}
    }

    try {
      // ═══════════════════════════════════════════════════════════
      //  MAIN PANEL BUTTONS
      // ═══════════════════════════════════════════════════════════

      if (interaction.customId === 'btn_pause') {
        await interaction.deferUpdate();
        if (!player.pause(guildId)) return epErr('Nothing is playing right now.');
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_resume') {
        await interaction.deferUpdate();
        if (!player.resume(guildId)) return epErr('Playback is not paused.');
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_stop') {
        await interaction.deferUpdate();
        player.stop(guildId);
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_next') {
        await interaction.deferUpdate();
        const ok = await player.skipNext(guildId);
        if (!ok) return epErr('No next surah in the queue.');
        return;
      }

      if (interaction.customId === 'btn_prev') {
        await interaction.deferUpdate();
        const ok = await player.skipPrev(guildId);
        if (!ok) return epErr('No previous surah in the queue.');
        return;
      }

      if (interaction.customId === 'btn_vol_up') {
        await interaction.deferUpdate();
        player.setVolume(guildId, s.volume + 10);
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_vol_down') {
        await interaction.deferUpdate();
        player.setVolume(guildId, s.volume - 10);
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_repeat') {
        await interaction.deferUpdate();
        player.cycleRepeat(guildId);
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_autonext') {
        await interaction.deferUpdate();
        s.autoNext = !s.autoNext;
        await refreshMain();
        return;
      }

      if (interaction.customId === 'btn_disconnect') {
        await interaction.deferUpdate();
        player.destroy(guildId);
        if (s.controlMsg) {
          try {
            const { EmbedBuilder } = require('discord.js');
            await s.controlMsg.edit({
              embeds: [new EmbedBuilder()
                .setColor(0x3d3d3d)
                .setAuthor({ name: 'Quran Bot', iconURL: 'https://i.imgur.com/8sEvHGj.png' })
                .setTitle('Disconnected')
                .setDescription('Use `/set` to start again.')
                .setTimestamp()
              ],
              components: []
            });
          } catch (_) {}
        }
        return;
      }

      if (interaction.customId === 'btn_play_all') {
        await interaction.deferUpdate();
        if (!s.moshaf) return epErr('Pick a reciter first.');
        const all = parseSurahList(s.moshaf.surah_list);
        if (!all.length) return epErr('No surahs available for this recitation.');
        s.queue = all;
        s.queueIndex = 0;
        await player.play(guildId, all[0]);
        return;
      }

      // ═══════════════════════════════════════════════════════════
      //  OPEN RECITER BROWSER
      // ═══════════════════════════════════════════════════════════

      if (interaction.customId === 'btn_pick_reciter') {
        let reciters;
        try {
          reciters = await fetchReciters();
        } catch (e) {
          return interaction.reply({ embeds: [errEmbed('Failed to load reciters. Please try again.')], ephemeral: true });
        }
        sess.reciters = reciters;
        sess.allReciters = reciters;
        const payload = buildReciterMenu(reciters);
        return interaction.reply({ ...payload, ephemeral: true });
      }

      if (interaction.customId === 'btn_reciter_search') {
        return interaction.showModal(buildReciterSearchModal());
      }

      if (interaction.customId === 'reciter_cancel') {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      // ═══════════════════════════════════════════════════════════
      //  RECITER SELECTED
      // ═══════════════════════════════════════════════════════════

      if (interaction.customId === 'menu_reciter') {
        const rid = parseInt(interaction.values[0]);
        const reciter = (sess.reciters || []).find(r => r.id === rid);
        if (!reciter) return interaction.reply({ embeds: [errEmbed('Reciter not found.')], ephemeral: true });

        sess.reciter = reciter;

        if (reciter.moshaf.length === 1) {
          sess.moshaf = reciter.moshaf[0];
          await interaction.deferUpdate();
          const payload = buildSurahMenu(sess.moshaf);
          await interaction.editReply({ ...payload });
        } else {
          await interaction.deferUpdate();
          const payload = buildMoshafMenu(reciter);
          await interaction.editReply({ ...payload });
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════
      //  MOSHAF SELECTED
      // ═══════════════════════════════════════════════════════════

      if (interaction.customId === 'menu_moshaf') {
        const mid = parseInt(interaction.values[0]);
        const moshaf = (sess.reciter?.moshaf || []).find(m => m.id === mid);
        if (!moshaf) return interaction.reply({ embeds: [errEmbed('Recitation not found.')], ephemeral: true });
        sess.moshaf = moshaf;
        await interaction.deferUpdate();
        const payload = buildSurahMenu(moshaf);
        await interaction.editReply({ ...payload });
        return;
      }

      if (interaction.customId === 'moshaf_cancel') {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (interaction.customId === 'surah_play_all') {
        await interaction.deferUpdate();
        // Apply selection and play all
        s.reciter    = sess.reciter;
        s.moshaf     = sess.moshaf;
        const all    = parseSurahList(sess.moshaf.surah_list);
        s.queue      = all;
        s.queueIndex = 0;
        await interaction.deleteReply().catch(() => {});
        await player.play(guildId, all[0]);
        return;
      }

      if (interaction.customId === 'surah_cancel') {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      // ═══════════════════════════════════════════════════════════
      //  SURAH SELECTED
      // ═══════════════════════════════════════════════════════════

      if (interaction.customId.startsWith('menu_surah_')) {
        const value = interaction.values[0];
        if (value === 'surah_cancel') {
          await interaction.deferUpdate();
          await interaction.deleteReply().catch(() => {});
          return;
        }
        const surahNum = parseInt(value, 10);
        if (!Number.isFinite(surahNum)) return;
        await interaction.deferUpdate();
        s.reciter = sess.reciter;
        s.moshaf = sess.moshaf;
        s.queue = [surahNum];
        s.queueIndex = 0;
        await interaction.deleteReply().catch(() => {});
        await player.play(guildId, surahNum);
        return;
      }

      // ═══════════════════════════════════════════════════════════
      //  "PICK SURAH" from main panel (within current moshaf)
      // ═══════════════════════════════════════════════════════════

      if (interaction.customId === 'btn_pick_surah') {
        if (!s.moshaf) return interaction.reply({ embeds: [errEmbed('Pick a reciter first.')], ephemeral: true });
        sess.reciter = s.reciter;
        sess.moshaf = s.moshaf;
        const payload = buildSurahMenu(s.moshaf);
        return interaction.reply({ ...payload, ephemeral: true });
      }

    } catch (err) {
      console.error('[Interaction]', err);
      await epErr('An unexpected error occurred. Please try again.');
    }
  }
};
