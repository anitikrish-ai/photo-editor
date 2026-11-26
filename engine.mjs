/* Photo Studio engine — canvas pipeline, history, tools. UI lives in app.mjs. */
export const GROUPS = {
  Light: [['exp','Exposure',-100,100,0],['bright','Brightness',0,200,100],['contrast','Contrast',0,200,100],['hi','Highlights',-100,100,0],['sh','Shadows',-100,100,0]],
  Color: [['sat','Saturation',0,200,100],['vib','Vibrance',-100,100,0],['temp','Temperature',-100,100,0],['tint','Tint',-100,100,0],['hue','Hue',-180,180,0]],
  Detail: [['sharp','Sharpen',0,100,0],['blur','Blur',0,60,0],['grain','Film grain',0,100,0],['vig','Vignette',0,100,0],['fade','Fade',0,100,0]],
  FX: [['sepia','Sepia',0,100,0],['gray','Grayscale',0,100,0],['inv','Invert',0,100,0],['pix','Pixelate',0,100,0],['chroma','Glitch split',0,100,0]],
  Lens: [['tilt','Tilt-shift',0,100,0],['glow','Glow',0,100,0],['duo','Duotone',0,100,0],['bord','Border',0,100,0]]
};
export const PRESETS = {Original:{},Vivid:{contrast:115,sat:150,bright:104,vib:20},Noir:{gray:100,contrast:130,vig:45,bright:95},Warm:{sepia:30,sat:120,temp:35,bright:105},Cool:{temp:-35,sat:92,contrast:108},Fade:{contrast:85,bright:112,sat:80,fade:35,grain:25},Dream:{blur:6,bright:112,sat:115,vig:20,exp:10},Cinema:{contrast:125,sat:85,vig:55,grain:30,bright:92,temp:-12},Retro:{sepia:55,contrast:110,grain:45,vig:35},Crisp:{sharp:60,contrast:115,vib:25},Matte:{fade:45,contrast:90,sat:90},Sunset:{temp:45,tint:12,sat:125,vig:30,sh:20},Neon:{duo:70,contrast:118,glow:45,sat:130},Dreamy:{glow:60,bright:108,sat:112,fade:15,blur:2},Toy:{tilt:65,sat:135,contrast:112,vib:20},Glitch:{chroma:55,contrast:115,sat:120,grain:25},Polaroid:{bord:30,fade:30,temp:18,vig:22}};
export const BLENDS = [['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['soft-light','Soft light'],['hard-light','Hard light'],['color-dodge','Color dodge'],['color-burn','Color burn'],['lighten','Lighten'],['darken','Darken'],['luminosity','Luminosity'],['color','Color'],['difference','Difference'],['exclusion','Exclusion']];
export const FONTS = ['system-ui','Georgia','Impact','Courier New','Trebuchet MS','Brush Script MT','Arial Black'];
export const EMOJI = ['😀','😍','🔥','✨','❤️','⭐','🌈','🎉','😎','🌸','☀️','🌙'];
export const RATIOS = [['Free',0],['1:1',1],['4:5',.8],['16:9',1.7778],['9:16',.5625],['3:2',1.5]];
const DEF = Object.fromEntries(Object.values(GROUPS).flat().map(s => [s[0], s[4]]));
const PXK = ['exp','hi','sh','vib','temp','tint','sharp','fade','chroma','duo'];
const MAXP = matchMedia('(pointer:coarse)').matches ? 1280 : 2000;

let S = fresh(), imgs = new Map(), baseImg = null, bc = null, crop = null, cv, ctx, stage, hc;
let pinch = false, LW = 900, LH = 600, hist = [], hi = -1, raf = 0, drag = null, guides = {}, uid = 1, noise = null, cmp = false, fr0 = null, frK = '', ct = 0;
function fresh() { return { duo: ['#2b1055', '#ffb86b'], bcol: '#ffffff', adj: { ...DEF }, rot: 0, ang: 0, fx: false, ar: 0, layers: [], sel: null }; }

const subs = new Set();
export const E = {
  get S() { return S; }, tool: 'move', brush: { size: 28, color: '#ff3b6b', mode: 'paint' },
  split: null, busy: '', pal: [], cut: false, cropRect: null, cropAr: 0, zoom: 1, ES: { f: 'image/png', q: 92, z: 1 }, msg: '', cmp: false,
  get has() { return !!bc; }, get info() { return bc ? `${LW}×${LH}px canvas · ${baseImg.width}×${baseImg.height} source` : 'Open a photo to begin'; },
  get canUndo() { return hi > 0; }, get canRedo() { return hi < hist.length - 1; },
  get cur() { return cur(); },
  on(f) { subs.add(f); return () => subs.delete(f); }
};
let er = 0; const emit = () => { if (!er) er = requestAnimationFrame(() => { er = 0; subs.forEach(f => f()); }); };
const cur = () => S.layers.find(l => l.id === S.sel);
const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(ctx, 1, true); histoSoon(); }); };
let ht = 0; const histoSoon = () => { clearTimeout(ht); ht = setTimeout(histo, 140); };
const upd = () => { sched(); emit(); };
export function toast(t) { E.msg = t; emit(); clearTimeout(toast.t); toast.t = setTimeout(() => { E.msg = ''; emit(); }, 1800); }

/* ---- history ---- */
const snap = () => JSON.stringify({ ...S, sel: 0 });
function commit() { const s = snap(); if (hist[hi] === s) return; hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 80) hist.shift(); hi = hist.length - 1; emit(); }
const commitSoon = () => { clearTimeout(ct); ct = setTimeout(commit, 350); };
function restore(i) { hi = i; const sel = S.sel; S = JSON.parse(hist[i]); baseImg = imgs.get(S.bk) || baseImg; fr0 = null; S.sel = S.layers.some(l => l.id === sel) ? sel : null; rebuild(); upd(); }
E.undo = () => hi > 0 && restore(hi - 1); E.redo = () => hi < hist.length - 1 && restore(hi + 1);

