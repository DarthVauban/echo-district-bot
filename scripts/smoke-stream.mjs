import { createRequire } from 'node:module';
import { Transform } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { YouTubeAudioService } from '../src/services/YouTubeAudioService.js';

const durationMs = Number(process.env.TEST_DURATION_MS || 60_000);
const videoUrl = process.env.TEST_VIDEO_URL;

if (!videoUrl) {
  throw new Error('TEST_VIDEO_URL is required.');
}

const require = createRequire(pathToFileURL(`${process.cwd()}/package.json`));
const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
} = require('@discordjs/voice');
const service = new YouTubeAudioService({
  ytDlpPath: process.env.YT_DLP_PATH,
  ffmpegPath: process.env.FFMPEG_PATH,
  metadataTimeoutMs: 45_000,
});

const pipeline = await service.createAudioStream(videoUrl);
let bytes = 0;
const exited = [];
let playerError = null;
let becameIdle = false;

for (const [processName, child] of Object.entries(pipeline.processes)) {
  child.once('close', (code, signal) => {
    exited.push({
      processName,
      code,
      signal,
      diagnostics: pipeline.diagnostics(),
    });
  });
}

const counter = new Transform({
  transform(chunk, encoding, callback) {
    bytes += chunk.length;
    callback(null, chunk);
  },
});
pipeline.stream.pipe(counter);

const resource = createAudioResource(counter, {
  inputType: pipeline.inputType === 'webm/opus'
    ? StreamType.WebmOpus
    : pipeline.inputType === 'ogg/opus'
      ? StreamType.OggOpus
      : StreamType.Raw,
  inlineVolume: true,
});
resource.volume.setVolume(0.5);

const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Play,
  },
});
player.on('error', (error) => {
  playerError = error.message;
});
player.on(AudioPlayerStatus.Idle, () => {
  becameIdle = true;
});
player.play(resource);

await new Promise((resolve) => setTimeout(resolve, durationMs));
const result = {
  videoUrl,
  secondsTested: durationMs / 1000,
  playbackSeconds: Math.round(resource.playbackDuration / 1000),
  bytes,
  processesExitedEarly: exited,
  playerError,
  becameIdle,
  pipeline: pipeline.diagnostics(),
};
const failed = Boolean(
  exited.length > 0
  || playerError
  || becameIdle
  || resource.playbackDuration < durationMs - 5_000
);

player.stop(true);
pipeline.cleanup();
console.log(JSON.stringify(result));

if (failed) {
  process.exitCode = 1;
}
