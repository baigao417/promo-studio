// Loopback-only preview server. Runtime data is separate from source assets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(ROOT, process.env.PROMO_DATA_DIR || 'runtime');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5178);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.wav': 'audio/wav',
};

const validId = (id) => /^[a-z0-9-]+$/.test(id);
const campaignExists = (id) => validId(id) && fs.existsSync(path.join(ROOT, 'campaigns', id, 'timeline.js'));
const campaignData = (id) => path.join(DATA, id);
const inside = (root, file) => {
  const rel = path.relative(root, file);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

function serveFile(req, res, root, file) {
  if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
  const real = fs.realpathSync(file);
  if (!inside(fs.realpathSync(root), real)) return send(res, 403, 'forbidden', 'text/plain');
  const st = fs.statSync(real);
  if (!st.isFile()) return send(res, 404, 'not found', 'text/plain');
  const type = TYPES[path.extname(real).toLowerCase()];
  if (!type) return send(res, 403, 'forbidden', 'text/plain');
  let start = 0, end = st.size - 1, code = 200;
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  if (req.headers.range) {
    const m = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) return send(res, 416, 'invalid range', 'text/plain');
    start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= st.size) {
      return send(res, 416, 'invalid range', 'text/plain');
    }
    code = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = st.size === 0 ? 0 : end - start + 1;
  res.writeHead(code, headers);
  if (req.method === 'HEAD' || st.size === 0) return res.end();
  fs.createReadStream(real, { start, end }).on('error', () => res.destroy()).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 403, '{"error":"loopback host required"}');
    const url = new URL(req.url, `http://${host}`);
    const api = url.pathname.match(/^\/api\/(review|outputs)\/([a-z0-9-]+)$/);
    if (api) {
      const [, kind, id] = api;
      if (!campaignExists(id)) return send(res, 404, '{"error":"unknown campaign"}');
      if (kind === 'outputs' && req.method === 'GET') {
        const dir = path.join(campaignData(id), 'out');
        const files = fs.existsSync(dir) ? fs.readdirSync(dir)
          .filter((f) => /^[a-z0-9_.-]+\.mp4$/i.test(f) && fs.statSync(path.join(dir, f)).isFile())
          .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs })) : [];
        return send(res, 200, JSON.stringify(files.sort((a, b) => b.mtime - a.mtime)));
      }
      const file = path.join(campaignData(id), 'review.json');
      if (kind === 'review' && req.method === 'GET') return send(res, 200, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{"notes":[]}');
      if (kind === 'review' && req.method === 'POST') {
        if (req.headers.origin !== `http://${host}`) return send(res, 403, '{"error":"same-origin request required"}');
        const body = await readBody(req);
        if (!body || !Array.isArray(body.notes) || body.notes.length > 1000 || body.notes.some((n) =>
          !n || typeof n.text !== 'string' || n.text.length > 10000 || !Number.isFinite(n.t) || n.t < 0)) {
          return send(res, 400, '{"error":"invalid notes"}');
        }
        const result = { notes: body.notes, updated_at: new Date().toISOString() };
        fs.mkdirSync(campaignData(id), { recursive: true });
        const temp = `${file}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(result, null, 2), 'utf8');
        fs.renameSync(temp, file);
        return send(res, 200, JSON.stringify({ ok: true, updated_at: result.updated_at }));
      }
      return send(res, 405, '{"error":"method not allowed"}');
    }
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'method not allowed', 'text/plain');
    let relative;
    try { relative = decodeURIComponent(url.pathname); }
    catch { return send(res, 400, 'invalid URL', 'text/plain'); }
    if (relative === '/') relative = '/tools/review.html';
    const segments = relative.split('/').filter(Boolean);
    if (segments.some((s) => s.startsWith('.') || s.includes('\\') || s.includes(':'))) return send(res, 403, 'forbidden', 'text/plain');
    const output = relative.match(/^\/campaigns\/([a-z0-9-]+)\/out\/([a-z0-9_.-]+\.mp4)$/i);
    if (output && campaignExists(output[1])) {
      const root = path.join(campaignData(output[1]), 'out');
      return serveFile(req, res, root, path.join(root, output[2]));
    }
    if (!['engine', 'tools', 'campaigns', 'assets'].includes(segments[0])) return send(res, 403, 'forbidden', 'text/plain');
    const file = path.resolve(ROOT, ...segments);
    if (!inside(ROOT, file)) return send(res, 403, 'forbidden', 'text/plain');
    serveFile(req, res, ROOT, file);
  } catch (e) {
    send(res, e.status || 500, JSON.stringify({ error: e.status ? e.message : 'local server error' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`Promo Studio running at http://127.0.0.1:${port}/tools/review.html?c=learning-workbench`);
});
