import { SlashCommandBuilder } from 'discord.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Поставити поточний трек на паузу');

export async function execute(interaction, { musicPlayer }) {
  const paused = await musicPlayer.pause(interaction.guildId);
  await respond(interaction, paused ? '⏸️ Пауза' : '⚠️ Немає активного треку для паузи');
}
