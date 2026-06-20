import { spawn } from 'node:child_process';
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
      const unavailable = /private|unavailable|not available|sign in|members-only/i.test(stderr);
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

    const source = await this.#getDirectAudioSource(url);
    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-rw_timeout',
      '15000000',
    ];

    if (source.userAgent) {
      ffmpegArgs.push('-user_agent', source.userAgent);
    }

    if (source.referer) {
      ffmpegArgs.push('-referer', source.referer);
    }

    ffmpegArgs.push(
      '-i',
      source.url,
      '-vn',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-f',
      's16le',
      'pipe:1',
    );

    const ffmpeg = spawn(
      this.ffmpegPath,
      ffmpegArgs,
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let ffmpegError = '';
    let cleanedUp = false;

    ffmpeg.stderr.on('data', (chunk) => {
      ffmpegError = appendLimited(ffmpegError, chunk, MAX_ERROR_BYTES);
    });

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;

      if (ffmpeg.exitCode === null) {
        ffmpeg.kill();
      }
    };

    try {
      await waitForSpawn(ffmpeg, 'ffmpeg');

      await new Promise((resolve, reject) => {
        const finish = (callback) => {
          clearTimeout(timeout);
          ffmpeg.stdout.off('readable', onReadable);
          ffmpeg.off('close', onFfmpegClose);
          callback();
        };
        const onReadable = () => finish(resolve);
        const onFfmpegClose = (code) => finish(() => reject(new BotError(
          'AUDIO_STREAM_FAILED',
          ffmpegError.trim() || `ffmpeg exited before producing audio (code ${code}).`,
        )));
        const timeout = setTimeout(() => {
          finish(() => reject(new BotError(
            'AUDIO_STREAM_FAILED',
            'Timed out while waiting for the first audio data.',
          )));
        }, 20_000);

        ffmpeg.stdout.once('readable', onReadable);
        ffmpeg.once('close', onFfmpegClose);
      });
    } catch (error) {
      cleanup();
      throw error;
    }

    return {
      stream: ffmpeg.stdout,
      processes: { ffmpeg },
      cleanup,
      diagnostics() {
        return {
          ffmpegError: ffmpegError.trim(),
          sourceProtocol: source.protocol,
        };
      },
    };
  }

  async #getDirectAudioSource(url) {
    const child = spawn(
      this.ytDlpPath,
      [
        '--dump-single-json',
        '--skip-download',
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes',
        'node',
        '--socket-timeout',
        '15',
        '--extractor-retries',
        '3',
        '-f',
        'bestaudio/best',
        '--',
        url,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

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

    const { code } = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new BotError('AUDIO_STREAM_FAILED', 'Audio URL extraction timed out.'));
      }, this.metadataTimeoutMs);

      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(new BotError(
          error.code === 'ENOENT' ? 'YT_DLP_NOT_FOUND' : 'AUDIO_STREAM_FAILED',
          'Could not start yt-dlp for audio URL extraction.',
          { cause: error },
        ));
      });

      child.once('close', (exitCode) => {
        clearTimeout(timeout);
        resolve({ code: exitCode });
      });
    });

    if (tooLarge || code !== 0) {
      throw new BotError(
        'AUDIO_STREAM_FAILED',
        stderr.trim() || 'Could not extract the direct audio URL.',
      );
    }

    let selected;

    try {
      selected = JSON.parse(stdout);
    } catch (error) {
      throw new BotError(
        'AUDIO_STREAM_FAILED',
        'yt-dlp returned invalid audio source JSON.',
        { cause: error },
      );
    }

    const mediaUrl = selected.url || selected.requested_downloads?.[0]?.url;
    let parsedUrl;

    try {
      parsedUrl = new URL(mediaUrl);
    } catch {
      throw new BotError('AUDIO_STREAM_FAILED', 'yt-dlp did not return a valid media URL.');
    }

    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      throw new BotError('AUDIO_STREAM_FAILED', 'Unsupported audio source protocol.');
    }

    const headers = selected.http_headers
      || selected.requested_downloads?.[0]?.http_headers
      || {};

    return {
      url: parsedUrl.toString(),
      protocol: selected.protocol || parsedUrl.protocol.replace(':', ''),
      userAgent: typeof headers['User-Agent'] === 'string'
        ? headers['User-Agent'].replace(/[\r\n]/g, '')
        : null,
      referer: typeof headers.Referer === 'string'
        ? headers.Referer.replace(/[\r\n]/g, '')
        : null,
    };
  }
}
