import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom';
import { GlassButton, GlassCard, GlassInput, GlassMenu, GlassNav, GlassSegmented, GlassSheet, GlassSlider, GlassSwitch } from '@zakisheriff/liquid-glass';
import { E, GROUPS, PRESETS, BLENDS, FONTS, EMOJI, RATIOS } from './engine.mjs';

const h = React.createElement;
const P = {
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'], redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13'],
  rotL: ['M2.5 2v6h6', 'M2.66 15.57a10 10 0 1 0 .57-8.38'], rotR: ['M21.5 2v6h-6', 'M21.34 15.57a10 10 0 1 1-.57-8.38'],
  flip: ['M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3', 'M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3', 'M12 2v20'],
  plus: ['M12 5v14', 'M5 12h14'], minus: ['M5 12h14'], image: ['M3 5h18v14H3z', 'm21 15-5-5L5 21'], type: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  shape: ['M3 3h8v8H3z', 'M17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'], smile: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01', 'M15 9h.01'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'], eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  eyeoff: ['m2 2 20 20', 'M6.7 6.7C3.6 8.5 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.5 4.9-1.3', 'M9.9 4.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'], wand: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'], trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
  up: ['m18 15-6-6-6 6'], down: ['m6 9 6 6 6-6'], kbd: ['M2 6h20v12H2z', 'M6 10h.01', 'M10 10h.01', 'M14 10h.01', 'M18 10h.01', 'M7 14h10'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'], fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'], crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'], layers: ['m12 2 10 5-10 5L2 7z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'],
  compare: ['M12 3v18', 'M3 5h6v14H3z', 'M15 5h6v14h-6z'], moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z']
};
const I = (n, s = 18) => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, ...P[n].map((d, i) => h('path', { key: i, d })));
const Sl = (label, val, min, max, fn, unit = '') => h('div', { className: 'sl', key: label }, h('div', { className: 'sl-h' }, h('span', null, label), h('b', null, Math.round(val) + unit)), h(GlassSlider, { value: val, min, max, step: 1, onChange: fn, 'aria-label': label }));
const Sw = (label, on, fn) => h('div', { className: 'sw', key: label }, h('span', null, label), h(GlassSwitch, { checked: !!on, onChange: fn, 'aria-label': label }));
const Pick = (label, value, items, fn) => h('div', { className: 'sw', key: label }, h('span', null, label, h('b', { className: 'cur' }, value)), h(GlassMenu, { icon: I('down', 16), size: 'sm', 'aria-label': label, items: items.map(([v, n]) => ({ label: n, checked: n === value, onSelect: () => fn(v) })) }));
const Col = (label, value, fn) => h('label', { className: 'sw', key: label }, h('span', null, label), h('input', { type: 'color', value, onChange: e => fn(e.target.value) }));
const Sec = (t, ...c) => h('section', { className: 'sec', key: t }, h('h3', null, t), ...c);
const pickFile = ref => () => ref.current && ref.current.click();

