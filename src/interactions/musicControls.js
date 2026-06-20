import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { BotError } from '../utils/errors.js';
import { formatTrackTitle } from '../utils/formatters.js';
import { getMemberVoiceChannel } from '../utils/interactions.js';
import { MUSIC_CONTROL_IDS } from '../utils/musicPanel.js';
import { requestTrackFromInteraction } from '../utils/trackRequests.js';
import { logger } from '../utils/logger.js';

function assertCanControl(interaction, musicPlayer) {
  const voiceChannel = getMemberVoiceChannel(interaction);

  if (!voiceChannel) {
    throw new BotError('NOT_IN_VOICE_CHANNEL', 'The user is not in a voice channel.');
  }

  const botVoiceChannelId = musicPlayer.getVoiceChannelId(interaction.guildId);

  if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
    throw new BotError(
      'DIFFERENT_VOICE_CHANNEL',
      'The user is not in the voice channel where the bot is playing.',
    );
  }

  return voiceChannel;
}

function createAddTrackModal() {
  const urlInput = new TextInputBuilder()
    .setCustomId(MUSIC_CONTROL_IDS.urlInput)
    .setLabel('YouTube URL')
    .setPlaceholder('https://www.youtube.com/watch?v=...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2048);

  return new ModalBuilder()
    .setCustomId(MUSIC_CONTROL_IDS.addModal)
    .setTitle('Додати трек')
    .addComponents(new ActionRowBuilder().addComponents(urlInput));
}

function createVolumeModal(currentVolume) {
  const volumeInput = new TextInputBuilder()
    .setCustomId(MUSIC_CONTROL_IDS.volumeInput)
    .setLabel('Гучність від 0 до 100')
    .setPlaceholder('Наприклад: 45')
    .setValue(String(currentVolume))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(3);

  return new ModalBuilder()
    .setCustomId(MUSIC_CONTROL_IDS.volumeModal)
    .setTitle('Встановити гучність')
    .addComponents(new ActionRowBuilder().addComponents(volumeInput));
}

export async function handleMusicButton(interaction, dependencies) {
  if (!Object.values(MUSIC_CONTROL_IDS).includes(interaction.customId)) {
    return false;
  }

  const { musicPlayer } = dependencies;

  // Show modal as the very first Discord call to stay inside the 3-second window.
  if (interaction.customId === MUSIC_CONTROL_IDS.add) {
    const ageMs = Date.now() - interaction.createdTimestamp;
    logger.info('Button pressed', { button: interaction.customId, guildId: interaction.guildId, ageMs });
    await interaction.showModal(createAddTrackModal());
    logger.info('Add modal shown', { guildId: interaction.guildId });
    musicPlayer.attachControlPanel(interaction.guildId, interaction.message);
    return true;
  }

  if (interaction.customId === MUSIC_CONTROL_IDS.volumeCustom) {
    const ageMs = Date.now() - interaction.createdTimestamp;
    logger.info('Button pressed', { button: interaction.customId, guildId: interaction.guildId, ageMs });
    const currentVolume = musicPlayer.getSnapshot(interaction.guildId).volume;
    await interaction.showModal(createVolumeModal(currentVolume));
    logger.info('Volume modal shown', { guildId: interaction.guildId });
    return true;
  }

  logger.info('Button pressed', { button: interaction.customId, guildId: interaction.guildId });
  musicPlayer.attachControlPanel(interaction.guildId, interaction.message);
  assertCanControl(interaction, musicPlayer);
  await interaction.deferUpdate();
  logger.info('Button deferred', { button: interaction.customId, guildId: interaction.guildId });

  switch (interaction.customId) {
    case MUSIC_CONTROL_IDS.toggle: {
      const snapshot = musicPlayer.getSnapshot(interaction.guildId);
      const changed = snapshot.isPaused
        ? await musicPlayer.resume(interaction.guildId)
        : await musicPlayer.pause(interaction.guildId);

      if (!changed) {
        await interaction.followUp({
          content: '⚠️ Немає активного треку для перемикання',
          flags: MessageFlags.Ephemeral,
        });
      }
      break;
    }
    case MUSIC_CONTROL_IDS.stop:
      await musicPlayer.stop(interaction.guildId);
      break;
    case MUSIC_CONTROL_IDS.skip: {
      const skipped = await musicPlayer.skip(interaction.guildId);

      if (!skipped) {
        await interaction.followUp({
          content: '⚠️ Зараз нічого не грає',
          flags: MessageFlags.Ephemeral,
        });
      }
      break;
    }
    case MUSIC_CONTROL_IDS.volumeDown: {
      const current = musicPlayer.getSnapshot(interaction.guildId).volume;
      musicPlayer.setVolume(interaction.guildId, Math.max(0, current - 10));
      break;
    }
    case MUSIC_CONTROL_IDS.volumeUp: {
      const current = musicPlayer.getSnapshot(interaction.guildId).volume;
      musicPlayer.setVolume(interaction.guildId, Math.min(100, current + 10));
      break;
    }
    default:
      return false;
  }

  await musicPlayer.refreshControlPanel(interaction.guildId);
  return true;
}

export async function handleMusicModal(interaction, dependencies) {
  if (
    interaction.customId !== MUSIC_CONTROL_IDS.addModal
    && interaction.customId !== MUSIC_CONTROL_IDS.volumeModal
  ) {
    return false;
  }

  if (interaction.customId === MUSIC_CONTROL_IDS.volumeModal) {
    assertCanControl(interaction, dependencies.musicPlayer);

    const rawValue = interaction.fields
      .getTextInputValue(MUSIC_CONTROL_IDS.volumeInput)
      .trim();
    const value = Number(rawValue);

    if (!/^\d{1,3}$/.test(rawValue) || !Number.isInteger(value) || value < 0 || value > 100) {
      await interaction.reply({
        content: '❌ Введи ціле число від 0 до 100',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    dependencies.musicPlayer.setVolume(interaction.guildId, value);
    await interaction.reply({
      content: `🔊 Гучність встановлено на ${value}%`,
      flags: MessageFlags.Ephemeral,
    });
    await dependencies.musicPlayer.refreshControlPanel(interaction.guildId);
    return true;
  }

  // addModal: defer immediately before any other work
  const url = interaction.fields.getTextInputValue(MUSIC_CONTROL_IDS.urlInput).trim();
  const ageMs = Date.now() - interaction.createdTimestamp;
  logger.info('Add modal submitted', { guildId: interaction.guildId, url, ageMs });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  logger.info('Add modal deferred', { guildId: interaction.guildId });
  assertCanControl(interaction, dependencies.musicPlayer);

  const { result, track } = await requestTrackFromInteraction(
    interaction,
    url,
    dependencies,
  );

  await dependencies.musicPlayer.moveControlPanelToBottom(
    interaction.guildId,
    interaction.channelId,
  );
  await interaction.editReply({
    content: result.started
      ? `▶️ Зараз грає: ${formatTrackTitle(track)}`
      : `✅ Додано в чергу: ${formatTrackTitle(track)}`,
  });
  return true;
}
