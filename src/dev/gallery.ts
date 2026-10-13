// Symbol gallery (lane E): browse every library character / linkage / frame at 1x/2x/4x with filters on/off.
//
// URL parameters (deep links): ?id=<char id | linkage>&frame=<n>&scale=<1|2|4>&filters=<0|1>&bounds=<0|1>
//                              &bg=<checker|black|white|gray>&play=1&text=<sample text for fonts>
// `window.__gallery` exposes { ready, id, frame, error } for automated screenshots.
import type { CharDef, FontDef } from '../shared/assetSchema.ts';
import { Library } from '../engine/swf/Library.ts';
import { Player } from '../engine/swf/Player.ts';
import {
  Button, DisplayObject, MovieClip, TextField, destroyDetached, instantiateDetached,
} from '../engine/swf/DisplayObject.ts';
import { renderConfig, renderObjectAt, renderStats } from '../engine/swf/render/renderer.ts';
import { engine } from '../engine/swf/state.ts';

interface Entry { id: number; label: string; type: string; key: string }

declare global {
  interface Window {
    __gallery: { ready: boolean; id?: number; frame?: number; error?: string };
    /** Automation handle (playwright probes): the loaded library and the gallery's player. */
    __galleryApi?: { lib: Library; player: Player; select: (id: number, frame: number) => void };
  }
}
window.__gallery = { ready: false };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const listEl = $<HTMLDivElement>('list');
const filterEl = $<HTMLInputElement>('filter');
const canvas = $<HTMLCanvasElement>('canvas');
const frameEl = $<HTMLInputElement>('frame');
const totalEl = $<HTMLSpanElement>('total');
const scaleEl = $<HTMLSelectElement>('scale');
const filtersEl = $<HTMLInputElement>('filters');
const boundsEl = $<HTMLInputElement>('bounds');
const bgEl = $<HTMLSelectElement>('bg');
const infoEl = $<HTMLDivElement>('info');
const titleEl = $<HTMLElement>('title');
const statsEl = $<HTMLSpanElement>('stats');
const playEl = $<HTMLButtonElement>('play');

const params = new URLSearchParams(location.search);
let lib: Library;
let player: Player;
let entries: Entry[] = [];
let current: { id: number; def: CharDef; obj: DisplayObject | null } | null = null;
let playing = false;
let sampleText = params.get('text') ?? 'Boxhead 2Play Rooms 0123456789 !?';

async function main(): Promise<void> {
  try {
    lib = await Library.load('./assets', (f) => { titleEl.textContent = `loading ${Math.round(f * 100)}%`; });
  } catch (e) {
    titleEl.textContent = 'failed to load assets/library.json — run `npm run extract`';
    window.__gallery.error = String(e);
    return;
  }
  player = new Player(lib, { renderScale: 2 });
  player.enterFrame();
  window.__galleryApi = { lib, player, select };
  buildEntries();
  renderList();
  if (params.get('scale')) scaleEl.value = params.get('scale')!;
  if (params.get('filters') === '0') filtersEl.checked = false;
  if (params.get('bounds') === '1') boundsEl.checked = true;
  if (params.get('bg')) bgEl.value = params.get('bg')!;
  const want = params.get('id');
  let id = entries.find((e) => e.type === 'sprite' && e.label === 'Screen_Main')?.id ?? entries[0]?.id ?? 1;
  if (want) {
    const n = Number(want);
    id = Number.isFinite(n) ? n : lib.charIdForLinkage(want) ?? id;
  }
  select(id, Number(params.get('frame') ?? 1) || 1);
  if (params.get('play') === '1') togglePlay();
  wire();
}

function buildEntries(): void {
  const out: Entry[] = [];
  const exp = lib.json.exports;
  for (const [name, id] of Object.entries(exp).sort((a, b) => a[0].localeCompare(b[0]))) {
    const c = lib.char(id);
    if (!c || name.startsWith('__Packages')) continue;
    out.push({ id, label: name, type: c.t, key: `${name} ${id} ${c.t}`.toLowerCase() });
  }
  for (const [k, c] of Object.entries(lib.json.chars).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const name = lib.linkageForChar(Number(k));
    if (name?.startsWith('__Packages')) continue;
    const extra = c.t === 'font' ? ` ${(c as FontDef).name}` : '';
    out.push({ id: Number(k), label: `#${k}${name ? ' ' + name : ''}${extra}`, type: c.t, key: `#${k} ${name ?? ''} ${c.t}${extra}`.toLowerCase() });
  }
  entries = out;
}

