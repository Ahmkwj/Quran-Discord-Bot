"use strict";

const { MessageFlags, EmbedBuilder } = require("discord.js");
const player = require("../utils/player");
const config = require("../utils/config");
const log = require("../utils/logger");
const { isOwnerOrMod } = require("../utils/permissions");
const {
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

    if (!isOwnerOrMod(userId)) {
      try {
        await interaction.reply(
          errReply("Only the bot owner and moderators can use the panel."),
        );
      } catch (_) {}
      return;
    }

    if (interaction.isModalSubmit()) {
      const bound = config.getBoundChannel(interaction.guildId);
      if (
        bound &&
        String(interaction.channelId) !== String(bound.commandChannelId)
      ) {
        try {
          await interaction.reply(
            errReply(
              "Use the panel in the channel where you ran the play command.",
            ),
          );
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
              errReply(
                `No reciters found for "${query}". Try a different search.`,
              ),
            );
          }
          sess.reciters = matches;
          const { embeds, components } = buildReciterSearchResultsMenu(
            matches,
            query,
          );
          return interaction.reply({
            embeds,
            components,
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          log.error("INTERACTION", err);
          return interaction
            .reply(errReply("Something went wrong. Please try again."))
            .catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const bound = config.getBoundChannel(guildId);
    if (
      bound &&
      String(interaction.channelId) !== String(bound.commandChannelId)
    ) {
      try {
        await interaction.reply(
          errReply(
            "Use the panel in the channel where you ran the play command.",
          ),
        );
      } catch (_) {}
      return;
    }

    async function ensureConnection() {
      if (bound && !s.connection) {
        const ch = await interaction.client.channels.fetch(bound.voiceChannelId);
        if (ch?.isVoiceBased?.()) {
          await player.connect(ch);
        }
      }
    }

    async function epErr(msg) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errReply(msg));
        } else {
          await interaction.reply(errReply(msg));
        }
      } catch (_) {}
    }

    try {
      if (interaction.customId === "btn_pause") {
        await interaction.deferUpdate();
        await ensureConnection();
        if (!player.pause(guildId))
          return epErr("Nothing is playing.");
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_resume") {
        await interaction.deferUpdate();
        await ensureConnection();
        if (!player.resume(guildId))
          return epErr("Playback is not paused.");
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_stop") {
        await interaction.deferUpdate();
        await player.resetToWelcome(guildId);
        return;
      }

      if (interaction.customId === "btn_next") {
        await interaction.deferUpdate();
        await ensureConnection();
        const ok = await player.skipNext(guildId);
        if (!ok) return epErr("No next surah.");
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_prev") {
        await interaction.deferUpdate();
        await ensureConnection();
        const ok = await player.skipPrev(guildId);
        if (!ok) return epErr("No previous surah.");
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_vol_up") {
        await interaction.deferUpdate();
        player.setVolume(guildId, s.volume + 10);
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_vol_down") {
        await interaction.deferUpdate();
        player.setVolume(guildId, s.volume - 10);
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_repeat") {
        await interaction.deferUpdate();
        player.cycleRepeat(guildId);
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_autonext") {
        await interaction.deferUpdate();
        s.autoNext = !s.autoNext;
        await player.updatePanel(guildId);
        return;
      }

      if (interaction.customId === "btn_disconnect") {
        await interaction.deferUpdate();
        await player.disconnect(guildId);
        if (s.controlChannelId && s.controlMsgId) {
          try {
            const ch = await interaction.client.channels.fetch(
              s.controlChannelId,
            );
            const msg = await ch.messages.fetch(s.controlMsgId);
            await msg.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x2b5f4a)
                  .setAuthor({ name: "Disconnected" })
                  .setDescription("Use the play command to begin again.")
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
        if (!s.moshaf)
          return epErr("Choose a reciter first.");
        await ensureConnection();
        if (bound && !s.connection)
          return epErr("Could not connect to voice channel.");
        const all = parseSurahList(s.moshaf.surah_list);
        if (!all.length)
          return epErr("No surahs available.");
        s.queue = all;
        s.queueIndex = 0;
        await player.startNewPlayback(guildId, all[0]);
        return;
      }

      if (interaction.customId === "btn_pick_reciter") {
        let reciters;
        try {
          reciters = await fetchReciters();
        } catch {
          return interaction.reply(
            errReply("Could not load reciters. Try again later."),
          );
        }
        sess.reciters = reciters;
        sess.allReciters = reciters;
        const { embeds, components } = buildReciterMenu(reciters);
        return interaction.reply({
          embeds,
          components,
          flags: MessageFlags.Ephemeral,
        });
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
        const rid = parseInt(interaction.values[0], 10);
        const reciter = (sess.reciters || []).find((r) => r.id === rid);
        if (!reciter)
          return interaction.reply(
            errReply("Reciter not found."),
          );

        sess.reciter = reciter;

        if (reciter.moshaf.length === 1) {
          sess.moshaf = reciter.moshaf[0];
          const { embeds, components } = buildSurahMenu(sess.moshaf);
          await interaction.deferUpdate();
          await interaction.editReply({ embeds, components });
        } else {
          const { embeds, components } = buildMoshafMenu(reciter);
          await interaction.deferUpdate();
          await interaction.editReply({ embeds, components });
        }
        return;
      }

      if (interaction.customId === "menu_moshaf") {
        const mid = parseInt(interaction.values[0], 10);
        const moshaf = (sess.reciter?.moshaf || []).find((m) => m.id === mid);
        if (!moshaf)
          return interaction.reply(
            errReply("Recitation not found."),
          );
        sess.moshaf = moshaf;
        const { embeds, components } = buildSurahMenu(moshaf);
        await interaction.deferUpdate();
        await interaction.editReply({ embeds, components });
        return;
      }

      if (interaction.customId === "moshaf_cancel") {
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
        if (!Number.isFinite(surahNum)) {
          await interaction.deferUpdate();
          return;
        }

        if (!sess.reciter || !sess.moshaf) {
          await interaction.deferUpdate();
          return epErr("Selection expired. Click Pick Reciter again.");
        }

        await interaction.deferUpdate();

        s.reciter = sess.reciter;
        s.moshaf = sess.moshaf;

        await ensureConnection();
        if (bound && !s.connection) {
          return epErr("Could not connect to voice channel.");
        }

        s.queue = [surahNum];
        s.queueIndex = 0;

        await interaction.deleteReply().catch(() => {});

        await player.startNewPlayback(guildId, surahNum);
        return;
      }

      if (interaction.customId === "surah_cancel") {
        await interaction.deferUpdate();
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (interaction.customId === "surah_play_all") {
        await interaction.deferUpdate();
        if (!sess.reciter || !sess.moshaf) {
          return epErr("Selection expired. Click Pick Reciter again.");
        }
        s.reciter = sess.reciter;
        s.moshaf = sess.moshaf;
        await ensureConnection();
        if (bound && !s.connection) {
          return epErr("Could not connect to voice channel.");
        }
        const all = parseSurahList(sess.moshaf.surah_list);
        if (!all.length)
          return epErr("No surahs available.");
        s.queue = all;
        s.queueIndex = 0;
        await interaction.deleteReply().catch(() => {});
        await player.startNewPlayback(guildId, all[0]);
        return;
      }

      if (interaction.customId === "btn_pick_surah") {
        if (!s.moshaf)
          return interaction.reply(
            errReply("Choose a reciter first."),
          );
        sess.reciter = s.reciter;
        sess.moshaf = s.moshaf;
        const { embeds, components } = buildSurahMenu(s.moshaf);
        return interaction.reply({
          embeds,
          components,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      log.error("INTERACTION", err);
      await epErr("Something went wrong. Please try again.");
    }
  },
};
