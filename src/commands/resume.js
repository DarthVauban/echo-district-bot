import { SlashCommandBuilder } from 'discord.js';
import { respond } from '../utils/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Продовжити відтворення після паузи');

export async function execute(interaction, { musicPlayer }) {
  const resumed = await musicPlayer.resume(interaction.guildId);
  await respond(
    interaction,
    resumed ? '▶️ Відтворення продовжено' : '⚠️ Поточний трек не стоїть на паузі',
  );
}
