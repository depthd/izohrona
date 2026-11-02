'use strict';
/* Кнопка «Скачать .vmap» руками пользователя: открыть продукт, дождаться карты,
   нажать, получить файл. Дальше файл проверяет tools/vmapcheck.py.
     node tools/proba_vmap.js builds/izohrona_v140.html out/proba.vmap */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 300000, polling: 400 });
  // v141: вместе с .vmap скачивается радар (.png и .txt) — ждём все три, берём .vmap
  const скачано = [];
  p.on('download', d => скачано.push(d));
  await p.click('#vmap');
  await p.waitForFunction(() => window.__vmapLast, null, { timeout: 300000 });
  for (let i = 0; i < 100 && скачано.length < 3; i++) await p.waitForTimeout(200);
  const dl = скачано.find(d => d.suggestedFilename().endsWith('.vmap'));
  await dl.saveAs(process.argv[3]);
  console.log('скачано', скачано.map(d => d.suggestedFilename()).join(', '));
  console.log(JSON.stringify(await p.evaluate('window.__vmapLast')));
  console.log('ошибок страницы', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})();
