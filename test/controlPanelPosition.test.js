import assert from 'node:assert/strict';
import test from 'node:test';
import { MusicPlayer } from '../src/services/MusicPlayer.js';

test('moving the panel sends a new message and deletes the previous one', async () => {
  const sentMessages = [];
  const deletedMessages = [];
  const channel = {
    id: 'text',
    isTextBased() {
      return true;
    },
    async send(payload) {
      const message = {
        id: `panel-${sentMessages.length + 1}`,
        channelId: 'text',
        payload,
      };
      sentMessages.push(message);
      return message;
    },
    messages: {
      async delete(messageId) {
        deletedMessages.push(messageId);
      },
      async edit() {},
    },
  };
  const client = {
    channels: {
      async fetch() {
        return channel;
      },
    },
  };
  const musicPlayer = new MusicPlayer(client, {}, { defaultVolume: 50 });

  const first = await musicPlayer.moveControlPanelToBottom('guild', 'text');
  const second = await musicPlayer.moveControlPanelToBottom('guild', 'text');

  assert.equal(first.id, 'panel-1');
  assert.equal(second.id, 'panel-2');
  assert.deepEqual(deletedMessages, ['panel-1']);
  assert.equal(musicPlayer.getState('guild').controlPanelMessageId, 'panel-2');
});