/* ---- base pipeline ---- */
function baseCanvas(max) {
  const r = Math.min(1, max / Math.max(baseImg.width, baseImg.height)), odd = S.rot % 2, iw = baseImg.width * r, ih = baseImg.height * r;
  const w = Math.round(odd ? ih : iw), h = Math.round(odd ? iw : ih), t = Math.abs(S.ang) * Math.PI / 180;
  const sc = S.ang ? Math.cos(t) + Math.sin(t) * Math.max(w / h, h / w) : 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.translate(w / 2, h / 2); x.rotate(S.rot * Math.PI / 2 + S.ang * Math.PI / 180); x.scale(sc * (S.fx ? -1 : 1), sc); x.drawImage(baseImg, -iw / 2, -ih / 2, iw, ih); return c;
}
const cropOf = (w, h) => { let cw = w, ch = h; if (S.ar > 0) { if (cw / ch > S.ar) cw = ch * S.ar; else ch = cw / S.ar; } return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }; };
function rebuild() { bc = baseImg ? baseCanvas(Math.round(MAXP * 1.2)) : null; sizeCanvas(); }
function sizeCanvas() {
  if (!bc) { LW = 900; LH = 600; crop = null; } else { crop = cropOf(bc.width, bc.height); const k = Math.min(1, MAXP / Math.max(crop.w, crop.h)); LW = Math.round(crop.w * k); LH = Math.round(crop.h * k); }
  if (cv) { cv.width = LW; cv.height = LH; } if (E.tool === 'crop') E.cropRect = { x: 0, y: 0, w: LW, h: LH }; layout(); sched(); emit();
}
const fit = () => { const p = innerWidth < 900 ? 28 : 96; return Math.min((stage.clientWidth - p) / LW, (stage.clientHeight - p) / LH, 4); };
function layout() { if (!cv) return; const f = fit() * E.zoom; cv.style.width = LW * f + 'px'; cv.style.height = LH * f + 'px'; }

/* ---- pixel adjustments (exposure, tone, white balance, vibrance, sharpen, pixelate) ---- */
function px(c, A) {
  const W = c.canvas.width, H = c.canvas.height;
  if (A.pix > 0) {
    const b = Math.max(2, Math.round(A.pix / 100 * 36 * W / 1200)), t = document.createElement('canvas'); t.width = Math.ceil(W / b); t.height = Math.ceil(H / b);
    t.getContext('2d').drawImage(c.canvas, 0, 0, t.width, t.height);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H); c.drawImage(t, 0, 0, t.width, t.height, 0, 0, t.width * b, t.height * b); c.restore();
  }
  if (!PXK.some(k => A[k])) return;
  const hx = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), d1 = hx(S.duo[0]), d2 = hx(S.duo[1]), du = A.duo / 100, id = c.getImageData(0, 0, W, H), d = id.data, m = Math.pow(2, A.exp / 50), tr = 1 + A.temp / 350, tb = 1 - A.temp / 350, tg = 1 - A.tint / 300, f = A.fade / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * m * tr, g = d[i + 1] * m * tg, b = d[i + 2] * m * tb;
    const l = Math.min(1, Math.max(0, (.2126 * r + .7152 * g + .0722 * b) / 255)), a = (1 - l) * (1 - l) * A.sh * .6 + l * l * A.hi * .6; r += a; g += a; b += a;
    if (A.vib) { const av = (r + g + b) / 3, s = A.vib / 100 * (1 - (Math.max(r, g, b) - Math.min(r, g, b)) / 255) * 1.5; r += (r - av) * s; g += (g - av) * s; b += (b - av) * s; }
    if (f) { r = r * (1 - f * .25) + f * 45; g = g * (1 - f * .25) + f * 45; b = b * (1 - f * .25) + f * 45; }
    if (du) { const q = (.2126 * r + .7152 * g + .0722 * b) / 255; r = r * (1 - du) + (d1[0] + (d2[0] - d1[0]) * q) * du; g = g * (1 - du) + (d1[1] + (d2[1] - d1[1]) * q) * du; b = b * (1 - du) + (d1[2] + (d2[2] - d1[2]) * q) * du; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  if (A.chroma > 0) { const s = d.slice(), sh = Math.max(1, Math.round(A.chroma / 100 * W / 45)); for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) { const i = (row + x) * 4; d[i] = s[(row + Math.max(0, x - sh)) * 4]; d[i + 2] = s[(row + Math.min(W - 1, x + sh)) * 4 + 2]; } } }
  if (A.sharp > 0) {
    const s = d.slice(), a = A.sharp / 100 * 1.1, W4 = W * 4;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) d[i + k] = s[i + k] * (1 + 4 * a) - a * (s[i + k - 4] + s[i + k + 4] + s[i + k - W4] + s[i + k + W4]); }
  }
  c.putImageData(id, 0, 0);
}
function tiltShift(c, A) {
  const W = c.canvas.width, H = c.canvas.height, t = document.createElement('canvas'); t.width = W; t.height = H; const x = t.getContext('2d');
  x.filter = `blur(${A.tilt / 100 * W / 70}px)`; x.drawImage(c.canvas, 0, 0); x.filter = 'none'; x.globalCompositeOperation = 'destination-in';
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#000'); g.addColorStop(.3, 'rgba(0,0,0,0)'); g.addColorStop(.7, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(t, 0, 0); c.restore();
}
function glow(c, A) {
  const W = c.canvas.width, H = c.canvas.height, t = document.createElement('canvas'); t.width = W; t.height = H; const x = t.getContext('2d');
  x.filter = `blur(${W / 45}px) brightness(1.25) saturate(1.2)`; x.drawImage(c.canvas, 0, 0);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'screen'; c.globalAlpha = A.glow / 100 * .85; c.drawImage(t, 0, 0); c.restore();
}
function histo() {
  const hc = E.hc; if (!hc || !bc) return; const t = histo.t || (histo.t = document.createElement('canvas')); t.width = 128; t.height = 80;
  const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0, 128, 80); const d = x.getImageData(0, 0, 128, 80).data, bins = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
  for (let i = 0; i < d.length; i += 4) { bins[0][d[i]]++; bins[1][d[i + 1]]++; bins[2][d[i + 2]]++; }
  const mx = Math.max(...bins.flat().map((v, i) => (i % 256 > 3 && i % 256 < 252) ? v : 0)) || 1, h = hc.getContext('2d'), W = hc.width, H = hc.height; h.clearRect(0, 0, W, H); h.globalCompositeOperation = 'lighter';
  ['#ff3b30', '#34c759', '#0a84ff'].forEach((col, ci) => { h.fillStyle = col; h.globalAlpha = .55; for (let i = 0; i < 256; i++) { const bh = Math.min(1, bins[ci][i] / mx) * H; h.fillRect(i * W / 256, H - bh, W / 256 + .6, bh); } });
  h.globalAlpha = 1; h.globalCompositeOperation = 'source-over';
}

