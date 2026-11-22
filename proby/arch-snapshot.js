'use strict';
// Открывает старые номера в v142. Пробует границу между готовой картой и её печатью.
// node proby/arch-snapshot.js [каталог для отчёта и кадров]
const { chromium } = require('playwright');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Первые три записи — gen.json и SHA-256 исходных m0..m2.vmf. Последняя — номер владельца.
const examples = [
  ['327306348:4.007582529757321:855372152', '8006b444f99880c0a2caf1bbe99588effe4c32cd0753e8f8dbc2372e2145dd52'],
  ['1977468515:3.277789574832176:2996074336', '7214118f187de2c55673ddca5046f3346ef9127437d267e9a1c7cd5cf719e915'],
  ['3904671571:3.9450395249503933:3516158308', '30b20e98f75f80f1a72f37359a173a2422d9602f5fff8de1ee91c28a5b2d20ea'],
  ['1712084959:2:2164811388', null],
];
const out = path.resolve(process.argv[2] || 'out/arch-research');
const build = path.resolve(__dirname, '../builds/izohrona_v142.html');

async function digest(download, vmfPath) {
  if (vmfPath) await download.saveAs(vmfPath);
  const hash = createHash('sha256');
  const stream = await download.createReadStream();
  for await (const chunk of stream) hash.update(chunk);
  await download.delete();
  return hash.digest('hex');
}

async function openNumber(page, number) {
  await page.locator('#nomerVvod').fill(number);
  await page.locator('#nomerVvod').press('Enter');
  await page.waitForFunction(n => document.querySelector('#nomerKod').textContent === n &&
    !document.querySelector('#flash').classList.contains('on'), number, { timeout: 180000 });
}

// Этот код выполняется на странице. Копируем только входы печати, включая вложенные массивы и Set.
// Статистику генерации, граф поиска путей и сохранённый крупный план в снимок не кладём.
function capture() {
  useCur();
  const { W, H, CELL, seed, __aim, coverSeed, g, zfield, px, floorPieces,
    stairMask, rampMask, palaces, cover, lmarks, places, zones, plan, m } = cur;
  const map = structuredClone({ W, H, CELL, seed, __aim, coverSeed, g, zfield, px, floorPieces,
    stairMask, rampMask, palaces, cover, lmarks, places, zones, plan, m: { pts: m.pts } });
  window.archSnapshots.set(seed, { map, fit: V127.fit });
  return { seed, size: [W,H,CELL], activeNodes: new Set(EDGES.flatMap(([a,b]) => [a,b])).size,
    namedNodes: Object.keys(baseNodes()).length, edges: EDGES.length,
    detourRaster: cur.det.крюкМакс, pairsRaster: cur.det.крюкПар };
}

async function measureSnapshot({ seed, negative }) {
  const snapshot = window.archSnapshots.get(seed);
  const map = structuredClone(snapshot.map); // buildVMF пишет диагностические поля в свой аргумент
  const previous = { W, H, CELL, SC, fit: V127.fit };
  const hash = async text => {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  };
  try {
    setSize(map.W, map.H); CELL = map.CELL; SC = 96 / CELL;
    V127.fit = negative ? !snapshot.fit : snapshot.fit;
    const vmf = buildVMF(map);
    const vmfHash = await hash(vmf);
    if (negative) return vmfHash;
    const { vmap } = ВЫГРУЗКА_VMAP.vmfToVmap(vmf, ВЫГРУЗКА_VMAP.ОБРАЗЕЦ, ВЫГРУЗКА_VMAP.ТОЧКИ, seed);
    return { vmf: vmfHash, vmap: await hash(vmap), activeSeed: cur.seed,
      floorCells: map.__surf.всегоПола, heightErrors: map.__surf.расходятся,
      detourPrint: map.__крюкПеч.максимум, pairsPrint: map.__крюкПеч.пар, badPairsPrint: map.__крюкПеч.хуже2,
      pairDifference: map.__крюкПеч.расхождение, narrowRoutes: map.__горло.уже96 };
  } finally {
    setSize(previous.W, previous.H); CELL = previous.CELL; SC = previous.SC; V127.fit = previous.fit;
  }
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(pathToFileURL(build).href, { timeout: 180000 });
    await page.waitForFunction(() => typeof cur !== 'undefined' && cur && cur.g, null, { timeout: 180000 });
    await page.locator('#nomerVvod >> xpath=ancestor::details/summary').click();
    await page.evaluate(() => { window.archSnapshots = new Map(); window.__TAGBOX = 1; });
    const rows = [];
    for (const [number, reference] of examples) {
      await openNumber(page, number);
      const row = { number, reference, ...await page.evaluate(capture) };
      for (const type of ['vmf','vmap']) {
        const wait = page.waitForEvent('download', { predicate: d => d.suggestedFilename().endsWith('.'+type), timeout: 180000 });
        await page.click('#'+type, { timeout: 180000 });
        row[type] = await digest(await wait, type === 'vmf' && path.join(out,row.seed+'.vmf'));
      }
      rows.push(row);
      console.log('Скачано', number, row.vmf, row.vmap);
    }
    const worst = rows.at(-1);
    await page.screenshot({ path: path.join(out,'map-2d.png') });
    const preview = page.locator('#t3D');
    if (!await preview.isVisible()) await page.locator('#t3D >> xpath=ancestor::details/summary').click();
    await preview.check();
    await page.screenshot({ path: path.join(out,'map-3d.png') });
    for (const row of rows) {
      if (row === worst) await openNumber(page, rows[0].number);
      row.snapshot = await page.evaluate(measureSnapshot, { seed: row.seed, negative: false });
      row.equal = row.seed !== row.snapshot.activeSeed && row.vmf === row.snapshot.vmf &&
        row.vmap === row.snapshot.vmap && (!row.reference || row.reference === row.vmf);
    }
    const changedFit = await page.evaluate(measureSnapshot, { seed: worst.seed, negative: true });
    const sensitiveToFit = changedFit !== worst.vmf;
    const result = { buildSha256: createHash('sha256').update(fs.readFileSync(build)).digest('hex'),
      rows, negativeControl: { number: worst.number, vmfWithOtherFit: changedFit, sensitiveToFit }, errors };
    fs.writeFileSync(path.join(out,'snapshot.json'), JSON.stringify(result,null,2)+'\n');
    console.log('Совпало', rows.filter(r => r.equal).length, '/', rows.length, '· ловит подмену UV', sensitiveToFit);
    if (!rows.every(r => r.equal) || !sensitiveToFit || errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
