// Loads a campaign and exposes a single draw(t) entry used by both the
// review tool (realtime) and the headless renderer (frame by frame).
import { loadFonts, loadImage, drawCaption, grain, vignette } from './core.js';

export async function loadCampaign(id, base = '') {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error('invalid campaign id');
  await loadFonts(base);
  const mod = await import(`${base}/campaigns/${id}/timeline.js`);
  const spec = mod.default;
  const assets = {};
  await Promise.all(
    Object.entries(spec.assets || {}).map(async ([k, src]) => {
      if (Array.isArray(src)) assets[k] = await Promise.all(src.map((s) => loadImage(`${base}/campaigns/${id}/${s}`)));
      else assets[k] = await loadImage(`${base}/campaigns/${id}/${src}`);
    }),
  );
  let data = {};
  if (spec.data) {
    const response = await fetch(`${base}/campaigns/${id}/${spec.data}`);
    if (!response.ok) throw new Error('failed to load campaign data');
    data = await response.json();
  }
  return { id, spec, assets, data };
}

export function createRenderer(campaign, canvas) {
  const { spec, assets, data } = campaign;
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  const env = { W: spec.width, H: spec.height, assets, data, palette: spec.palette, canvas, spec };
  const scene = spec.create(env);
  return {
    ctx,
    draw(t) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      scene.draw(ctx, t);
      ctx.restore();
      const cap = spec.captions.find((c) => t >= c.start && t <= c.end);
      drawCaption(ctx, spec.width, spec.height, cap, t, spec.palette);
      vignette(ctx, spec.width, spec.height, spec.vignette ?? 0.45);
      grain(ctx, spec.width, spec.height, t, 0.035, spec.fps);
    },
  };
}
