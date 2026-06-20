import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleMusicButton,
  handleMusicModal,
} from '../src/interactions/musicControls.js';
import { MUSIC_CONTROL_IDS } from '../src/utils/musicPanel.js';

function createInteraction(customId) {
  return {
    customId,
    guildId: 'guild',
    message: { id: 'message', channelId: 'text' },
    member: {
      voice: {
        channel: { id: 'voice' },
      },
    },
    async deferUpdate() {},
    async followUp() {},
  };
}

test('add-track button opens a URL modal', async () => {
  const interaction = createInteraction(MUSIC_CONTROL_IDS.add);
  let shownModal = null;
  interaction.showModal = async (modal) => {
    shownModal = modal;
  };

  const musicPlayer = {
    attachControlPanel() {},
    getVoiceChannelId() {
      return 'voice';
    },
  };

  const handled = await handleMusicButton(interaction, { musicPlayer });

  assert.equal(handled, true);
  assert.equal(shownModal.data.custom_id, MUSIC_CONTROL_IDS.addModal);
  assert.equal(shownModal.components.length, 1);
});

test('volume-up button clamps volume to 100 percent', async () => {
  const interaction = createInteraction(MUSIC_CONTROL_IDS.volumeUp);
  let newVolume = null;

  const musicPlayer = {
    attachControlPanel() {},
    getVoiceChannelId() {
      return 'voice';
    },
    getSnapshot() {
      return { volume: 95 };
    },
    setVolume(guildId, value) {
      assert.equal(guildId, 'guild');
      newVolume = value;
    },
    async refreshControlPanel() {},
  };

  const handled = await handleMusicButton(interaction, { musicPlayer });

  assert.equal(handled, true);
  assert.equal(newVolume, 100);
});

test('custom-volume button opens a modal with the current value', async () => {
  const interaction = createInteraction(MUSIC_CONTROL_IDS.volumeCustom);
  let shownModal = null;
  interaction.showModal = async (modal) => {
    shownModal = modal;
  };

  const musicPlayer = {
    attachControlPanel() {},
    getVoiceChannelId() {
      return 'voice';
    },
    getSnapshot() {
      return { volume: 65 };
    },
  };

  await handleMusicButton(interaction, { musicPlayer });

  assert.equal(shownModal.data.custom_id, MUSIC_CONTROL_IDS.volumeModal);
  assert.equal(shownModal.components[0].components[0].data.value, '65');
});

test('custom-volume modal applies an exact value', async () => {
  let appliedVolume = null;
  let reply = null;
  let refreshed = false;
  const interaction = {
    customId: MUSIC_CONTROL_IDS.volumeModal,
    guildId: 'guild',
    member: { voice: { channel: { id: 'voice' } } },
    fields: {
      getTextInputValue() {
        return '37';
      },
    },
    async reply(payload) {
      reply = payload;
    },
  };
  const musicPlayer = {
    getVoiceChannelId() {
      return 'voice';
    },
    setVolume(guildId, value) {
      assert.equal(guildId, 'guild');
      appliedVolume = value;
    },
    async refreshControlPanel() {
      refreshed = true;
    },
  };

  const handled = await handleMusicModal(interaction, { musicPlayer });

  assert.equal(handled, true);
  assert.equal(appliedVolume, 37);
  assert.equal(refreshed, true);
  assert.equal(reply.ephemeral, true);
});

test('custom-volume modal rejects values outside 0 to 100', async () => {
  let applied = false;
  let reply = null;
  const interaction = {
    customId: MUSIC_CONTROL_IDS.volumeModal,
    guildId: 'guild',
    member: { voice: { channel: { id: 'voice' } } },
    fields: {
      getTextInputValue() {
        return '101';
      },
    },
    async reply(payload) {
      reply = payload;
    },
  };
  const musicPlayer = {
    getVoiceChannelId() {
      return 'voice';
    },
    setVolume() {
      applied = true;
    },
  };

  await handleMusicModal(interaction, { musicPlayer });

  assert.equal(applied, false);
  assert.match(reply.content, /0 до 100/);
});
