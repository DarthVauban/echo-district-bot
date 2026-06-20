import { SlashCommandBuilder } from 'discord.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Зупинити відтворення, очистити чергу й відключити бота');

export async function execute(interaction, { musicPlayer }) {
  await musicPlayer.stop(interaction.guildId);
  await respond(interaction, '⏹️ Відтворення зупинено, чергу очищено');
}
