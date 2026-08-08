/* ПОВТОР КАРТЫ ПО СИДУ + зонд расхождения печати с растром.

   Гейт находит дефект на одной карте из двадцати. Без повтора проверка правки
   идёт вслепую: гоняешь два десятка новых карт и надеешься, что дефект попадётся
   снова. Отсюда прибор.

   Карта задаётся ТРОЙКОЙ сид:цель:ковёр, а не одним сидом:
     сид   — mulberry32 планировщика;
     цель  — cfg.M, которую решатель баланса подсунул генератору (она зависит от
             сноса, накопленного за прошлые карты в этой же вкладке, поэтому один
             сид при другой цели даёт ДРУГУЮ карту);
     ковёр — coverSeed, от него зависит расстановка тел.
   Все три печатаются этим прибором и лежат в gen.json гейта.

     node tools/povtor.js <сборка> <N>                      — N случайных карт
     node tools/povtor.js <сборка> --сид 659323758:3.37:2428020358 [ещё...]

   Печатает по карте: площадь пола (отпечаток — совпал, значит карта та же),
   вырожденные коробки, расхождение напечатанной поверхности с растром (всего и
   отдельно по плато паласа), сработки прорубa и замка плато. */
const { chromium } = require('playwright');
const path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const сборка=process.argv[2];
  const сиды=[]; let N=+(process.argv[3]||5);
  if(process.argv[3]==='--сид'){ N=process.argv.length-4; for(let i=4;i<process.argv.length;i++) сиды.push(process.argv[i]); }
  const b=await chromium.launch({executablePath:EXE});
  const p=await b.newPage();
  p.on('pageerror',e=>console.log('ОШИБКА СТРАНИЦЫ:',String(e.message).slice(0,200)));
  await p.goto('file://'+path.resolve(сборка),{timeout:180000});
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:180000,polling:400});
  for(let k=0;k<N;k++){
    if(сиды.length){
      const [с,а,кв]=String(сиды[k]).split(':');
      await p.evaluate(`window.__SEED=${Number(с)}; window.__AIM=${а===undefined?'undefined':Number(а)};`
                      +` window.__COVSEED=${кв===undefined?'undefined':Number(кв)};`);
      await p.click('#gen');
      await p.waitForFunction(`cur && cur.g && cur.seed===${Number(с)}`,null,{timeout:150000,polling:400});
    } else if(k){ const пр=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${пр}`,null,{timeout:150000,polling:400}); }
    await p.evaluate('window.__TAGBOX=1');
    const r=JSON.parse(await p.evaluate(`(function(){ useCur(); buildVMF(cur);
      return JSON.stringify({сид:cur.seed, аим:cur.__aim, ков:cur.coverSeed,
                 degen:cur.__degen.slice(0,8), degenN:cur.__degen.length,
                 palas:cur.__palas, surf:cur.__surf, проруб:(cur.det||{}).проруб, крюкМакс:(cur.det||{}).крюкМакс, крюкПар:(cur.det||{}).крюкПар, крюкНет:(cur.det||{}).крюкНетПути, мест:(cur.places&&cur.places.list||[]).length, безЯкоря:(cur.places&&cur.places.list||[]).filter(q=>q.ax===undefined).length, крюкХуже2:(cur.det||{}).крюкХуже2, попыток:(cur.__bal||{}).попыток, почему:(cur.det||{}).прорубПочему, прМакс:(cur.det||{}).прорубМакс, прПар:(cur.det||{}).прорубПар, ступеней:(cur.det||{}).steps, замок:(cur.det||{}).замокСтоп||0,
                 блок:cur.__block, стыки:(cur.det||{}).стыки, дыр:(cur.det||{}).дыр, стен:(cur.det||{}).стен, zskip:(cur.det||{}).zskip, крпеч:cur.__крюкПеч, недост:cur.__недост, пробка:(cur.det||{}).probka, lmCut:(cur.det||{}).lmCut, укрытий:(cur.cover||[]).length, ловушек:cur.__trap, лестниц:cur.__lad, остров:cur.__island, отрезано:cur.__cut, узк:cur.__uzk,
                 палас:(cur.palaces||[]).map(q=>({x0:q.x0,y0:q.y0,x1:q.x1,y1:q.y1,
                        topZ:+q.topZ.toFixed(2),рампа:(q.rampCells||[]).length}))}); })()`));
    console.log(`${r.сид}:${r.аим}:${r.ков}  пола ${r.surf.всегоПола}  вырожд ${r.degenN}`
      +`  пол≠растр ${r.surf.расходятся}  плато≠растр ${r.palas.расходятся}`
      +`  паласов ${r.палас.length}  проруб ${r.проруб}  ступеней ${r.ступеней}  замок ${r.замок}`
      +`  ловушек ${r.ловушек}  остров ${r.остров}  отрезано ${r.отрезано}  лестниц ${r.лестниц}`
      +`  пробок ${r.пробка}/${r.укрытий} lm${r.lmCut}  узко ${r.узк.потеряно}  НАПРЕДЕЛЕ ${r.узк.наПределе} (${r.узк.доляПредел}%)`);
    {const c=r.стыки||[]; const ст=c.filter(x=>x[1]==='стена'), от=c.filter(x=>x[1]==='открыт');
      const дл=a=>a.length?`${Math.min(...a.map(x=>x[0]))*16}..${Math.max(...a.map(x=>x[0]))*16}u`:'—';
      console.log(`  СТЫКИ ЗОН ${c.length}: стеной ${ст.length} (${дл(ст)}), открыто ${от.length} (${дл(от)})  ·  стен ${r.стен}, дыр ${r.дыр}`);}
    console.log('  КРЮК ГЕН', r.крюкМакс, 'хуже2', r.крюкХуже2, 'пар', r.крюкПар, 'нетпути', r.крюкНет, '· мест', r.мест, 'без якоря', r.безЯкоря, '· попыток', r.попыток);
    console.log('  проруб:', JSON.stringify(r.почему), 'макс', r.прМакс, 'пар', r.прПар);
    console.log('  КРЮК ПЕЧАТИ', r.крпеч.максимум, 'хуже2', r.крпеч.хуже2, 'нетпути', r.крпеч.путиНет, '· худшее расхождение', JSON.stringify(r.крпеч.расхождение));
    console.log('  экспорт закрыл пола:', r.блок.доля+'%', '· НЕДОСТУПНО', r.недост.потеряно, `(${r.недост.доля}%)`, '· КРИВЫХ', r.недост.кривых, `(${r.недост.доляКривых}%)`, 'крюк пола', r.недост.крюкПола, JSON.stringify(r.недост.виновники).slice(0,110));
    if(r.degenN) console.log('  вырожденные:', r.degen.join(' | '));
    if(r.surf.расходятся) console.log('  пол:', JSON.stringify(r.surf.примеры));
    if(r.palas.расходятся) console.log('  плато:', JSON.stringify(r.palas.примеры), JSON.stringify(r.палас));
  }
  await b.close();
})();
