/* СНИМОК 3D-ПРЕВЬЮ. Единственный канал, по которому человек может судить о декоре:
   он не читает код и не открывает Хаммер на каждую правку. Без картинки любая
   работа над видом — это моё гадание.

     node tools/vid3d.js <сборка> <куда.png> [сид:цель:ковёр] */
const { chromium } = require('playwright');
const path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const сборка=process.argv[2], куда=process.argv[3]||'/tmp/3d.png', тройка=process.argv[4];
  const b=await chromium.launch(require("fs").existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1600,height:1200},deviceScaleFactor:1});
  p.on('pageerror',e=>console.log('ОШИБКА СТРАНИЦЫ:',String(e.message).slice(0,180)));
  await p.goto('file://'+path.resolve(сборка),{timeout:180000});
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:180000,polling:400});
  if(process.env['БЕЗ']) await p.evaluate(`window.__БЕЗ=${JSON.stringify(process.env['БЕЗ'])}`);
  if(тройка){ const [с,а,кв]=тройка.split(':');
    await p.evaluate(`window.__SEED=${Number(с)}; window.__AIM=${а?Number(а):'undefined'};`
                    +` window.__COVSEED=${кв?Number(кв):'undefined'};`);
    await p.click('#gen');
    await p.waitForFunction(`cur && cur.g && cur.seed===${Number(с)}`,null,{timeout:150000,polling:400}); }
  await p.evaluate(`(function(){ const e=document.getElementById('t3D');
    e.checked=true; e.dispatchEvent(new Event('change')); })()`);
  await p.waitForTimeout(1500);
  await p.locator('#map').screenshot({path:куда});
  console.log(куда, await p.evaluate('cur.seed+":"+cur.__aim+":"+cur.coverSeed'),
              'укрытий', await p.evaluate('(cur.cover||[]).length'));
  await b.close();
})();
