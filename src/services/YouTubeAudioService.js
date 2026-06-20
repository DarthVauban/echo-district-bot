import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { BotError } from '../utils/errors.js';
import { formatDuration } from '../utils/formatters.js';
import { isYouTubeUrl } from '../utils/validators.js';

const MAX_METADATA_BYTES = 5 * 1024 * 1024;
const MAX_ERROR_BYTES = 16 * 1024;

function appendLimited(current, chunk, limit) {
  if (current.length >= limit) {
    return current;
  }

  return `${current}${chunk.toString('utf8')}`.slice(0, limit);
}

function waitForSpawn(child, binaryName) {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', (error) => {
      reject(new BotError(
        binaryName === 'yt-dlp' ? 'YT_DLP_NOT_FOUND' : 'FFMPEG_NOT_FOUND',
        `Could not start ${binaryName}.`,
        { cause: error },
      ));
    });
  });
}

export class YouTubeAudioService {
  constructor({ ytDlpPath = 'yt-dlp', ffmpegPath = 'ffmpeg', metadataTimeoutMs = 30_000 } = {}) {
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.metadataTimeoutMs = metadataTimeoutMs;
  }

  validateUrl(url) {
    if (!isYouTubeUrl(url)) {
      throw new BotError('INVALID_YOUTUBE_URL', 'Invalid YouTube URL.');
    }
  }

