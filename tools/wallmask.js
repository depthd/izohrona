/* Толщина САМОЙ МАСКИ СТЕН (не перегородок между полами) и во что её превращает
   группировка. Отвечает на вопрос: браш в 16u — это настоящая тонкая стена или
   осколок толстой, разрезанный ключом склейки. */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch({executablePath:EXE});
  const p=await b.newPage({viewport:{width:1000,height:800}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve('builds/izohrona_v120.html'));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  const r=await p.evaluate(()=>{ useCur();
    const g=cur.g, U=CELL, N=W*H;
    /* маска стен = всё, что не пол. Расстояние до ближайшего ПОЛА: чем больше,
       тем толще массив стены в этой точке. */
    const D=new Int32Array(N).fill(-1), q=[];
    for(let i=0;i<N;i++) if(g[i]){ D[i]=0; q.push(i); }
    for(let h=0;h<q.length;h++){ const i=q[h], x=i%W, y=(i/W)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx;
        if(D[j]<0){ D[j]=D[i]+1; q.push(j); } } }
    /* ЛИЦЕВЫЕ клетки стены: те, что примыкают к полу (D==1). Их толщина = сколько
       клеток стены подряд вглубь от пола. Именно они дают видимые грани. */
    const hist={}; let лиц=0;
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x;
      if(g[i]||D[i]!==1) continue;
      /* вглубь — в сторону, противоположную ближайшему полу */
      let dx=0,dy=0;
      if(g[i-1])dx=1; else if(g[i+1])dx=-1; else if(g[i-W])dy=1; else if(g[i+W])dy=-1; else continue;
      let k=0,cx=x,cy=y;
      while(k<12&&cx>0&&cy>0&&cx<W&&cy<H&&!g[cy*W+cx]){ k++; cx+=dx; cy+=dy; }
      hist[k*U]=(hist[k*U]||0)+1; лиц++; }
    const keys=Object.keys(hist).map(Number).sort((a,b)=>a-b);
    const flat=[]; for(const k of keys) for(let j=0;j<hist[k];j++) flat.push(k);
    return { лиц, мед:flat[flat.length>>1], p10:flat[(flat.length*0.1)|0],
             до32: Math.round(100*flat.filter(v=>v<=32).length/Math.max(1,flat.length)),
             ровно16: Math.round(100*flat.filter(v=>v===16).length/Math.max(1,flat.length)),
             hist: keys.slice(0,7).map(k=>k+'u:'+hist[k]).join('  ') };
  });
  console.log(`лицевых клеток стены ${r.лиц}`);
  console.log(`  толщина массива вглубь: медиана ${r.мед}u, p10 ${r.p10}u`);
  console.log(`  тоньше или равно 32u: ${r.до32}%   ровно 16u: ${r.ровно16}%`);
  console.log('  ' + r.hist);
  await b.close(); })();
