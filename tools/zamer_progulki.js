/* ЗАМЕР ПРОГУЛКИ: сколько миллисекунд уходит на кадр.
   Браузер без видеокарты (SwiftShader рисует процессором) — это ещё слабее
   слабого ноутбука, поэтому разница «было / стало» видна крупно.
   Три вида с одного места: через всю карту, в стену у края, сверху.
     node tools/zamer_progulki.js <сборка> <three.min.js> [кадров=40] */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [сборка, три, N = 40] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const ошибки = []; p.on('pageerror', e => ошибки.push(e.message));
  await p.route('**/three.min.js', r => r.fulfill({ path: три, contentType: 'application/javascript' }));
  await p.goto('file://' + path.resolve(сборка), { timeout: 180000 });
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 180000, polling: 400 });
  await p.waitForTimeout(800);
  await p.click('#walk'); await p.waitForSelector('#progulka canvas', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async ([N, ПИКС]) => {
    const S = ПРОГУЛКА.состояние(); S.живо = false;            // свой цикл, без анимации страницы
    if (ПИКС) { S.R.setPixelRatio(ПИКС); S.R.setSize(innerWidth, innerHeight, false); }   // ПИКС=1.5 — разрешение как у ноутбука
    await new Promise(ok => setTimeout(ok, 200));
    ПРОГУЛКА.прыгнутьК(0); ПРОГУЛКА.тест({}, 1);
    const gl = S.R.getContext();
    const П = S.точки.filter(Boolean).map(т => т.p), cx = П.reduce((s, q) => s + q[0], 0) / П.length, cy = П.reduce((s, q) => s + q[1], 0) / П.length;
    const кЦентру = Math.atan2(cy - S.P[1], cx - S.P[0]);
    const виды = { 'через карту': [кЦентру, 0], 'в стену у края': [кЦентру + Math.PI, 0], 'вниз под углом': [кЦентру, -0.5] };
    const out = { пикселей: S.R.domElement.width + '×' + S.R.domElement.height, треугольников: S.треугольников };
    for (const [имя, [рыск, тангаж]] of Object.entries(виды)) {
      S.рыск = рыск; S.тангаж = тангаж;
      ПРОГУЛКА.тест({}, 0);                                   // поставить камеру
      for (let i = 0; i < 3; i++) { S.R.render(S.С, S.кам); gl.finish(); }
      const t0 = performance.now();
      for (let i = 0; i < N; i++) { S.R.render(S.С, S.кам); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
      out[имя] = +((performance.now() - t0) / N).toFixed(1) + ' мс';
      out['вызовов ' + имя] = S.R.info.render.calls + ' / треуг ' + S.R.info.render.triangles;
    }
    return out; }, [+N, +(process.env['ПИКС'] || 0)]);
  console.log(JSON.stringify(r, null, 1), '\nошибок страницы', ошибки.length, ошибки.slice(0, 2));
  await b.close();
})();
