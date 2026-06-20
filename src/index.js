import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { commands } from './commands/index.js';
import { getRuntimeConfig } from './config/env.js';
import {
  handleMusicButton,
  handleMusicModal,
} from './interactions/musicControls.js';
import { MusicPlayer } from './services/MusicPlayer.js';
import { YouTubeAudioService } from './services/YouTubeAudioService.js';
import { getPublicErrorMessage } from './utils/errors.js';
import { respond } from './utils/interactions.js';
import { logger } from './utils/logger.js';

const config = getRuntimeConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const youtubeAudioService = new YouTubeAudioService({
  ytDlpPath: config.ytDlpPath,
  ffmpegPath: config.ffmpegPath,
});
const musicPlayer = new MusicPlayer(client, youtubeAudioService, {
  defaultVolume: config.defaultVolume,
  maxQueueSize: config.maxQueueSize,
});
const commandCollection = new Collection(
  commands.map((command) => [command.data.name, command]),
);

client.once(Events.ClientReady, (readyClient) => {
  logger.info('Bot is ready', {
    user: readyClient.user.tag,
    applicationId: readyClient.application?.id,
    guilds: readyClient.guilds.cache.size,
  });

  // Log every failed interaction callback so we can see the exact URL and status.
  client.rest.on('response', async (req, res) => {
    if (req.path.includes('/interactions/') && res.status >= 400) {
      let body;
      try {
        body = typeof res.json === 'function' ? await res.json() : undefined;
      } catch {
        // ignore body parse errors
      }
      logger.warn('REST interaction error', {
        method: req.method,
        path: req.path.replace(/\/interactions\/(\d+)\/([^/]{8})[^/]+\//, '/interactions/$1/$2…/'),
        status: res.status,
        body,
      });
    }
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.inGuild()) {
    return;
  }

  // Detect application ID mismatch (bot token ≠ registered application).
  const clientAppId = client.application?.id;
  if (clientAppId && interaction.applicationId !== clientAppId) {
    logger.error('Application ID mismatch', {
      interactionAppId: interaction.applicationId,
      clientAppId,
      type: interaction.type,
    });
  }

  try {
    const dependencies = {
      musicPlayer,
      youtubeAudioService,
    };

    if (interaction.isButton()) {
      await handleMusicButton(interaction, dependencies);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleMusicModal(interaction, dependencies);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandCollection.get(interaction.commandName);

    if (!command) {
      await respond(interaction, '❌ Невідома команда', { ephemeral: true });
      return;
    }

    await command.execute(interaction, dependencies);
  } catch (error) {
    if (error.code === 10062 || error.code === 40060) {
      logger.warn(`Interaction dead (${error.code})`, {
        command: interaction.commandName ?? interaction.customId ?? interaction.type,
      });
      return;
    }

    logger.error('Command failed', {
      command: interaction.commandName ?? interaction.customId ?? interaction.type,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      code: error.code,
      message: error.message,
    });

    try {
      await respond(interaction, getPublicErrorMessage(error), { ephemeral: true });
    } catch (replyError) {
      if (replyError.message !== 'Interaction has already been acknowledged.') {
        logger.error('Could not send command error response', {
          command: interaction.commandName ?? interaction.customId ?? interaction.type,
          message: replyError.message,
        });
      }
    }
  }
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error', error);
});

client.on(Events.ShardDisconnect, (event, id) => {
  logger.warn('Gateway disconnected', { shardId: id, code: event.code, reason: event.reason });
});

client.on(Events.ShardResume, (id, replayed) => {
  logger.info('Gateway resumed', { shardId: id, replayedEvents: replayed });
});

client.on(Events.ShardReconnecting, (id) => {
  logger.info('Gateway reconnecting', { shardId: id });
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('Shutting down bot', { signal });
  await musicPlayer.shutdown();
  client.destroy();
}

process.once('SIGINT', () => {
  shutdown('SIGINT').finally(() => {
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => {
    process.exit(0);
  });
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', error);
});

client.login(config.discordToken).catch((error) => {
  logger.error('Discord login failed', error);
  process.exitCode = 1;
});
