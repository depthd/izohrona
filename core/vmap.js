'use strict';
/* ЗАПИСЬ .vmap (Hammer CS2) БЕЗ .vmf-ПОСРЕДНИКА.

   Каркас файла и каждый меш берутся из ОБРАЗЦА — файла, сохранённого его
   Hammer (`data/yashiki.vmap.txt`, editorbuild 10869). Мы ничего не
   выдумываем про атрибуты: клонируем элемент из образца и заменяем только
   геометрию. Точечные сущности (спавны, свет) в образце не встречаются —
   их форма взята из открытого cs2-mapgen (MIT), сверенного автором с Hammer.

   Меш в Source 2 — «полурёберная» сетка: у каждого ребра две половинки,
   по одной на каждую из граней по обе стороны. Половинка знает вершину, в
   которую идёт, свою грань, следующую половинку по кругу грани и свою пару. */

const { El, parse, write, idGen } = require('./kv2');

const fmt = x => { const r = Math.round(x * 10000) / 10000; return String(Object.is(r, -0) ? 0 : r); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit(n);
}

/* Оси текстуры по нормали грани — как в Source и как в образце:
   пол/потолок U=(1,0,0) V=(0,-1,0); стена поперёк X U=(0,1,0); поперёк Y U=(1,0,0). */
function texAxes(n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (az >= ax && az >= ay) return [[1, 0, 0], [0, -1, 0]];
  if (ax >= ay) return [[0, 1, 0], [0, 0, -1]];
  return [[1, 0, 0], [0, 0, -1]];
}

/* Коробка как многогранник. Грани против часовой, если смотреть снаружи. */
function boxPoly(b) {
  const { x0, y0, z0, x1, y1, z1 } = b;
  const verts = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
                 [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[4, 5, 6, 7], [0, 3, 2, 1], [1, 2, 6, 5], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4]];
  return { verts, faces: faces.map(v => ({ v })) };
}

/* Текстура грани по правилу из CLAUDE.md 5.3:
   'мир' (М) — общая сетка мира, скейл постоянный, шов где придётся;
   'грань' (Ф) — ровно одна картинка на грань, шов на рёбрах (ящик). */
function faceTex(pts, n, tex) {
  const [U, V] = texAxes(n);
  const T = tex.size || 512;
  if (tex.rule === 'грань') {
    const us = pts.map(p => dot(p, U)), vs = pts.map(p => dot(p, V));
    const umin = Math.min(...us), vmin = Math.min(...vs);
    const su = Math.max(1, Math.max(...us) - umin) / T, sv = Math.max(1, Math.max(...vs) - vmin) / T;
    return { U: [...U, -umin / su], V: [...V, -vmin / sv], scale: [su, sv], T };
  }
  const s = tex.scale || 0.25;
  return { U: [...U, 0], V: [...V, 0], scale: [s, s], T };
}

/* Многогранник -> полурёберная сетка в точности тех массивов, что пишет Hammer. */
function halfEdges(poly) {
  const he = [];                 // {to, face, next, opp}
  const byKey = new Map();
  const loops = [];
  poly.faces.forEach((f, fi) => {
    const loop = [];
    for (let i = 0; i < f.v.length; i++) {
      const a = f.v[i], b = f.v[(i + 1) % f.v.length];
      let e = byKey.get(a + ',' + b);
      if (e === undefined) {
        e = he.length;
        he.push({ to: b, face: -1, opp: e + 1 }, { to: a, face: -1, opp: e });
        byKey.set(a + ',' + b, e);
        byKey.set(b + ',' + a, e + 1);
      }
      if (he[e].face !== -1) throw new Error('ребро ' + a + '→' + b + ' дважды: грани смотрят не наружу');
      he[e].face = fi;
      loop.push(e);
    }
    loop.forEach((e, i) => { he[e].next = loop[(i + 1) % loop.length]; });
    loops.push(loop);
  });
  he.forEach((h, e) => { if (h.face < 0) throw new Error('сетка не замкнута у ребра ' + e); });
  const vEdge = poly.verts.map(() => -1);
  he.forEach((h, e) => { const from = he[h.opp].to; if (vEdge[from] < 0) vEdge[from] = e; });
  return { he, loops, vEdge };
}

