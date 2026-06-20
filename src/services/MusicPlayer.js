import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { BotError } from '../utils/errors.js';
import { formatTrackTitle } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';
import { createMusicPanelPayload } from '../utils/musicPanel.js';
import { GuildQueue } from './GuildQueue.js';

export class MusicPlayer {
  constructor(client, youtubeAudioService, { defaultVolume = 50, maxQueueSize = 100 } = {}) {
    this.client = client;
    this.youtubeAudioService = youtubeAudioService;
    this.defaultVolume = defaultVolume;
    this.maxQueueSize = maxQueueSize;
    this.guilds = new Map();
  }

  getState(guildId) {
    return this.guilds.get(guildId) ?? null;
  }

  getOrCreateState(guildId) {
    let state = this.guilds.get(guildId);

    if (!state) {
      state = new GuildQueue(guildId, { defaultVolume: this.defaultVolume });
      state.audioPlayer = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause,
        },
      });
      this.#attachPlayerEvents(state);
      this.guilds.set(guildId, state);
    }

    return state;
  }

  async addTrack({ guildId, track, voiceChannel, textChannelId }) {
    const state = this.getOrCreateState(guildId);

    return state.runExclusive(async () => {
      const connectedVoiceChannelId = state.voiceConnection?.joinConfig.channelId;

      if (
        state.currentTrack
        && connectedVoiceChannelId
        && connectedVoiceChannelId !== voiceChannel.id
      ) {
        throw new BotError(
          'DIFFERENT_VOICE_CHANNEL',
          'The user is not in the voice channel where the bot is playing.',
        );
      }

      if (state.queue.length >= this.maxQueueSize) {
        throw new BotError('QUEUE_FULL', 'The queue has reached MAX_QUEUE_SIZE.');
      }

      state.textChannelId = textChannelId;
      state.voiceChannelId = voiceChannel.id;

      const isActive = Boolean(state.currentTrack)
        || state.audioPlayer.state.status !== AudioPlayerStatus.Idle;

      const position = state.enqueue(track);

      if (isActive) {
        return { started: false, position };
      }

      await this.#ensureConnection(state, voiceChannel);

      try {
        const startedTrack = await this.#startNext(state, { announce: false });
        return { started: Boolean(startedTrack), position: 0 };
      } catch (error) {
        throw error instanceof BotError
          ? error
          : new BotError('AUDIO_STREAM_FAILED', 'Could not start playback.', { cause: error });
      }
    });
  }

  async start(guildId, { voiceChannel = null, textChannelId = null } = {}) {
    const state = this.getOrCreateState(guildId);

    return state.runExclusive(async () => {
      if (textChannelId) {
        state.textChannelId = textChannelId;
      }

      if (state.isPaused) {
        const resumed = state.audioPlayer.unpause();
        state.isPaused = !resumed;
        void this.refreshControlPanel(guildId);
        return resumed ? 'resumed' : 'already-playing';
      }

      if (state.currentTrack || state.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
        return 'already-playing';
      }

      if (state.queue.length === 0) {
        return 'empty';
      }

      if (!state.voiceConnection || state.voiceConnection.state.status === VoiceConnectionStatus.Destroyed) {
        if (!voiceChannel) {
          throw new BotError('NOT_IN_VOICE_CHANNEL', 'A voice channel is required.');
        }

        state.voiceChannelId = voiceChannel.id;
        await this.#ensureConnection(state, voiceChannel);
      }

      const track = await this.#startNext(state, { announce: false });
      void this.refreshControlPanel(guildId);
      return track ? 'started' : 'empty';
    });
  }

  async stop(guildId) {
    const state = this.getState(guildId);

    if (!state) {
      return false;
    }

    return state.runExclusive(async () => {
      const hadPlayback = Boolean(state.currentTrack)
        || state.queue.length > 0
        || state.audioPlayer.state.status !== AudioPlayerStatus.Idle;

      state.clear();
      state.endReason = 'stop';
      state.currentTrack = null;
      state.isPaused = false;
      state.audioResource = null;
      this.#cleanupPlayback(state);
      state.audioPlayer.stop(true);

      if (state.voiceConnection) {
        state.voiceConnection.destroy();
        state.voiceConnection = null;
        logger.info('Disconnected from voice channel', { guildId });
      }

      state.voiceChannelId = null;
      state.textChannelId = null;
      this.#syncProgressTimer(state);
      await this.refreshControlPanel(guildId);
      return hadPlayback;
    });
  }

  async skip(guildId) {
    const state = this.getState(guildId);

    if (!state?.currentTrack) {
      return false;
    }

    return state.runExclusive(async () => {
      if (!state.currentTrack) {
        return false;
      }

      state.endReason = 'skip';
      const stopped = state.audioPlayer.stop(true);

      if (!stopped) {
        this.#cleanupPlayback(state);
        state.currentTrack = null;
        state.audioResource = null;
        await this.#startNext(state, { announce: true });
      }

      return true;
    });
  }

  async pause(guildId) {
    const state = this.getState(guildId);

    if (!state?.currentTrack || state.isPaused) {
      return false;
    }

    const paused = state.audioPlayer.pause();
    state.isPaused = paused;
    void this.refreshControlPanel(guildId);
    return paused;
  }

  async resume(guildId) {
    const state = this.getState(guildId);

    if (!state?.currentTrack || !state.isPaused) {
      return false;
    }

    const resumed = state.audioPlayer.unpause();
    state.isPaused = !resumed;
    void this.refreshControlPanel(guildId);
    return resumed;
  }

  setVolume(guildId, value) {
    const state = this.getOrCreateState(guildId);
    state.volume = value;

    if (state.audioResource?.volume) {
      state.audioResource.volume.setVolume(value / 100);
    }

    void this.refreshControlPanel(guildId);
    return value;
  }

  clearQueue(guildId) {
    const cleared = this.getState(guildId)?.clear() ?? 0;
    void this.refreshControlPanel(guildId);
    return cleared;
  }

  getSnapshot(guildId) {
    const state = this.getState(guildId);

    if (!state) {
      return {
        currentTrack: null,
        tracks: [],
        volume: this.defaultVolume,
        isPaused: false,
        playbackDurationMs: 0,
      };
    }

    return {
      ...state.snapshot(),
      playbackDurationMs: state.audioResource?.playbackDuration ?? 0,
    };
  }

  getVoiceChannelId(guildId) {
    return this.getState(guildId)?.voiceConnection?.joinConfig.channelId
      ?? this.getState(guildId)?.voiceChannelId
      ?? null;
  }

  createControlPanelPayload(guildId) {
    return createMusicPanelPayload(this.getSnapshot(guildId));
  }

  attachControlPanel(guildId, message) {
    const state = this.getOrCreateState(guildId);
    state.controlPanelChannelId = message.channelId;
    state.controlPanelMessageId = message.id;
    this.#syncProgressTimer(state);
  }

  async refreshControlPanel(guildId) {
    const state = this.getState(guildId);

    if (!state?.controlPanelChannelId || !state.controlPanelMessageId) {
      return;
    }

    return state.runPanelExclusive(async () => {
      try {
        const channel = await this.client.channels.fetch(state.controlPanelChannelId);

        if (!channel?.isTextBased() || !('messages' in channel)) {
          return;
        }

        await channel.messages.edit(
          state.controlPanelMessageId,
          this.createControlPanelPayload(guildId),
        );
        this.#syncProgressTimer(state);
      } catch (error) {
        logger.warn('Could not update music control panel', {
          guildId,
          message: error.message,
        });
        state.controlPanelChannelId = null;
        state.controlPanelMessageId = null;
        this.#syncProgressTimer(state);
      }
    });
  }

  async moveControlPanelToBottom(guildId, channelId = null) {
    const state = this.getOrCreateState(guildId);
    const targetChannelId = channelId
      ?? state.controlPanelChannelId
      ?? state.textChannelId;

    if (!targetChannelId) {
      return null;
    }

    return state.runPanelExclusive(async () => {
      try {
        const channel = await this.client.channels.fetch(targetChannelId);

        if (
          !channel?.isTextBased()
          || !('send' in channel)
          || !('messages' in channel)
        ) {
          return null;
        }

        const oldChannelId = state.controlPanelChannelId;
        const oldMessageId = state.controlPanelMessageId;
        const newMessage = await channel.send(this.createControlPanelPayload(guildId));

        state.controlPanelChannelId = newMessage.channelId;
        state.controlPanelMessageId = newMessage.id;
        state.textChannelId = newMessage.channelId;
        this.#syncProgressTimer(state);

        if (oldMessageId && oldMessageId !== newMessage.id) {
          try {
            const oldChannel = oldChannelId === newMessage.channelId
              ? channel
              : await this.client.channels.fetch(oldChannelId);

            if (oldChannel?.isTextBased() && 'messages' in oldChannel) {
              await oldChannel.messages.delete(oldMessageId);
            }
          } catch (error) {
            if (error.code !== 10008) {
              logger.warn('Could not delete previous music control panel', {
                guildId,
                message: error.message,
              });
            }
          }
        }

        return newMessage;
      } catch (error) {
        logger.warn('Could not move music control panel', {
          guildId,
          message: error.message,
        });
        return null;
      }
    });
  }

  getNowPlaying(guildId) {
    return this.getState(guildId)?.currentTrack ?? null;
  }

  async shutdown() {
    for (const state of this.guilds.values()) {
      this.#stopProgressTimer(state);
    }

    await Promise.allSettled([...this.guilds.keys()].map((guildId) => this.stop(guildId)));
  }

  #syncProgressTimer(state) {
    const shouldRun = Boolean(
      state.currentTrack
      && !state.isPaused
      && state.controlPanelChannelId
      && state.controlPanelMessageId,
    );

    if (!shouldRun) {
      this.#stopProgressTimer(state);
      return;
    }

    if (state.progressTimer) {
      return;
    }

    state.progressTimer = setInterval(() => {
      this.refreshControlPanel(state.guildId).catch((error) => {
        logger.warn('Progress update failed', {
          guildId: state.guildId,
          message: error.message,
        });
      });
    }, 10_000);
    state.progressTimer.unref?.();
  }

  #stopProgressTimer(state) {
    if (!state.progressTimer) {
      return;
    }

    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }

  /*
   * The remaining private methods own the Discord voice connection and
   * playback process lifecycle.
   */

  async #ensureConnection(state, voiceChannel) {
    const existing = state.voiceConnection;

    if (
      existing
      && existing.joinConfig.channelId === voiceChannel.id
      && existing.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      existing.subscribe(state.audioPlayer);
      await entersState(existing, VoiceConnectionStatus.Ready, 20_000);
      return existing;
    }

    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      existing.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    state.voiceConnection = connection;
    state.voiceChannelId = voiceChannel.id;
    connection.subscribe(state.audioPlayer);

    connection.on('stateChange', (oldState, newState) => {
      logger.info('Voice connection state changed', {
        guildId: state.guildId,
        from: oldState.status,
        to: newState.status,
      });
    });

    connection.on('error', (error) => {
      logger.error('Voice connection error', { guildId: state.guildId, message: error.message });
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        if (state.voiceConnection === connection) {
          await this.stop(state.guildId);
        }
      }
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      logger.info('Connected to voice channel', {
        guildId: state.guildId,
        voiceChannelId: voiceChannel.id,
      });
      return connection;
    } catch (error) {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      state.voiceConnection = null;
      throw new BotError('VOICE_CONNECTION_FAILED', 'Voice connection did not become ready.', {
        cause: error,
      });
    }
  }

  async #startNext(state, { announce }) {
    while (!state.currentTrack && state.queue.length > 0) {
      const track = state.dequeue();
      state.currentTrack = track;
      state.isPaused = false;
      state.endReason = null;

      try {
        const pipeline = await this.youtubeAudioService.createAudioStream(track.url);
        const resource = createAudioResource(pipeline.stream, {
          inputType: pipeline.inputType === 'ogg/opus'
            ? StreamType.OggOpus
            : StreamType.Raw,
          inlineVolume: true,
          metadata: track,
        });

        resource.volume.setVolume(state.volume / 100);
        state.audioResource = resource;
        state.playback = {
          ...pipeline,
          active: true,
          errorReported: false,
        };

        this.#watchPlaybackProcesses(state, state.playback);
        state.audioPlayer.play(resource);
        this.#syncProgressTimer(state);
        void this.refreshControlPanel(state.guildId);
        logger.info('Started track', {
          guildId: state.guildId,
          title: track.title,
        });

        if (announce) {
          await this.#sendToTextChannel(
            state,
            `▶️ Зараз грає: ${formatTrackTitle(track)}`,
          );
        }

        return track;
      } catch (error) {
        logger.error('Could not start track', {
          guildId: state.guildId,
          title: track.title,
          message: error.message,
        });
        this.#cleanupPlayback(state);
        state.currentTrack = null;
        state.audioResource = null;

        if (state.queue.length === 0) {
          throw new BotError('AUDIO_STREAM_FAILED', 'Could not create the audio stream.', {
            cause: error,
          });
        }

        await this.#sendToTextChannel(
          state,
          `❌ Не вдалося відтворити: ${formatTrackTitle(track)}. Переходжу до наступного треку.`,
        );
      }
    }

    return null;
  }

  #attachPlayerEvents(state) {
    state.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      state.runExclusive(async () => {
        if (state.currentTrack) {
          const playedSeconds = Math.floor(
            (state.audioResource?.playbackDuration ?? 0) / 1000,
          );
          const expectedSeconds = state.currentTrack.durationSeconds;
          const endedPrematurely = (
            !state.endReason
            && Number.isFinite(expectedSeconds)
            && playedSeconds + 15 < expectedSeconds
          );
          const details = {
            guildId: state.guildId,
            title: state.currentTrack.title,
            playedSeconds,
            expectedSeconds,
            reason: state.endReason ?? (endedPrematurely ? 'premature-eof' : 'natural'),
          };

          if (endedPrematurely) {
            logger.warn('Track ended prematurely', details);
          } else {
            logger.info('Finished track', details);
          }
        }

        this.#cleanupPlayback(state);
        state.currentTrack = null;
        state.audioResource = null;
        state.isPaused = false;
        state.endReason = null;

        try {
          await this.#startNext(state, { announce: true });
        } catch (error) {
          logger.error('Could not advance queue', {
            guildId: state.guildId,
            message: error.message,
          });
          await this.#sendToTextChannel(state, '❌ Не вдалося отримати аудіо з наступного відео');
        }

        this.#syncProgressTimer(state);
        await this.refreshControlPanel(state.guildId);
      }).catch((error) => {
        logger.error('Idle handler failed', { guildId: state.guildId, message: error.message });
      });
    });

    state.audioPlayer.on('error', (error) => {
      logger.error('Audio player error', {
        guildId: state.guildId,
        message: error.message,
      });

      state.runExclusive(async () => {
        await this.#sendToTextChannel(state, '❌ Відтворення перервано через помилку аудіо');
        state.endReason = 'player-error';
        state.audioPlayer.stop(true);
      }).catch(() => {});
    });
  }

  #watchPlaybackProcesses(state, playback) {
    const reportFailure = (processName, code, signal) => {
      const exitedSuccessfully = code === 0 && !signal;

      if (!playback.active || playback.errorReported || exitedSuccessfully) {
        return;
      }

      playback.errorReported = true;
      const diagnostics = playback.diagnostics();
      logger.error(`${processName} exited during playback`, {
        guildId: state.guildId,
        code,
        signal,
        diagnostics,
      });

      state.runExclusive(async () => {
        if (state.playback !== playback) {
          return;
        }

        await this.#sendToTextChannel(state, '❌ Не вдалося продовжити відтворення цього треку');
        state.endReason = 'process-error';
        state.audioPlayer.stop(true);
      }).catch(() => {});
    };

    for (const [processName, child] of Object.entries(playback.processes)) {
      child.once('close', (code, signal) => {
        if (!playback.active) {
          return;
        }

        logger.info('Playback process exited', {
          guildId: state.guildId,
          processName,
          code,
          signal,
          diagnostics: playback.diagnostics(),
        });
        reportFailure(processName, code, signal);
      });
    }
  }

  #cleanupPlayback(state) {
    if (!state.playback) {
      return;
    }

    state.playback.active = false;
    state.playback.cleanup();
    state.playback = null;
  }

  async #sendToTextChannel(state, content) {
    if (!state.textChannelId) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(state.textChannelId);

      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send({ content });
        await this.moveControlPanelToBottom(state.guildId, state.textChannelId);
      }
    } catch (error) {
      logger.warn('Could not send playback update', {
        guildId: state.guildId,
        message: error.message,
      });
    }
  }
}