function renderList(): void {
  const f = filterEl.value.trim().toLowerCase();
  listEl.textContent = '';
  const frag = document.createDocumentFragment();
  for (const e of entries) {
    if (f && !e.key.includes(f)) continue;
    const d = document.createElement('div');
    d.dataset.id = String(e.id);
    d.innerHTML = `${escapeHtml(e.label)} <span class="t">${e.type}</span>`;
    if (current?.id === e.id) d.className = 'sel';
    d.onclick = () => select(e.id, 1);
    frag.appendChild(d);
  }
  listEl.appendChild(frag);
}

const escapeHtml = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function select(id: number, frame: number): void {
  const def = lib.char(id);
  if (!def) return;
  if (current?.obj) destroyDetached(current.obj);
  let obj: DisplayObject | null = null;
  if (def.t !== 'font' && def.t !== 'bitmap' && def.t !== 'sound') obj = instantiateDetached(id) ?? null;
  current = { id, def, obj };
  if (obj instanceof MovieClip) {
    obj.gotoAndStop(Math.max(1, Math.min(obj._totalframes, frame)));
    player.flushActions();
  }
  for (const el of listEl.querySelectorAll('.sel')) el.classList.remove('sel');
  listEl.querySelector(`[data-id="${id}"]`)?.classList.add('sel');
  updateUrl();
  draw();
}

function updateUrl(): void {
  if (!current) return;
  const p = new URLSearchParams();
  p.set('id', String(current.id));
  if (current.obj instanceof MovieClip && current.obj._currentframe !== 1) p.set('frame', String(current.obj._currentframe));
  if (scaleEl.value !== '2') p.set('scale', scaleEl.value);
  if (!filtersEl.checked) p.set('filters', '0');
  if (boundsEl.checked) p.set('bounds', '1');
  if (bgEl.value !== 'checker') p.set('bg', bgEl.value);
  history.replaceState(null, '', `?${p.toString()}`);
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bg = bgEl.value;
  if (bg === 'checker') {
    const s = 8;
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8c8c8';
    for (let y = 0; y < h; y += s) for (let x = ((y / s) & 1) * s; x < w; x += 2 * s) ctx.fillRect(x, y, s, s);
  } else {
    ctx.fillStyle = bg === 'black' ? '#000' : bg === 'white' ? '#fff' : '#808080';
    ctx.fillRect(0, 0, w, h);
  }
}

function draw(): void {
  if (!current) return;
  let scale = Number(scaleEl.value) || 2;
  renderConfig.filters = filtersEl.checked;
  const ctx = canvas.getContext('2d')!;
  const { def, obj } = current;
  titleEl.textContent = `#${current.id} ${lib.linkageForChar(current.id) ?? ''} (${def.t})`;
  if (def.t === 'font') { drawFont(ctx, def, scale); finishDraw(); return; }
  if (def.t === 'bitmap') {
    const img = lib.bitmap(def.id);
    canvas.width = Math.max(1, def.w * scale); canvas.height = Math.max(1, def.h * scale);
    fillBackground(ctx, canvas.width, canvas.height);
    if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }
    infoEl.textContent = JSON.stringify(def, null, 2);
    finishDraw();
    return;
  }
  if (!obj) { canvas.width = 1; canvas.height = 1; infoEl.textContent = JSON.stringify(def, null, 2); finishDraw(); return; }
  const b = obj.$boundsWith(null) ?? { xMin: 0, yMin: 0, xMax: 1, yMax: 1 };
  const pad = filtersEl.checked ? 24 : 6;
  let w = b.xMax - b.xMin + 2 * pad, h = b.yMax - b.yMin + 2 * pad;
  while (scale > 0.25 && (w * scale > 8192 || h * scale > 8192)) scale /= 2;
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  fillBackground(ctx, canvas.width, canvas.height);
  // origin on a whole device pixel (as the game's RenderMovieClipAsBitmapObject does)
  const m = { a: scale, b: 0, c: 0, d: scale, tx: Math.round((pad - b.xMin) * scale), ty: Math.round((pad - b.yMin) * scale) };
  const t0 = performance.now();
  renderObjectAt(obj, ctx, m, scale, filtersEl.checked);
  const dt = performance.now() - t0;
  if (boundsEl.checked) drawBounds(ctx, obj, m);
  statsEl.textContent = `${dt.toFixed(1)} ms · ${renderStats.objects} objs · ${renderStats.filtered} filtered (${renderStats.filterCacheHits} cached) · ${canvas.width}×${canvas.height}`;
  if (obj instanceof MovieClip) {
    frameEl.value = String(obj._currentframe);
    frameEl.max = String(obj._totalframes);
    totalEl.textContent = `/ ${obj._totalframes}`;
  } else { frameEl.value = '1'; totalEl.textContent = '/ 1'; }
  infoEl.textContent = describe(obj, b);
  finishDraw();
  void w; void h;
}

