'use strict';
/* ОБРАЗЕЦ ДЛЯ ЗАПИСИ .vmap — из файла, сохранённого ЕГО Hammer.
   Берётся каркас карты, один меш и по одной сущности каждого вида. Запись
   .vmap клонирует отсюда, а не выдумывает атрибуты.
     node tools/obrazec.js <его.vmap.txt> data/obrazec.vmap.txt */
const fs = require('fs');
const { parse, write, idGen } = require('../core/kv2');
const doc = parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = doc.roots.find(r => r.cls === 'CMapRootElement');
const world = root.get('world');
const kids = world.get('children');
const keep = [kids.find(c => c.cls === 'CMapMesh')];
const seen = new Set();
for (const c of kids) if (c.cls === 'CMapEntity') {
  const cls = c.get('entity_properties').get('classname');
  if (!seen.has(cls)) { seen.add(cls); keep.push(c); }
}
world.put('children', 'element_array', keep);
const pre = doc.roots.find(r => r.cls === '$prefix_element$');
if (pre) pre.put('map_asset_references', 'string_array', []);
fs.writeFileSync(process.argv[3], write(doc, idGen(7).uuid));
console.log('editorbuild', root.get('editorbuild'), '· сущности:', [...seen].join(', '));
