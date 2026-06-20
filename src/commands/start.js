import { SlashCommandBuilder } from 'discord.js';
import { assertBotVoicePermissions, getMemberVoiceChannel, respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Запустити або продовжити відтворення');

export async function execute(interaction, { musicPlayer }) {
  const voiceChannel = getMemberVoiceChannel(interaction);

  if (voiceChannel) {
    assertBotVoicePermissions(interaction, voiceChannel);
  }

  const result = await musicPlayer.start(interaction.guildId, {
    voiceChannel,
    textChannelId: interaction.channelId,
  });

  const messages = {
    resumed: '▶️ Відтворення продовжено',
    started: '▶️ Відтворення запущено',
    'already-playing': 'ℹ️ Відтворення вже запущено',
    empty: '⚠️ Немає треків для запуску',
  };

  await respond(interaction, messages[result]);
}
