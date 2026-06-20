import { escapeMarkdown } from 'discord.js';

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }

  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return [hours, minutes, remainder]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
      .join(':');
  }

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatTrackTitle(track) {
  const safeTitle = escapeMarkdown(track.title || 'Без назви');
  return safeTitle.length > 180 ? `${safeTitle.slice(0, 177)}...` : safeTitle;
}

export function formatQueue(snapshot) {
  if (!snapshot.currentTrack && snapshot.tracks.length === 0) {
    return '⚠️ Черга порожня';
  }

  const lines = [];

  if (snapshot.currentTrack) {
    lines.push('🎵 **Зараз грає:**');
    lines.push(`1. ${formatTrackTitle(snapshot.currentTrack)}`);
  }

  if (snapshot.tracks.length > 0) {
    const startIndex = snapshot.currentTrack ? 2 : 1;
    lines.push('', '📋 **Черга:**');
    snapshot.tracks.slice(0, 10).forEach((track, index) => {
      lines.push(`${startIndex + index}. ${formatTrackTitle(track)}`);
    });

    if (snapshot.tracks.length > 10) {
      lines.push(`…і ще ${snapshot.tracks.length - 10}`);
    }
  }

  return lines.join('\n');
}
