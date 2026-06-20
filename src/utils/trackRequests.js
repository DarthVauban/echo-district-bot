import { BotError } from './errors.js';
import {
  assertBotVoicePermissions,
  getMemberVoiceChannel,
} from './interactions.js';

export async function requestTrackFromInteraction(
  interaction,
  url,
  { musicPlayer, youtubeAudioService },
) {
  const voiceChannel = getMemberVoiceChannel(interaction);

  if (!voiceChannel) {
    throw new BotError('NOT_IN_VOICE_CHANNEL', 'The user is not in a voice channel.');
  }

  assertBotVoicePermissions(interaction, voiceChannel);
  youtubeAudioService.validateUrl(url);

  const metadata = await youtubeAudioService.getMetadata(url);
  const track = {
    title: metadata.title,
    url: metadata.webpageUrl,
    duration: metadata.duration,
    durationSeconds: metadata.durationSeconds,
    requestedBy: interaction.user.username,
    thumbnail: metadata.thumbnail,
  };

  const result = await musicPlayer.addTrack({
    guildId: interaction.guildId,
    track,
    voiceChannel,
    textChannelId: interaction.channelId,
  });

  return { result, track };
}
