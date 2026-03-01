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
} = require("discord.js");

const { getSurah } = require("./surahs");
const { parseSurahList } = require("./api");

const EMBED_COLOR = 0x3d3d3d;

function volumeDisplay(v) {
  const filled = Math.round(v / 10);
  const empty = 10 - filled;
  const bar = '\u2014'.repeat(filled) + '\u00B7'.repeat(empty);
  return `\`${bar}\` **${v}%**`;
}

function repeatLabel(r) {
  if (r === 'one') return 'One surah';
  if (r === 'all') return 'All queue';
  return 'Off';
}

function statusLabel(s) {
  if (!s.playing && !s.paused)   return "Stopped";
  if (s.paused) return "Paused";
  return "Playing";
}

function buildMainEmbed(s) {
  const surah = s.queue.length ? getSurah(s.queue[s.queueIndex]) : null;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: 'Quran Bot', iconURL: 'https://i.imgur.com/8sEvHGj.png' })
    .setTimestamp();

  if (surah) {
    embed.setTitle(`${surah.ar}  \u00B7  Surah ${surah.n} of 114`);
    embed.setDescription('**بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ**');
    embed.setThumbnail('https://i.imgur.com/8sEvHGj.png');

    const reciterName = s.reciter ? s.reciter.name : '\u2014';
    const moshafName = s.moshaf ? s.moshaf.name : '\u2014';

    embed.addFields(
      { name: 'Reciter', value: reciterName, inline: true },
      { name: 'Recitation', value: moshafName, inline: true },
      { name: 'Status', value: statusLabel(s), inline: true },
      { name: 'Volume', value: volumeDisplay(s.volume), inline: true },
      { name: 'Repeat', value: repeatLabel(s.repeat), inline: true },
      { name: 'Auto-next', value: s.autoNext ? 'On' : 'Off', inline: true }
    );

    if (s.queue.length > 1) {
      embed.addFields({
        name: 'Queue position',
        value: `${s.queueIndex + 1} of ${s.queue.length}`,
        inline: false
      });
    }

    embed.setFooter({ text: '\u202B وَرَتِّلِ الْقُرْآنَ تَرْتِيلاً \u202C' });
  } else {
    embed.setTitle('Nothing selected');
    embed.setDescription(
      '**بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ**\n\n' +
      'Press **Pick reciter** below to choose a reciter and surah.'
    );
    embed.setFooter({ text: 'Use the buttons below to get started' });
  }

  return embed;
}

