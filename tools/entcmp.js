/* Входы у генератора при двух порогах — чтобы понять, лишние проходы это или
   дробление границы на огрызки. Реальные карты меряются тем же кодом (plcnode.js). */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  for(let k=0;k<(+process.argv[3]||3);k++){
    if(k){ const prev=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${prev}`,null,{timeout:300000,polling:400}); }
    await p.waitForTimeout(300);
    const r=await p.evaluate(()=>{ useCur(); const out={};
      for(const em of [2,4,6]){ const P=computePlaces(cur.g,W,H,16,{entMin:em});
        const e=P.list.map(x=>x.ent).sort((a,b)=>a-b);
        out[em]={мест:P.count, мед:e[e.length>>1], p90:e[Math.floor(e.length*0.9)], макс:e[e.length-1],
                 туп:P.list.filter(x=>x.ent<2).length,
                 огрызков:P.list.reduce((s,x)=>s+x.strips.filter(t=>t.n<6).length,0)}; }
      return out; });
    for(const em of [2,4,6]) console.log(`порог ${em} (${em*16}u): мест ${r[em].мест} · вх ${r[em].мед}/${r[em].p90}/${r[em].макс} · тупиков ${r[em].туп}`+(em===2?` · полос уже 96u: ${r[em].огрызков}`:''));
    console.log('');
  }
  await b.close(); })();
