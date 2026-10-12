// Review tool: a CapCut-style timeline for reviewing code-rendered promo videos.
import { loadCampaign, createRenderer } from '../engine/player.js';
import { renderSoundtrack, peaks } from '../engine/audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const CID = params.get('c') || 'learning-workbench';
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

const state = {
  t: 0, playing: false, rate: 1, muted: false, loop: false, source: 'live',
  pxPerSec: 48, notes: [], kind: '画面', audioBuf: null,
};

let campaign, renderer, spec, actx, audioNode, gainNode, playStartCtx = 0, playStartT = 0;
const canvas = $('canvas');
const video = $('video');

function sceneAt(t) {
  return spec.scenes.find((s) => t >= s.start && t < s.end) || spec.scenes[spec.scenes.length - 1];
}

// ---------- playback ----------
function now() {
  if (state.source === 'video') return video.currentTime;
  if (!state.playing) return state.t;
  return playStartT + (actx.currentTime - playStartCtx) * state.rate;
}

function startAudio(at) {
  stopAudio();
  if (!state.audioBuf || state.muted) return;
  audioNode = actx.createBufferSource();
  audioNode.buffer = state.audioBuf;
  audioNode.playbackRate.value = state.rate;
  gainNode = actx.createGain();
  audioNode.connect(gainNode).connect(actx.destination);
  audioNode.start(0, Math.max(0, at));
}

function stopAudio() {
  if (audioNode) { try { audioNode.stop(); } catch {} audioNode.disconnect(); audioNode = null; }
}

function play() {
  if (state.t >= spec.duration - 0.02) state.t = 0;
  state.playing = true;
  $('play').textContent = '❚❚';
  if (state.source === 'video') {
    video.currentTime = state.t; video.playbackRate = state.rate; video.muted = state.muted; video.play();
    return;
  }
  actx.resume();
  playStartCtx = actx.currentTime;
  playStartT = state.t;
  startAudio(state.t);
}

function pause() {
  state.t = now();
  state.playing = false;
  $('play').textContent = '▶';
  stopAudio();
  if (state.source === 'video') video.pause();
}

function seek(t) {
  t = Math.min(spec.duration, Math.max(0, t));
  const wasPlaying = state.playing;
  if (wasPlaying) pause();
  state.t = t;
  if (state.source === 'video') video.currentTime = t;
  if (wasPlaying) play();
  draw();
}

function tick() {
  if (state.playing) {
    let t = now();
    const sc = sceneAt(state.t);
    if (state.loop && t >= sc.end) { seek(sc.start); t = sc.start; }
    if (t >= spec.duration) { pause(); state.t = spec.duration; t = spec.duration; }
    state.t = t;
    draw();
  }
  requestAnimationFrame(tick);
}

function draw() {
  if (state.source === 'live') renderer.draw(state.t);
  updateChrome();
}

// ---------- chrome ----------
function updateChrome() {
  const t = state.t;
  $('time').textContent = `${fmt(t)} / ${fmt(spec.duration)}`;
  $('noteAt').textContent = fmt(t);
  const sc = sceneAt(t);
  $('noteScene').textContent = sc.label;
  const spb = 60 / spec.bpm;
  const beat = Math.floor(t / spb);
  $('beatInfo').textContent = `${spec.bpm} BPM · 第 ${Math.floor(beat / 4) + 1} 小节 第 ${(beat % 4) + 1} 拍 · ${spec.fps}fps 帧 ${Math.round(t * spec.fps)}`;
  const x = t * state.pxPerSec;
  $('playhead').style.left = `${x}px`;
  document.querySelectorAll('#trkScenes .clip').forEach((el) => el.classList.toggle('cur', el.dataset.id === sc.id));
  document.querySelectorAll('.scene-item').forEach((el) => el.classList.toggle('cur', el.dataset.id === sc.id));
  if (state.playing && $('follow').checked) {
    const sc2 = $('tlScroll');
    if (x < sc2.scrollLeft + 40 || x > sc2.scrollLeft + sc2.clientWidth - 80) sc2.scrollLeft = x - 120;
  }
}

