import { beatInfo, clamp, ease, font, FONT_MONO, roundRect, wrapLines } from '../engine/core.js';

const COLORS = ['#256a59', '#ae3862', '#405eb5', '#8c4a20'];

export function demoCampaign({ title, duration, bpm = 120, labels, captions }) {
  const starts = [0, 8, 16, 24, duration - 6];
  const scenes = starts.map((start, i) => ({
    id: `scene-${i + 1}`, start, end: starts[i + 1] ?? duration,
    label: labels[i], color: COLORS[i % COLORS.length],
    note: 'Synthetic illustration; no captured product or personal data.',
  }));
  return {
    title, width: 1080, height: 1920, fps: 60, duration, bpm,
    palette: { accent: '#58dcc0', accent2: '#ff7794', captionBg: '#20252c' },
    vignette: 0.08,
    assets: {}, data: 'example.json', scenes,
    captions: scenes.map((s, i) => ({
      start: s.start + 0.4, end: s.end - 0.4, zh: captions[i][0], en: captions[i][1],
    })),
    score: {
      bpm, duration,
      chords: [[45, [57, 60, 64]], [41, [53, 57, 60]], [48, [60, 64, 67]], [43, [55, 59, 62]]],
      parts: [
        { type: 'bright-intro', start: 0, end: 8 },
        { type: 'drop', start: 8, end: duration - 6 },
        { type: 'roll', start: duration - 6, end: duration - 4 },
        { type: 'outro', start: duration - 4, end: duration },
      ],
      sfx: [
        { t: 0.8, type: 'pop', midi: 84, vel: 0.3 },
        { t: 2.4, type: 'whoosh', dur: 0.3, vel: 0.22 },
        { t: 8, type: 'impact', vel: 0.75 },
        ...scenes.slice(2).map((s) => ({ t: s.start, type: 'pop', midi: 81, vel: 0.5 })),
      ],
    },
    create: (env) => syntheticScenes(env),
  };
}

function syntheticScenes({ W, H, spec, data }) {
  function text(ctx, value, x, y, width, size, color, weight = 600) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    const lines = wrapLines(ctx, value, width);
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.3));
  }

  return {
    draw(ctx, t) {
      const index = spec.scenes.findIndex((s) => t >= s.start && t < s.end);
      const current = index < 0 ? spec.scenes.length - 1 : index;
      const scene = spec.scenes[current];
      const progress = clamp((t - scene.start) / (scene.end - scene.start));
      const { pulse } = beatInfo(t, spec.bpm);
      ctx.fillStyle = '#f3f5f8';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = scene.color;
      ctx.fillRect(0, 0, W, 24 + pulse * 6);
      text(ctx, 'PROMO STUDIO / SYNTHETIC DEMO', 72, 128, W - 144, 28, '#59616b');
      text(ctx, spec.title, 72, 272, W - 144, 74, '#20252c', 800);
      text(ctx, scene.label, 72, 440, W - 144, 52, scene.color, 700);

      ctx.save();
      ctx.translate(0, (1 - ease.outCubic(clamp(progress * 6))) * 32);
      const items = data.items || [];
      for (let i = 0; i < items.length; i++) {
        const y = 550 + i * 180;
        ctx.fillStyle = i === current % items.length ? '#ffffff' : '#e7ebf0';
        roundRect(ctx, 72, y, W - 144, 150, 8);
        ctx.fill();
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fillRect(96, y + 32, 7, 86);
        ctx.font = font(30, 600, FONT_MONO);
        ctx.fillText(String(i + 1).padStart(2, '0'), 124, y + 55);
        text(ctx, items[i], 210, y + 58, W - 330, 38, '#20252c');
        ctx.fillStyle = scene.color;
        ctx.fillRect(210, y + 105, (W - 350) * clamp(progress * 1.4 - i * 0.08), 6);
      }
      ctx.restore();

      const x = 72, y = H * 0.67;
      ctx.fillStyle = '#d7dde5';
      ctx.fillRect(x, y, W - 144, 8);
      ctx.fillStyle = scene.color;
      ctx.fillRect(x, y, (W - 144) * clamp(t / spec.duration), 8);
      text(ctx, `${current + 1} / ${spec.scenes.length}     ${spec.bpm} BPM`, x, y + 66, W - 144, 32, '#59616b');
    },
  };
}
