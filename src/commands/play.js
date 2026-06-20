import { SlashCommandBuilder } from 'discord.js';
import { formatTrackTitle } from '../utils/formatters.js';
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
  youtubeAudioService.validateUrl(url);
  await interaction.deferReply({ ephemeral: true });

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
