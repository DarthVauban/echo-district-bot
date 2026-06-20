import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { BotError } from '../utils/errors.js';
import { formatTrackTitle } from '../utils/formatters.js';
import { getMemberVoiceChannel } from '../utils/interactions.js';
import { MUSIC_CONTROL_IDS } from '../utils/musicPanel.js';
import { requestTrackFromInteraction } from '../utils/trackRequests.js';

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
  await musicPlayer.attachControlPanel(interaction.guildId, interaction.message);
  assertCanControl(interaction, musicPlayer);

  if (interaction.customId === MUSIC_CONTROL_IDS.add) {
    await interaction.showModal(createAddTrackModal());
    return true;
  }

  if (interaction.customId === MUSIC_CONTROL_IDS.volumeCustom) {
    const currentVolume = musicPlayer.getSnapshot(interaction.guildId).volume;
    await interaction.showModal(createVolumeModal(currentVolume));
    return true;
  }

  await interaction.deferUpdate();

  switch (interaction.customId) {
    case MUSIC_CONTROL_IDS.toggle: {
      const snapshot = musicPlayer.getSnapshot(interaction.guildId);
      const changed = snapshot.isPaused
        ? await musicPlayer.resume(interaction.guildId)
        : await musicPlayer.pause(interaction.guildId);

      if (!changed) {
        await interaction.followUp({
          content: '⚠️ Немає активного треку для перемикання',
          ephemeral: true,
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
          ephemeral: true,
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

  assertCanControl(interaction, dependencies.musicPlayer);

  if (interaction.customId === MUSIC_CONTROL_IDS.volumeModal) {
    const rawValue = interaction.fields
      .getTextInputValue(MUSIC_CONTROL_IDS.volumeInput)
      .trim();
    const value = Number(rawValue);

    if (!/^\d{1,3}$/.test(rawValue) || !Number.isInteger(value) || value < 0 || value > 100) {
      await interaction.reply({
        content: '❌ Введи ціле число від 0 до 100',
        ephemeral: true,
      });
      return true;
    }

    dependencies.musicPlayer.setVolume(interaction.guildId, value);
    await interaction.reply({
      content: `🔊 Гучність встановлено на ${value}%`,
      ephemeral: true,
    });
    await dependencies.musicPlayer.refreshControlPanel(interaction.guildId);
    return true;
  }

  const url = interaction.fields.getTextInputValue(MUSIC_CONTROL_IDS.urlInput).trim();
  await interaction.deferReply({ ephemeral: true });

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