/* ---- render ---- */
function grain() { if (noise) return noise; const n = document.createElement('canvas'); n.width = n.height = 192; const c = n.getContext('2d'), d = c.createImageData(192, 192); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } c.putImageData(d, 0, 0); return noise = ctx.createPattern(n, 'repeat'); }
const fnt = L => `${L.bold ? '700' : '400'} ${L.italic ? 'italic ' : ''}64px ${L.font}`;
function dims(L) {
  if (L.type === 'shape') return { w: L.w, h: Math.max(L.h, 14) };
  if (L.type !== 'text') { const i = imgs.get(L.k); return { w: i.width, h: i.height }; }
  ctx.save(); ctx.font = fnt(L); const w = ctx.measureText(L.text || ' ').width; ctx.restore(); return { w: w + 16, h: 84 };
}
function drawLayer(c, L) {
  if (L.vis === false) return; const d = dims(L);
  c.save(); c.globalAlpha = L.op; c.globalCompositeOperation = L.blend; c.translate(LW / 2 + L.x, LH / 2 + L.y); c.rotate(L.r * Math.PI / 180); c.scale(L.s * (L.flip ? -1 : 1), L.s);
  if (L.sh > 0) { c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = L.sh * 2; c.shadowOffsetY = L.sh * .5; }
  if (L.type === 'text') { c.font = fnt(L); c.textAlign = 'center'; c.textBaseline = 'middle'; if (L.stroke > 0) { c.lineJoin = 'round'; c.lineWidth = L.stroke; c.strokeStyle = L.scolor; c.strokeText(L.text, 0, 0); } c.fillStyle = L.color; c.fillText(L.text, 0, 0); }
  else if (L.type === 'shape') {
    const w = d.w, h = d.h; c.fillStyle = c.strokeStyle = L.color; c.lineWidth = L.stroke || 6; c.lineCap = c.lineJoin = 'round'; c.beginPath();
    if (L.shape === 'rect') c.rect(-w / 2, -h / 2, w, h); else if (L.shape === 'ellipse') c.ellipse(0, 0, w / 2, h / 2, 0, 0, 7);
    else { c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0); if (L.shape === 'arrow') { c.moveTo(w / 2 - 34, -22); c.lineTo(w / 2, 0); c.lineTo(w / 2 - 34, 22); } }
    L.fill && L.shape !== 'line' && L.shape !== 'arrow' ? c.fill() : c.stroke();
  } else c.drawImage(imgs.get(L.k), -d.w / 2, -d.h / 2, d.w, d.h);
  c.restore();
}
let cache = null, cacheKey = '';
function baseStage(c, k, A) {
  c.save(); let pad = 0;
  if (S.bg) { c.fillStyle = S.bg; c.fillRect(0, 0, LW, LH); }
  if (!cmp) {
    const b = A.blur * (LW / 1200), f = []; pad = b * 2.4; if (b > .1) f.push(`blur(${b * k}px)`);
    if (A.bright != 100) f.push(`brightness(${A.bright}%)`); if (A.contrast != 100) f.push(`contrast(${A.contrast}%)`); if (A.sat != 100) f.push(`saturate(${A.sat}%)`);
    if (A.hue) f.push(`hue-rotate(${A.hue}deg)`); if (A.sepia) f.push(`sepia(${A.sepia}%)`); if (A.gray) f.push(`grayscale(${A.gray}%)`); if (A.inv) f.push(`invert(${A.inv}%)`);
    c.filter = f.length ? f.join(' ') : 'none';
  }
  c.drawImage(bc, crop.x, crop.y, crop.w, crop.h, -pad, -pad, LW + pad * 2, LH + pad * 2); c.restore();
  if (cmp) return false; px(c, A); if (A.tilt > 0) tiltShift(c, A); if (A.glow > 0) glow(c, A);
  if (A.vig > 0) { const g = c.createRadialGradient(LW / 2, LH / 2, Math.min(LW, LH) * .25, LW / 2, LH / 2, Math.hypot(LW, LH) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${A.vig / 100 * .92})`); c.fillStyle = g; c.fillRect(0, 0, LW, LH); }
  if (A.grain > 0) { c.save(); c.globalAlpha = A.grain / 100 * .55; c.globalCompositeOperation = 'overlay'; c.fillStyle = grain(); c.fillRect(0, 0, LW, LH); c.restore(); }
  return true;
}
function draw(c, k, ui, ky = k) {
  c.setTransform(k, 0, 0, ky, 0, 0); c.clearRect(0, 0, LW, LH); c.imageSmoothingQuality = 'high';
  if (!bc) { c.fillStyle = '#1a1d24'; c.fillRect(0, 0, LW, LH); return; }
  const A = S.adj, ck = ui && k === 1 && !cmp ? JSON.stringify([A, S.duo, S.rot, S.fx, S.ar, S.ang, S.bk, S.bg, LW, LH]) : '';
  if (ck && cache && cacheKey === ck) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(cache, 0, 0); c.restore(); }
  else {
    if (!baseStage(c, k, A)) return;
    if (ck) { const W = c.canvas.width, H = c.canvas.height; if (!cache || cache.width !== W || cache.height !== H) { cache = document.createElement('canvas'); cache.width = W; cache.height = H; } const x = cache.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(c.canvas, 0, 0); cacheKey = ck; }
  }
  S.layers.forEach(L => drawLayer(c, L));
  if (A.bord > 0) { const lw = A.bord / 100 * Math.min(LW, LH) * .24; c.save(); c.strokeStyle = S.bcol; c.lineWidth = lw; c.strokeRect(lw / 2, lw / 2, LW - lw, LH - lw); c.restore(); }
  if (ui) drawUI(c);
}
const kv = () => LW / cv.getBoundingClientRect().width;
function corners(L) { const d = dims(L), r = L.r * Math.PI / 180, co = Math.cos(r), si = Math.sin(r), cx = LW / 2 + L.x, cy = LH / 2 + L.y, p = (x, y) => [cx + (x * co - y * si) * L.s, cy + (x * si + y * co) * L.s], w = d.w / 2, h = d.h / 2; return { c: [p(-w, -h), p(w, -h), p(w, h), p(-w, h)], rot: p(0, -h - 34 * kv() / L.s), top: p(0, -h), cx, cy }; }
function drawUI(c) {
  const k = kv();
  if (E.split != null) { const x = LW * E.split; c.save(); c.beginPath(); c.rect(0, 0, x, LH); c.clip(); c.filter = 'none'; c.drawImage(bc, crop.x, crop.y, crop.w, crop.h, 0, 0, LW, LH); c.restore();
    c.save(); c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 6 * k; c.fillRect(x - 1.5 * k, 0, 3 * k, LH); c.beginPath(); c.arc(x, LH / 2, 16 * k, 0, 7); c.fill(); c.shadowBlur = 0; c.fillStyle = '#333'; c.font = `700 ${13 * k}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('↔', x, LH / 2); c.restore(); }
  if (E.tool === 'crop' && E.cropRect) {
    const r = E.cropRect; c.save(); c.fillStyle = 'rgba(0,0,0,.58)'; c.fillRect(0, 0, LW, r.y); c.fillRect(0, r.y + r.h, LW, LH - r.y - r.h); c.fillRect(0, r.y, r.x, r.h); c.fillRect(r.x + r.w, r.y, LW - r.x - r.w, r.h);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5 * k; c.strokeRect(r.x, r.y, r.w, r.h); c.globalAlpha = .45; c.lineWidth = k; c.beginPath();
    for (let i = 1; i < 3; i++) { c.moveTo(r.x + r.w * i / 3, r.y); c.lineTo(r.x + r.w * i / 3, r.y + r.h); c.moveTo(r.x, r.y + r.h * i / 3); c.lineTo(r.x + r.w, r.y + r.h * i / 3); } c.stroke(); c.globalAlpha = 1; c.fillStyle = '#fff';
    [[r.x, r.y], [r.x + r.w / 2, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y + r.h / 2]].forEach(q => { c.beginPath(); c.arc(q[0], q[1], 7 * k, 0, 7); c.fill(); }); c.restore(); return;
  }
  if (drag && drag.mode === 'move') { c.save(); c.strokeStyle = 'rgba(255,70,140,.9)'; c.lineWidth = 1.2 * k; c.setLineDash([6 * k, 4 * k]); if (guides.x) { c.beginPath(); c.moveTo(LW / 2, 0); c.lineTo(LW / 2, LH); c.stroke(); } if (guides.y) { c.beginPath(); c.moveTo(0, LH / 2); c.lineTo(LW, LH / 2); c.stroke(); } c.restore(); }
  const L = cur(); if (!L || L.vis === false || E.tool === 'brush') return; const g = corners(L);
  c.save(); c.strokeStyle = '#4f7cff'; c.lineWidth = 1.6 * k; c.beginPath(); g.c.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(g.top[0], g.top[1]); c.lineTo(g.rot[0], g.rot[1]); c.stroke(); c.fillStyle = '#fff';
  [...g.c, g.rot].forEach(p => { c.beginPath(); c.arc(p[0], p[1], 6.5 * k, 0, 7); c.fill(); c.stroke(); }); c.restore();
}