function EditPanel({ fileRef }) {
  const [g, setG] = useState(0), S = E.S, names = Object.keys(GROUPS), A = S.adj, hcRef = useRef();
  useEffect(() => { E.hc = hcRef.current; E.initHist && E.initHist(hcRef.current); }, []);
  const ratio = RATIOS.find(r => r[1] === S.ar) || RATIOS[0];
  return h('div', { className: E.has ? '' : 'dim' },
    Sec('Photo', h('div', { className: 'row nodim' }, h(GlassButton, { variant: 'tinted-filled', icon: I('image'), onClick: pickFile(fileRef) }, 'Open photo'), h(GlassButton, { onClick: E.resetAll }, 'Reset')),
      Pick('Crop aspect', ratio[0], RATIOS.map(([n, v]) => [v, n]), E.setAr),
      h('div', { className: 'row' }, h(GlassButton, { icon: I('rotL'), 'aria-label': 'Rotate left', onClick: () => E.rotate(-1) }), h(GlassButton, { icon: I('rotR'), 'aria-label': 'Rotate right', onClick: () => E.rotate(1) }), h(GlassButton, { icon: I('flip'), 'aria-label': 'Flip', onClick: E.flipPhoto })),
      Sl('Straighten', S.ang, -45, 45, E.straighten, '°')),
    Sec('Presets', h('div', { className: 'chips' }, Object.keys(PRESETS).map(n => h(GlassButton, { key: n, size: 'sm', variant: 'clear', onClick: () => E.preset(n) }, n)))),
    Sec('Adjust', h('canvas', { ref: hcRef, className: 'histo', width: 256, height: 70, 'aria-label': 'Histogram' }),
      h('div', { className: 'row' }, h(GlassButton, { icon: I('wand'), variant: 'tinted', onClick: E.autoEnhance }, 'Auto enhance'), h(GlassButton, { onClick: E.resetAdj }, 'Reset')),
      h(GlassSegmented, { options: names, value: g, onChange: setG, size: 'sm', 'aria-label': 'Adjustment group' }),
      h('div', { className: 'tile' }, GROUPS[names[g]].map(([k, n, a, b]) => Sl(n, A[k], a, b, v => E.adj(k, v))), names[g] === 'Lens' && [Col('Duotone shadows', S.duo[0], v => E.setDuo(0, v)), Col('Duotone lights', S.duo[1], v => E.setDuo(1, v)), Col('Border color', S.bcol, E.setBorderColor)])),
    h('p', { className: 'hint' }, 'Tip: paste or drop images anywhere. Everything stays on your device.'));
}

function LayersPanel({ imgRef }) {
  const S = E.S, L = E.cur, B = E.brush, tools = ['move', 'brush', 'eyedrop'];
  const tile = l => h('li', { key: l.id, className: l.id === S.sel ? 'sel' : '', onClick: () => E.select(l.id) },
    h('button', { className: 'ib', 'aria-label': 'Toggle visibility', onClick: e => { e.stopPropagation(); E.toggleVis(l.id); } }, I(l.vis === false ? 'eyeoff' : 'eye', 16)),
    h('span', null, l.type === 'text' ? 'T · ' + (l.text || '').slice(0, 18) : l.name));
  const props = !L ? null : Sec('Layer',
    h('div', { className: 'row' }, h(GlassButton, { size: 'sm', icon: I('up'), 'aria-label': 'Move up', onClick: () => E.layerAct('up') }), h(GlassButton, { size: 'sm', icon: I('down'), 'aria-label': 'Move down', onClick: () => E.layerAct('down') }), h(GlassButton, { size: 'sm', icon: I('copy'), 'aria-label': 'Duplicate', onClick: () => E.layerAct('dup') }), h(GlassButton, { size: 'sm', destructive: true, icon: I('trash'), 'aria-label': 'Delete', onClick: () => E.layerAct('del') })),
    L.type === 'text' && h(GlassInput, { key: 'txt', label: 'Text', value: L.text, onChange: e => E.patch('text', e.target.value) }),
    L.type === 'text' && Pick('Font', L.font, FONTS.map(f => [f, f]), v => E.patch('font', v)),
    L.type === 'text' && h('div', { className: 'row', key: 'col' }, Col('Fill', L.color, v => E.patch('color', v)), Col('Outline', L.scolor, v => E.patch('scolor', v))),
    L.type === 'text' && Sw('Bold', L.bold, v => E.patch('bold', v)), L.type === 'text' && Sw('Italic', L.italic, v => E.patch('italic', v)),
    L.type === 'text' && Sl('Outline', L.stroke, 0, 30, v => E.patch('stroke', v)),
    L.type === 'shape' && Col('Color', L.color, v => E.patch('color', v)), L.type === 'shape' && Sw('Filled', L.fill, v => E.patch('fill', v)),
    L.type === 'shape' && Sl('Stroke', L.stroke, 1, 40, v => E.patch('stroke', v)), L.type === 'shape' && Sl('Width', L.w, 20, 1200, v => E.patch('w', v)), L.type === 'shape' && Sl('Height', L.h, 4, 1200, v => E.patch('h', v)),
    Sl('Opacity', L.op * 100, 0, 100, v => E.patch('op', v / 100), '%'),
    Pick('Blend', (BLENDS.find(b => b[0] === L.blend) || BLENDS[0])[1], BLENDS, v => E.patch('blend', v)),
    Sl('Size', L.s * 100, 3, 600, v => E.patch('s', v / 100), '%'), Sl('Rotation', L.r, -180, 180, v => E.patch('r', v), '°'), Sl('Shadow', L.sh, 0, 40, v => E.patch('sh', v)),
    Sw('Flip', L.flip, v => E.patch('flip', v)), h(GlassButton, { key: 'ctr', onClick: () => E.layerAct('center') }, 'Center on canvas'));
  return h('div', { className: E.has ? '' : 'dim' },
    Sec('Add', h('div', { className: 'row' }, h(GlassButton, { icon: I('image'), onClick: pickFile(imgRef) }, 'Image'), h(GlassButton, { icon: I('type'), onClick: () => E.addText() }, 'Text')),
      h('div', { className: 'row' }, h(GlassMenu, { icon: I('shape'), 'aria-label': 'Add shape', align: 'start', items: ['rect', 'ellipse', 'line', 'arrow'].map(s => ({ label: s[0].toUpperCase() + s.slice(1), onSelect: () => E.addShape(s) })) }),
        h(GlassMenu, { icon: I('smile'), 'aria-label': 'Add sticker', align: 'start', items: EMOJI.map(e => ({ label: e, onSelect: () => E.addText(e, { name: 'Sticker', bold: false, sh: 6, s: 2 }) })) }))),
    Sec('Tool', h(GlassSegmented, { options: ['Move', 'Brush', 'Pick color'], value: tools.indexOf(E.tool), onChange: i => E.setTool(tools[i]), 'aria-label': 'Tool' }),
      E.tool !== 'move' && h('div', { className: 'tile', key: 'b' }, Sl('Brush size', B.size, 2, 160, v => E.setBrush({ size: v })), Col('Color', B.color, v => E.setBrush({ color: v })), Sw('Eraser', B.erase, v => E.setBrush({ erase: v })))),
    Sec('Layers', h('ul', null, S.layers.length ? [...S.layers].reverse().map(tile) : h('li', { className: 'empty' }, 'No layers yet')), props));
}

