// Promo Studio core: deterministic time-based drawing helpers.
// Every draw function is a pure function of time t (seconds), so preview and
// frame-by-frame export always produce identical images.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const range = (t, a, b) => clamp((t - a) / (b - a));

export const ease = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inCubic: (k) => k * k * k,
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outQuart: (k) => 1 - Math.pow(1 - k, 4),
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inExpo: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
  inOutExpo: (k) =>
    k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2,
  outBack: (k) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
  outElastic: (k) => {
    if (k <= 0 || k >= 1) return k;
    return Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

// Animate from a to b between t0 and t1 with an easing curve.
export const tween = (t, t0, t1, a, b, fn = ease.outCubic) => lerp(a, b, fn(range(t, t0, t1)));

// Seeded PRNG so particles / glitches are reproducible.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Beat helpers ---------------------------------------------------------------
export function beatInfo(t, bpm, offset = 0) {
  const spb = 60 / bpm;
  const b = (t - offset) / spb;
  const idx = Math.floor(b);
  const phase = b - idx;
  return { beat: idx, phase, spb, pulse: Math.exp(-phase * 6) };
}

// Pulse that peaks exactly at each listed hit time and decays afterwards.
export function hitPulse(t, hits, decay = 8) {
  let v = 0;
  for (const h of hits) {
    if (t >= h && t - h < 1.2) v = Math.max(v, Math.exp(-(t - h) * decay));
  }
  return v;
}

// Drawing helpers -------------------------------------------------------------
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function withAlpha(ctx, a, fn) {
  if (a <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(a);
  fn();
  ctx.restore();
}

export const FONT_ZH = '"Microsoft YaHei", system-ui, sans-serif';
export const FONT_MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

export function font(size, weight = 700, family = FONT_ZH) {
  return `${weight} ${size}px ${family}`;
}

// Draw text revealed character by character (typewriter).
export function typeText(ctx, text, x, y, k) {
  const n = Math.floor(text.length * clamp(k));
  ctx.fillText(text.slice(0, n), x, y);
  return n;
}

// Wrap text into lines that fit maxWidth. Handles CJK (per char) and Latin (per word).
export function wrapLines(ctx, text, maxWidth) {
  const tokens = text.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g) || [];
  const lines = [];
  let line = '';
  for (const tok of tokens) {
    const next = line + tok;
    if (ctx.measureText(next).width > maxWidth && line.trim()) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

// Image drawn with "cover" fit into a rect, optional zoom and focus point (0..1).
export function drawCover(ctx, img, x, y, w, h, zoom = 1, fx = 0.5, fy = 0.5) {
  if (!img || !img.width) return;
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  const dx = x + (w - dw) * fx, dy = y + (h - dh) * fy;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// Draw a sub-rectangle of a source image (in source pixels) into a dest rect.
export function drawCrop(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (!img || !img.width) return;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// Soft glow behind shapes / text.
export function glow(ctx, color, blur, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

// Film grain overlay, deterministic per frame index.
export function grain(ctx, W, H, t, amount = 0.05, fps = 60) {
  const f = Math.floor(t * fps);
  const r = rng(f * 9973 + 17);
  ctx.save();
  ctx.globalAlpha = amount;
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H;
    ctx.fillStyle = r() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

export function vignette(ctx, W, H, strength = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// RGB split glitch: re-draws slices of the current canvas with offsets.
export function glitch(ctx, canvas, t, intensity, seed = 1) {
  if (intensity <= 0.01) return;
  const W = canvas.width, H = canvas.height;
  const r = rng(Math.floor(t * 30) * 31 + seed);
  const slices = 6 + Math.floor(intensity * 10);
  for (let i = 0; i < slices; i++) {
    const y = Math.floor(r() * H);
    const h = Math.floor(10 + r() * 120 * intensity);
    const dx = Math.floor((r() - 0.5) * 120 * intensity);
    ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35 * intensity;
  ctx.drawImage(canvas, 10 * intensity, 0);
  ctx.restore();
}

// Background: deep gradient with slow-moving light blobs and a subtle grid.
export function techBackground(ctx, W, H, t, palette) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, palette.bg0);
  g.addColorStop(1, palette.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const blobs = [
    [0.2, 0.25, palette.accent, 0.18],
    [0.85, 0.55, palette.accent2, 0.14],
    [0.4, 0.85, palette.accent, 0.1],
  ];
  blobs.forEach(([bx, by, c, a], i) => {
    const x = W * (bx + 0.05 * Math.sin(t * 0.4 + i * 2));
    const y = H * (by + 0.04 * Math.cos(t * 0.3 + i));
    const rg = ctx.createRadialGradient(x, y, 0, x, y, W * 0.7);
    rg.addColorStop(0, hexA(c, a));
    rg.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const step = 72, off = (t * 18) % step;
  for (let x = -step; x < W + step; x += step) {
    ctx.beginPath(); ctx.moveTo(x + off * 0.3, 0); ctx.lineTo(x + off * 0.3, H); ctx.stroke();
  }
  for (let y = -step; y < H + step; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + off); ctx.lineTo(W, y + off); ctx.stroke();
  }
  ctx.restore();
}

export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Bilingual caption block anchored near the bottom safe area.
// Chinese line big, English line smaller in monospace. Animated in/out.
export function drawCaption(ctx, W, H, cap, t, palette) {
  if (!cap) return;
  const { start, end, zh, en } = cap;
  if (t < start || t > end) return;
  const kin = ease.outExpo(range(t, start, start + 0.35));
  const kout = 1 - ease.inCubic(range(t, end - 0.25, end));
  const a = Math.min(kin, kout);
  const y0 = H * 0.80 + (1 - kin) * 40;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(58, 800);
  const zhLines = wrapLines(ctx, zh, W - 160);
  ctx.font = font(30, 500, FONT_MONO);
  const enLines = en ? wrapLines(ctx, en, W - 180) : [];
  const blockH = zhLines.length * 76 + enLines.length * 42 + 36;
  const top = y0 - blockH / 2;
  // backdrop
  const bw = W - 96;
  ctx.fillStyle = palette.captionBg || 'rgba(6,10,20,0.55)';
  roundRect(ctx, (W - bw) / 2, top - 30, bw, blockH + 40, 28);
  ctx.fill();
  ctx.strokeStyle = hexA(palette.accent, 0.35);
  ctx.lineWidth = 2;
  ctx.stroke();
  let y = top + 40;
  ctx.font = font(58, 800);
  ctx.fillStyle = '#ffffff';
  zhLines.forEach((l) => { ctx.fillText(l, W / 2, y); y += 76; });
  y += 4;
  ctx.font = font(30, 500, FONT_MONO);
  ctx.fillStyle = hexA(palette.accent, 0.95);
  enLines.forEach((l) => { ctx.fillText(l, W / 2, y); y += 42; });
  ctx.restore();
}

// Keycap visual, pressed state depresses and lights up.
export function keycap(ctx, x, y, label, pressed, palette, size = 1) {
  const w = (40 + label.length * 30) * size, h = 96 * size;
  const dy = pressed * 10 * size;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x - w / 2, y - h / 2 + 12 * size, w, h, 18 * size);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, pressed > 0.3 ? palette.accent : '#2a3348');
  g.addColorStop(1, pressed > 0.3 ? palette.accent2 : '#1a2132');
  ctx.fillStyle = g;
  roundRect(ctx, x - w / 2, y - h / 2 + dy, w, h, 18 * size);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = font(44 * size, 700, FONT_MONO);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + dy + 2);
  ctx.restore();
}

// Mouse cursor arrow.
export function cursor(ctx, x, y, click = 0, scale = 1.6) {
  ctx.save();
  ctx.translate(x, y);
  if (click > 0.01) {
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * click})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + (1 - click) * 60, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 26); ctx.lineTo(7, 20); ctx.lineTo(12, 31);
  ctx.lineTo(16, 29); ctx.lineTo(11, 18); ctx.lineTo(20, 18); ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// Asset loading ------------------------------------------------------------------
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + src));
    img.src = src;
  });
}

export async function loadFonts() {
  // System fonts avoid redistributing font binaries or making network requests.
  await document.fonts.ready;
}
