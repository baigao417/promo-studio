import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('local preview and isolated review storage', async (t) => {
  const root = path.resolve(process.env.PROMO_TEST_DIR || os.tmpdir());
  fs.mkdirSync(root, { recursive: true });
  const data = fs.mkdtempSync(path.join(root, 'promo-studio-test-'));
  process.env.PROMO_DATA_DIR = data;
  process.env.PORT = '0';
  const { server } = await import('../server.mjs');
  if (!server.listening) await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const relative = path.relative(root, data);
    if (!relative.startsWith('promo-studio-test-') || relative.includes(path.sep)) throw new Error('unsafe test cleanup path');
    fs.rmSync(data, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, origin = base) => fetch(`${base}/api/review/explore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
  });

  await t.test('root serves the review tool and campaigns serve their modules', async () => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Promo Studio/);
    assert.equal((await fetch(`${base}/campaigns/explore/timeline.js`)).status, 200);
    const sample = await (await fetch(`${base}/campaigns/explore/example.json`)).json();
    assert.equal(sample.synthetic, true);
  });
  await t.test('review note POST is persisted and returned by GET', async () => {
    const notes = [{ t: 3.5, text: 'Synthetic test note', kind: 'frame', scene_label: 'demo' }];
    assert.equal((await post({ notes })).status, 200);
    const response = await fetch(`${base}/api/review/explore`);
    assert.deepEqual((await response.json()).notes, notes);
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'explore', 'review.json'), 'utf8'));
    assert.deepEqual(saved.notes, notes);
  });
  await t.test('bad JSON, bad notes and unknown campaigns fail without writes', async () => {
    assert.equal((await post({ notes: 'bad' })).status, 400);
    assert.equal((await post({ notes: [{ t: -1, text: 'invalid' }] })).status, 400);
    assert.equal((await fetch(`${base}/api/review/missing`)).status, 404);
    const invalid = await fetch(`${base}/api/review/explore`, { method: 'POST', headers: { Origin: base }, body: '{' });
    assert.equal(invalid.status, 400);
  });
  await t.test('foreign origin cannot write local review data', async () => {
    assert.equal((await post({ notes: [] }, 'http://localhost:1')).status, 403);
  });
  await t.test('private files and encoded traversal are not served', async () => {
    for (const url of ['/.env', '/.git/config', '/tools/%2e%2e%5c.env', '/tools/runtime.py', '/LICENSE']) {
      assert.equal((await fetch(`${base}${url}`)).status, 403);
    }
    assert.equal((await fetch(`${base}/tools/%ZZ`)).status, 400);
  });
  await t.test('output listing and HTTP ranges use only the isolated data directory', async () => {
    const out = path.join(data, 'explore', 'out');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'synthetic.mp4'), 'synthetic-payload');
    const listed = await (await fetch(`${base}/api/outputs/explore`)).json();
    assert.deepEqual(listed.map((f) => f.name), ['synthetic.mp4']);
    const url = `${base}/campaigns/explore/out/synthetic.mp4`;
    const partial = await fetch(url, { headers: { Range: 'bytes=0-3' } });
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), 'synt');
    const suffix = await fetch(url, { headers: { Range: 'bytes=-7' } });
    assert.equal(await suffix.text(), 'payload');
    assert.equal((await fetch(url, { headers: { Range: 'bytes=999-' } })).status, 416);
    assert.equal((await fetch(url, { method: 'HEAD' })).headers.get('Content-Length'), '17');
  });
});
