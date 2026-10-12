import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSoundtrack } from '../../engine/audio.js';

test('empty short score stays finite and silent instead of dividing by zero', async (t) => {
  const original = globalThis.OfflineAudioContext;
  t.after(() => {
    if (original === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = original;
  });
  function buffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (i) => data[i] };
  }
  const node = () => ({
    gain: {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {},
  });
  globalThis.OfflineAudioContext = class {
    constructor(channels, length, sampleRate) { this.result = buffer(channels, length, sampleRate); }
    createBuffer(...args) { return buffer(...args); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createConvolver() { return node(); }
    async startRendering() { return this.result; }
  };
  const result = await renderSoundtrack({ duration: 0.1, bpm: 120, chords: [], parts: [], sfx: [] });
  assert.ok(result.getChannelData(0).every((sample) => sample === 0));
  assert.ok(result.getChannelData(1).every((sample) => sample === 0));
});
