import { SlashCommandBuilder } from 'discord.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Пропустити поточний трек');

export async function execute(interaction, { musicPlayer }) {
  const skipped = await musicPlayer.skip(interaction.guildId);
  await respond(interaction, skipped ? '⏭️ Трек пропущено' : '⚠️ Зараз нічого не грає');
}