  async getMetadata(url) {
    this.validateUrl(url);

    const args = [
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      '--js-runtimes',
      'node',
      '--socket-timeout',
      '15',
      '--extractor-retries',
      '2',
      '--extractor-args',
      'youtube:player_client=ios',
      '--',
      url,
    ];

    const child = spawn(this.ytDlpPath, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let tooLarge = false;

    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > MAX_METADATA_BYTES) {
        tooLarge = true;
        child.kill();
        return;
      }

      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk, MAX_ERROR_BYTES);
    });

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new BotError('METADATA_FAILED', 'yt-dlp metadata request timed out.'));
      }, this.metadataTimeoutMs);

      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(new BotError(
          error.code === 'ENOENT' ? 'YT_DLP_NOT_FOUND' : 'METADATA_FAILED',
          'Could not start yt-dlp. Is it installed?',
          { cause: error },
        ));
      });

      child.once('close', (code) => {
        clearTimeout(timeout);
        resolve({ code });
      });
    });

    if (tooLarge) {
      throw new BotError('METADATA_FAILED', 'yt-dlp returned too much metadata.');
    }

    if (result.code !== 0) {
      const unavailable = /private video|video is unavailable|this video is not available|sign in to confirm|members.?only/i.test(stderr);
      throw new BotError(
        unavailable ? 'YOUTUBE_UNAVAILABLE' : 'METADATA_FAILED',
        stderr.trim() || `yt-dlp exited with code ${result.code}.`,
      );
    }

    let metadata;

    try {
      metadata = JSON.parse(stdout);
    } catch (error) {
      throw new BotError('METADATA_FAILED', 'yt-dlp returned invalid JSON.', { cause: error });
    }

    const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
    const hasAudio = metadata.acodec !== 'none'
      || formats.some((format) => format.acodec && format.acodec !== 'none');

    if (!hasAudio) {
      throw new BotError('VIDEO_HAS_NO_AUDIO', 'No audio format is available.');
    }

    const thumbnails = Array.isArray(metadata.thumbnails) ? metadata.thumbnails : [];

    return {
      title: metadata.title || 'Без назви',
      duration: formatDuration(metadata.duration),
      durationSeconds: Number.isFinite(metadata.duration) ? metadata.duration : null,
      thumbnail: metadata.thumbnail || thumbnails.at(-1)?.url || null,
      author: metadata.uploader || metadata.channel || null,
      webpageUrl: metadata.webpage_url || url,
    };
  }

  async createAudioStream(url) {
    this.validateUrl(url);

    // yt-dlp downloads the audio and pipes it to stdout, handling all YouTube
    // authentication and CDN quirks internally.
    const ytdlp = spawn(
      this.ytDlpPath,
      [
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '--js-runtimes',
        'node',
        '--socket-timeout',
        '15',
        '--extractor-retries',
        '3',
        '--extractor-args',
        'youtube:player_client=ios',
        '-f',
        'bestaudio[acodec=opus]/bestaudio/best',
        '-o',
        '-',
        '--',
        url,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    // ffmpeg remuxes/transcodes yt-dlp's output into a streaming-friendly ogg/opus format.
    const ffmpeg = spawn(
      this.ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-threads',
        '1',
        '-i',
        'pipe:0',
        '-vn',
        '-sn',
        '-dn',
        '-map',
        '0:a:0',
        '-c:a',
        'libopus',
        '-b:a',
        '128k',
        '-application',
        'audio',
        '-f',
        'ogg',
        '-page_duration',
        '20000',
        '-flush_packets',
        '1',
        'pipe:1',
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let ytdlpError = '';
    let ffmpegError = '';
    let cleanedUp = false;

    ytdlp.stderr.on('data', (chunk) => {
      ytdlpError = appendLimited(ytdlpError, chunk, MAX_ERROR_BYTES);
    });
    ffmpeg.stderr.on('data', (chunk) => {
      ffmpegError = appendLimited(ffmpegError, chunk, MAX_ERROR_BYTES);
    });

    // Large buffer so the initial fast download from the CDN fills ~32 seconds
    // of audio ahead of playback; brief CDN rate-limit stalls at minute
    // boundaries drain this buffer instead of starving ffmpeg.
    const audioBuffer = new PassThrough({ highWaterMark: 512 * 1024 });

    ytdlp.stdout.pipe(audioBuffer);
    audioBuffer.pipe(ffmpeg.stdin);
    ytdlp.stdout.on('error', () => {});
    audioBuffer.on('error', () => {});
    ffmpeg.stdin.on('error', () => {});

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      ytdlp.stdout.unpipe(audioBuffer);
      audioBuffer.unpipe(ffmpeg.stdin);
      audioBuffer.destroy();

      if (ytdlp.exitCode === null) {
        ytdlp.kill();
      }

      if (ffmpeg.exitCode === null) {
        ffmpeg.kill();
      }
    };

    try {
      await Promise.all([
        waitForSpawn(ytdlp, 'yt-dlp'),
        waitForSpawn(ffmpeg, 'ffmpeg'),
      ]);

      await new Promise((resolve, reject) => {
        const finish = (callback) => {
          clearTimeout(timeout);
          ffmpeg.stdout.off('readable', onReadable);
          ffmpeg.off('close', onFfmpegClose);
          ytdlp.off('close', onYtdlpClose);
          callback();
        };

        const onReadable = () => finish(resolve);

        const onFfmpegClose = (code) => finish(() => reject(new BotError(
          'AUDIO_STREAM_FAILED',
          ffmpegError.trim() || ytdlpError.trim() || `ffmpeg exited before producing audio (code ${code}).`,
        )));

        const onYtdlpClose = (code) => {
          if (code !== 0) {
            finish(() => reject(new BotError(
              'AUDIO_STREAM_FAILED',
              ytdlpError.trim() || `yt-dlp exited with code ${code}.`,
            )));
          }
          // code 0: yt-dlp finished successfully; ffmpeg continues processing its buffer.
        };

        const timeout = setTimeout(() => {
          finish(() => reject(new BotError(
            'AUDIO_STREAM_FAILED',
            'Timed out while waiting for the first audio data.',
          )));
        }, 20_000);

        ffmpeg.stdout.once('readable', onReadable);
        ffmpeg.once('close', onFfmpegClose);
        ytdlp.once('close', onYtdlpClose);
      });
    } catch (error) {
      cleanup();
      throw error;
    }

    return {
      stream: ffmpeg.stdout,
      inputType: 'ogg/opus',
      processes: { ytdlp, ffmpeg },
      cleanup,
      diagnostics() {
        return {
          ytdlpError: ytdlpError.trim(),
          ffmpegError: ffmpegError.trim(),
          outputType: 'ogg/opus',
        };
      },
    };
  }
}
