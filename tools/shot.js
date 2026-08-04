/* Прогон сборки в настоящем Chromium: генерация, снимок канвы, выгрузка .vmf.
   Под jsdom buildVMF() падает с v91, поэтому экспорт до сих пор не проверялся автоматически.

   node tools/shot.js <билд.html> <сколько карт> <куда класть> */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BUILD = process.argv[2] || 'builds/izohrona_v96.html';
const N     = +(process.argv[3] || 3);
const OUT   = process.argv[4] || 'out';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // в образе лежит свой Chromium, версия не совпадает с той, что тянет playwright
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(BUILD));
  await page.waitForSelector('#map');

  const probe = await page.evaluate(() => ({
    hasGen: !!document.getElementById('gen'),
    fns: ['buildVMF', 'downloadRadar', 'makeCover', 'planStructures'].filter(f => typeof window[f] === 'function'),
    toggles: [...document.querySelectorAll('.tg input')].map(i => ({ id: i.id, on: i.checked })),
  }));
  console.log('probe:', JSON.stringify(probe, null, 1));

  for (let i = 0; i < N; i++) {
    // cur объявлен через let: он в лексической области скрипта, а не на window.
    // Обращаться можно только по голому имени — ровно та же грабля, что в dump.js.
    const prev = await page.evaluate('typeof cur!=="undefined" && cur ? cur.seed : -1');
    await page.click('#gen');
    await page.waitForFunction(
      `typeof cur!=="undefined" && cur && cur.g && cur.seed !== ${prev}`,
      null, { timeout: 240000, polling: 500 });
    await page.waitForTimeout(1200);

    const info = await page.evaluate(`({
      seed: cur.seed, cell: CELL, w: W, h: H,
      cover: (cur.cover || []).length,
      rot: (cur.cover || []).filter(c => c.rot).length,
      doors: ((cur.plan || {}).doors || []).length,
      hgts: [...new Set((cur.cover || []).map(c => c.hgt))],
      foot: [...new Set((cur.cover || []).map(c => (c.w || 1) + 'x' + (c.h || 1)))],
})`);
    console.log('карта', i, JSON.stringify(info));

    await page.locator('#map').screenshot({ path: `${OUT}/map_${info.seed}.png` });

    // v97: вид под углом. Тумблера может не быть в старых сборках — тогда просто пропускаем.
    if (await page.$('#t3D')) {
      await page.evaluate('VIEW3D=true; document.getElementById("t3D").checked=true; document.getElementById("p3d").style.display="block";');
      for (const v of (process.env.VIEWS || '35/52,140/44').split(',')) {
        const [yaw, tilt] = v.split('/').map(Number);
        await page.evaluate(`V3.yaw=${yaw}; V3.tilt=${tilt}; syncV3(); draw();`);
        await page.waitForTimeout(150);
        await page.locator('#map').screenshot({ path: `${OUT}/map_${info.seed}_3d_${yaw}.png` });
      }
      await page.evaluate('VIEW3D=false; document.getElementById("t3D").checked=false; draw();');
    }

    let vmf = null, vmfErr = null;
    try { vmf = await page.evaluate('buildVMF(cur)'); }
    catch (e) { vmfErr = e.message; }
    if (vmf) {
      fs.writeFileSync(`${OUT}/de_izohrona_${info.seed}.vmf`, vmf);
      console.log('  vmf ok:', (vmf.length / 1048576).toFixed(1), 'МБ');
    } else console.log('  vmf УПАЛ:', vmfErr);
  }

  if (errs.length) console.log('ошибки страницы:\n' + errs.slice(0, 10).join('\n'));
  await browser.close();
})();
