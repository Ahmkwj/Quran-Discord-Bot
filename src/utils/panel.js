'use strict';

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
} = require('discord.js');

const { getSurah } = require('./surahs');
const { parseSurahList } = require('./api');

const COLOR = 0x1a6b47;

// ── Helpers ──────────────────────────────────────────────────────────────────

function repeatLabel(r) {
  if (r === 'one') return 'One surah';
  if (r === 'all') return 'All queue';
  return 'Off';
}

function statusLabel(s) {
  if (s.paused) return '\u23F8\uFE0F  Paused';
  if (s.playing) return '\u25B6\uFE0F  Playing';
  return '\u23F9\uFE0F  Stopped';
}

function btn(id, label, emoji, style) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style || ButtonStyle.Secondary);
}

// ── Main panel ───────────────────────────────────────────────────────────────

function buildMainEmbed(s) {
  const embed = new EmbedBuilder().setColor(COLOR).setTimestamp();
  const surah = s.queue.length ? getSurah(s.queue[s.queueIndex]) : null;

  if (surah) {
    embed.setTitle(`${surah.ar}  \u00B7  ${surah.en}  \u00B7  ${surah.n}/114`);
    embed.setDescription('**\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0646\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650**');

    const fields = [
      { name: 'Reciter', value: s.reciter?.name || '\u2014', inline: true },
      { name: 'Recitation', value: s.moshaf?.name || '\u2014', inline: true },
      { name: 'Status', value: statusLabel(s), inline: true },
      { name: 'Volume', value: `${''.padStart(Math.round(s.volume / 10), '\u2588')}${''.padStart(10 - Math.round(s.volume / 10), '\u2591')} ${s.volume}%`, inline: true },
      { name: 'Repeat', value: repeatLabel(s.repeat), inline: true },
      { name: 'Auto-next', value: s.autoNext ? 'On' : 'Off', inline: true },
    ];

    if (s.queue.length > 1) {
      fields.push({ name: 'Queue', value: `${s.queueIndex + 1} of ${s.queue.length}`, inline: false });
    }

    embed.addFields(fields);
    embed.setFooter({ text: '\u202B \u0648\u064E\u0631\u064E\u062A\u0651\u0650\u0644\u0650 \u0627\u0644\u0652\u0642\u064F\u0631\u0652\u0622\u0646\u064E \u062A\u064E\u0631\u0652\u062A\u0650\u064A\u0644\u0627\u064B \u202C' });
  } else {
    embed.setTitle('\u{1F54C}  Quran Bot');
    embed.setDescription(
      '**\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0646\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650**\n\n' +
      'Select **Pick reciter** below to choose a reciter and surah.'
    );
    embed.setFooter({ text: 'Use the buttons below to get started' });
  }

  return embed;
}

function buildButtons(s) {
  const hasTrack = s.queue.length > 0;
  const isPlaying = s.playing || s.paused;
  const rows = [];

  if (hasTrack && isPlaying) {
    const playback = [];
    if (s.queueIndex > 0) playback.push(btn('btn_prev', 'Previous', '\u23EE\uFE0F'));
    playback.push(
      s.paused
        ? btn('btn_resume', 'Resume', '\u25B6\uFE0F', ButtonStyle.Success)
        : btn('btn_pause', 'Pause', '\u23F8\uFE0F')
    );
    if (s.queueIndex < s.queue.length - 1 || s.repeat === 'all') {
      playback.push(btn('btn_next', 'Next', '\u23ED\uFE0F'));
    }
    playback.push(btn('btn_stop', 'Stop', '\u23F9\uFE0F', ButtonStyle.Danger));
    rows.push(new ActionRowBuilder().addComponents(playback));
  }

  if (hasTrack && s.moshaf) {
    rows.push(new ActionRowBuilder().addComponents(
      btn('btn_vol_down', 'Vol -', '\uD83D\uDD09'),
      btn('btn_vol_up', 'Vol +', '\uD83D\uDD0A'),
      btn('btn_repeat',
        s.repeat === 'none' ? 'Repeat' : s.repeat === 'one' ? 'One' : 'All',
        s.repeat === 'one' ? '\uD83D\uDD02' : '\uD83D\uDD01'
      ),
      btn('btn_autonext', 'Auto-next', s.autoNext ? '\u2705' : '\u274C'),
    ));
  }

  const nav = [btn('btn_pick_reciter', 'Pick reciter', '\uD83C\uDF99\uFE0F')];
  if (hasTrack && s.moshaf) {
    nav.push(btn('btn_pick_surah', 'Pick surah', '\uD83D\uDCDC'));
    nav.push(btn('btn_play_all', 'Play all', '\uD83C\uDFB5'));
  }
  nav.push(btn('btn_disconnect', 'Disconnect', '\uD83D\uDEAA'));
  rows.push(new ActionRowBuilder().addComponents(nav));

  return rows;
}

