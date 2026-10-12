import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRenderer } from '../../engine/player.js';
import learning from '../../campaigns/learning-workbench/timeline.js';
import explore from '../../campaigns/explore/timeline.js';

function fakeCanvas() {
  const operations = [];
  const ctx = new Proxy({}, {
    get: (_, name) => {
      if (name === 'globalAlpha') return 1;
      if (name === 'measureText') return (s) => ({ width: String(s).length * 24 });
      if (name === 'createRadialGradient') return (...args) => {
        const descriptor = { type: 'radial-gradient', args, stops: [] };
        return { descriptor, addColorStop: (...stop) => descriptor.stops.push(stop) };
      };
      return (...args) => operations.push([name, ...args]);
    },
    set: (_, name, value) => { operations.push(['set', name, value?.descriptor ?? value]); return true; },
  });
  return { canvas: { getContext: () => ctx }, operations };
}

for (const [id, spec] of [['learning-workbench', learning], ['explore', explore]]) {
  const data = JSON.parse(fs.readFileSync(new URL(`../../campaigns/${id}/example.json`, import.meta.url), 'utf8'));
  test(`${id} synthetic scenes draw at every boundary without missing assets`, () => {
    const { canvas, operations } = fakeCanvas();
    const renderer = createRenderer({ spec, data, assets: {} }, canvas);
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1920);
    for (const t of [...spec.scenes.map((s) => s.start), spec.duration]) renderer.draw(t);
    assert.ok(operations.some(([name, value]) => name === 'fillText' && value === spec.title));
    assert.ok(operations.some(([name]) => name === 'fillRect'));
    assert.ok(operations.every((op) => op.every((value) => typeof value !== 'number' || Number.isFinite(value))));
  });
  test(`${id} repeated time produces identical drawing operations`, () => {
    const a = fakeCanvas(), b = fakeCanvas();
    for (const result of [a, b]) createRenderer({ spec, data, assets: {} }, result.canvas).draw(10);
    assert.deepEqual(a.operations, b.operations);
  });
}
