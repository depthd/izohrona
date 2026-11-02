'use strict';
/* СВЕРКА ПЕРЕВОДА: наш .vmf -> .vmap против того же файла, переведённого ЕГО Hammer.
     node tools/sverka_vmap.js out/izohrona_v139_kusok.vmf <его.vmap.txt>
   Меши сравниваются по порядку (импортёр сохраняет порядок брашей): вершины,
   и у каждой грани — материал, оси развёртки со сдвигом и масштаб. Сущности —
   по виду: какие ключи у нас иначе, чем у него. */
const fs = require('fs');
const path = require('path');
const { parse } = require('../core/kv2');
const { vmfToVmap } = require('../core/vmf2vmap');
const корень = path.join(__dirname, '..');
const образец = fs.readFileSync(path.join(корень, 'data/obrazec.vmap.txt'), 'utf8');
const точки = JSON.parse(fs.readFileSync(path.join(корень, 'data/tekstury_tochek.json'), 'utf8'));
const { vmap, scene } = vmfToVmap(fs.readFileSync(process.argv[2], 'utf8'), образец, точки);
const наш = parse(vmap), его = parse(fs.readFileSync(process.argv[3], 'utf8'));
const мир = d => d.roots.find(r => r.cls === 'CMapRootElement').get('world').get('children');
const st = (arr, n) => (arr.get('streams').find(s => s.get('name') === n) || { get: () => [] }).get('data');
const num = s => s.split(' ').map(Number);
const грани = m => {
  const md = m.get('meshData'), o = num(m.get('origin'));
  const P = st(md.get('vertexData'), 'position:0').map(s => num(s).map((v, k) => +(v + o[k]).toFixed(2)));
  const mats = md.get('materials'), fd = md.get('faceData');
  const sc = st(fd, 'textureScale:0'), U = st(fd, 'textureAxisU:0'), V = st(fd, 'textureAxisV:0'), mi = st(fd, 'materialindex:0');
  const to = md.get('edgeVertexIndices').map(Number), fc = md.get('edgeFaceIndices').map(Number);
  const out = new Map();
  fc.forEach((f, e) => { if (f < 0) return; const r = out.get(f) || { v: [] }; r.v.push(P[to[e]].join(',')); out.set(f, r); });
  const g = [];
  for (const [f, r] of out) g.push({ ключ: r.v.sort().join('|'), мат: mats[+mi[f]], U: num(U[f]), V: num(V[f]), s: num(sc[f]) });
  return { верш: [...new Set(P.map(p => p.join(',')))].sort().join('|'), g };
};
const нМ = мир(наш).filter(c => c.cls === 'CMapMesh'), еМ = мир(его).filter(c => c.cls === 'CMapMesh');
const сч = { мешей: Math.min(нМ.length, еМ.length), форма: 0, граней: 0, мат: 0, оси: 0, сдвиг: 0, масштаб: 0 };
const примеры = [];
const осиПр = [];
// сдвиг в точках картинки: 0 и 512 у картинки в 512 точек — одно и то же
const покругу = (a, b, мат) => { const T = точки[мат.replace('materials/', '').replace('.vmat', '')] || 1024; const d = ((a - b) % T + T) % T; return Math.min(d, T - d) < 0.5; };   // полточки картинки — меньше 0.05u на стене
const близко = (a, b, e) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= e * Math.max(1, Math.abs(b[i])));
for (let i = 0; i < сч.мешей; i++) {
  const a = грани(нМ[i]), b = грани(еМ[i]);
  if (a.верш !== b.верш) { сч.форма++; if (примеры.length < 3) примеры.push(`меш ${i}: форма · наш ${a.верш.slice(0, 160)} · его ${b.верш.slice(0, 160)}`); continue; }
  for (const fb of b.g) {
    const fa = a.g.find(x => x.ключ === fb.ключ);
    if (!fa) { сч.граней++; continue; }
    if (fa.мат !== fb.мат) сч.мат++;
    if (!близко(fa.U.slice(0, 3), fb.U.slice(0, 3), 1e-4) || !близко(fa.V.slice(0, 3), fb.V.slice(0, 3), 1e-4)) { сч.оси++; if (осиПр.length < 3) осиПр.push(`меш ${i} ${fb.мат}: наш U ${fa.U} V ${fa.V} · его U ${fb.U} V ${fb.V}`); }
    else if (!покругу(fa.U[3], fb.U[3], fb.мат) || !покругу(fa.V[3], fb.V[3], fb.мат)) { сч.сдвиг++; if (примеры.length < 6) примеры.push(`меш ${i} ${fb.мат}: сдвиг наш ${fa.U[3]},${fa.V[3]} его ${fb.U[3]},${fb.V[3]}`); }
    if (!близко(fa.s, fb.s, 1e-3)) { сч.масштаб++; if (примеры.length < 9) примеры.push(`меш ${i} ${fb.мат}: масштаб наш ${fa.s} его ${fb.s}`); }
  }
}
console.log(`мешей у нас ${нМ.length}, у него ${еМ.length}; сверено ${сч.мешей}`);
console.log('расхождений:', JSON.stringify(сч));
примеры.forEach(s => console.log('  ' + s));
осиПр.forEach(s => console.log('  оси: ' + s));
if (scene.unknown.length) console.log('материалы без размера картинки:', scene.unknown.join(', '));
// сущности: ключи, где значения разные
const ents = d => { const r = {}; for (const c of мир(d)) if (c.cls === 'CMapEntity') { const ep = c.get('entity_properties'); const k = ep.get('classname'); (r[k] = r[k] || []).push(c); } return r; };
const нЕ = ents(наш), еЕ = ents(его);
for (const cls of Object.keys(еЕ)) {
  const a = (нЕ[cls] || [])[0], b = еЕ[cls][0];
  if (!a) { console.log(`  ${cls}: у нас нет (у него ${еЕ[cls].length})`); continue; }
  const pa = Object.fromEntries(a.get('entity_properties').a.map(x => [x[0], x[2]]));
  const diff = b.get('entity_properties').a.filter(([k, , v]) => k !== 'id' && pa[k] !== v).map(([k, , v]) => `${k}: наш ${pa[k]} его ${v}`);
  const extra = Object.keys(pa).filter(k => !b.get('entity_properties').a.some(x => x[0] === k));
  const o = (a.get('origin') === b.get('origin')) ? '' : ` · origin наш ${a.get('origin')} его ${b.get('origin')}`;
  console.log(`  ${cls} (${(нЕ[cls] || []).length}/${еЕ[cls].length}): ${diff.length ? diff.slice(0, 6).join('; ') : 'ключи совпали'}${extra.length ? ' · лишние у нас: ' + extra.join(',') : ''}${o}`);
}
