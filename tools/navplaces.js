/* Настоящие карты через ТУ ЖЕ функцию computePlaces, что стоит в сборке.
   Растры навов приходят из tools/navdump.py, страница грузится ради своего кода,
   а не ради генерации. Так пороги «места» подбираются на реальных картах, и число
   мест генератора сравнивается с ними одним прибором.

   node tools/navplaces.js <билд.html> [minR] [mergeK] [minArea]
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BUILD = process.argv[2] || 'builds/izohrona_v137.html';
const opt = { minR: +(process.argv[3] || 96), mergeK: +(process.argv[4] || 0.72),
              minArea: +(process.argv[5] || 96000) };

(async () => {
  const data = JSON.parse(fs.readFileSync('data/navraster16.json', 'utf8'));
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(BUILD));
  await page.waitForFunction('typeof computePlaces === "function"', null, { timeout: 120000 });

  console.log(`\nМЕСТА одним прибором · minR ${opt.minR}u · седло ${opt.mergeK} · крошка <${opt.minArea / 1000}k\n`);
  console.log(['карта', 'пол_k', 'мест', 'k/место', 'имён нав', 'входов<2', 'вх медиана', 'крупнейшее']
    .map(s => s.padEnd(10)).join(''));
  const rows = [];
  for (const name in data) {
    const d = data[name];
    const r = await page.evaluate(([d, opt]) => {
      const raw = atob(d.g), g = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) g[i] = raw.charCodeAt(i);
      const P = computePlaces(g, d.W, d.H, d.cell, opt);
      const ent = P.list.map(p => p.ent).sort((a, b) => a - b);
      let floor = 0; for (let i = 0; i < g.length; i++) if (g[i]) floor++;
      return { n: P.count, полk: Math.round(floor * d.cell * d.cell / 1000),
               туп: P.list.filter(p => p.ent < 2).length,
               entMed: ent[ent.length >> 1] || 0,
               big: Math.max(...P.list.map(p => p.area)) };
    }, [d, opt]);
    rows.push([name, r.полk, r.n, Math.round(r.полk / r.n), d.nav, r.туп, r.entMed, r.big]);
    console.log(rows[rows.length - 1].map(s => String(s).padEnd(10)).join(''));
  }
  const med = k => { const v = rows.map(r => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  console.log(`\nмедиана: мест ${med(2)}, k u² на место ${med(3)}, входов ${med(6)}, тупиков ${med(5)}`);
  await browser.close();
})();
