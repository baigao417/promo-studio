import assert from 'node:assert/strict';
import test from 'node:test';
import { clamp, lerp, tween, ease, rng, beatInfo, hitPulse } from '../../engine/core.js';
import { encodeWav, peaks } from '../../engine/audio.js';
import learning from '../../campaigns/learning-workbench/timeline.js';
import explore from '../../campaigns/explore/timeline.js';

test('interpolation clamps at timeline boundaries', () => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(2), 1);
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(tween(-1, 0, 2, 10, 20), 10);
  assert.equal(tween(3, 0, 2, 10, 20), 20);
  assert.equal(tween(1, 0, 2, 10, 20, ease.linear), 15);
});

test('seeded drawing random sequence is repeatable and bounded', () => {
  const a = rng(123), b = rng(123), c = rng(456);
  const values = Array.from({ length: 100 }, () => a());
  assert.deepEqual(values, Array.from({ length: 100 }, () => b()));
  assert.notDeepEqual(values, Array.from({ length: 100 }, () => c()));
  assert.ok(values.every((n) => n >= 0 && n < 1));
});

test('beat and effect pulses use seconds rather than wall time', () => {
  assert.deepEqual(beatInfo(1, 120), { beat: 2, phase: 0, spb: 0.5, pulse: 1 });
  assert.equal(hitPulse(0.9, [1]), 0);
  assert.equal(hitPulse(1, [1]), 1);
  assert.ok(hitPulse(1.1, [1]) < 1);
});

test('WAV encoder writes little-endian stereo PCM and clips samples', () => {
  const channels = [new Float32Array([-2, 0, 2, 0.5]), new Float32Array([2, 0, -2, -0.5])];
  const bytes = encodeWav({ numberOfChannels: 2, length: 4, sampleRate: 4, getChannelData: (c) => channels[c] }, 0.75);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(bytes.length, 44 + 3 * 4);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 4);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 32767);
});

test('waveform envelope exposes nonzero signal', () => {
  const data = new Float32Array(32);
  data[0] = 0.5; data[16] = -0.75;
  assert.deepEqual(Array.from(peaks({ getChannelData: () => data }, 2)), [0.5, 0.75]);
});

for (const [id, spec] of [['learning-workbench', learning], ['explore', explore]]) {
  test(`${id} has contiguous scenes and no captured assets`, () => {
    assert.equal(spec.scenes[0].start, 0);
    assert.equal(spec.scenes.at(-1).end, spec.duration);
    assert.equal(spec.score.duration, spec.duration);
    assert.equal(spec.scenes.length, 5);
    assert.deepEqual(spec.assets, {});
    for (let i = 1; i < spec.scenes.length; i++) assert.equal(spec.scenes[i - 1].end, spec.scenes[i].start);
    assert.ok(spec.captions.every((c) => c.start >= 0 && c.end <= spec.duration && c.start < c.end));
    assert.ok(spec.score.sfx.every((s) => s.t >= 0 && s.t < spec.duration));
  });
}
