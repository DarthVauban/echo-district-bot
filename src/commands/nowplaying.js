import { SlashCommandBuilder } from 'discord.js';
import { formatTrackTitle } from '../utils/formatters.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Показати поточний трек');

export async function execute(interaction, { musicPlayer }) {
  const track = musicPlayer.getNowPlaying(interaction.guildId);
  await respond(
    interaction,
    track ? `🎵 Зараз грає: ${formatTrackTitle(track)}` : '⚠️ Зараз нічого не грає',
  );
}