function loadTemplate(text) {
  const doc = parse(text);
  const root = doc.roots.find(r => r.cls === 'CMapRootElement');
  const world = root.get('world');
  const mesh = world.get('children').find(c => c.cls === 'CMapMesh');
  if (!mesh) throw new Error('в образце нет ни одного CMapMesh');
  return { doc, root, world, mesh };
}

function streamOf(arr, name) {
  return arr.get('streams').find(s => s.get('name') === name);
}

/* parts: [{poly, mats:[...] , faceMat:[i...], faceTex:[{...}]}] — один CMapMesh. */
function meshEl(tpl, poly, texOf, matOf, idg, node) {
  const m = tpl.mesh.clone();
  const md = m.get('meshData');
  const o = [0, 1, 2].map(k => {
    const vs = poly.verts.map(p => p[k]);
    return Math.round((Math.min(...vs) + Math.max(...vs)) / 2);
  });
  const { he, loops, vEdge } = halfEdges(poly);
  const mats = [];
  const faceMat = poly.faces.map((f, fi) => {
    const p = matOf(fi); let k = mats.indexOf(p); if (k < 0) { mats.push(p); k = mats.length - 1; } return k; });
  const ft = poly.faces.map((f, fi) => {
    const pts = f.v.map(i => poly.verts[i]);
    const n = newell(pts);
    return { n, t: faceTex(pts, n, texOf(fi, n)) };
  });
  const H = he.length;
  md.put('vertexEdgeIndices', 'int_array', vEdge.map(String));
  md.put('vertexDataIndices', 'int_array', poly.verts.map((_, i) => String(i)));
  md.put('edgeVertexIndices', 'int_array', he.map(h => String(h.to)));
  md.put('edgeOppositeIndices', 'int_array', he.map(h => String(h.opp)));
  md.put('edgeNextIndices', 'int_array', he.map(h => String(h.next)));
  md.put('edgeFaceIndices', 'int_array', he.map(h => String(h.face)));
  md.put('edgeDataIndices', 'int_array', he.map((_, e) => String(e >> 1)));
  md.put('edgeVertexDataIndices', 'int_array', he.map((_, e) => String(e)));
  md.put('faceEdgeIndices', 'int_array', loops.map(l => String(l[0])));
  md.put('faceDataIndices', 'int_array', loops.map((_, i) => String(i)));
  md.put('materials', 'string_array', mats);

  const vd = md.get('vertexData'), fvd = md.get('faceVertexData'), ed = md.get('edgeData'), fd = md.get('faceData');
  vd.put('size', 'int', String(poly.verts.length));
  streamOf(vd, 'position:0').put('data', 'vector3_array', poly.verts.map(p => sub(p, o).map(fmt).join(' ')));
  fvd.put('size', 'int', String(H));
  const tc = [], nr = [], tg = [];
  he.forEach(h => {
    const { n, t } = ft[h.face];
    const p = poly.verts[h.to];
    tc.push(fmt((dot(p, t.U) / t.scale[0] + t.U[3]) / t.T) + ' ' + fmt((dot(p, t.V) / t.scale[1] + t.V[3]) / t.T));
    nr.push(n.map(fmt).join(' '));
    const w = dot(cross(n, t.U), t.V) >= 0 ? 1 : -1;
    tg.push([t.U[0], t.U[1], t.U[2], w].map(fmt).join(' '));
  });
  streamOf(fvd, 'texcoord:0').put('data', 'vector2_array', tc);
  streamOf(fvd, 'normal:0').put('data', 'vector3_array', nr);
  streamOf(fvd, 'tangent:0').put('data', 'vector4_array', tg);
  ed.put('size', 'int', String(H / 2));
  streamOf(ed, 'flags:0').put('data', 'int_array', Array(H / 2).fill('0'));
  const F = poly.faces.length;
  fd.put('size', 'int', String(F));
  streamOf(fd, 'textureScale:0').put('data', 'vector2_array', ft.map(f => f.t.scale.map(fmt).join(' ')));
  streamOf(fd, 'textureAxisU:0').put('data', 'vector4_array', ft.map(f => f.t.U.map(fmt).join(' ')));
  streamOf(fd, 'textureAxisV:0').put('data', 'vector4_array', ft.map(f => f.t.V.map(fmt).join(' ')));
  streamOf(fd, 'materialindex:0').put('data', 'int_array', faceMat.map(String));
  for (const nm of ['flags:0', 'lightmapScaleBias:0']) { const s = streamOf(fd, nm); if (s) s.put('data', 'int_array', Array(F).fill('0')); }
  md.get('subdivisionData').put('subdivisionLevels', 'int_array', Array(H).fill('0'));

  m.put('nodeID', 'int', String(node));
  m.put('referenceID', 'uint64', idg.ref());
  m.put('randomSeed', 'int', String(idg.int()));
  m.put('origin', 'vector3', o.join(' '));
  return { el: m, mats };
}