function PreviewSheet({ open, onClose }) {
  const [fi, setFi] = useState(0), [zi, setZi] = useState(0), [q, setQ] = useState(92), [o, setO] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [url, setUrl] = useState('');
  const F = ['image/png', 'image/jpeg', 'image/webp'], Z = [1, .75, .5, .25];
  useEffect(() => {
    if (!open) return; let dead = false; setBusy(true); setErr('');
    const t = setTimeout(async () => { try { const r = await E.makeOut(F[fi], q, Z[zi]); if (dead) return; setO(r); setUrl(u => { u && URL.revokeObjectURL(u); return URL.createObjectURL(r.blob); }); } catch { !dead && setErr('This size is too large for your browser. Pick a smaller size.'); } !dead && setBusy(false); }, 220);
    return () => { dead = true; clearTimeout(t); };
  }, [open, fi, zi, q]);
  return h(GlassSheet, { open, onClose, detents: ['large'], 'aria-label': 'Preview and export' }, h('div', { className: 'sheet' },
    h('h2', null, 'Preview & export'), h('div', { className: 'pvimg' }, url && h('img', { src: url, alt: 'Preview of the edited photo' }), busy && h('span', { className: 'busy' }, 'Rendering full quality…')),
    h(GlassSegmented, { options: ['PNG', 'JPG', 'WebP'], value: fi, onChange: setFi, 'aria-label': 'Format' }),
    fi > 0 && Sl('Quality', q, 60, 100, setQ), h(GlassSegmented, { options: ['100%', '75%', '50%', '25%'], value: zi, onChange: setZi, 'aria-label': 'Size' }),
    h('div', { className: 'tile meta' }, err || (o ? h('span', null, h('b', null, o.w + ' × ' + o.h), ' px · ', E.ext(o.fmt).toUpperCase(), ' · ', h('b', null, E.fmtB(o.blob.size))) : '—')),
    h('div', { className: 'row' }, h(GlassButton, { icon: I('copy'), onClick: E.copy }, 'Copy'), h(GlassButton, { variant: 'filled', icon: I('download'), disabled: !o || busy, onClick: () => E.save(o) }, 'Download'))));
}

