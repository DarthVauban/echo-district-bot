import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMusicPanelPayload,
  formatProgressBar,
} from '../src/utils/musicPanel.js';

test('progress bar places the marker according to elapsed time', () => {
  const bar = formatProgressBar(50, 100, 10);

  assert.equal(bar.length, 11);
  assert.equal(bar.indexOf('🔘'), 5);
});

test('music panel contains playback and volume controls', () => {
  const payload = createMusicPanelPayload({
    currentTrack: {
      title: 'Test track',
      url: 'https://youtu.be/test',
      duration: '3:00',
      durationSeconds: 180,
      requestedBy: 'tester',
      thumbnail: null,
    },
    tracks: [{ title: 'Next track' }],
    volume: 50,
    isPaused: false,
    playbackDurationMs: 90_000,
  });

  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].components.length, 4);
  assert.equal(payload.components[1].components.length, 4);
  assert.match(payload.embeds[0].data.fields[0].value, /1:30 \/ 3:00/);
});
