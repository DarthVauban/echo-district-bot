import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDuration } from '../src/utils/formatters.js';
import { isYouTubeUrl, isVolume } from '../src/utils/validators.js';

test('accepts supported YouTube video URLs', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
  assert.equal(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), true);
  assert.equal(isYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), true);
});

test('rejects unsafe or unrelated URLs', () => {
  assert.equal(isYouTubeUrl('https://youtube.com.example.org/watch?v=test'), false);
  assert.equal(isYouTubeUrl('file:///etc/passwd'), false);
  assert.equal(isYouTubeUrl('not a url'), false);
});

test('validates volume range', () => {
  assert.equal(isVolume(0), true);
  assert.equal(isVolume(100), true);
  assert.equal(isVolume(-1), false);
  assert.equal(isVolume(101), false);
  assert.equal(isVolume(1.5), false);
});

test('formats durations', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatDuration(null), null);
});
