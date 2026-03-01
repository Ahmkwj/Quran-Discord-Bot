"use strict";

const { MessageFlags, EmbedBuilder } = require("discord.js");
const player = require("../utils/player");
const config = require("../utils/config");
const log = require("../utils/logger");
const { isOwnerOrMod } = require("../utils/permissions");
const {
  buildPanel,
  buildReciterMenu,
  buildReciterSearchModal,
  buildReciterSearchResultsMenu,
  buildMoshafMenu,
  buildSurahMenu,
  errReply,
} = require("../utils/panel");
const { fetchReciters, parseSurahList } = require("../utils/api");

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}

function filterRecitersByName(reciters, query) {
  const q = query.trim().toLowerCase();
  if (!q) return reciters;
  return reciters.filter((r) => r.name.toLowerCase().includes(q));
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const s = player.get(guildId);
    const sess = getSession(userId);

    if (interaction.isModalSubmit()) {
      if (!isOwnerOrMod(userId)) {
        try {
          await interaction.reply(errReply("Only the bot owner and moderators can use the panel."));
        } catch (_) {}
        return;
      }
      const boundModal = config.getBoundChannel(interaction.guildId);
      if (boundModal && String(interaction.channelId) !== String(boundModal.commandChannelId)) {
        try {
          await interaction.reply(errReply("Use the panel in the channel where you ran the play command."));
        } catch (_) {}
        return;
      }
      if (interaction.customId === "modal_reciter_search") {
        const query = interaction.fields
          .getTextInputValue("reciter_search_query")
          .trim();
        const fullList = sess.allReciters || sess.reciters || [];
        const matches = filterRecitersByName(fullList, query);
        try {
          if (matches.length === 0) {
            return interaction.reply(
              errReply(`No reciters found for "${query}". Try a different search.`)
            );
          }
          const payload = buildReciterSearchResultsMenu(matches, query);
          sess.reciters = matches;
          return interaction.reply({
            ...payload,
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          log.error("INTERACTION", err);
          return interaction.reply(errReply("Something went wrong. Please try again.")).catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    if (!isOwnerOrMod(userId)) {
      try {
        await interaction.reply(errReply("Only the bot owner and moderators can use the panel."));
      } catch (_) {}
      return;
    }

    const bound = config.getBoundChannel(guildId);
    if (bound && String(interaction.channelId) !== String(bound.commandChannelId)) {
      try {
        await interaction.reply(errReply("Use the panel in the channel where you ran the play command."));
      } catch (_) {}
      return;
    }

    async function refreshMain() {
      await player.refreshPanel(guildId);
    }

    async function ensureConnection() {
      if (bound && !s.connection) await player.ensureInBoundChannel(guildId);
    }

    async function epErr(msg) {
      const payload = errReply(msg);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (_) {}
    }

    try {
      if (interaction.customId === "btn_pause") {
        await interaction.deferUpdate();
        await ensureConnection();
        if (!player.pause(guildId))
          return epErr("Nothing is playing. Choose a reciter and surah first.");
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_resume") {
        await interaction.deferUpdate();
        await ensureConnection();
        if (!player.resume(guildId)) return epErr("Playback is not paused. Nothing to resume.");
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_stop") {
        await interaction.deferUpdate();
        player.stop(guildId);
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_next") {
        await interaction.deferUpdate();
        await ensureConnection();
        const ok = await player.skipNext(guildId);
        if (!ok) return epErr("There is no next surah in the queue.");
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_prev") {
        await interaction.deferUpdate();
        await ensureConnection();
        const ok = await player.skipPrev(guildId);
        if (!ok) return epErr("There is no previous surah in the queue.");
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_vol_up") {
        await interaction.deferUpdate();
        player.setVolume(guildId, s.volume + 10);
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_vol_down") {
        await interaction.deferUpdate();
        player.setVolume(guildId, s.volume - 10);
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_repeat") {
        await interaction.deferUpdate();
        player.cycleRepeat(guildId);
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_autonext") {
        await interaction.deferUpdate();
        s.autoNext = !s.autoNext;
        await refreshMain();
        return;
      }

      if (interaction.customId === "btn_disconnect") {
        await interaction.deferUpdate();
        if (bound) {
          player.stop(guildId);
          s.queue = [];
          s.queueIndex = 0;
        } else {
          player.destroy(guildId);
        }
        if (s.controlChannelId && s.controlMsgId) {
          try {
            const ch = await interaction.client.channels.fetch(s.controlChannelId);
            const msg = await ch.messages.fetch(s.controlMsgId);
            await msg.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x2b5f4a)
                  .setAuthor({ name: bound ? "Stopped" : "Disconnected" })
                  .setDescription(bound ? "Playback stopped. Use the play command to open the panel again." : "Use the play command to begin again.")
                  .setTimestamp(),
              ],
              components: [],
            });
          } catch (_) {}
        }
        return;
      }

      if (interaction.customId === "btn_play_all") {
        await interaction.deferUpdate();
        if (!s.moshaf) return epErr("Choose a reciter first, then you can play all.");
        await ensureConnection();
        if (bound && !s.connection) return epErr("Could not reconnect to the voice channel. Try again or run the play command.");
        const all = parseSurahList(s.moshaf.surah_list);
        if (!all.length)
          return epErr("No surahs available for this recitation.");
        s.queue = all;
        s.queueIndex = 0;
        await player.play(guildId, all[0]);
        return;
      }

      if (interaction.customId === "btn_pick_reciter") {
        let reciters;
        try {
          reciters = await fetchReciters();
        } catch (e) {
          return interaction.reply(errReply("Could not load reciters. Try again later."));
        }
        sess.reciters = reciters;
        sess.allReciters = reciters;
        const payload = buildReciterMenu(reciters);
        return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === "btn_reciter_search") {
        return interaction.showModal(buildReciterSearchModal());
      }

      if (interaction.customId === "reciter_cancel") {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (interaction.customId === "menu_reciter") {
        const rid = parseInt(interaction.values[0]);
        const reciter = (sess.reciters || []).find((r) => r.id === rid);
        if (!reciter)
          return interaction.reply(errReply("Reciter not found. Try choosing again from the list."));

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

      if (interaction.customId === "menu_moshaf") {
        const mid = parseInt(interaction.values[0]);
        const moshaf = (sess.reciter?.moshaf || []).find((m) => m.id === mid);
        if (!moshaf)
          return interaction.reply(errReply("Recitation not found. Try choosing again from the list."));
        sess.moshaf = moshaf;
        await interaction.deferUpdate();
        const payload = buildSurahMenu(moshaf);
        await interaction.editReply({ ...payload });
        return;
      }

      if (interaction.customId === "moshaf_cancel") {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (interaction.customId === "surah_play_all") {
        await interaction.deferUpdate();
        s.reciter = sess.reciter;
        s.moshaf = sess.moshaf;
        await ensureConnection();
        if (bound && !s.connection) return epErr("Could not reconnect to the voice channel. Try again or run the play command.");
        const all = parseSurahList(sess.moshaf.surah_list);
        s.queue = all;
        s.queueIndex = 0;
        await interaction.deleteReply().catch(() => {});
        await player.play(guildId, all[0]);
        return;
      }

      if (interaction.customId === "surah_cancel") {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (interaction.customId.startsWith("menu_surah_")) {
        const value = interaction.values[0];
        if (value === "surah_cancel") {
          await interaction.deferUpdate();
          await interaction.deleteReply().catch(() => {});
          return;
        }
        const surahNum = parseInt(value, 10);
        if (!Number.isFinite(surahNum)) return;
        await interaction.deferUpdate();
        s.reciter = sess.reciter;
        s.moshaf = sess.moshaf;
        await ensureConnection();
        if (bound && !s.connection) return epErr("Could not reconnect to the voice channel. Try again or run the play command.");
        s.queue = [surahNum];
        s.queueIndex = 0;
        await interaction.deleteReply().catch(() => {});
        await player.play(guildId, surahNum);
        return;
      }

      if (interaction.customId === "btn_pick_surah") {
        if (!s.moshaf)
          return interaction.reply(errReply("Choose a reciter first, then you can pick a surah."));
        sess.reciter = s.reciter;
        sess.moshaf = s.moshaf;
        const payload = buildSurahMenu(s.moshaf);
        return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      log.error("INTERACTION", err);
      await epErr("Something went wrong. Please try again.");
    }
  },
};
