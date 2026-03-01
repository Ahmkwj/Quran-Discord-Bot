"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");

const { getSurah } = require("./surahs");
const { parseSurahList } = require("./api");

const EMBED_COLOR = 0x2b5f4a;

function repeatLabel(r) {
  if (r === "one") return "One surah";
  if (r === "all") return "All queue";
  return "Off";
}

function statusLabel(s) {
  if (!s.playing && !s.paused) return "Stopped";
  if (s.paused) return "Paused";
  return "Playing";
}

function buildMainEmbed(s) {
  const surah = s.queue.length ? getSurah(s.queue[s.queueIndex]) : null;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTimestamp();

  if (surah) {
    embed.setTitle(`${surah.ar}  \u00B7  Surah ${surah.n} of 114`);
    embed.setDescription("**بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ**");

    const reciterName = s.reciter ? s.reciter.name : "\u2014";
    const moshafName = s.moshaf ? s.moshaf.name : "\u2014";

    embed.addFields(
      { name: "Reciter", value: reciterName, inline: true },
      { name: "Recitation", value: moshafName, inline: true },
      { name: "Status", value: statusLabel(s), inline: true },
      { name: "Volume", value: `${s.volume}%`, inline: true },
      { name: "Repeat", value: repeatLabel(s.repeat), inline: true },
      { name: "Auto-next", value: s.autoNext ? "On" : "Off", inline: true }
    );

    if (s.queue.length > 1) {
      embed.addFields({
        name: "Queue",
        value: `${s.queueIndex + 1} of ${s.queue.length}`,
        inline: false,
      });
    }

    embed.setFooter({ text: "\u202B وَرَتِّلِ الْقُرْآنَ تَرْتِيلاً \u202C" });
  } else {
    embed.setTitle("Quran Bot");
    embed.setDescription(
      "**بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ**\n\n" +
        "Choose **Pick reciter** below to select a reciter and surah."
    );
    embed.setFooter({ text: "Use the buttons below to get started" });
  }

  return embed;
}

function btn(id, label, emoji) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(ButtonStyle.Secondary);
}

function buildButtons(s) {
  const hasTrack = s.queue.length > 0;
  const isPlaying = s.playing || s.paused;
  const canPrev = hasTrack && s.queueIndex > 0;
  const canNext = hasTrack && (s.queueIndex < s.queue.length - 1 || s.repeat === "all");
  const canPauseResume = hasTrack && isPlaying;
  const canStop = isPlaying;

  const rows = [];

  const playback = [];
  if (canPrev) playback.push(btn("btn_prev", "Previous", "⏮️"));
  if (canPauseResume) {
    playback.push(
      btn(s.paused ? "btn_resume" : "btn_pause", s.paused ? "Resume" : "Pause", s.paused ? "▶️" : "⏸️")
    );
  }
  if (canNext) playback.push(btn("btn_next", "Next", "⏭️"));
  if (canStop) playback.push(btn("btn_stop", "Stop", "⏹️"));
  if (playback.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(playback));
  }

  if (s.moshaf) {
    const settings = [
      btn("btn_vol_down", "Vol -", "🔉"),
      btn("btn_vol_up", "Vol +", "🔊"),
      btn(
        "btn_repeat",
        s.repeat === "none" ? "Repeat" : s.repeat === "one" ? "One" : "All",
        s.repeat === "one" ? "🔂" : "🔁"
      ),
      btn("btn_autonext", "Auto-next", s.autoNext ? "✅" : "❌"),
    ];
    rows.push(new ActionRowBuilder().addComponents(settings));
  }

  const nav = [btn("btn_pick_reciter", "Pick reciter", "🎙️")];
  if (s.moshaf) {
    nav.push(btn("btn_pick_surah", "Pick surah", "📜"));
    nav.push(btn("btn_play_all", "Play all", "🎵"));
  }
  nav.push(btn("btn_disconnect", "Disconnect", "🚪"));
  rows.push(new ActionRowBuilder().addComponents(nav));

  return rows;
}

function buildPanel(s) {
  return {
    embeds: [buildMainEmbed(s)],
    components: buildButtons(s),
  };
}

const RECITERS_PER_PAGE = 25;