function plug() {
  return new El('DmePlugList').set('id', 'elementid', '')
    .set('names', 'string_array', []).set('dataTypes', 'int_array', [])
    .set('plugTypes', 'int_array', []).set('descriptions', 'string_array', []);
}

function entityEl(cls, origin, props, angles, idg, node) {
  const ep = new El('EditGameClassProps').set('id', 'elementid', '').set('classname', 'string', cls);
  for (const k in props || {}) ep.set(k, 'string', String(props[k]));
  const pin = new El('DmElement').set('id', 'elementid', '').set('name', 'string', 'transformPin')
    .set('referenceName', 'string', '').set('targetReferenceID', 'uint64', '0x0')
    .set('offsetOrigin', 'vector3', '0 0 0').set('offsetAngles', 'qangle', '0 0 0')
    .set('pinAngles', 'bool', '1').set('twoWay', 'bool', '0');
  return new El('CMapEntity').set('id', 'elementid', '')
    .set('nodeID', 'int', String(node)).set('referenceID', 'uint64', idg.ref())
    .set('children', 'element_array', []).set('variableTargetKeys', 'string_array', [])
    .set('variableNames', 'string_array', []).set('relayPlugData', 'DmePlugList', plug())
    .set('connectionsData', 'element_array', []).set('entity_properties', 'EditGameClassProps', ep)
    .set('hitNormal', 'vector3', '0 0 1').set('isProceduralEntity', 'bool', '0')
    .set('origin', 'vector3', origin.map(fmt).join(' ')).set('angles', 'qangle', (angles || [0, 0, 0]).map(fmt).join(' '))
    .set('scales', 'vector3', '1 1 1').set('transformLocked', 'bool', '0')
    .set('transformPin', 'DmElement', pin).set('force_hidden', 'bool', '0')
    .set('editorOnly', 'bool', '0').set('customVisGroup', 'string', '').set('randomSeed', 'int', String(idg.int()));
}

/* scene: {boxes:[{x0..z1, mat, tex:{rule,size,scale}}], points:[{cls, at:[x,y,z], props, angles}], camera} */
function toVmap(scene, templateText, seed) {
  const tpl = loadTemplate(templateText);
  const idg = idGen(seed || 1);
  let node = 2;
  const kids = [], allMats = new Set();
  for (const b of scene.boxes) {
    const { el, mats } = meshEl(tpl, boxPoly(b), () => b.tex || {}, () => 'materials/' + b.mat + '.vmat', idg, node++);
    mats.forEach(x => allMats.add(x));
    kids.push(el);
  }
  for (const p of scene.points || []) kids.push(entityEl(p.cls, p.at, p.props, p.angles, idg, node++));
  const doc = { header: tpl.doc.header, roots: tpl.doc.roots.map(r => r.clone()) };
  const root = doc.roots.find(r => r.cls === 'CMapRootElement');
  root.get('world').put('children', 'element_array', kids);
  const pre = doc.roots.find(r => r.cls === '$prefix_element$');
  if (pre) pre.put('map_asset_references', 'string_array', [...allMats].sort());
  if (scene.camera) {
    const c = root.get('defaultcamera');
    c.put('position', 'vector3', scene.camera.pos.map(fmt).join(' '));
    c.put('lookat', 'vector3', scene.camera.at.map(fmt).join(' '));
  }
  return write(doc, idg.uuid);
}

module.exports = { toVmap, boxPoly, halfEdges, newell, texAxes };
