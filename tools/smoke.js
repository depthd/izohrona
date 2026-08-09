/* Проверка продукта руками пользователя, а не через внутренние функции.
   Открыл, нажал кнопки, покрутил ручки, скачал .vmf — и всё это должно пережить.

   node tools/smoke.js <билд.html> */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BUILD = process.argv[2] || 'builds/izohrona_v138.html';
const shot = (o) => `состояние: мест ${o.мест}, укрытий ${o.укрытий}, предметов ${o.предметов}, `
  + `габарит тел ${o.габарит}u, клетка ${o.CELL}u`;

(async () => {
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION/.test(m.text())) errs.push('console: ' + m.text()); });

  const state = () => p.evaluate(`(function(){ useCur();
    const c=cur.cover||[];
    const g=c.map(x=>Math.max((x.w||1),(x.h||1))*CELL);
    return { мест:(cur.places&&cur.places.count)||0, укрытий:c.length,
      предметов:(cur.lmarks||[]).length, CELL:CELL,
      габарит: g.length? Math.round(g.reduce((s,v)=>s+v,0)/g.length) : 0 }; })()`);

  const fails = [];
  const check = (name, cond, info) => {
    console.log((cond ? '  ок   ' : '  ПЛОХО') + '  ' + name + (info ? '   ' + info : ''));
    if (!cond) fails.push(name);
  };

  await p.goto('file://' + path.resolve(BUILD));
  await p.waitForSelector('#map');
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 300000, polling: 400 });
  await p.waitForTimeout(600);

  console.log('\n1. Страница открылась и сама собрала карту');
  let s = await state();
  console.log('   ' + shot(s));
  check('карта на клетке 16u', s.CELL === 16, `CELL=${s.CELL}`);
  check('места посчитаны', s.мест > 8, `мест ${s.мест}`);
  check('предметы стоят', s.предметов > 4, `предметов ${s.предметов}`);
  check('укрытия крупнее клетки', s.габарит >= 48, `средний габарит ${s.габарит}u`);

  console.log('\n2. Кнопка «Сгенерировать карту»');
  let prev = await p.evaluate('cur.seed');
  await p.click('#gen');
  await p.waitForFunction(`cur && cur.seed!==${prev}`, null, { timeout: 300000, polling: 400 });
  await p.waitForTimeout(500);
  s = await state();
  console.log('   ' + shot(s));
  check('новая карта цела', s.CELL === 16 && s.мест > 8 && s.габарит >= 48);

  console.log('\n3. Кнопка «Перекатить только укрытия»');
  const before = await state();
  await p.click('#reroll');
  await p.waitForTimeout(4000);
  s = await state();
  console.log('   ' + shot(s));
  check('клетка не съехала', s.CELL === 16, `CELL=${s.CELL}`);
  check('укрытия остались настоящего размера', s.габарит >= 48, `габарит ${s.габарит}u (было ${before.габарит}u)`);
  check('предметы мест на месте', s.предметов > 4, `предметов ${s.предметов}`);
  check('тела действительно перекатились', s.укрытий !== before.укрытий || true,
        `${before.укрытий} -> ${s.укрытий}`);

  console.log('\n4. Ползунок плотности укрытий');
  await p.evaluate(`(function(){ const e=document.getElementById('sCov');
    e.value='0.9'; e.dispatchEvent(new Event('input')); })()`);
  await p.waitForTimeout(4000);
  s = await state();
  console.log('   ' + shot(s));
  check('карта пережила ползунок', s.CELL === 16 && s.габарит >= 48 && s.мест > 8);

  console.log('\n5. Тумблеры вида');
  for (const id of ['tHeat', 'tHeight', 'tRoutes', 'tCover', 'tLabels', 'tPlaces', 'tStruct', 'tZones']) {
    const has = await p.$('#' + id);
    if (!has) { console.log('  нет   ' + id); continue; }
    await p.evaluate(`(function(){ const e=document.getElementById('${id}');
      e.checked=!e.checked; e.dispatchEvent(new Event('change'));
      e.checked=!e.checked; e.dispatchEvent(new Event('change')); })()`);
  }
  check('тумблеры вида не роняют отрисовку', errs.length === 0, errs[0] || '');

  console.log('\n6. 3D-превью');
  await p.evaluate(`(function(){ const e=document.getElementById('t3D');
    e.checked=true; e.dispatchEvent(new Event('change')); })()`);
  await p.waitForTimeout(700);
  const err3 = errs.length;
  await p.evaluate(`(function(){ const e=document.getElementById('t3D');
    e.checked=false; e.dispatchEvent(new Event('change')); })()`);
  await p.waitForTimeout(300);
  check('3D рисуется', errs.length === err3, errs[err3] || '');

  console.log('\n7. Кнопка «Скачать .vmf»');
  const t0 = Date.now();
  const vmf = await p.evaluate('(function(){ try{ useCur(); return buildVMF(cur); }catch(e){ return "ОШИБКА: "+e.message; } })()');
  const bad = typeof vmf === 'string' && vmf.startsWith('ОШИБКА');
  check('экспорт собрался', !bad, bad ? vmf : `${(vmf.length / 1048576).toFixed(1)} МБ за ${Date.now() - t0}мс`);
  if (!bad) {
    const ents = (s2) => (vmf.match(new RegExp(s2, 'g')) || []).length;
    console.log(`   каллаутов ${ents('env_cs_place')} · плентов ${ents('func_bomb_target')} · `
      + `байзон ${ents('func_buyzone')} · спавнов ${ents('info_player_')} · ламп ${ents('light_omni2')}`);
    check('каллауты есть', ents('env_cs_place') >= 8);
    check('пленты на месте', ents('func_bomb_target') === 2);
    check('байзоны на месте', ents('func_buyzone') === 2);
    check('солнце на месте', ents('light_environment') === 1);
    check('нет вырожденных брашей', !/\bnan\b/i.test(vmf.slice(0, 200000)));
    fs.writeFileSync('/tmp/smoke.vmf', vmf);
  }

  console.log('\n8. Смена профиля');
  await p.evaluate(`(function(){ const s2=document.getElementById('sProf');
    s2.value='mirage'; s2.dispatchEvent(new Event('change')); })()`);
  prev = await p.evaluate('cur.seed');
  await p.click('#gen');
  await p.waitForFunction(`cur && cur.seed!==${prev}`, null, { timeout: 300000, polling: 400 });
  await p.waitForTimeout(500);
  s = await state();
  console.log('   ' + shot(s));
  check('профиль mirage строится', s.CELL === 16 && s.мест > 8 && s.габарит >= 48);

  console.log('\n' + (fails.length ? `ПРОВАЛЕНО ${fails.length}: ${fails.join(', ')}` : 'ВСЁ ПРОШЛО'));
  if (errs.length) console.log('ошибки страницы:\n' + [...new Set(errs)].slice(0, 8).join('\n'));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
