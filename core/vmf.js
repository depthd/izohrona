'use strict';
/* Запасной выход: те же коробки в .vmf. Нужен для двух вещей — старые приборы
   (`tools/vise.py`, `tools/predmet.py`) читают только .vmf, и если .vmap
   почему-то не откроется в Hammer, этот файл откроется точно.
   Порядок точек плоскости — как в продукте v139 (функция box в экспорте).
   Скейл текстуры пишется ×16: импортёр CS2 делит его на 16 (CLAUDE.md, 5.3). */

const { texAxes } = require('./vmap');

function toVmf(scene, comment) {
  let id = 1;
  const nid = () => id++;
  const ax = (n, b, key) => {
    const [U, V] = texAxes(n);
    const t = b.tex || {};
    const s = (t.scale || 0.25) * 16;
    const a = key === 'u' ? U : V;
    return `[${a.join(' ')} 0] ${s}`;
  };
  const side = (p1, p2, p3, n, b) =>
    `\tside\n\t{\n\t\t"id" "${nid()}"\n\t\t"plane" "(${p1}) (${p2}) (${p3})"\n\t\t"material" "${b.mat.toUpperCase()}"\n` +
    `\t\t"uaxis" "${ax(n, b, 'u')}"\n\t\t"vaxis" "${ax(n, b, 'v')}"\n\t\t"rotation" "0"\n\t\t"lightmapscale" "16"\n\t\t"smoothing_groups" "0"\n\t}`;
  const solid = b => {
    const { x0, y0, z0, x1, y1, z1 } = b;
    const s = [
      side(`${x0} ${y1} ${z1}`, `${x1} ${y1} ${z1}`, `${x1} ${y0} ${z1}`, [0, 0, 1], b),
      side(`${x0} ${y0} ${z0}`, `${x1} ${y0} ${z0}`, `${x1} ${y1} ${z0}`, [0, 0, -1], b),
      side(`${x0} ${y1} ${z1}`, `${x0} ${y0} ${z1}`, `${x0} ${y0} ${z0}`, [-1, 0, 0], b),
      side(`${x1} ${y1} ${z0}`, `${x1} ${y0} ${z0}`, `${x1} ${y0} ${z1}`, [1, 0, 0], b),
      side(`${x1} ${y1} ${z1}`, `${x0} ${y1} ${z1}`, `${x0} ${y1} ${z0}`, [0, 1, 0], b),
      side(`${x1} ${y0} ${z0}`, `${x0} ${y0} ${z0}`, `${x0} ${y0} ${z1}`, [0, -1, 0], b)];
    return `solid\n{\n\t"id" "${nid()}"\n${s.join('\n')}\n}`;
  };
  const ent = p => {
    const kv = Object.assign({ classname: p.cls, origin: p.at.join(' '), angles: (p.angles || [0, 0, 0]).join(' ') }, p.props || {});
    return `entity\n{\n\t"id" "${nid()}"\n` + Object.keys(kv).map(k => `\t"${k}" "${kv[k]}"`).join('\n') + '\n}';
  };
  const world = `world\n{\n\t"id" "${nid()}"\n\t"mapversion" "1"\n\t"classname" "worldspawn"\n\t"skyname" "sky_dust"\n\t"comment" "${comment || ''}"\n` +
    scene.boxes.map(solid).join('\n').replace(/^/gm, '\t') + '\n}';
  return `versioninfo\n{\n\t"editorversion" "400"\n\t"editorbuild" "8000"\n\t"mapversion" "1"\n\t"formatversion" "100"\n\t"prefab" "0"\n}\n` +
    `visgroups\n{\n}\nviewsettings\n{\n\t"bSnapToGrid" "1"\n\t"bShowGrid" "1"\n\t"nGridSpacing" "16"\n}\n` +
    world + '\n' + (scene.points || []).map(ent).join('\n') + '\ncameras\n{\n\t"activecamera" "-1"\n}\ncordon\n{\n\t"mins" "(-1024 -1024 -1024)"\n\t"maxs" "(1024 1024 1024)"\n\t"active" "0"\n}\n';
}

module.exports = { toVmf };