function Help({ open, onClose }) {
  const K = [['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z', 'Redo'], ['\\ (hold)', 'Compare with original'], ['V / B / I', 'Move / Brush / Pick color'], ['Ctrl/⌘ + D', 'Duplicate layer'], ['Delete', 'Remove layer'], ['Arrows (+Shift)', 'Nudge layer'], ['Ctrl + wheel', 'Zoom']];
  return h(GlassSheet, { open, onClose, 'aria-label': 'Keyboard shortcuts' }, h('div', { className: 'sheet' }, h('h2', null, 'Shortcuts'), ...K.map(([a, b]) => h('div', { className: 'sw', key: a }, h('span', null, b), h('kbd', null, a)))));
}

const MQ = '(max-width: 900px)';
function App() {
  const [, f] = useState(0), [tab, setTab] = useState(0), [pv, setPv] = useState(false), [help, setHelp] = useState(false), [shut, setShut] = useState(false);
  const [dark, setDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches), [mob, setMob] = useState(matchMedia(MQ).matches);
  const cvRef = useRef(), stRef = useRef(), fileRef = useRef(), imgRef = useRef();
  useEffect(() => {
    E.onSelect = () => { setTab(1); setShut(false); }; const m = matchMedia(MQ), fn = () => setMob(m.matches); m.addEventListener('change', fn);
    const off = E.on(() => f(x => x + 1)); E.init(cvRef.current, stRef.current, null); return () => { off(); m.removeEventListener('change', fn); };
  }, []);
  const has = E.has, toggleDark = v => { setDark(v); E.theme(v); };
  const menu = [...(mob ? [{ label: 'Preview & export', icon: I('download', 16), onSelect: () => setPv(true), disabled: !has }, { label: 'Before / after split', icon: I('compare', 16), onSelect: E.toggleSplit, disabled: !has }, { label: dark ? 'Light mode' : 'Dark mode', icon: I('moon', 16), onSelect: () => toggleDark(!dark) }] : []),
    { label: 'Copy to clipboard', icon: I('copy', 16), onSelect: E.copy, disabled: !has }, { label: 'Keyboard shortcuts', icon: I('kbd', 16), onSelect: () => setHelp(true) }];
  const scroll = h('div', { className: 'scroll' }, h('div', { style: { display: tab === 0 ? 'block' : 'none' } }, h(EditPanel, { fileRef })), h('div', { style: { display: tab === 1 ? 'block' : 'none' } }, h(LayersPanel, { imgRef })));
  const splitBtn = h(GlassButton, { size: 'sm', icon: I('compare'), variant: E.split != null ? 'tinted-filled' : 'glass', 'aria-label': 'Before and after split', onClick: E.toggleSplit });
  return h(React.Fragment, null,
    h('input', { ref: fileRef, type: 'file', accept: 'image/*', hidden: true, onChange: e => { E.openBase(e.target.files[0]); e.target.value = ''; } }),
    h('input', { ref: imgRef, type: 'file', accept: 'image/*', hidden: true, onChange: e => { E.openOverlay(e.target.files[0]); e.target.value = ''; } }),
    h('header', null, h('div', { className: 'brand' }, h('span', { className: 'logo' }), h('b', null, 'Photo Studio')),
      h('div', { className: 'hl' }, h(GlassButton, { icon: I('undo'), 'aria-label': 'Undo', disabled: !E.canUndo, onClick: E.undo }), h(GlassButton, { icon: I('redo'), 'aria-label': 'Redo', disabled: !E.canRedo, onClick: E.redo })),
      !mob && h('div', { className: 'hc' }, h(GlassSegmented, { options: ['Edit', 'Layers'], value: tab, onChange: setTab, 'aria-label': 'Panel' })),
      h('div', { className: 'hr' }, !mob && h(GlassSwitch, { checked: dark, onChange: toggleDark, tint: '#5b47f5', 'aria-label': 'Dark mode' }),
        h(GlassButton, { icon: I('compare'), variant: E.cmp ? 'tinted-filled' : 'glass', disabled: !has, onPointerDown: () => E.hold(true), 'aria-label': 'Hold to compare with original' }),
        !mob && h(GlassButton, { disabled: !has, onClick: () => setPv(true) }, 'Preview'),
        mob ? h(GlassButton, { variant: 'filled', icon: I('download'), 'aria-label': 'Download', disabled: !has, onClick: E.quickSave }) : h(GlassButton, { variant: 'filled', icon: I('download'), disabled: !has, onClick: E.quickSave }, 'Download'),
        h(GlassMenu, { icon: I('more'), 'aria-label': 'More', items: menu }))),
    h('main', null,
      h('section', { className: 'stage', ref: stRef },
        h('canvas', { ref: cvRef, width: 900, height: 600, tabIndex: 0, 'aria-label': 'Photo canvas', className: has ? '' : 'gone' }),
        !has && h(GlassCard, { className: 'empty', padding: '32px 24px', radius: '30px' }, h('div', { className: 'ring' }), h('h2', null, 'Drop a photo to start'), h('p', null, 'Or paste one from your clipboard. Your images never leave this device.'), h(GlassButton, { variant: 'filled', size: 'lg', onClick: pickFile(fileRef) }, 'Choose photo'))),
      !mob && h(GlassCard, { className: 'side', padding: '6px', radius: '28px' }, scroll)),
    mob ? h('div', { className: 'dock' },
      h('div', { className: 'mbar' }, h(GlassButton, { size: 'sm', icon: I('fit'), 'aria-label': 'Fit to screen', onClick: () => E.setZoom(1) }), splitBtn, h('span', { className: 'info' }, has ? E.info.split(' · ')[0] : ''), h('span', { className: 'sp' }), h(GlassButton, { size: 'sm', icon: I(shut ? 'up' : 'down'), 'aria-label': shut ? 'Show tools' : 'Hide tools', onClick: () => setShut(!shut) })),
      h('div', { className: 'dpanel' + (shut ? ' shut' : '') }, h(GlassCard, { className: 'side', padding: '6px', radius: '26px' }, scroll)),
      h(GlassNav, { items: [{ label: 'Edit', icon: I('sliders', 22) }, { label: 'Layers', icon: I('layers', 22) }], activeIndex: tab, onChange: i => { setTab(i); setShut(false); }, showLabels: true }))
    : h(GlassCard, { className: 'bar', padding: '6px 10px', radius: '99px' }, h(GlassButton, { size: 'sm', icon: I('minus'), 'aria-label': 'Zoom out', onClick: () => E.setZoom(E.zoom / 1.2) }),
      h('div', { className: 'zs' }, h(GlassSlider, { value: Math.round(E.zoom * 100), min: 25, max: 400, step: 1, onChange: v => E.setZoom(v / 100), 'aria-label': 'Zoom' })),
      h(GlassButton, { size: 'sm', icon: I('plus'), 'aria-label': 'Zoom in', onClick: () => E.setZoom(E.zoom * 1.2) }), h(GlassButton, { size: 'sm', icon: I('fit'), 'aria-label': 'Fit', onClick: () => E.setZoom(1) }), splitBtn, h('span', { className: 'info' }, E.info)),
    h(PreviewSheet, { open: pv, onClose: () => setPv(false) }), h(Help, { open: help, onClose: () => setHelp(false) }),
    h('div', { id: 'toast', className: E.msg ? 'show' : '' }, E.msg));
}
createRoot(document.getElementById('root')).render(h(App));
