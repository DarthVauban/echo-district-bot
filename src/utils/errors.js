export class BotError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'BotError';
    this.code = code;
  }
}

const publicMessages = {
  INVALID_YOUTUBE_URL: '❌ Некоректне YouTube-посилання',
  YOUTUBE_UNAVAILABLE: '❌ Відео недоступне або приватне',
  VIDEO_HAS_NO_AUDIO: '❌ Це відео не містить доступної аудіодоріжки',
  METADATA_FAILED: '❌ Не вдалося отримати дані цього відео',
  AUDIO_STREAM_FAILED: '❌ Не вдалося отримати аудіо з цього відео',
  YT_DLP_NOT_FOUND: '❌ yt-dlp не знайдено. Встанови його та перезапусти бота',
  FFMPEG_NOT_FOUND: '❌ ffmpeg не знайдено. Встанови його та перезапусти бота',
  MISSING_VOICE_PERMISSIONS: '❌ У бота немає прав для підключення або відтворення аудіо',
  VOICE_CONNECTION_FAILED: '❌ Не вдалося підключитися до голосового каналу',
  QUEUE_FULL: '❌ Черга вже заповнена',
  NOT_IN_VOICE_CHANNEL: '⚠️ Спочатку зайди в голосовий канал',
  DIFFERENT_VOICE_CHANNEL: '⚠️ Спочатку зайди в голосовий канал, де вже перебуває бот',
};

export function getPublicErrorMessage(error) {
  if (error instanceof BotError && publicMessages[error.code]) {
    return publicMessages[error.code];
  }

  return '❌ Сталася неочікувана помилка. Спробуй ще раз пізніше.';
}
