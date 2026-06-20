import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
} from 'discord.js';
import { formatDuration } from './formatters.js';

export const MUSIC_CONTROL_IDS = Object.freeze({
  toggle: 'music:toggle',
  stop: 'music:stop',
  skip: 'music:skip',
  add: 'music:add',
  volumeDown: 'music:volume_down',
  volumeUp: 'music:volume_up',
  volumeCustom: 'music:volume_custom',
  addModal: 'music:add_modal',
  urlInput: 'music:url',
  volumeModal: 'music:volume_modal',
  volumeInput: 'music:volume',
});

export function createMusicPanelPayload(snapshot) {
  const track = snapshot.currentTrack;
  const hasTrack = Boolean(track);
  const isPaused = hasTrack && snapshot.isPaused;
  const playbackDurationMs = Number.isFinite(snapshot.playbackDurationMs)
    ? snapshot.playbackDurationMs
    : 0;
  const elapsedSeconds = Math.max(0, Math.floor(playbackDurationMs / 1000));
  const totalSeconds = track?.durationSeconds ?? null;
  const elapsed = formatDuration(elapsedSeconds) ?? '0:00';
  const total = formatDuration(totalSeconds) ?? track?.duration ?? '?:??';

  const embed = new EmbedBuilder()
    .setColor(isPaused ? 0xf1c40f : hasTrack ? 0x5865f2 : 0x747f8d)
    .setTitle(hasTrack ? '🎵 Музичний плеєр' : '🎵 Плеєр зупинено')
    .setDescription(
      hasTrack
        ? `**[${escapeMarkdown(track.title)}](${track.url})**`
        : 'Наразі нічого не відтворюється. Натисни **Додати трек**, щоб почати.',
    )
    .addFields(
      {
        name: 'Час',
        value: hasTrack ? `\`${elapsed} / ${total}\`` : `\`0:00 / ?:??\``,
        inline: true,
      },
      {
        name: 'Гучність',
        value: `🔊 ${snapshot.volume}%`,
        inline: true,
      },
      {
        name: 'У черзі',
        value: String(snapshot.tracks.length),
        inline: true,
      },
      {
        name: 'Замовив',
        value: track ? escapeMarkdown(track.requestedBy || 'Невідомо') : '—',
        inline: true,
      },
    )
    .setFooter({
      text: isPaused ? 'Відтворення на паузі' : hasTrack ? 'Відтворення' : 'Очікування треку',
    });

  if (track?.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  const playbackRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.toggle)
      .setLabel(isPaused || !hasTrack ? 'Play' : 'Пауза')
      .setEmoji(isPaused || !hasTrack ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!hasTrack),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.stop)
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasTrack && snapshot.tracks.length === 0),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.skip)
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTrack),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.add)
      .setLabel('Додати трек')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Primary),
  );

  const volumeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.volumeDown)
      .setLabel('−10%')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(snapshot.volume <= 0),
    new ButtonBuilder()
      .setCustomId('music:volume_display')
      .setLabel(`${snapshot.volume}%`)
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.volumeUp)
      .setLabel('+10%')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(snapshot.volume >= 100),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.volumeCustom)
      .setLabel('Ввести %')
      .setEmoji('🎚️')
      .setStyle(ButtonStyle.Primary),
  );

  return {
    content: null,
    embeds: [embed],
    components: [playbackRow, volumeRow],
  };
}
