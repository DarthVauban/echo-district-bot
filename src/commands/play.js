import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatTrackTitle } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';
import { respond } from '../utils/interactions.js';
import { requestTrackFromInteraction } from '../utils/trackRequests.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Відтворити YouTube-відео або додати його до черги')
  .addStringOption((option) => option
    .setName('url')
    .setDescription('Посилання на YouTube-відео')
    .setRequired(true));

export async function execute(interaction, { musicPlayer, youtubeAudioService }) {
  const url = interaction.options.getString('url', true).trim();
  const ageMs = Date.now() - interaction.createdTimestamp;
  logger.info('Play command received', { guildId: interaction.guildId, ageMs });
  youtubeAudioService.validateUrl(url);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { result, track } = await requestTrackFromInteraction(
    interaction,
    url,
    { musicPlayer, youtubeAudioService },
  );

  await musicPlayer.moveControlPanelToBottom(interaction.guildId, interaction.channelId);

  await respond(
    interaction,
    result.started
      ? `▶️ Зараз грає: ${formatTrackTitle(track)}`
      : `✅ Додано в чергу: ${formatTrackTitle(track)}`,
  );
}
