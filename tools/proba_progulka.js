/* ПРОБА ПРОГУЛКИ: открыть карту от первого лица и проверить физику без мыши.
   three.js подставляется из локального файла (в песочнице браузер без сети).
     node tools/proba_progulka.js [сборка] [three.min.js] [папка для снимков] */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [сборка = 'builds/izohrona_v141.html', три, куда] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const ошибки = []; p.on('pageerror', e => ошибки.push(e.message));
  if (три) await p.route('**/three.min.js', r => r.fulfill({ path: три, contentType: 'application/javascript' }));
  await p.goto('file://' + path.resolve(сборка), { timeout: 180000 });
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 180000, polling: 400 });
  await p.waitForTimeout(800);
  await p.click('#walk');
  await p.waitForSelector('#progulka canvas', { timeout: 60000 });
  await p.waitForTimeout(500);
  const т = (к, с, р) => p.evaluate(`ПРОГУЛКА.тест(${JSON.stringify(к)}, ${с}${р === undefined ? '' : ',' + р})`);
  const снимок = async имя => { if (!куда) return; await p.evaluate(`document.querySelector('.pg-pauza').style.display='none'`);
    await p.screenshot({ path: path.join(куда, имя + '.png') }); };
  const итог = {};
  итог.спавн = await т({}, 1.5);
  await снимок('1_spawn_T');
  // прыжок: максимум высоты за полёт
  const z0 = итог.спавн.P[2]; let зМакс = z0;
  await p.evaluate(`ПРОГУЛКА.состояние().клав={Space:true}`);
  for (let i = 0; i < 50; i++) { const r = await т({ Space: i < 2 }, 1 / 60); зМакс = Math.max(зМакс, r.P[2]); }
  итог.прыжок = +(зМакс - z0).toFixed(1);
  const пц = await т({}, 1.5); итог.послеПрыжка = пц;
  итог.приземлился = Math.abs(пц.P[2] - z0) < 1;
  // ходьба вперёд 8 секунд: должна упереться и встать
  const ход = []; for (let k = 0; k < 8; k++) ход.push((await т({ KeyW: true }, 1)).P);
  итог.ходьба = ход.map(P => P.join(' '));
  итог.упёрся = Math.hypot(ход[7][0] - ход[6][0], ход[7][1] - ход[6][1]) < 5;
  итог.вСтене = await p.evaluate('(()=>{const s=ПРОГУЛКА.состояние(); return false;})()');
  await снимок('2_walked');
  for (const [i, имя] of [[2, '3_site_A'], [3, '4_site_B'], [1, '5_spawn_CT']]) {
    await p.evaluate(`ПРОГУЛКА.прыгнутьК(${i})`); итог[имя] = await т({}, 1.5); await снимок(имя); }
  // v142: пол под щелчком на большой карте — тот же, что у плента
  for (const [i, имя] of [[2, 'A'], [3, 'B']]) {
    const т = await p.evaluate(`ПРОГУЛКА.состояние().точки[${i}].p`);
    const пол = await p.evaluate(`ПРОГУЛКА.полПод(${т[0]}, ${т[1]})`);
    итог['пол под щелчком ' + имя] = пол && пол.map(Math.round).join(' ');
  }
  if (куда) {
    await p.evaluate(`document.querySelector('.pg-pauza').style.display=''`);   // снимки её прятали
    await p.screenshot({ path: path.join(куда, '6_pauza.png') });               // пауза видна: мышь не захвачена
    await p.click('.pg-kartu'); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(куда, '7_karta.png') });
    // щелчок по большой карте — в букву B
    const xy = await p.evaluate(`(()=>{ const S=ПРОГУЛКА.состояние(), Р=S.радар, cv=document.querySelector('.pg-karta canvas'),
      В=cv.__вид, r=cv.getBoundingClientRect(), м=Р.метки.find(m=>m.имя==='B'); const [u,v]=Р.наРадар(м.p[0],м.p[1]);
      return [r.left+В.ox+u*В.к, r.top+В.oy+v*В.к]; })()`);
    await p.mouse.click(xy[0], xy[1]); await p.waitForTimeout(300);
    итог['щелчок по B'] = await т({}, 1);
    await снимок('8_posle_shchelchka');
  }
  console.log(JSON.stringify(итог, null, 1));
  console.log('ошибок страницы', ошибки.length, ошибки.slice(0, 3));
  await b.close();
})();