function buildTimeline() {
  const W = Math.ceil(spec.duration * state.pxPerSec) + 60;
  $('tlInner').style.width = `${W}px`;
  // ruler
  const ruler = $('ruler');
  ruler.innerHTML = '';
  const spb = 60 / spec.bpm;
  for (let b = 0; b * spb <= spec.duration + 0.001; b++) {
    const t = b * spb;
    const isSec = Math.abs(t - Math.round(t)) < 1e-6;
    const isBar = b % 4 === 0;
    if (!isBar && state.pxPerSec < 40) continue;
    const el = document.createElement('div');
    el.className = 'tick' + (isBar ? ' sec' : '');
    el.style.left = `${t * state.pxPerSec}px`;
    el.style.top = isBar ? '0' : '16px';
    if (isBar) el.innerHTML = `<span>${fmt(t).slice(1, 5)}</span>`;
    else if (isSec) el.style.top = '12px';
    ruler.appendChild(el);
  }
  // scenes
  const ts = $('trkScenes');
  ts.innerHTML = '';
  spec.scenes.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'clip';
    el.dataset.id = s.id;
    el.style.left = `${s.start * state.pxPerSec}px`;
    el.style.width = `${(s.end - s.start) * state.pxPerSec - 2}px`;
    el.style.background = s.color;
    el.textContent = s.label;
    el.title = `${s.label}  ${fmt(s.start)} – ${fmt(s.end)}`;
    el.onclick = (e) => { e.stopPropagation(); seek(s.start); };
    ts.appendChild(el);
  });
  // captions
  const tc = $('trkCaps');
  tc.innerHTML = '';
  spec.captions.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'clip cap';
    el.style.left = `${c.start * state.pxPerSec}px`;
    el.style.width = `${(c.end - c.start) * state.pxPerSec - 2}px`;
    el.textContent = c.zh;
    el.title = `${c.zh}\n${c.en}`;
    el.onclick = (e) => { e.stopPropagation(); seek(c.start); };
    tc.appendChild(el);
  });
  // sfx
  const tf = $('trkSfx');
  tf.innerHTML = '';
  const label = { impact: '冲击', thud: '落地', whoosh: '嗖', riser: '起势', tick: '滴', type: '打字', key: '按键', pop: '叮', glitch: '故障', shutter: '快门' };
  spec.score.sfx.forEach((e) => {
    const el = document.createElement('div');
    el.className = 'sfx';
    el.style.left = `${e.t * state.pxPerSec}px`;
    if (state.pxPerSec >= 60) el.innerHTML = `<span>${label[e.type] || e.type}</span>`;
    el.title = `${label[e.type] || e.type} @ ${fmt(e.t)}`;
    tf.appendChild(el);
  });
  drawWave();
  renderPins();
  updateChrome();
}

function drawWave() {
  const c = $('wave');
  const W = Math.ceil(spec.duration * state.pxPerSec);
  c.width = W; c.height = 34; c.style.width = `${W}px`;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, 34);
  if (!state.audioBuf) return;
  const p = peaks(state.audioBuf, W);
  g.fillStyle = '#4fd1c5';
  for (let x = 0; x < W; x++) {
    const h = Math.max(1, p[x] * 30);
    g.fillRect(x, 17 - h / 2, 1, h);
  }
}

// ---------- notes ----------
async function loadNotes() {
  try {
    const r = await fetch(`/api/review/${CID}`);
    state.notes = (await r.json()).notes || [];
  } catch {
    state.notes = JSON.parse(localStorage.getItem(`review:${CID}`) || '[]');
  }
  renderNotes();
}