function buildPanel(s) {
  return { embeds: [buildMainEmbed(s)], components: buildButtons(s) };
}

// ── Reciter menu ─────────────────────────────────────────────────────────────

function buildReciterMenu(reciters) {
  const slice = reciters.slice(0, 25);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: '\uD83C\uDF99\uFE0F Select Reciter' })
    .setDescription(
      `**${reciters.length}** reciters available.\n\n` +
      'Pick one from the list below, or use **Search by name** to find a specific reciter.'
    )
    .setFooter({ text: 'Choose from the list or search' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('menu_reciter')
    .setPlaceholder('Choose a reciter...')
    .addOptions(slice.map(r => ({
      label: r.name.substring(0, 100),
      description: `${r.moshaf.length} recitation(s)`,
      value: String(r.id),
      emoji: '\uD83C\uDF99\uFE0F',
    })));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        btn('btn_reciter_search', 'Search by name', '\uD83D\uDD0D'),
        btn('reciter_cancel', 'Cancel', '\u2716\uFE0F'),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

function buildReciterSearchModal() {
  return new ModalBuilder()
    .setCustomId('modal_reciter_search')
    .setTitle('Search for reciter')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reciter_search_query')
          .setLabel('Reciter name')
          .setPlaceholder('Type part of the name...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100)
      )
    );
}

function buildReciterSearchResultsMenu(reciters, query) {
  const slice = reciters.slice(0, 25);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: '\uD83D\uDD0D Search Results' })
    .setDescription(`Found **${reciters.length}** reciter(s) for \`${query}\`.`)
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('menu_reciter')
    .setPlaceholder('Choose a reciter...')
    .addOptions(slice.map(r => ({
      label: r.name.substring(0, 100),
      description: `${r.moshaf.length} recitation(s)`,
      value: String(r.id),
      emoji: '\uD83C\uDF99\uFE0F',
    })));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(btn('reciter_cancel', 'Cancel', '\u2716\uFE0F')),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

// ── Moshaf menu ──────────────────────────────────────────────────────────────

function buildMoshafMenu(reciter) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: `\uD83D\uDCD6 ${reciter.name}` })
    .setDescription(
      'This reciter has **multiple recitations**.\n\n' +
      'Choose the recitation style you want.'
    )
    .setFooter({ text: `${reciter.moshaf.length} recitation(s) available` })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('menu_moshaf')
    .setPlaceholder('Choose recitation...')
    .addOptions(reciter.moshaf.map(m => ({
      label: m.name.substring(0, 100),
      description: `${m.surah_total} surahs`,
      value: String(m.id),
      emoji: '\uD83D\uDCD6',
    })));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(btn('moshaf_cancel', 'Cancel', '\u2716\uFE0F')),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

// ── Surah menu ───────────────────────────────────────────────────────────────

function buildSurahMenu(moshaf) {
  const surahList = parseSurahList(moshaf.surah_list);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: '\uD83D\uDCDC Select Surah' })
    .setDescription(`**Recitation:** ${moshaf.name}\n\n**${surahList.length} surahs** available.`)
    .setFooter({ text: 'Choose a surah from the lists' })
    .setTimestamp();

  const rows = [];
  const firstRowSize = 24;
  const perMenu = 25;

  for (let i = 0; i < 5; i++) {
    const start = i === 0 ? 0 : firstRowSize + (i - 1) * perMenu;
    const count = i === 0 ? firstRowSize : i === 4 ? 15 : perMenu;
    const slice = surahList.slice(start, start + count);
    if (slice.length === 0) break;

    const options = slice.map(n => {
      const su = getSurah(n);
      return {
        label: `${String(n).padStart(3, '0')} \u2014 ${su.ar}`,
        description: su.en,
        value: String(n),
        emoji: '\uD83D\uDCDC',
      };
    });

    if (i === 0) {
      options.push({ label: 'Cancel', description: 'Close menu', value: 'surah_cancel', emoji: '\u2716\uFE0F' });
    }

    const lastNum = slice[slice.length - 1];
    const firstNum = slice[0];
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`menu_surah_${i}`)
        .setPlaceholder(i === 0 ? `Surahs ${firstNum}\u2013${lastNum} or Cancel` : `Surahs ${firstNum}\u2013${lastNum}`)
        .addOptions(options)
    ));
  }

  return { embeds: [embed], components: rows, flags: MessageFlags.Ephemeral };
}

// ── Reply helpers ────────────────────────────────────────────────────────────

function errReply(msg) {
  return { content: '\u274C ' + msg, flags: MessageFlags.Ephemeral };
}

function successReply(msg) {
  return { content: '\u2705 ' + msg, flags: MessageFlags.Ephemeral };
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
