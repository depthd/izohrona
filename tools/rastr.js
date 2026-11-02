/* ВЫГРУЗКА РАСТРА РЯДОМ С .vmf — чтобы обе стороны мерились одним прибором.

   Генератор считает связность по своему растру, приёмка — по напечатанному
   файлу. Когда числа расходятся, спорить не о чем: нужен сам растр рядом с
   файлом, клетка в клетку. Прибор строит карту (можно по тройке сид:цель:ковёр),
   пишет .vmf и .rastr.json с полем g, zfield, габаритом клетки и спавнами.

     node tools/rastr.js <сборка> <куда> [сид:цель:ковёр]
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const сборка=process.argv[2], куда=process.argv[3]||'/tmp/rastr', тройка=process.argv[4];
  fs.mkdirSync(куда,{recursive:true});
  const b=await chromium.launch(require("fs").existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage();
  p.on('pageerror',e=>console.error('ОШИБКА СТРАНИЦЫ:',String(e.message).slice(0,200)));
  await p.goto('file://'+path.resolve(сборка),{timeout:180000});
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:180000,polling:400});
  /* DETOFF=part,narrow — выключить пасы слоя деталей до генерации. Контрфакт по
     пасу: какой из них съедает ширину проходов. */
  if(process.env['DETOFF']) await p.evaluate(
    `for(const k of ${JSON.stringify(process.env['DETOFF'].split(','))}) DET[k]=false;`);
  if(тройка){ const [с,а,кв]=тройка.split(':');
    await p.evaluate(`window.__SEED=${Number(с)}; window.__AIM=${а?Number(а):'undefined'};`
                    +` window.__COVSEED=${кв?Number(кв):'undefined'};`);
    await p.click('#gen');
    await p.waitForFunction(`cur && cur.g && cur.seed===${Number(с)}`,null,{timeout:150000,polling:400}); }
  if(process.env['БЕЗ']) await p.evaluate(`window.__БЕЗ=${JSON.stringify(process.env['БЕЗ'])}`);
  const txt=await p.evaluate('(function(){ useCur(); return buildVMF(cur); })()');
  const имя=`${куда}/r`;
  fs.writeFileSync(имя+'.vmf', txt);
  const данные=await p.evaluate(`(function(){
    /* те же ZS=72 и STEP=8, что в buildVMF: отметка обязана совпадать с печатью */
    const zq=[]; for(let i=0;i<W*H;i++) zq.push(Math.round(Math.round(cur.zfield[i]*72)/8)*8);
    return JSON.stringify({сид:cur.seed, аим:cur.__aim, ков:cur.coverSeed,
      W:W, H:H, S:CELL, ZS:72,
      g:Array.from(cur.g), z:zq,
      px:{T:[cur.px.T.x,cur.px.T.y], CT:[cur.px.CT.x,cur.px.CT.y],
          A:[cur.px.A.x,cur.px.A.y], B:[cur.px.B.x,cur.px.B.y]},
      места:(cur.places&&cur.places.list||[]).map(q=>[q.им||'?',q.x,q.y]) }); })()`);
  fs.writeFileSync(имя+'.rastr.json', данные);
  console.log(имя+'.vmf');
  await b.close();
})();