function buildButtons(s) {
  const hasTrack = s.queue.length > 0;
  const isPlaying = s.playing || s.paused;
  const canPrev = hasTrack && s.queueIndex > 0;
  const canNext = hasTrack && (s.queueIndex < s.queue.length - 1 || s.repeat === 'all');
  const canPauseResume = hasTrack && isPlaying;
  const canStop = isPlaying;

  const rows = [];

  const playback = [];
  if (canPrev) {
    playback.push(
      new ButtonBuilder()
        .setCustomId('btn_prev')
        .setLabel('Previous')
        .setEmoji('⏮️')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (canPauseResume) {
    playback.push(
      new ButtonBuilder()
        .setCustomId(s.paused ? 'btn_resume' : 'btn_pause')
        .setLabel(s.paused ? 'Resume' : 'Pause')
        .setEmoji(s.paused ? '▶️' : '⏸️')
        .setStyle(s.paused ? ButtonStyle.Success : ButtonStyle.Primary)
    );
  }
  if (canNext) {
    playback.push(
      new ButtonBuilder()
        .setCustomId('btn_next')
        .setLabel('Next')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (canStop) {
    playback.push(
      new ButtonBuilder()
        .setCustomId('btn_stop')
        .setLabel('Stop')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
    );
  }
  if (playback.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(playback));
  }

  const settings = [
    new ButtonBuilder()
      .setCustomId('btn_vol_down')
      .setLabel('Vol -')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_vol_up')
      .setLabel('Vol +')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_repeat')
      .setLabel(s.repeat === 'none' ? 'Repeat' : s.repeat === 'one' ? 'One' : 'All')
      .setEmoji(s.repeat === 'one' ? '🔂' : '🔁')
      .setStyle(s.repeat !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_autonext')
      .setLabel('Auto-next')
      .setEmoji(s.autoNext ? '✅' : '❌')
      .setStyle(s.autoNext ? ButtonStyle.Success : ButtonStyle.Secondary)
  ];
  rows.push(new ActionRowBuilder().addComponents(settings));

  const nav = [
    new ButtonBuilder()
      .setCustomId('btn_pick_reciter')
      .setLabel('Pick reciter')
      .setEmoji('🕌')
      .setStyle(ButtonStyle.Primary)
  ];
  if (s.moshaf) {
    nav.push(
      new ButtonBuilder()
        .setCustomId('btn_pick_surah')
        .setLabel('Pick surah')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_play_all')
        .setLabel('Play all')
        .setEmoji('🎵')
        .setStyle(ButtonStyle.Success)
    );
  }
  nav.push(
    new ButtonBuilder()
      .setCustomId('btn_disconnect')
      .setLabel('Disconnect')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger)
  );
  rows.push(new ActionRowBuilder().addComponents(nav));

  return rows;
}

function buildPanel(s) {
  return {
    embeds: [buildMainEmbed(s)],
    components: buildButtons(s)
  };
}

const RECITERS_PER_PAGE = 25;

function buildReciterMenu(reciters) {
  const slice = reciters.slice(0, RECITERS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: 'Pick a reciter', iconURL: 'https://i.imgur.com/8sEvHGj.png' })
    .setDescription(
      `**${reciters.length}** reciters available.\n` +
      `Can't find yours? Use **Search by name** below.`
    )
    .setFooter({ text: 'Select from the list or search' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('menu_reciter')
    .setPlaceholder('Choose a reciter...')
    .addOptions(slice.map(r => ({
      label: r.name.substring(0, 100),
      description: `${r.moshaf.length} recitation(s)`,
      value: String(r.id),
      emoji: '🎙️'
    })));

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_reciter_search')
      .setLabel('Search by name')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('reciter_cancel')
      .setLabel('Cancel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      row2
    ],
    flags: MessageFlags.Ephemeral
  };
}

function buildReciterSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('modal_reciter_search')
    .setTitle('Search for reciter');
  const input = new TextInputBuilder()
    .setCustomId('reciter_search_query')
    .setLabel('Reciter name')
    .setPlaceholder('Type part of the name to search...')
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
    .setAuthor({ name: 'Search results', iconURL: 'https://i.imgur.com/8sEvHGj.png' })
    .setDescription(`Results for \`${query}\`: **${reciters.length}** reciter(s).`)
    .setFooter({ text: 'Select a reciter' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('menu_reciter')
    .setPlaceholder('Choose a reciter...')
    .addOptions(slice.map(r => ({
      label: r.name.substring(0, 100),
      description: `${r.moshaf.length} recitation(s)`,
      value: String(r.id),
      emoji: '🎙️'
    })));

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reciter_cancel')
      .setLabel('Cancel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      row2
    ],
    flags: MessageFlags.Ephemeral
  };
}

function buildMoshafMenu(reciter) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: `Recitation — ${reciter.name}`, iconURL: 'https://i.imgur.com/8sEvHGj.png' })
    .setDescription(`**${reciter.name}** has multiple recitations. Choose one below.`)
    .setFooter({ text: `${reciter.moshaf.length} recitation(s) available` })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('menu_moshaf')
    .setPlaceholder('Choose recitation...')
    .addOptions(reciter.moshaf.map(m => ({
      label: m.name.substring(0, 100),
      description: `${m.surah_total} surahs`,
      value: String(m.id),
      emoji: '📖'
    })));

  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('moshaf_cancel')
      .setLabel('Cancel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu), cancelRow],
    flags: MessageFlags.Ephemeral
  };
}

const SURAHS_PER_MENU = 25;

function buildSurahMenu(moshaf) {
  const surahList = parseSurahList(moshaf.surah_list);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: 'Pick a surah', iconURL: 'https://i.imgur.com/8sEvHGj.png' })
    .setDescription(
      `**Recitation:** \`${moshaf.name}\`\n` +
      `**114 surahs** — select from the dropdowns below. Use **Play all** on the main panel for the full Quran.`
    )
    .setFooter({ text: 'Choose a surah from the lists' })
    .setTimestamp();

  const rows = [];
  const firstRowSize = 24;
  for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
    const start = rowIndex === 0 ? 0 : firstRowSize + (rowIndex - 1) * SURAHS_PER_MENU;
    const count = rowIndex === 0 ? firstRowSize : (rowIndex === 4 ? 15 : SURAHS_PER_MENU);
    const slice = surahList.slice(start, start + count);
    if (slice.length === 0) break;
    const options = slice.map(n => {
      const su = getSurah(n);
      return {
        label: `${String(n).padStart(3, '0')} \u2014 ${su.ar}`,
        description: su.en,
        value: String(n),
        emoji: '📜'
      };
    });
    if (rowIndex === 0) {
      options.push({ label: 'Cancel', description: 'Close menu', value: 'surah_cancel', emoji: '✖️' });
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`menu_surah_${rowIndex}`)
      .setPlaceholder(rowIndex === 0 ? 'Surahs 1–24 or Cancel' : `Surahs ${start + 1}–${start + count}`)
      .addOptions(options);
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  return {
    embeds: [embed],
    components: rows,
    flags: MessageFlags.Ephemeral
  };
}

function errEmbed(msg) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Error")
    .setDescription(msg)
    .setTimestamp();
}

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x2d7d46)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp();
}

module.exports = {
  buildPanel,
  buildReciterMenu,
  buildReciterSearchModal,
  buildReciterSearchResultsMenu,
  buildMoshafMenu,
  buildSurahMenu,
  errEmbed,
  successEmbed,
};
