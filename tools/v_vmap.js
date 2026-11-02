'use strict';
/* Целая карта .vmf -> .vmap (тот же перевод, что в кнопке продукта).
     node tools/v_vmap.js <карта.vmf> <карта.vmap> */
const fs = require('fs');
const path = require('path');
const { vmfToVmap } = require('../core/vmf2vmap');
const к = path.join(__dirname, '..');
const t0 = Date.now();
const { vmap, scene } = vmfToVmap(fs.readFileSync(process.argv[2], 'utf8'),
  fs.readFileSync(path.join(к, 'data/obrazec.vmap.txt'), 'utf8'),
  JSON.parse(fs.readFileSync(path.join(к, 'data/tekstury_tochek.json'), 'utf8')));
fs.writeFileSync(process.argv[3], vmap);
const виды = {}; for (const e of scene.ents) виды[e.cls] = (виды[e.cls] || 0) + 1;
console.log(`мешей ${scene.polys.length}, сущностей ${scene.ents.length}, ${Math.round(vmap.length / 1048576)} МБ, ${Date.now() - t0} мс`);
console.log('сущности:', JSON.stringify(виды));
if (scene.unknown.length) console.log('материалы без размера картинки (взято 1024):', scene.unknown.join(', '));