/* ---- pointer: move / scale / rotate / brush / eyedropper ---- */
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * LW / r.width, (e.clientY - r.top) * LH / r.height]; };
function local(L, p) { const d = dims(L), r = -L.r * Math.PI / 180, dx = p[0] - LW / 2 - L.x, dy = p[1] - LH / 2 - L.y; return [(dx * Math.cos(r) - dy * Math.sin(r)) / L.s, (dx * Math.sin(r) + dy * Math.cos(r)) / L.s, d]; }
const hit = (L, p) => { if (L.vis === false) return false; const [x, y, d] = local(L, p); return Math.abs(x) <= d.w / 2 && Math.abs(y) <= d.h / 2; };
function stroke(L, a, b) {
  const t = drag.ctx, [ax, ay, d] = local(L, a), [bx, by] = local(L, b); t.save(); t.lineCap = t.lineJoin = 'round'; t.lineWidth = E.brush.size / L.s; t.strokeStyle = drag.pat || E.brush.color; t.globalCompositeOperation = E.brush.mode === 'erase' ? 'destination-out' : 'source-over';
  t.beginPath(); t.moveTo(ax + d.w / 2, ay + d.h / 2); t.lineTo(bx + d.w / 2 + .01, by + d.h / 2); t.stroke(); t.restore();
}
function snapPattern(mode, x2) {
  const t = document.createElement('canvas'); t.width = LW; t.height = LH; const x = t.getContext('2d');
  if (mode === 'blur') { x.filter = `blur(${Math.max(4, E.brush.size / 3)}px)`; x.drawImage(cv, 0, 0); }
  else { const b = Math.max(6, E.brush.size / 2.5), s = document.createElement('canvas'); s.width = Math.ceil(LW / b); s.height = Math.ceil(LH / b); s.getContext('2d').drawImage(cv, 0, 0, s.width, s.height); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, s.width, s.height, 0, 0, s.width * b, s.height * b); }
  return x2.createPattern(t, 'no-repeat');
}
function brushStart(p) {
  let L = cur(); if (!L || L.type !== 'draw') { const c = document.createElement('canvas'); c.width = LW; c.height = LH; const k = 'i' + uid++, id = uid++; imgs.set(k, c); L = { id, type: 'draw', name: 'Drawing ' + id, k, x: 0, y: 0, s: 1, r: 0, op: 1, blend: 'source-over', sh: 0, flip: false }; S.layers.push(L); S.sel = id; }
  const o = imgs.get(L.k), n = document.createElement('canvas'); n.width = o.width; n.height = o.height; n.getContext('2d').drawImage(o, 0, 0); const k = 'i' + uid++; imgs.set(k, n); L.k = k;
  drag = { mode: 'brush', last: p, ctx: n.getContext('2d') }; const bm = E.brush.mode; if (bm === 'mosaic' || bm === 'blur') drag.pat = snapPattern(bm, drag.ctx); stroke(L, p, p);
}
function eyedrop(p) { const t = document.createElement('canvas'); t.width = t.height = 1; const x = t.getContext('2d'); x.drawImage(cv, -p[0], -p[1]); const d = x.getImageData(0, 0, 1, 1).data; E.brush.color = '#' + [...d].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''); E.tool = 'brush'; upd(); }
function cropMove(p) {
  const d = drag, r0 = d.r0, hn = d.h, cl = (v, a, b) => Math.min(b, Math.max(a, v)); let x1 = r0.x, y1 = r0.y, x2 = r0.x + r0.w, y2 = r0.y + r0.h;
  if (hn === 'move') { E.cropRect = { x: cl(r0.x + p[0] - d.p0[0], 0, LW - r0.w), y: cl(r0.y + p[1] - d.p0[1], 0, LH - r0.h), w: r0.w, h: r0.h }; sched(); return; }
  if (hn.includes('w')) x1 = cl(p[0], 0, x2 - 40); if (hn.includes('e')) x2 = cl(p[0], x1 + 40, LW); if (hn.includes('n')) y1 = cl(p[1], 0, y2 - 40); if (hn.includes('s')) y2 = cl(p[1], y1 + 40, LH);
  const ar = E.cropAr;
  if (ar > 0) {
    let w = x2 - x1, h = y2 - y1;
    if (hn === 'n' || hn === 's') { w = h * ar; const cx = r0.x + r0.w / 2; x1 = cx - w / 2; x2 = cx + w / 2; }
    else { h = w / ar; if (hn.includes('n')) y1 = y2 - h; else if (hn.includes('s')) y2 = y1 + h; else { const cy = r0.y + r0.h / 2; y1 = cy - h / 2; y2 = cy + h / 2; } }
    if (x1 < 0 || y1 < 0 || x2 > LW || y2 > LH) return;
  }
  E.cropRect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; sched();
}
function onDown(e) {
  if (!bc || e.button || drag || pinch) return; cv.focus({ preventScroll: true }); const p = pt(e), k = kv(), L = cur(); cv.setPointerCapture(e.pointerId);
  if (E.split != null && Math.abs(p[0] - LW * E.split) < 22 * k) { drag = { mode: 'split' }; return; }
  if (E.tool === 'crop' && E.cropRect) {
    const r = E.cropRect, hs = { nw: [r.x, r.y], n: [r.x + r.w / 2, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, r.y + r.h / 2], se: [r.x + r.w, r.y + r.h], s: [r.x + r.w / 2, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, r.y + r.h / 2] }, hr = 24 * k;
    const hn = Object.keys(hs).find(n => Math.hypot(p[0] - hs[n][0], p[1] - hs[n][1]) < hr);
    if (hn) drag = { mode: 'crop', h: hn, r0: { ...r }, p0: p }; else if (p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h) drag = { mode: 'crop', h: 'move', r0: { ...r }, p0: p };
    return;
  }
  if (E.tool === 'eyedrop') return eyedrop(p);
  if (E.tool === 'brush') { brushStart(p); return; }
  if (L && L.vis !== false) { const g = corners(L), hr = 14 * k;
    if (Math.hypot(p[0] - g.rot[0], p[1] - g.rot[1]) < hr) { drag = { mode: 'rot' }; return; }
    if (g.c.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < hr)) { drag = { mode: 'scale', d0: Math.hypot(p[0] - g.cx, p[1] - g.cy), s0: L.s }; return; } }
  const t = [...S.layers].reverse().find(l => hit(l, p));
  if (t) { S.sel = t.id; E.onSelect && E.onSelect(); drag = { mode: 'move', px: p[0], py: p[1], x0: t.x, y0: t.y }; cv.style.cursor = 'grabbing'; } else { S.sel = null; drag = null; }
  upd();
}
function onMove(e) {
  if (!drag || pinch) return; const p = pt(e), L = cur(), k = kv();
  if (drag.mode === 'split') { E.split = Math.min(1, Math.max(0, p[0] / LW)); sched(); return; }
  if (drag.mode === 'crop') { cropMove(p); return; }
  if (!L) return;
  if (drag.mode === 'brush') { stroke(L, drag.last, p); drag.last = p; sched(); return; }
  if (drag.mode === 'move') { let x = drag.x0 + p[0] - drag.px, y = drag.y0 + p[1] - drag.py; const th = 7 * k; guides.x = Math.abs(x) < th; guides.y = Math.abs(y) < th; if (guides.x) x = 0; if (guides.y) y = 0; L.x = x; L.y = y; }
  else if (drag.mode === 'scale') L.s = Math.min(8, Math.max(.03, drag.s0 * Math.hypot(p[0] - LW / 2 - L.x, p[1] - LH / 2 - L.y) / drag.d0));
  else { let a = Math.atan2(p[1] - LH / 2 - L.y, p[0] - LW / 2 - L.x) * 180 / Math.PI + 90; a = ((a + 180) % 360 + 360) % 360 - 180; const n = Math.round(a / 45) * 45; if (Math.abs(a - n) < 3) a = n; L.r = Math.round(a * 10) / 10; }
  upd();
}
function onUp() { if (drag) { const m = drag.mode; drag = null; guides = {}; cv.style.cursor = ''; if (m !== 'split' && m !== 'crop') commit(); upd(); } }

