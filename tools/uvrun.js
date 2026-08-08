/* Сборка карт и выгрузка .vmf для проверки подгонки текстур (v127).
   Каждая карта выгружается ДВАЖДЫ — с подгонкой и без — чтобы сравнивать
   один и тот же экспорт, а не две разные карты.

     node tools/uvrun.js builds/izohrona_v137.html [сколько] [want] [unit]
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:120000,polling:400});
  const N=+(process.argv[3]||2), WANT=+(process.argv[4]||96), UNIT=+(process.argv[5]||32);
  const out=process.env.OUT||'/tmp/uv';
  fs.mkdirSync(out,{recursive:true});
  for(let k=0;k<N;k++){
    if(k){ const prev=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${prev}`,null,{timeout:90000,polling:400}); }
    const seed=await p.evaluate('cur.seed');
    for(const fit of [true,false]){
      const txt=await p.evaluate(`(function(){ V127.fit=${fit}; V127.want=${WANT}; V127.unit=${UNIT};
        useCur(); const t=buildVMF(cur); window.__uv=cur.__uv; return t; })()`);
      const f=`${out}/${seed}_${fit?'fit':'grid'}.vmf`;
      fs.writeFileSync(f,txt);
      const st=await p.evaluate('window.__uv');
      console.log(f, JSON.stringify(st), (txt.length/1e6).toFixed(2)+'МБ');
    }
  }
  await b.close(); })();