function finishDraw(): void {
  window.__gallery = { ready: true, id: current?.id, frame: current?.obj instanceof MovieClip ? current.obj._currentframe : 1 };
}

function drawBounds(ctx: CanvasRenderingContext2D, obj: DisplayObject, m: { a: number; d: number; tx: number; ty: number }): void {
  const r = obj.getBounds(obj);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,0,0,0.9)';
  ctx.strokeRect(Math.round(r.xMin * m.a + m.tx) + 0.5, Math.round(r.yMin * m.d + m.ty) + 0.5, Math.round((r.xMax - r.xMin) * m.a), Math.round((r.yMax - r.yMin) * m.d));
  const kids = obj.$kids();
  if (kids) {
    ctx.strokeStyle = 'rgba(0,160,255,0.8)';
    ctx.setLineDash([3, 3]);
    for (const k of kids) {
      const kb = k.getBounds(obj);
      if (kb.xMin > 6e6) continue;
      ctx.strokeRect(kb.xMin * m.a + m.tx + 0.5, kb.yMin * m.d + m.ty + 0.5, (kb.xMax - kb.xMin) * m.a, (kb.yMax - kb.yMin) * m.d);
    }
    ctx.setLineDash([]);
  }
  // origin
  ctx.strokeStyle = 'rgba(0,255,0,0.9)';
  ctx.beginPath();
  ctx.moveTo(m.tx - 6, m.ty + 0.5); ctx.lineTo(m.tx + 6, m.ty + 0.5);
  ctx.moveTo(m.tx + 0.5, m.ty - 6); ctx.lineTo(m.tx + 0.5, m.ty + 6);
  ctx.stroke();
}

function describe(obj: DisplayObject, b: { xMin: number; yMin: number; xMax: number; yMax: number }): string {
  const lines: string[] = [];
  const id = current!.id;
  const link = lib.linkageForChar(id);
  lines.push(`id ${id}  ${obj.$kind}${link ? `  linkage ${link}` : ''}`);
  if (link && lib.json.classes[link]) lines.push(`class ${lib.json.classes[link]}`);
  lines.push(`bounds x ${b.xMin.toFixed(2)}..${b.xMax.toFixed(2)}  y ${b.yMin.toFixed(2)}..${b.yMax.toFixed(2)}`);
  lines.push(`size ${(b.xMax - b.xMin).toFixed(2)} × ${(b.yMax - b.yMin).toFixed(2)}`);
  if (obj instanceof MovieClip && obj.$def) {
    lines.push(`frames ${obj._totalframes}`);
    const labels = Object.entries(obj.$def.labels);
    if (labels.length) lines.push(`labels ${labels.map(([k, v]) => `${k}=${v}`).join(' ')}`);
    const f = obj.$def.frames[obj._currentframe - 1];
    if (f?.actions?.length) lines.push(`frame ${obj._currentframe}: DoAction ×${f.actions.length}`);
    if (f?.sounds?.length) lines.push(`frame ${obj._currentframe}: sounds ${f.sounds.map((s) => s.id).join(',')}`);
  }
  if (obj instanceof TextField) lines.push(`text ${JSON.stringify(obj.text)}`, `html ${obj.htmlText}`);
  const kids = obj.$kids();
  if (kids && kids.length) {
    lines.push('', 'children (depth name kind char x y filters):');
    for (const k of kids) {
      const fl = k.$filters ? k.$filters.map((f) => f.kind).join('+') : '';
      const extra = k.$clipDepth ? ` mask→${k.$clipDepth}` : '';
      lines.push(`${String(k.$depth).padStart(6)} ${k._name || '-'} ${k.$kind} #${k.$charId} ${k._x.toFixed(1)},${k._y.toFixed(1)}${fl ? ' [' + fl + ']' : ''}${extra}${k._visible ? '' : ' (hidden)'}`);
    }
  }
  if (obj instanceof Button) lines.push('', `button records: ${obj.$def.records.length}`);
  return lines.join('\n');
}

