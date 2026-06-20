export class GuildQueue {
  constructor(guildId, { defaultVolume }) {
    this.guildId = guildId;
    this.voiceConnection = null;
    this.audioPlayer = null;
    this.audioResource = null;
    this.currentTrack = null;
    this.queue = [];
    this.volume = defaultVolume;
    this.isPaused = false;
    this.textChannelId = null;
    this.voiceChannelId = null;
    this.playback = null;
    this.endReason = null;
    this.currentTrackRetries = 0;
    this.controlPanelChannelId = null;
    this.controlPanelMessageId = null;
    this.progressTimer = null;
    this.operation = Promise.resolve();
    this.panelOperation = Promise.resolve();
  }

  enqueue(track) {
    this.queue.push(track);
    return this.queue.length;
  }

  dequeue() {
    return this.queue.shift() ?? null;
  }

  clear() {
    const count = this.queue.length;
    this.queue.length = 0;
    return count;
  }

  snapshot() {
    return {
      currentTrack: this.currentTrack ? { ...this.currentTrack } : null,
      tracks: this.queue.map((track) => ({ ...track })),
      volume: this.volume,
      isPaused: this.isPaused,
    };
  }

  runExclusive(operation) {
    const result = this.operation.then(operation, operation);
    this.operation = result.catch(() => {});
    return result;
  }

  runPanelExclusive(operation) {
    const result = this.panelOperation.then(operation, operation);
    this.panelOperation = result.catch(() => {});
    return result;
  }
}
