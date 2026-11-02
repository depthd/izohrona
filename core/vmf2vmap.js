'use strict';
/* ПЕРЕВОД .vmf -> .vmap так же, как это делает его Hammer при импорте.

   Зачем. Генератор умеет печатать .vmf, а Hammer при импорте переводит его
   с потерями: масштаб текстур делит на размер картинки, ключи Source 2 у
   солнца выбрасывает. Здесь тот же перевод, но под нашим контролем — и целая
   карта сразу в .vmap, без ручного импорта.

   Сверка — `tools/sverka_vmap.js`: наш перевод против перевода его Hammer на
   одном и том же файле (`out/izohrona_v139_kusok.vmf` ↔ его primer.vmap). */

const { toVmap } = require('./vmap');

/* ---- разбор .vmf: блоки `имя { ... }` и пары "ключ" "значение" ---- */
function parseVmf(text) {
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|([A-Za-z_][\w]*)/g;
  const root = { name: '', kv: [], kids: [] };
  const stack = [root];
  let m, pendingKey = null, pendingName = null;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[2] === '{') {
      const n = { name: pendingName || '', kv: [], kids: [] };
      top.kids.push(n); stack.push(n); pendingName = null; pendingKey = null;
    } else if (m[2] === '}') { stack.pop(); pendingKey = null; pendingName = null; }
    else if (m[3] !== undefined) pendingName = m[3];
    else if (pendingKey === null) pendingKey = m[1];
    else { top.kv.push([pendingKey, m[1]]); pendingKey = null; }
  }
  return root;
}
const kvGet = (n, k) => { const r = n.kv.find(x => x[0] === k); return r ? r[1] : undefined; };

