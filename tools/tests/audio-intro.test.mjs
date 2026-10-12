import assert from 'node:assert/strict';
import test from 'node:test';
import { arrange } from '../../engine/audio.js';
import campaign from '../../campaigns/learning-workbench/timeline.js';

function schedule(score) {
  const calls = [];
  const studio = new Proxy({}, {
    get: (_, name) => (...args) => calls.push({ name, args }),
  });
  arrange(studio, score);
  return calls;
}

test('bright intro uses short upper-register notes without a drone or heavy drums', () => {
  const calls = schedule({ ...campaign.score, parts: [campaign.score.parts[0]], sfx: [] });
  assert.ok(calls.some((c) => c.name === 'chime'));
  assert.ok(calls.every((c) => ['chime', 'hat'].includes(c.name)));
  assert.ok(calls.filter((c) => c.name === 'chime').every((c) => c.args[1] >= 71 && c.args[0] + 0.3 <= 8));
});

test('legacy intro remains available for other campaigns', () => {
  const calls = schedule({ ...campaign.score, parts: [{ type: 'intro', start: 0, end: 8 }], sfx: [] });
  assert.equal(calls.filter((c) => c.name === 'drone').length, 1);
  assert.equal(calls.filter((c) => c.name === 'chime').length, 0);
});

test('eight-second drop and all later music scheduling remain unchanged', () => {
  const bright = schedule(campaign.score).filter((c) => c.args[0] >= 8);
  const legacy = schedule({
    ...campaign.score,
    parts: [{ type: 'intro', start: 0, end: 8 }, ...campaign.score.parts.slice(1)],
  }).filter((c) => c.args[0] >= 8);
  assert.deepEqual(bright, legacy);
  assert.ok(bright.some((c) => c.name === 'impact' && c.args[0] === 8));
});

test('opening effects are light and the existing timing stays at 42 seconds', () => {
  const opening = campaign.score.sfx.filter((s) => s.t < 8);
  assert.ok(opening.every((s) => !['thud', 'glitch', 'impact'].includes(s.type)));
  assert.ok(opening.every((s) => s.vel <= 0.45));
  assert.equal(campaign.duration, 42);
  assert.equal(campaign.fps, 60);
  assert.equal(campaign.score.parts[1].start, 8);
});