function buildReciterMenu(reciters) {
  const slice = reciters.slice(0, RECITERS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: "🎙️ Select Reciter" })
    .setDescription(
      `**${reciters.length}** reciters available.\n\n` +
        "Pick one from the list below, or use **Search by name** to find a specific reciter."
    )
    .addFields({
      name: "\u200b",
      value: "Select a reciter from the dropdown to continue.",
      inline: false,
    })
    .setFooter({ text: "Choose from the list or search" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("menu_reciter")
    .setPlaceholder("Choose a reciter...")
    .addOptions(
      slice.map((r) => ({
        label: r.name.substring(0, 100),
        description: `${r.moshaf.length} recitation(s)`,
        value: String(r.id),
        emoji: "🎙️",
      }))
    );

  const row2 = new ActionRowBuilder().addComponents(
    btn("btn_reciter_search", "Search by name", "🔍"),
    btn("reciter_cancel", "Cancel", "✖️")
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu), row2],
    flags: MessageFlags.Ephemeral,
  };
}

function buildReciterSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId("modal_reciter_search")
    .setTitle("Search for reciter");
  const input = new TextInputBuilder()
    .setCustomId("reciter_search_query")
    .setLabel("Reciter name")
    .setPlaceholder("Type part of the name to search...")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildReciterSearchResultsMenu(reciters, query) {
  const slice = reciters.slice(0, 25);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: "🔍 Search Results" })
    .setDescription(
      `Found **${reciters.length}** reciter(s) for \`${query}\`.\n\n` +
        "Select one from the list below."
    )
    .setFooter({ text: "Select a reciter" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("menu_reciter")
    .setPlaceholder("Choose a reciter...")
    .addOptions(
      slice.map((r) => ({
        label: r.name.substring(0, 100),
        description: `${r.moshaf.length} recitation(s)`,
        value: String(r.id),
        emoji: "🎙️",
      }))
    );

  const row2 = new ActionRowBuilder().addComponents(btn("reciter_cancel", "Cancel", "✖️"));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu), row2],
    flags: MessageFlags.Ephemeral,
  };
}

function buildMoshafMenu(reciter) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: `📖 ${reciter.name}` })
    .setDescription(
      "This reciter has **multiple recitations**.\n\n" +
        "Choose the recitation style you want from the list below."
    )
    .addFields({
      name: "\u200b",
      value: `${reciter.moshaf.length} recitation(s) available.`,
      inline: false,
    })
    .setFooter({ text: "Select a recitation" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("menu_moshaf")
    .setPlaceholder("Choose recitation...")
    .addOptions(
      reciter.moshaf.map((m) => ({
        label: m.name.substring(0, 100),
        description: `${m.surah_total} surahs`,
        value: String(m.id),
        emoji: "📖",
      }))
    );

  const cancelRow = new ActionRowBuilder().addComponents(btn("moshaf_cancel", "Cancel", "✖️"));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu), cancelRow],
    flags: MessageFlags.Ephemeral,
  };
}

const SURAHS_PER_MENU = 25;

function buildSurahMenu(moshaf) {
  const surahList = parseSurahList(moshaf.surah_list);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: "📜 Select Surah" })
    .setDescription(
      `**Recitation:** ${moshaf.name}\n\n` +
        "**114 surahs** — choose from the dropdowns below.\n\n" +
        "Use **Play all** on the main panel to play the full Quran."
    )
    .setFooter({ text: "Choose a surah from the lists" })
    .setTimestamp();

  const rows = [];
  const firstRowSize = 24;
  for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
    const start = rowIndex === 0 ? 0 : firstRowSize + (rowIndex - 1) * SURAHS_PER_MENU;
    const count = rowIndex === 0 ? firstRowSize : rowIndex === 4 ? 15 : SURAHS_PER_MENU;
    const slice = surahList.slice(start, start + count);
    if (slice.length === 0) break;
    const options = slice.map((n) => {
      const su = getSurah(n);
      return {
        label: `${String(n).padStart(3, "0")} \u2014 ${su.ar}`,
        description: su.en,
        value: String(n),
        emoji: "📜",
      };
    });
    if (rowIndex === 0) {
      options.push({ label: "Cancel", description: "Close menu", value: "surah_cancel", emoji: "✖️" });
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`menu_surah_${rowIndex}`)
      .setPlaceholder(
        rowIndex === 0 ? "Surahs 1\u201324 or Cancel" : `Surahs ${start + 1}\u2013${start + count}`
      )
      .addOptions(options);
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  return {
    embeds: [embed],
    components: rows,
    flags: MessageFlags.Ephemeral,
  };
}

function errReply(msg) {
  return {
    content: "\u274C " + msg,
    flags: MessageFlags.Ephemeral,
  };
}

function successReply(msg) {
  return {
    content: "\u2705 " + msg,
    flags: MessageFlags.Ephemeral,
  };
}

module.exports = {
  buildPanel,
  buildReciterMenu,
  buildReciterSearchModal,
  buildReciterSearchResultsMenu,
  buildMoshafMenu,
  buildSurahMenu,
  errReply,
  successReply,
};