/* ---- браш (набор плоскостей) -> выпуклый многогранник ---- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
const snap = v => (Math.abs(v - Math.round(v)) < 1e-4 ? Math.round(v) + 0 : v);

function solidPoly(solid, texSizes, unknown) {
  const planes = [];
  for (const s of solid.kids.filter(k => k.name === 'side')) {
    const pts = (kvGet(s, 'plane').match(/\(([^)]+)\)/g) || []).map(t => t.slice(1, -1).trim().split(/\s+/).map(Number));
    if (pts.length !== 3) continue;
    // VMF: три точки по часовой снаружи, внешняя нормаль = (p1-p2) x (p3-p2) — как в tools/vise.py
    const n = norm(cross(sub(pts[0], pts[1]), sub(pts[2], pts[1])));
    const mat = (kvGet(s, 'material') || 'tools/toolsnodraw').toLowerCase();
    const ax = k => { const mm = /\[\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\]\s*([-\d.e]+)/.exec(kvGet(s, k) || '');
      return mm ? mm.slice(1).map(Number) : [1, 0, 0, 0, 0.25]; };
    planes.push({ n, d: dot(n, pts[0]), mat, u: ax('uaxis'), v: ax('vaxis') });
  }
  const verts = [], key = new Map();
  const EPS = 0.01;   // юнита, постоянный: доля от координаты на тонком браше больше самого браша
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const A = planes[i], B = planes[j], C = planes[k];
    const bc = cross(B.n, C.n), det = dot(A.n, bc);
    if (Math.abs(det) < 1e-9) continue;
    const ca = cross(C.n, A.n), ab = cross(A.n, B.n);
    const p = [0, 1, 2].map(t => snap((A.d * bc[t] + B.d * ca[t] + C.d * ab[t]) / det));
    if (planes.some(P => dot(P.n, p) > P.d + EPS)) continue;
    const kk = p.map(x => x.toFixed(3)).join(',');
    if (!key.has(kk)) { key.set(kk, verts.length); verts.push(p); }
  }
  const faces = [];
  for (const P of planes) {
    const on = [];
    verts.forEach((p, i) => { if (Math.abs(dot(P.n, p) - P.d) < EPS) on.push(i); });
    if (on.length < 3) continue;
    const c = [0, 1, 2].map(t => on.reduce((s, i) => s + verts[i][t], 0) / on.length);
    const u0 = norm(sub(verts[on[0]], c)), w0 = cross(P.n, u0);
    on.sort((a, b) => {
      const da = sub(verts[a], c), db = sub(verts[b], c);
      return Math.atan2(dot(da, w0), dot(da, u0)) - Math.atan2(dot(db, w0), dot(db, u0));
    });
    const T = texSizes[P.mat] || (unknown && unknown.add(P.mat), 1024);
    // импортёр его Hammer: скейл_vmap = скейл_vmf * 16 / точек_в_картинке (data/tekstury_tochek.json)
    // и сдвиг × (точек/16), по кругу картинки: ящик 256 → ×16 (−576.89×16 mod 256 = 241.78,
    // ровно как у него), дерево 1024 → ×64. Импортёр будто считает картинку Source 1 в 16 точек.
    const sh = a => [a[0], a[1], a[2], (((a[3] * T / 16) % T) + T) % T];
    faces.push({ v: on, mat: P.mat, tex: { U: sh(P.u), V: sh(P.v), scale: [P.u[4] * 16 / T, P.v[4] * 16 / T], size: T } });
  }
  return faces.length >= 4 ? { verts, faces } : null;
}

/* ---- сущности: ключи как есть, солнце — как переводит импортёр ---- */
const НЕ_БЕРЁТ = { light_omni2: ['brightness_lumens'], light_environment: ['angulardiameter'] };
function entProps(e) {
  const skip = new Set(['id', 'classname', 'origin', 'angles']);
  const props = {};
  for (const [k, v] of e.kv) if (!skip.has(k)) props[k] = v;
  const cls = kvGet(e, 'classname');
  let angles = (kvGet(e, 'angles') || '0 0 0').split(/\s+/).map(Number);
  if (cls === 'light_environment') {
    // замер по его primer: brightness = _light[3]/255, skyintensity = _ambient[3]/255,
    // наклон солнца = -pitch; ключи Source 2 из .vmf импортёр перекрывает
    const L = (props._light || '255 255 255 200').split(/\s+/).map(Number);
    const A = (props._ambient || '255 255 255 20').split(/\s+/).map(Number);
    props.color = L.slice(0, 3).join(' '); props.brightness = (L[3] / 255).toFixed(6);
    props.skycolor = A.slice(0, 3).join(' '); props.skyintensity = (A[3] / 255).toFixed(6);
    if (props.pitch !== undefined) angles = [-Number(props.pitch), angles[1], angles[2]];
    for (const k of ['_light', '_ambient', 'pitch']) delete props[k];
  }
  // Ключи, которые импортёр его Hammer НЕ принимает и ставит свои (сверка с primer):
  // повторяем это, чтобы карта выглядела так же, как после ручного импорта.
  for (const k of (НЕ_БЕРЁТ[cls] || [])) delete props[k];
  return { cls, props, angles };
}

function vmfToScene(text, texSizes) {
  const root = parseVmf(text);
  const unknown = new Set();
  const world = root.kids.find(k => k.name === 'world');
  const polys = [];
  for (const s of world.kids.filter(k => k.name === 'solid')) {
    const poly = solidPoly(s, texSizes, unknown);
    if (poly) polys.push({ poly });
  }
  const ents = [];
  for (const e of root.kids.filter(k => k.name === 'entity')) {
    const { cls, props, angles } = entProps(e);
    const o = kvGet(e, 'origin');
    const ps = e.kids.filter(k => k.name === 'solid').map(s => solidPoly(s, texSizes, unknown)).filter(Boolean).map(poly => ({ poly }));
    // брашевая зона без origin у импортёра стоит в 0 0 0, меш — в своём центре
    ents.push({ cls, props, angles, at: o ? o.split(/\s+/).map(Number) : [0, 0, 0], polys: ps });
  }
  // небо: импортёр сам добавляет пустой env_sky «default_sky» — так было и у старых карт
  if (!ents.some(e => e.cls === 'env_sky')) ents.push({ cls: 'env_sky', props: { targetname: 'default_sky' }, angles: [0, 0, 0], at: [0, 0, 0], polys: [] });
  return { polys, ents, unknown: [...unknown] };
}

function vmfToVmap(text, templateText, texSizes, seed) {
  const scene = vmfToScene(text, texSizes);
  return { vmap: toVmap(scene, templateText, seed || 1, texSizes), scene };
}

module.exports = { parseVmf, solidPoly, vmfToScene, vmfToVmap };
