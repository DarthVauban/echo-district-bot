const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function isYouTubeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) {
    return false;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!['https:', 'http:'].includes(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return false;
  }

  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    return url.pathname.split('/').filter(Boolean).length >= 1;
  }

  return (
    (url.pathname === '/watch' && Boolean(url.searchParams.get('v')))
    || /^\/(shorts|live|embed)\/[^/]+/.test(url.pathname)
  );
}

export function isVolume(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}
