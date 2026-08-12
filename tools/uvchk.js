/* Проверка подгонки текстур ТАМ, ГДЕ ОНА ЗАДАНА — по списку коробок REG, а не
   по .vmf. Причина: вычитание режет коробку на куски, а куски НАРОЧНО наследуют
   оси и смещения целой коробки, чтобы рисунок не прыгал на разрезе. Значит у куска
   вдоль грани лежит нецелое число повторов — и это правильно. Мерить куски
   формулой для целых коробок = мерить двумя разными приборами.

   Здесь проверяются сами коробки:
     ЦЕЛЫХ ПОВТОРОВ — длина грани / период текстуры должно быть целым;
     ШОВ НА РЕБРЕ   — тексель в ближнем углу грани кратен периоду.

     node tools/uvchk.js builds/izohrona_v139.html [карт] [want] [unit]
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');

const PROBE = (want,unit)=>`(function(){
  window.__UVDUMP=1; V127.fit=true; V127.want=${want}; V127.unit=${unit}; useCur(); buildVMF(cur);
  const R=window.__REGDUMP||[];
  const TEXW=${unit}/8;
  const ax=s=>{ const m=/^\\[([-\\d.e ]+)\\] ([-\\d.e]+)$/.exec(s); if(!m) return null;
    const a=m[1].trim().split(/\\s+/).map(Number);
    return {v:[a[0],a[1],a[2]], off:(a[3]||0), sc:+m[2]}; };
  let fit=0, grid=0, badR=0, badO=0, split=0, tot=0;
  const bad=[], hk={};   // гистограмма: во сколько раз повтор больше натурального
  for(const b of R){
    if(!b.uv) continue;
    tot++;
    if(b.split) split++;
    const cor=[];
    for(const x of [b.x0,b.x1]) for(const y of [b.y0,b.y1]) for(const z of [b.z0,b.z1]) cor.push([x,y,z]);
    for(const k of ['ut','vt','ub','vb','uY','uX','vw']){
      const a=ax(b.uv[k]); if(!a) continue;
      const pr=cor.map(c=>a.v[0]*c[0]+a.v[1]*c[1]+a.v[2]*c[2]);
      const c0=Math.min.apply(null,pr), c1=Math.max.apply(null,pr), L=c1-c0;
      if(L<1) continue;
      if(a.sc===8 && a.off===0){ grid++; continue; }
      fit++;
      const reps=L/(a.sc*TEXW);
      { const k=(L/Math.max(1,Math.round(reps)))/${unit};
        const b2=k<0.5?'<0.50':k<0.6?'0.50-0.60':k<0.7?'0.60-0.70':k<0.85?'0.70-0.85':
                 k<1.18?'0.85-1.18':k<1.45?'1.18-1.45':'>1.45';
        hk[b2]=(hk[b2]||0)+1; }
      const u0=c0/a.sc+a.off;   // тексель в ближнем углу: должен быть ровно 0, свёртки больше нет
      const dR=Math.abs(reps-Math.round(reps)), dO=Math.abs(u0)/Math.max(1,TEXW);
      if(dR>0.01||Math.round(reps)<1){ badR++; if(bad.length<6) bad.push(['повторы',k,L,a.sc,+reps.toFixed(3)]); }
      if(dO>0.005){ badO++; if(bad.length<6) bad.push(['шов',k,c0,a.sc,a.off,+u0.toFixed(3)]); }
    }
  }
  return {коробок:tot, разрезано:split, граней_подогнано:fit, граней_сетка:grid,
          дробных_повторов:badR, шов_мимо:badO, перекос:hk, примеры:bad, счётчик:cur.__uv};
})()`;

(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:120000,polling:400});
  const N=+(process.argv[3]||3), WANT=+(process.argv[4]||96), UNIT=+(process.argv[5]||32);
  for(let k=0;k<N;k++){
    if(k){ const prev=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${prev}`,null,{timeout:90000,polling:400}); }
    const seed=await p.evaluate('cur.seed');
    const r=await p.evaluate(PROBE(WANT,UNIT));
    console.log('\nсид', seed, '· рисунок', WANT, '· натура', UNIT);
    console.log(' ', JSON.stringify(r,null,0).slice(0,900));
  }
  await b.close(); })();
