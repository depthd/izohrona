/* Настоящие карты через ТУ ЖЕ функцию computePlaces, что стоит в сборке, с таймингом.
   node tools/navplaces2.js <билд.html> [minR] [mergeK] [minArea] */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BUILD = process.argv[2] || 'builds/izohrona_v120.html';
const opt = { minR: +(process.argv[3] || 96), mergeK: +(process.argv[4] || 0.72),
              minArea: +(process.argv[5] || 96000) };
(async () => {
  const data = JSON.parse(fs.readFileSync('data/navraster16.json', 'utf8'));
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(BUILD));
  await p.waitForFunction('typeof computePlaces==="function"', null, { timeout: 120000 });
  const acc = [];
  for (const name in data) {
    const d = data[name];
    const t0 = Date.now();
    let r;
    try {
      r = await p.evaluate(([d, opt]) => {
        const raw = atob(d.g), g = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) g[i] = raw.charCodeAt(i);
        let floor = 0; for (let i = 0; i < g.length; i++) if (g[i]) floor++;
        const t = performance.now();
        const P = computePlaces(g, d.W, d.H, d.cell, opt);
        const ent = P.list.map(x => x.ent).sort((a, b) => a - b);
        return { n: P.count, полk: Math.round(floor * d.cell * d.cell / 1000),
                 туп: P.list.filter(x => x.ent < 2).length, entMed: ent[ent.length >> 1] || 0,
                 big: Math.max(...P.list.map(x => x.area)), ms: Math.round(performance.now() - t),
                 grid: d.W + 'x' + d.H };
      }, [d, opt]);
    } catch (e) { console.log(name, 'УПАЛ', e.message.split('\n')[0]); continue; }
    acc.push([r.n, Math.round(r.полk / r.n), r.entMed, r.туп]);
    console.log(`${name.padEnd(9)} ${r.grid.padEnd(9)} пол ${String(r.полk).padEnd(6)} мест ${String(r.n).padEnd(4)}`
      + ` k/место ${String(Math.round(r.полk / r.n)).padEnd(5)} нав ${String(d.nav).padEnd(4)}`
      + ` тупиков ${String(r.туп).padEnd(4)} вхМед ${String(r.entMed).padEnd(3)} крупн ${String(r.big).padEnd(6)} ${r.ms}мс`);
  }
  const med = k => { const v = acc.map(r => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  if (acc.length) console.log(`\nмедиана: мест ${med(0)} · k u² на место ${med(1)} · входов ${med(2)} · тупиков ${med(3)}`);
  await b.close();
})();