/* ---- API ---- */
E.init = (canvas, st, histCanvas) => {
  cv = canvas; ctx = cv.getContext('2d'); stage = st; E.hc = E.hc || histCanvas;
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  stage.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); E.setZoom(E.zoom * (e.deltaY < 0 ? 1.1 : .9)); }, { passive: false });
  const tp = new Map(); let pd = 0, pm = null;
  stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; tp.set(e.pointerId, [e.clientX, e.clientY]); if (tp.size === 2) { pinch = true; if (drag) { drag = null; commit(); } pd = 0; pm = null; } }, true);
  stage.addEventListener('pointermove', e => {
    if (!tp.has(e.pointerId)) return; tp.set(e.pointerId, [e.clientX, e.clientY]); if (tp.size !== 2) return;
    const [a, b] = [...tp.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (pd) E.setZoom(E.zoom * d / pd); if (pm) { stage.scrollLeft -= m[0] - pm[0]; stage.scrollTop -= m[1] - pm[1]; } pd = d; pm = m;
  }, true);
  const tend = e => { tp.delete(e.pointerId); if (tp.size < 2) { pd = 0; pm = null; } if (!tp.size) pinch = false; };
  stage.addEventListener('pointerup', tend, true); stage.addEventListener('pointercancel', tend, true);
  new ResizeObserver(layout).observe(stage);
  addEventListener('dragover', e => e.preventDefault()); addEventListener('drop', e => { e.preventDefault(); [...e.dataTransfer.files].forEach(intake); });
  addEventListener('paste', e => { for (const it of e.clipboardData.items) if (it.type.startsWith('image/')) intake(it.getAsFile()); });
  addEventListener('pointerup', () => cmp && E.hold(false)); addEventListener('keydown', keys); addEventListener('keyup', e => { if (e.key === '\\') E.hold(false); });
  hist = [snap()]; hi = 0; sizeCanvas();
};
E.setZoom = z => { E.zoom = Math.min(4, Math.max(.25, z)); layout(); emit(); };
E.toggleSplit = () => { if (!bc) return toast('Open a photo first'); E.split = E.split == null ? .5 : null; upd(); };
E.setDuo = (i, v) => { S.duo[i] = v; upd(); commitSoon(); }; E.setBorderColor = v => { S.bcol = v; upd(); commitSoon(); };
E.hold = v => { if (!bc) return; cmp = E.cmp = v; sched(); emit(); };
function loadFile(f, cb) { if (!f || !f.type.startsWith('image/')) return; const u = URL.createObjectURL(f), i = new Image(); i.onload = () => { cb(i); setTimeout(() => URL.revokeObjectURL(u), 3000); }; i.onerror = () => { toast('Could not read that image'); cb(null); }; i.src = u; }
function setBase(i) { if (!i) return; baseImg = i; S = fresh(); imgs.clear(); fr0 = null; S.bk = 'b' + uid++; imgs.set(S.bk, i); E.cut = false; E.split = null; E.tool = 'move'; E.cropRect = null; E.pal = palette(i); rebuild(); hist = []; hi = -1; commit(); E.zoom = 1; layout(); upd(); toast('Photo loaded'); }
function addImg(i) { if (!i) return; const k = 'i' + uid++, id = uid++; imgs.set(k, i); S.layers.push({ id, type: 'img', name: 'Image ' + id, k, x: 0, y: 0, s: Math.min(2, LW * .45 / i.width), r: 0, op: .6, blend: 'source-over', sh: 0, flip: false }); S.sel = id; commit(); upd(); }
let chain = Promise.resolve(); const intake = f => { if (/\.pstudio$/i.test(f.name)) return E.openProject(f); chain = chain.then(() => new Promise(res => loadFile(f, i => { try { bc ? addImg(i) : setBase(i); } finally { res(); } }))); };
E.openBase = f => loadFile(f, setBase); E.openOverlay = f => bc ? loadFile(f, addImg) : toast('Open a photo first');
const base = () => ({ x: 0, y: 0, s: 1, r: 0, op: 1, blend: 'source-over', sh: 0, flip: false });
E.addText = (text = 'Your text', o = {}) => { if (!bc) return toast('Open a photo first'); const id = uid++; S.layers.push({ id, type: 'text', name: 'Text', text, font: 'system-ui', color: '#ffffff', scolor: '#000000', stroke: 0, bold: true, italic: false, ...base(), s: 1.2, sh: 8, ...o }); S.sel = id; commit(); upd(); };
E.addShape = shape => { if (!bc) return toast('Open a photo first'); const id = uid++; S.layers.push({ id, type: 'shape', name: shape[0].toUpperCase() + shape.slice(1), shape, color: '#ff3b6b', fill: false, stroke: 8, w: shape === 'line' || shape === 'arrow' ? 320 : 280, h: shape === 'line' || shape === 'arrow' ? 14 : 180, ...base() }); S.sel = id; commit(); upd(); };
E.setTool = t => { if (!bc && t !== 'move') { toast('Open a photo first'); return; } E.tool = t; E.cropAr = 0; E.cropRect = t === 'crop' ? { x: 0, y: 0, w: LW, h: LH } : null; sched(); emit(); };
E.setBrush = o => { Object.assign(E.brush, o); emit(); };
E.adj = (k, v) => { S.adj[k] = v; upd(); commitSoon(); };
E.preset = n => { S.adj = { ...DEF, ...PRESETS[n] }; commit(); upd(); };
E.resetAdj = () => { S.adj = { ...DEF }; commit(); upd(); };
E.straighten = v => { S.ang = v; rebuild(); commitSoon(); };
E.setAr = v => { S.ar = v; sizeCanvas(); commit(); };
E.rotate = d => { S.rot = (S.rot + d + 4) % 4; rebuild(); commit(); }; E.flipPhoto = () => { S.fx = !S.fx; rebuild(); commit(); };
E.resetAll = () => { if (!baseImg) return; S = fresh(); rebuild(); commit(); upd(); };
E.autoEnhance = () => {
  if (!bc) return; const t = document.createElement('canvas'); t.width = 160; t.height = 100; const x = t.getContext('2d'); x.drawImage(bc, 0, 0, 160, 100); const d = x.getImageData(0, 0, 160, 100).data, h = new Array(256).fill(0); let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const l = Math.round(.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]); h[l]++; sum += l; n++; }
  let a = 0, lo = 0, hi2 = 255; for (let i = 0; i < 256; i++) { a += h[i]; if (a > n * .01) { lo = i; break; } } a = 0; for (let i = 255; i >= 0; i--) { a += h[i]; if (a > n * .01) { hi2 = i; break; } }
  const mean = sum / n; S.adj = { ...DEF, contrast: Math.round(Math.min(140, Math.max(95, 100 * 235 / Math.max(80, hi2 - lo)))), bright: Math.round(Math.min(120, Math.max(85, 100 + (125 - mean) * .35))), vib: 22, sh: mean < 100 ? 25 : 8, hi: hi2 > 245 ? -15 : 0 };
  commit(); upd(); toast('Auto-enhanced');
};
E.select = id => { S.sel = id; upd(); };
E.patch = (k, v) => { const L = cur(); if (!L) return; L[k] = v; upd(); commitSoon(); };
E.layerAct = a => {
  const L = cur(), i = S.layers.indexOf(L); if (!L) return;
  if (a === 'del') { S.layers = S.layers.filter(l => l !== L); S.sel = null; }
  else if (a === 'dup') { const c = { ...L, id: uid++, x: L.x + 24, y: L.y + 24 }; S.layers.push(c); S.sel = c.id; }
  else if (a === 'up' && i < S.layers.length - 1) [S.layers[i], S.layers[i + 1]] = [S.layers[i + 1], S.layers[i]];
  else if (a === 'down' && i > 0) [S.layers[i], S.layers[i - 1]] = [S.layers[i - 1], S.layers[i]];
  else if (a === 'center') L.x = L.y = 0;
  commit(); upd();
};
E.toggleVis = id => { const L = S.layers.find(l => l.id === id); L.vis = L.vis === false; commit(); upd(); };
function keys(e) {
  const tag = e.target.tagName, typing = tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type !== 'range'), m = e.ctrlKey || e.metaKey;
  if (m && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? E.redo() : E.undo(); return; }
  if (m && e.key.toLowerCase() === 'y') { e.preventDefault(); E.redo(); return; }
  if (typing || tag === 'SELECT') return; const L = cur();
  if (e.key === '\\') { E.hold(true); return; }
  if (E.tool === 'crop') { if (e.key === 'Enter') E.applyCrop(); if (e.key === 'Escape') E.cropCancel(); }
  if (!m && e.key === 'c') E.setTool('crop');
  if (e.key === 'v') E.setTool('move'); if (e.key === 'b') E.setTool('brush'); if (e.key === 'i') E.setTool('eyedrop');
  if (m && e.key.toLowerCase() === 'd' && L) { e.preventDefault(); E.layerAct('dup'); return; }
  if (!L) return; if (e.key === 'Delete' || e.key === 'Backspace') E.layerAct('del');
  const st = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
  if (mv) { e.preventDefault(); L.x += mv[0]; L.y += mv[1]; upd(); commitSoon(); }
}

