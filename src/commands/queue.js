import { SlashCommandBuilder } from 'discord.js';
import { formatQueue } from '../utils/formatters.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Показати поточний трек і чергу');

export async function execute(interaction, { musicPlayer }) {
  await respond(interaction, formatQueue(musicPlayer.getSnapshot(interaction.guildId)));
}
