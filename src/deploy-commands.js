import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
} from 'discord.js';
import { commands } from './commands/index.js';
import { getCommandDeploymentConfig } from './config/env.js';
import { logger } from './utils/logger.js';

async function deployCommands() {
  const config = getCommandDeploymentConfig();
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = commands.map((command) => ({
    ...command.data.toJSON(),
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
  }));
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  logger.info('Deploying slash commands', {
    count: body.length,
    scope: config.guildId ? 'guild' : 'global',
  });

  await rest.put(route, { body });
  logger.info('Slash commands deployed successfully', {
    count: body.length,
    scope: config.guildId ? 'guild' : 'global',
  });
}

deployCommands().catch((error) => {
  logger.error('Slash command deployment failed', error);
  process.exitCode = 1;
});
