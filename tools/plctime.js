/* Где computePlaces тратит время. Гоняется на карте самого генератора. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 300000, polling: 400 });
  const r = await p.evaluate(() => {
    useCur();
    const t = performance.now();
    const P = computePlaces(cur.g, W, H, CELL);
    return { ms: Math.round(performance.now() - t), n: P.count, W, H,
             ent: P.list.map(x => x.ent), area: P.list.map(x => x.area) };
  });
  console.log('сетка', r.W + 'x' + r.H, 'мест', r.n, 'за', r.ms, 'мс');
  console.log('входов:', r.ent.join(' '));
  console.log('площади k u²:', r.area.join(' '));
  await b.close();
})();
