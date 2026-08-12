/* computePlaces вырезается из сборки и гоняется в голом node — так видно, где висит.
   node tools/plcnode.js <билд.html> [карта] */
const fs = require('fs');
const BUILD = process.argv[2] || 'builds/izohrona_v139.html';
const ONLY = process.argv[3] || '';
const html = fs.readFileSync(BUILD, 'utf8');
const a = html.indexOf('const PLC=');
const b = html.indexOf('/* ---------- РАЗМЕТКА КЛЕТОК ПО ЗОНАМ ----------');
if (a < 0 || b < 0) { console.error('не нашёл computePlaces в сборке'); process.exit(1); }
const src = html.slice(a, b);
eval(src);

const data = JSON.parse(fs.readFileSync('data/navraster16.json', 'utf8'));
for (const name in data) {
  if (ONLY && name !== ONLY) continue;
  const d = data[name];
  const g = Buffer.from(d.g, 'base64');
  let floor = 0; for (let i = 0; i < g.length; i++) if (g[i]) floor++;
  const t = Date.now();
  const to = setTimeout(() => { console.log(name, 'ВИСНЕТ >20с'); process.exit(2); }, 20000);
  const P = computePlaces(g, d.W, d.H, d.cell, {entMin:+(process.argv[4]||2)});
  clearTimeout(to);
  const ent = P.list.map(x => x.ent).sort((x, y) => x - y);
  const полk = Math.round(floor * d.cell * d.cell / 1000);
  console.log(`${name.padEnd(9)} ${(d.W + 'x' + d.H).padEnd(10)} пол ${String(полk).padEnd(6)}`
    + ` мест ${String(P.count).padEnd(4)} k/место ${String(Math.round(полk / P.count)).padEnd(5)}`
    + ` нав ${String(d.nav).padEnd(4)} тупиков ${String(P.list.filter(x => x.ent < 2).length).padEnd(4)}`
    + ` вх ${String(ent[ent.length >> 1] || 0).padEnd(2)}/${String(ent[Math.floor(ent.length * 0.9)] || 0).padEnd(2)}/${String(ent[ent.length - 1] || 0).padEnd(3)}`
    + ` крупн ${String(Math.max(...P.list.map(x => x.area))).padEnd(6)} ${Date.now() - t}мс`);
}
