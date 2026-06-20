import { SlashCommandBuilder } from 'discord.js';
import { respond } from '../utils/interactions.js';
import { isVolume } from '../utils/validators.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Змінити гучність відтворення')
  .addIntegerOption((option) => option
    .setName('value')
    .setDescription('Гучність від 0 до 100')
    .setMinValue(0)
    .setMaxValue(100)
    .setRequired(true));

export async function execute(interaction, { musicPlayer }) {
  const value = interaction.options.getInteger('value', true);

  if (!isVolume(value)) {
    await respond(interaction, '❌ Гучність має бути цілим числом від 0 до 100', {
      ephemeral: true,
    });
    return;
  }

  musicPlayer.setVolume(interaction.guildId, value);
  await respond(interaction, `🔊 Гучність встановлено на ${value}%`);
}
