import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { getCommandDeploymentConfig } from './config/env.js';

const { clientId } = getCommandDeploymentConfig();
const permissions = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
]);

const url = new URL('https://discord.com/oauth2/authorize');
url.searchParams.set('client_id', clientId);
url.searchParams.set('scope', 'bot applications.commands');
url.searchParams.set('permissions', permissions.bitfield.toString());
url.searchParams.set('integration_type', '0');

console.info(url.toString());
