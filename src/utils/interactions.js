import { PermissionsBitField } from 'discord.js';
import { BotError } from './errors.js';

export async function respond(interaction, content, { ephemeral = false } = {}) {
  if (interaction.isMessageComponent?.() && interaction.deferred) {
    return interaction.followUp({ content, ephemeral: true });
  }

  if (interaction.deferred) {
    return interaction.editReply({ content });
  }

  if (interaction.replied) {
    return interaction.followUp({ content, ephemeral });
  }

  return interaction.reply({ content, ephemeral });
}

export function getMemberVoiceChannel(interaction) {
  return interaction.member?.voice?.channel ?? null;
}

export function assertBotVoicePermissions(interaction, voiceChannel) {
  const botMember = interaction.guild?.members?.me;
  const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;

  if (
    !permissions?.has(PermissionsBitField.Flags.Connect)
    || !permissions.has(PermissionsBitField.Flags.Speak)
  ) {
    throw new BotError(
      'MISSING_VOICE_PERMISSIONS',
      'The bot cannot connect to or speak in this voice channel.',
    );
  }
}