async function saveNotes() {
  $('saveStatus').textContent = '保存中…';
  try {
    const r = await fetch(`/api/review/${CID}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: CID, notes: state.notes }),
    });
    if (!r.ok) throw new Error(await r.text());
    $('saveStatus').textContent = '已保存到 review.json';
  } catch {
    try { localStorage.setItem(`review:${CID}`, JSON.stringify(state.notes)); } catch {}
    $('saveStatus').textContent = '服务未连接，已暂存在浏览器';
  }
}

function addNote() {
  const text = $('noteText').value.trim();
  if (!text) { $('noteText').focus(); return; }
  const sc = sceneAt(state.t);
  state.notes.push({
    id: `n${Date.now().toString(36)}`, t: Number(state.t.toFixed(2)), scene: sc.id, scene_label: sc.label,
    kind: state.kind, text, status: 'open', created_at: new Date().toISOString(),
  });
  state.notes.sort((a, b) => a.t - b.t);
  $('noteText').value = '';
  renderNotes();
  saveNotes();
}

function renderNotes() {
  const box = $('notes');
  box.innerHTML = '';
  const open = state.notes.filter((n) => n.status !== 'done').length;
  $('noteCount').textContent = state.notes.length ? `(${open}/${state.notes.length})` : '';
  if (!state.notes.length) {
    box.innerHTML = '<p class="help">还没有批注。暂停在需要修改的地方，写下意见即可。</p>';
  }
  state.notes.forEach((n) => {
    const el = document.createElement('div');
    el.className = 'note' + (n.status === 'done' ? ' done' : '');
    el.innerHTML = `<div class="meta"><span class="t mono">${fmt(n.t)}</span><span>${escapeHTML(n.scene_label)}</span><span class="kind">${escapeHTML(n.kind)}</span>
      <span class="x"><button data-a="done" title="标记已处理 / 恢复">${n.status === 'done' ? '↺' : '✓'}</button><button data-a="del" title="删除">✕</button></span></div>
      <div class="body"></div>`;
    el.querySelector('.body').textContent = n.text;
    el.onclick = (e) => {
      const a = e.target.dataset?.a;
      if (a === 'done') { n.status = n.status === 'done' ? 'open' : 'done'; renderNotes(); saveNotes(); return; }
      if (a === 'del') {
        if (el.dataset.confirm) { state.notes = state.notes.filter((x) => x !== n); renderNotes(); saveNotes(); }
        else { el.dataset.confirm = '1'; e.target.textContent = '确认删除'; }
        return;
      }
      seek(n.t);
    };
    box.appendChild(el);
  });
  renderPins();
}

function renderPins() {
  const tn = $('trkNotes');
  tn.innerHTML = '';
  state.notes.forEach((n) => {
    const el = document.createElement('div');
    el.className = 'pin' + (n.status === 'done' ? ' done' : '');
    el.style.left = `${n.t * state.pxPerSec}px`;
    el.title = `${fmt(n.t)} ${n.kind}：${n.text}`;
    el.onclick = (e) => { e.stopPropagation(); seek(n.t); };
    tn.appendChild(el);
  });
}

function renderScenes() {
  const box = $('scenes');
  box.innerHTML = '';
  spec.scenes.forEach((s, i) => {
    const caps = spec.captions.filter((c) => c.start < s.end && c.end > s.start);
    const el = document.createElement('div');
    el.className = 'scene-item';
    el.dataset.id = s.id;
    el.innerHTML = `<h4><span style="color:${s.color}">■</span>${i + 1}. ${s.label}<span class="mono">${fmt(s.start)}–${fmt(s.end)}</span></h4>
      <p>${s.note || ''}</p>${caps.map((c) => `<p>「${c.zh}」<br><span class="mono">${c.en}</span></p>`).join('')}`;
    el.onclick = () => seek(s.start);
    box.appendChild(el);
  });
}

// ---------- outputs / source ----------
async function loadOutputs() {
  const sel = $('outputs');
  try {
    const files = await (await fetch(`/api/outputs/${CID}`)).json();
    sel.innerHTML = files.length ? files.map((f) => `<option value="${f.name}">${f.name}</option>`).join('') : '<option value="">（还没有成片）</option>';
  } catch { sel.innerHTML = '<option value="">（服务未连接）</option>'; }
}

function setSource(src) {
  if (src === 'video' && !$('outputs').value) { $('saveStatus').textContent = '还没有渲染好的成片'; return; }
  pause();
  state.source = src;
  document.querySelectorAll('#source button').forEach((b) => b.classList.toggle('on', b.dataset.src === src));
  canvas.hidden = src !== 'live';
  video.hidden = src !== 'video';
  if (src === 'video') {
    video.src = `/campaigns/${CID}/out/${encodeURIComponent($('outputs').value)}`;
    video.currentTime = state.t;
  }
  draw();
}

// ---------- events ----------
function bind() {
  $('play').onclick = () => (state.playing ? pause() : play());
  $('toStart').onclick = () => seek(0);
  $('stepBack').onclick = () => seek(state.t - 1 / spec.fps);
  $('stepFwd').onclick = () => seek(state.t + 1 / spec.fps);
  $('prevScene').onclick = () => {
    const i = spec.scenes.indexOf(sceneAt(state.t));
    const s = spec.scenes[i];
    seek(state.t - s.start > 0.3 || i === 0 ? s.start : spec.scenes[i - 1].start);
  };
  $('nextScene').onclick = () => {
    const i = spec.scenes.indexOf(sceneAt(state.t));
    if (i < spec.scenes.length - 1) seek(spec.scenes[i + 1].start);
  };
  $('loop').onclick = () => { state.loop = !state.loop; $('loop').classList.toggle('on', state.loop); };
  $('rate').onchange = (e) => { const p = state.playing; if (p) pause(); state.rate = Number(e.target.value); if (p) play(); };
  $('mute').onclick = () => {
    state.muted = !state.muted; $('mute').textContent = state.muted ? '🔇' : '🔊';
    video.muted = state.muted;
    if (state.playing && state.source === 'live') { state.t = now(); playStartCtx = actx.currentTime; playStartT = state.t; startAudio(state.t); }
  };
  $('safe').onclick = () => { $('viewport').classList.toggle('show-safe'); $('safe').classList.toggle('on'); };
  $('addNote').onclick = addNote;
  $('noteText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) addNote(); });
  $('noteText').addEventListener('focus', () => { if (state.playing) pause(); });
  document.querySelectorAll('#kinds .chip').forEach((c) => {
    c.onclick = () => { state.kind = c.dataset.kind; document.querySelectorAll('#kinds .chip').forEach((x) => x.classList.toggle('on', x === c)); };
  });
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${b.dataset.pane}`));
    };
  });
  document.querySelectorAll('#source button').forEach((b) => (b.onclick = () => setSource(b.dataset.src)));
  $('outputs').onchange = () => { if (state.source === 'video') setSource('video'); };
  $('zoom').oninput = (e) => { state.pxPerSec = Number(e.target.value); buildTimeline(); };
  video.addEventListener('timeupdate', () => { if (state.source === 'video') { state.t = video.currentTime; updateChrome(); } });
  video.addEventListener('ended', () => pause());

  // timeline scrub
  const inner = $('tlInner');
  let dragging = false;
  const toT = (e) => (e.clientX - inner.getBoundingClientRect().left) / state.pxPerSec;
  inner.addEventListener('mousedown', (e) => { if (e.target.closest('.clip,.pin')) return; dragging = true; seek(toT(e)); });
  window.addEventListener('mousemove', (e) => { if (dragging) seek(toT(e)); });
  window.addEventListener('mouseup', () => (dragging = false));

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('textarea, input, select')) return;
    const step = e.shiftKey ? 1 : 1 / spec.fps;
    switch (e.key) {
      case ' ': e.preventDefault(); state.playing ? pause() : play(); break;
      case 'ArrowLeft': e.preventDefault(); seek(state.t - step); break;
      case 'ArrowRight': e.preventDefault(); seek(state.t + step); break;
      case 'ArrowUp': e.preventDefault(); $('prevScene').click(); break;
      case 'ArrowDown': e.preventDefault(); $('nextScene').click(); break;
      case 'Home': seek(0); break;
      case 'n': case 'N': e.preventDefault(); pause(); $('noteText').focus(); break;
      case 'l': case 'L': $('loop').click(); break;
      case 'm': case 'M': $('mute').click(); break;
      case 's': case 'S': $('safe').click(); break;
      default: break;
    }
  });
}

// ---------- boot ----------
(async function boot() {
  try {
    campaign = await loadCampaign(CID, '..');
    spec = campaign.spec;
    renderer = createRenderer(campaign, canvas);
    $('title').textContent = `${spec.title} · ${spec.width}×${spec.height} · ${spec.duration}s`;
    actx = new AudioContext({ sampleRate: 48000 });
    bind();
    renderScenes();
    buildTimeline();
    draw();
    await Promise.all([loadNotes(), loadOutputs()]);
    state.audioBuf = await renderSoundtrack(spec.score);
    drawWave();
    $('loading').hidden = true;
    requestAnimationFrame(tick);
  } catch (e) {
    $('loading').textContent = `加载失败：${e.message}`;
    console.error(e);
  }
})();
