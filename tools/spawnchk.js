/* Проверка спавнов по экспортированному .vmf: стоит ли каждая точка на ровном полу
   и не касается ли стены. Меряется по самому файлу, а не по намерению кода. */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch({executablePath:EXE});
  const p=await b.newPage({viewport:{width:1000,height:800}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve('builds/izohrona_v138.html'));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  for(let k=0;k<3;k++){
    if(k){ const prev=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${prev}`,null,{timeout:300000,polling:400}); }
    await p.waitForTimeout(300);
    const r=await p.evaluate(()=>{ useCur(); const v=buildVMF(cur);
      const g=cur.g, zf=cur.zfield, U=CELL;
      /* координаты спавнов из готового файла */
      const re=/"classname" "(info_player_terrorist|info_player_counterterrorist)"[\s\S]{0,200}?"origin" "([-\d ]+)"/g;
      const re2=/"origin" "([-\d ]+)"[\s\S]{0,200}?"classname" "(info_player_terrorist|info_player_counterterrorist)"/g;
      const pts=[]; let m;
      while((m=re.exec(v))) pts.push(m[2].split(' ').map(Number));
      while((m=re2.exec(v))) pts.push(m[1].split(' ').map(Number));
      /* обратно в клетки: wx(x)=x*S, wy(y)=(H-y)*S */
      let вСтене=0, наСтупени=0, уСтены=0;
      for(const [X,Y,Z] of pts){
        /* origin = wx(x)+hc, wy(y+1)+hc; обратно: wy(cy)=(H-cy)*S, значит
           H-floor(Y/S) даёт y+1, а не y — снимаем единицу. */
        const cx=Math.floor(X/U), cy=H-Math.floor(Y/U)-1;
        if(cx<1||cy<1||cx>=W-1||cy>=H-1) continue;
        const i=cy*W+cx;
        if(!g[i]){ вСтене++; continue; }
        const qz8=z=>Math.round((z*72)/8)*8;      // та же квантовка, что в экспорте
        const z0=qz8(zf[i]||0); let ступ=false, стена=false;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const j=(cy+dy)*W+(cx+dx);
          if(!g[j]) стена=true; else if(qz8(zf[j]||0)!==z0) ступ=true; }
        if(стена) уСтены++; if(ступ) наСтупени++; }
      return { всего:pts.length, вСтене, уСтены, наСтупени, T:cur.__spT, CT:cur.__spC };
    });
    console.log(`спавнов ${r.всего} (T ${r.T}, CT ${r.CT}) · В СТЕНЕ ${r.вСтене} · касается стены ${r.уСтены} · на ступеньке ${r.наСтупени}`);
  }
  await b.close(); })();
