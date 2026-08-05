/* Толщина перегородок в растре генератора: сколько клеток стены между двумя полами.
   У реальных карт медиана 80u. Если у нас 16-32u — «торчащие стены» это не баг
   склейки, а настоящая толщина, и чинить надо в растре. */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1000,height:800}});
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  const r=await p.evaluate(()=>{ useCur();
    const g=cur.g, U=CELL, hist={};
    let n=0;
    /* для каждой клетки стены, соседней с полом, меряем толщину поперёк */
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const i=y*W+x; if(g[i]) continue;
      for(const [dx,dy] of [[1,0],[0,1]]){
        if(!(g[i-dx-dy*W])) continue;               // с одной стороны пол
        let k=0, cx=x, cy=y;
        while(k<20 && cx>0&&cy>0&&cx<W&&cy<H && !g[cy*W+cx]){ k++; cx+=dx; cy+=dy; }
        if(k>=20) continue;                          // массив, а не перегородка
        if(!(cx<W&&cy<H&&g[cy*W+cx])) continue;      // с другой стороны тоже пол
        hist[k*U]=(hist[k*U]||0)+1; n++; }
    }
    const keys=Object.keys(hist).map(Number).sort((a,b)=>a-b);
    const flat=[]; for(const k of keys) for(let j=0;j<hist[k];j++) flat.push(k);
    return { n, мед:flat[flat.length>>1], p10:flat[Math.floor(flat.length*0.1)],
             p90:flat[Math.floor(flat.length*0.9)],
             доля16: Math.round(100*(hist[16]||0)/Math.max(1,n)),
             доля32: Math.round(100*((hist[16]||0)+(hist[32]||0))/Math.max(1,n)),
             hist: keys.slice(0,8).map(k=>k+'u:'+hist[k]).join('  ') };
  });
  console.log(`перегородок ${r.n}\n  медиана ${r.мед}u   p10 ${r.p10}u   p90 ${r.p90}u`);
  console.log(`  тоньше 32u: ${r.доля32}%   ровно 16u: ${r.доля16}%`);
  console.log('  ' + r.hist);
  console.log('  реальные карты: медиана толщины перегородки 80u (SVODKA_2 §2.3)');
  await b.close(); })();
