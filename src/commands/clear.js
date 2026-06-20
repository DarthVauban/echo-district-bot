import { SlashCommandBuilder } from 'discord.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Очистити чергу, не зупиняючи поточний трек');

export async function execute(interaction, { musicPlayer }) {
  musicPlayer.clearQueue(interaction.guildId);
  await respond(interaction, '🧹 Чергу очищено');
}