function drawFont(ctx: CanvasRenderingContext2D, font: FontDef, scale: number): void {
  const size = 32, cell = 44, cols = 16;
  const showSample = font.ascent !== undefined;
  const rows = Math.ceil(font.glyphs.length / cols);
  const sampleH = showSample ? 80 : 0;
  canvas.width = cols * cell * scale;
  canvas.height = (rows * cell + sampleH + 8) * scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  fillBackground(ctx, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  font.glyphs.forEach((g, i) => {
    const p = lib.glyphPath(font, i);
    const x = (i % cols) * cell + 4, y = Math.floor(i / cols) * cell + size;
    if (p) { ctx.setTransform(scale * size / 1024, 0, 0, scale * size / 1024, x * scale, y * scale); ctx.fill(p); }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#333';
    ctx.fillText(String(g.code), x, y + 10);
    ctx.fillStyle = '#000';
  });
  if (showSample) {
    // sample line laid out with advances + kerning
    const s = 40, y = rows * cell + 56;
    let x = 8;
    const map = lib.fontCodeMap(font);
    let prev = -1;
    for (const ch of sampleText) {
      const code = ch.charCodeAt(0);
      const gi = map.get(code);
      if (prev >= 0) x += lib.kerning(font, prev, code) * s / 1024;
      if (gi !== undefined) {
        const p = lib.glyphPath(font, gi);
        if (p) { ctx.setTransform(scale * s / 1024, 0, 0, scale * s / 1024, x * scale, y * scale); ctx.fillStyle = '#103070'; ctx.fill(p); }
        x += font.glyphs[gi]!.adv * s / 1024;
      }
      prev = code;
    }
  }
  infoEl.textContent = `font #${font.id} ${font.name}${font.bold ? ' bold' : ''}${font.italic ? ' italic' : ''}\n` +
    `glyphs ${font.glyphs.length}  ascent ${font.ascent} descent ${font.descent} leading ${font.leading}\n` +
    `kerning pairs ${font.kerning?.length ?? 0}\ncodes: ${font.glyphs.map((g) => String.fromCharCode(g.code)).join('')}`;
  totalEl.textContent = '/ 1';
}

function step(d: number): void {
  const o = current?.obj;
  if (!(o instanceof MovieClip)) return;
  const n = ((o._currentframe - 1 + d + o._totalframes * 100) % o._totalframes) + 1;
  o.gotoAndStop(n);
  player.flushActions();
  updateUrl();
  draw();
}

let raf = 0, last = 0, acc = 0;
function togglePlay(): void {
  playing = !playing;
  playEl.textContent = playing ? 'stop' : 'play';
  const o = current?.obj;
  if (o instanceof MovieClip) { if (playing) o.play(); else o.stop(); }
  if (playing) { last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); }
  else cancelAnimationFrame(raf);
}
function tick(t: number): void {
  if (!playing) return;
  acc += t - last; last = t;
  const fps = lib.json.stage.frameRate || 50;
  let n = 0;
  while (acc >= 1000 / fps && n < 4) { acc -= 1000 / fps; player.enterFrame(); n++; }
  if (acc > 200) acc = 0;
  if (n) draw();
  raf = requestAnimationFrame(tick);
}

function wire(): void {
  filterEl.oninput = () => renderList();
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  playEl.onclick = () => togglePlay();
  frameEl.onchange = () => {
    const o = current?.obj;
    if (o instanceof MovieClip) { o.gotoAndStop(Number(frameEl.value) || 1); player.flushActions(); updateUrl(); draw(); }
  };
  for (const el of [scaleEl, filtersEl, boundsEl, bgEl]) el.onchange = () => { updateUrl(); draw(); };
  window.addEventListener('keydown', (e) => {
    if (e.target === filterEl) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === ' ') { togglePlay(); e.preventDefault(); }
  });
  canvas.addEventListener('mousemove', (e) => {
    const o = current?.obj;
    if (!o) return;
    const r = canvas.getBoundingClientRect();
    statsEl.title = `canvas ${Math.round(e.clientX - r.left)},${Math.round(e.clientY - r.top)}`;
  });
  void engine;
}

export function setSampleText(s: string): void { sampleText = s; draw(); }

void main();