/* ---- export ---- */
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
E.ext = f => EXT[f];
E.fmtB = n => n > 1e6 ? (n / 1e6).toFixed(2) + ' MB' : Math.round(n / 1e3) + ' KB';
function fullRes() { const k = [S.rot, S.fx, S.ar, S.ang, S.bk].join(); if (fr0 && frK === k) return fr0; const c = baseCanvas(8192); frK = k; return fr0 = { c, cr: cropOf(c.width, c.height) }; }
E.makeOut = async (fmt = E.ES.f, q = E.ES.q, z = E.ES.z) => {
  const F = fullRes(), w = Math.max(1, Math.round(F.cr.w * z)), h = Math.max(1, Math.round(F.cr.h * z)), o = document.createElement('canvas'); o.width = w; o.height = h;
  const x = o.getContext('2d'), sb = bc, sc = crop, ss = S.sel, sp = cmp; bc = F.c; crop = F.cr; S.sel = null; cmp = false;
  try { draw(x, w / LW, false, h / LH); } finally { bc = sb; crop = sc; S.sel = ss; cmp = sp; }
  let out = o; if (fmt !== 'image/png') { out = document.createElement('canvas'); out.width = w; out.height = h; const y = out.getContext('2d'); y.fillStyle = '#fff'; y.fillRect(0, 0, w, h); y.drawImage(o, 0, 0); }
  const blob = await new Promise(r => out.toBlob(r, fmt, fmt === 'image/png' ? undefined : q / 100)); if (!blob) throw new Error('Export failed'); return { blob, w, h, fmt };
};
E.save = o => { const a = document.createElement('a'); a.href = URL.createObjectURL(o.blob); a.download = `photo-studio-${Date.now()}.${EXT[o.fmt]}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast(`Saved ${o.w}×${o.h} · ${E.fmtB(o.blob.size)}`); };
E.quickSave = async () => { toast('Rendering full quality…'); try { E.save(await E.makeOut()); } catch { toast('Export failed. Try a smaller size in Preview.'); } };
E.copy = async () => { try { const o = await E.makeOut('image/png'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': o.blob })]); toast('Copied to clipboard'); } catch { toast('Clipboard not available here'); } };
E.theme = d => { document.documentElement.dataset.theme = d ? 'dark' : 'light'; emit(); };

/* ---- v3: destructive base ops (undoable via base keys), crop, smart tools, AI, projects ---- */
function replaceBase(c) { const k = 'b' + uid++; imgs.set(k, c); baseImg = c; S.bk = k; fr0 = null; }
E.toast = toast;
E.setBg = v => { S.bg = v; upd(); commitSoon(); };
E.setCropAr = v => { E.cropAr = v; if (v > 0) { let w = LW, h = LH; if (LW / LH > v) w = h * v; else h = w / v; E.cropRect = { x: (LW - w) / 2, y: (LH - h) / 2, w, h }; } else E.cropRect = { x: 0, y: 0, w: LW, h: LH }; sched(); emit(); };
E.cropCancel = () => { E.tool = 'move'; E.cropRect = null; sched(); emit(); };
E.applyCrop = () => {
  const r = E.cropRect; if (!r || !bc) return; if (r.w >= LW - 1 && r.h >= LH - 1) return E.cropCancel();
  const F = fullRes(), sx = F.cr.w / LW, sy = F.cr.h / LH, sw = Math.max(1, Math.round(r.w * sx)), sh = Math.max(1, Math.round(r.h * sy)), n = document.createElement('canvas'); n.width = sw; n.height = sh;
  n.getContext('2d').drawImage(F.c, F.cr.x + r.x * sx, F.cr.y + r.y * sy, r.w * sx, r.h * sy, 0, 0, sw, sh);
  const oW = LW, oH = LH; replaceBase(n); S.rot = 0; S.fx = false; S.ang = 0; S.ar = 0; E.tool = 'move'; E.cropRect = null; rebuild();
  const f = LW / r.w; S.layers.forEach(L => { L.x = (L.x - (r.x + r.w / 2 - oW / 2)) * f; L.y = (L.y - (r.y + r.h / 2 - oH / 2)) * f; L.s *= f; });
  commit(); upd(); toast('Cropped');
};
E.smartCrop = ar => {
  if (!bc) return toast('Open a photo first'); E.tool = 'crop'; E.cropAr = ar;
  const tw = 96, th = Math.max(8, Math.round(96 * LH / LW)), t = document.createElement('canvas'); t.width = tw; t.height = th; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0, tw, th); const d = x.getImageData(0, 0, tw, th).data;
  const lum = i => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2], en = new Float64Array(tw * th);
  for (let y = 1; y < th - 1; y++) for (let xx = 1; xx < tw - 1; xx++) { const i = (y * tw + xx) * 4; en[y * tw + xx] = (Math.abs(lum(i + 4) - lum(i - 4)) + Math.abs(lum(i + tw * 4) - lum(i - tw * 4))) * (1.15 - Math.hypot((xx - tw / 2) / tw, (y - th / 2) / th)); }
  const I = new Float64Array((tw + 1) * (th + 1)); for (let y = 0; y < th; y++) { let row = 0; for (let xx = 0; xx < tw; xx++) { row += en[y * tw + xx]; I[(y + 1) * (tw + 1) + xx + 1] = I[y * (tw + 1) + xx + 1] + row; } }
  const sum = (x1, y1, x2, y2) => I[y2 * (tw + 1) + x2] - I[y1 * (tw + 1) + x2] - I[y2 * (tw + 1) + x1] + I[y1 * (tw + 1) + x1];
  const R = ar > 0 ? ar : tw / th; let mw = tw, mh = tw / R; if (mh > th) { mh = th; mw = th * R; }
  let best = -1, br = [0, 0, tw, th]; for (let s = 1; s >= .5; s -= .05) { const w = Math.floor(mw * s), h = Math.floor(mh * s); if (w < 8 || h < 8) continue; for (let y = 0; y + h <= th; y += 2) for (let xx = 0; xx + w <= tw; xx += 2) { const v = sum(xx, y, xx + w, y + h) / Math.sqrt(w * h); if (v > best) { best = v; br = [xx, y, w, h]; } } }
  E.cropRect = { x: br[0] * LW / tw, y: br[1] * LH / th, w: br[2] * LW / tw, h: br[3] * LH / th }; sched(); emit(); toast('Smart crop suggested — adjust or Apply');
};
E.autoWB = () => {
  if (!bc) return; const t = document.createElement('canvas'); t.width = 64; t.height = 40; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(bc, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } if (!n) return; r /= n; g /= n; b /= n;
  S.adj.temp = Math.round(Math.max(-60, Math.min(60, (b - r) / (b + r + 1e-6) * 350))); S.adj.tint = Math.round(Math.max(-40, Math.min(40, 300 * (1 - (r + b) / 2 / (g + 1e-6))))); commit(); upd(); toast('White balance corrected');
};
function palette(src) {
  const t = document.createElement('canvas'); t.width = t.height = 64; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data, P = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) P.push([d[i], d[i + 1], d[i + 2]]); if (!P.length) return [];
  const lum = p => .2126 * p[0] + .7152 * p[1] + .0722 * p[2], K = Math.min(5, P.length); P.sort((a, b) => lum(a) - lum(b));
  let C = Array.from({ length: K }, (_, i) => P[Math.floor((i + .5) * P.length / K)].slice()), cnt = [];
  for (let it = 0; it < 8; it++) { const sm = C.map(() => [0, 0, 0, 0]); for (const p of P) { let bi = 0, bd = 1e9; C.forEach((c, i) => { const q = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (q < bd) { bd = q; bi = i; } }); const s = sm[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; } C = sm.map((s, i) => s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : C[i]); cnt = sm.map(s => s[3]); }
  return C.map((c, i) => [c, cnt[i]]).sort((a, b) => b[1] - a[1]).map(([c]) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
E.extractPalette = () => { if (bc) { E.pal = palette(cv); emit(); } };
E.duoFromPal = () => { if (E.pal.length < 2) return; const l = h => { const n = parseInt(h.slice(1), 16); return .2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255); }, s = [...E.pal].sort((a, b) => l(a) - l(b)); S.duo = [s[0], s[s.length - 1]]; S.adj.duo = 85; commit(); upd(); toast('Duotone from palette'); };
E.floodCut = tol => {
  if (!baseImg) return toast('Open a photo first'); E.busy = 'Cutting out background…'; emit();
  setTimeout(() => {
    try {
      const w = baseImg.width, h = baseImg.height, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(baseImg, 0, 0);
      const id = x.getImageData(0, 0, w, h), d = id.data; let sr = 0, sg = 0, sb = 0; [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].forEach(([a, b]) => { const i = (b * w + a) * 4; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }); sr /= 4; sg /= 4; sb /= 4;
      const T = (tol * 2.6) ** 2, seen = new Uint8Array(w * h), st = new Int32Array(w * h); let sp = 0;
      const push = p => { if (seen[p]) return; const i = p * 4, a = d[i] - sr, b = d[i + 1] - sg, q = d[i + 2] - sb; if (a * a + b * b + q * q <= T) { seen[p] = 1; st[sp++] = p; } };
      for (let i = 0; i < w; i++) { push(i); push((h - 1) * w + i); } for (let j = 0; j < h; j++) { push(j * w); push(j * w + w - 1); }
      while (sp) { const p = st[--sp], cx = p % w; d[p * 4 + 3] = 0; if (cx > 0) push(p - 1); if (cx < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < w * (h - 1)) push(p + w); }
      for (let p = 0; p < w * h; p++) if (!seen[p] && ((p % w > 0 && seen[p - 1]) || (p % w < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]))) d[p * 4 + 3] = 110;
      x.putImageData(id, 0, 0); replaceBase(c); E.cut = true; rebuild(); commit(); upd(); toast('Background removed — add a fill color if you like');
    } catch { toast('Cutout failed'); } finally { E.busy = ''; emit(); }
  }, 30);
};
E.aiCutout = async mode => {
  if (!baseImg) return toast('Open a photo first'); E.busy = 'Loading AI model… (first run downloads ~45 MB, then it is cached)'; emit();
  try {
    const { segment } = await import('./ai.mjs'), W = baseImg.width, H = baseImg.height, m = Math.min(1, 1280 / Math.max(W, H)), w = Math.round(W * m), h = Math.round(H * m);
    const src = document.createElement('canvas'); src.width = w; src.height = h; src.getContext('2d').drawImage(baseImg, 0, 0, w, h);
    const a = await segment(src, p => { if (p && p.status === 'progress') { E.busy = `Downloading AI model… ${Math.round(p.progress || 0)}%`; emit(); } }); E.busy = 'Finding the subject…'; emit();
    const mk = document.createElement('canvas'); mk.width = w; mk.height = h; const mx = mk.getContext('2d'), id = mx.createImageData(w, h); for (let i = 0; i < w * h; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a.data[i]; } mx.putImageData(id, 0, 0);
    const cut = document.createElement('canvas'); cut.width = W; cut.height = H; const cx = cut.getContext('2d'); cx.drawImage(baseImg, 0, 0); cx.globalCompositeOperation = 'destination-in'; cx.imageSmoothingQuality = 'high'; cx.drawImage(mk, 0, 0, W, H);
    let out = cut;
    if (mode === 'blur') { out = document.createElement('canvas'); out.width = W; out.height = H; const y = out.getContext('2d'), b = Math.max(W, H) / 55; y.filter = `blur(${b}px)`; y.drawImage(baseImg, -b * 2, -b * 2, W + b * 4, H + b * 4); y.filter = 'none'; y.drawImage(cut, 0, 0); }
    replaceBase(out); E.cut = mode !== 'blur'; rebuild(); commit(); upd(); toast(mode === 'blur' ? 'Portrait blur applied' : 'Background removed');
  } catch (err) { console.error(err); toast('AI model unavailable — check your connection, or use Magic cutout'); } finally { E.busy = ''; emit(); }
};
const loadUrl = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
const toCanvas = i => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return c; };
E.saveProject = () => {
  if (!baseImg) return toast('Open a photo first'); const used = {}; S.layers.forEach(L => { if (L.k) used[L.k] = toCanvas(imgs.get(L.k)).toDataURL('image/png'); });
  const blob = new Blob([JSON.stringify({ v: 1, S: { ...S, sel: null }, cut: E.cut, base: toCanvas(baseImg).toDataURL(E.cut ? 'image/png' : 'image/jpeg', .95), imgs: used })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `project-${Date.now()}.pstudio`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Project saved');
};
E.openProject = async f => {
  try {
    const j = JSON.parse(await f.text()); if (j.v !== 1) throw 0; const bi = await loadUrl(j.base); imgs.clear(); const bk = 'b' + uid++; baseImg = toCanvas(bi); imgs.set(bk, baseImg); const map = {};
    for (const [k, u] of Object.entries(j.imgs)) { const nk = 'i' + uid++; imgs.set(nk, toCanvas(await loadUrl(u))); map[k] = nk; }
    S = { ...fresh(), ...j.S, adj: { ...DEF, ...j.S.adj }, bk, sel: null }; S.layers.forEach(L => { if (L.k) L.k = map[L.k]; L.id = uid++; });
    E.cut = !!j.cut; E.split = null; E.tool = 'move'; E.cropRect = null; fr0 = null; rebuild(); hist = []; hi = -1; commit(); E.zoom = 1; layout(); E.pal = palette(baseImg); upd(); toast('Project opened');
  } catch { toast('Not a valid project file'); }
};
