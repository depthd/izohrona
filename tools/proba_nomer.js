/* ПРОБА НОМЕРА КАРТЫ: номер обязан открывать ту же карту байт в байт.
   Генерирует карту (по желанию — с другим стилем и ползунком), берёт номер,
   открывает страницу заново, вводит номер и сравнивает .vmf обеих карт.
     node tools/proba_nomer.js [сборка=builds/izohrona_v141.html] [стиль=dust2] */
const { chromium } = require('playwright');
const path = require('path');
const crypto = require('crypto');
(async () => {
  const сборка = process.argv[2] || 'builds/izohrona_v141.html', стиль = process.argv[3] || 'dust2';
  const b = await chromium.launch();
  const ошибки = [];
  const открыть = async () => { const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', e => ошибки.push(e.message));
    await p.goto('file://' + path.resolve(сборка), { timeout: 180000 });
    await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 180000, polling: 400 });
    return p; };
  const отпечаток = async p => p.evaluate('(function(){ useCur(); return buildVMF(cur); })()')
    .then(t => crypto.createHash('md5').update(t).digest('hex').slice(0, 12));
  const ждать = p => p.waitForFunction('!document.getElementById("flash").classList.contains("on")', null, { timeout: 180000, polling: 300 });

  const p1 = await открыть();
  if (стиль !== 'dust2') { await p1.click('#sProf >> xpath=ancestor::details/summary'); await p1.selectOption('#sProf', стиль); await p1.waitForTimeout(100); await ждать(p1); }
  await p1.waitForTimeout(600);
  const номер = await p1.textContent('#nomerKod');
  const f1 = await отпечаток(p1);
  console.log('номер', номер, 'отпечаток', f1);

  const p2 = await открыть();
  await p2.click('#nomerVvod >> xpath=ancestor::details/summary');
  await p2.fill('#nomerVvod', 'Карта № ' + номер);
  await p2.click('#nomerOpen');
  await p2.waitForTimeout(300); await ждать(p2); await p2.waitForTimeout(500);
  const f2 = await отпечаток(p2), номер2 = await p2.textContent('#nomerKod');
  console.log('открыта', номер2, 'отпечаток', f2, '|', await p2.textContent('#nomerMsg'));
  console.log(f1 === f2 && номер === номер2 ? 'СОВПАЛО' : 'НЕ СОВПАЛО', '· ошибок страницы', ошибки.length, ошибки.slice(0, 2));
  await p2.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
  await b.close();
  process.exit(f1 === f2 ? 0 : 1);
})();
