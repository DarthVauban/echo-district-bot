import dotenv from 'dotenv';

dotenv.config();

function parseInteger(name, fallback, { min, max }) {
  const rawValue = process.env[name];
  const value = rawValue === undefined || rawValue === '' ? fallback : Number(rawValue);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return value;
}

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getRuntimeConfig() {
  return {
    discordToken: requireEnvironmentVariable('DISCORD_TOKEN'),
    defaultVolume: parseInteger('DEFAULT_VOLUME', 50, { min: 0, max: 100 }),
    maxQueueSize: parseInteger('MAX_QUEUE_SIZE', 100, { min: 1, max: 1000 }),
    ytDlpPath: process.env.YT_DLP_PATH?.trim() || 'yt-dlp',
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
    ytDlpCookiesFile: process.env.YT_DLP_COOKIES_FILE?.trim() || null,
  };
}

export function getCommandDeploymentConfig() {
  return {
    discordToken: requireEnvironmentVariable('DISCORD_TOKEN'),
    clientId: requireEnvironmentVariable('CLIENT_ID'),
    guildId: process.env.GUILD_ID?.trim() || null,
  };
}
