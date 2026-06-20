import assert from 'node:assert/strict';
import test from 'node:test';
import { GuildQueue } from '../src/services/GuildQueue.js';

const track = {
  title: 'Test track',
  url: 'https://youtu.be/example',
  duration: '3:00',
  requestedBy: 'tester',
  thumbnail: null,
};

test('stores tracks in FIFO order', () => {
  const queue = new GuildQueue('guild', { defaultVolume: 50 });
  queue.enqueue({ ...track, title: 'First' });
  queue.enqueue({ ...track, title: 'Second' });

  assert.equal(queue.dequeue().title, 'First');
  assert.equal(queue.dequeue().title, 'Second');
  assert.equal(queue.dequeue(), null);
});

test('clear removes only queued tracks', () => {
  const queue = new GuildQueue('guild', { defaultVolume: 50 });
  queue.currentTrack = track;
  queue.enqueue({ ...track, title: 'Queued' });

  assert.equal(queue.clear(), 1);
  assert.equal(queue.currentTrack, track);
  assert.equal(queue.queue.length, 0);
});
