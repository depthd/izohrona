/* Сборка N карт для гейта: пишет .vmf и JSON с числами, которые видит только
   генератор (расхождение пола с растром, спавны, вырожденные браши, каллауты).

     node tools/gate_export.js <сборка> <сколько> <куда>
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');

(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const сборка=process.argv[2], N=+(process.argv[3]||3), куда=process.argv[4]||'/tmp/gate';
  fs.mkdirSync(куда,{recursive:true});
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage();
  const ошибки=[];
  p.on('pageerror',e=>ошибки.push(String(e.message).slice(0,120)));
  await p.goto('file://'+path.resolve(сборка),{timeout:180000});
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:180000,polling:400});
  const итог=[];
  for(let k=0;k<N;k++){
    if(k){ const пр=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${пр}`,null,{timeout:150000,polling:400}); }
    const t0=Date.now();
    const txt=await p.evaluate('(function(){ useCur(); return buildVMF(cur); })()');
    const файл=`${куда}/m${k}.vmf`;
    fs.writeFileSync(файл,txt);
    /* Крюк, посчитанный САМИМ генератором по его растру — чтобы сравнивать с
       крюком по .vmf на ТОЙ ЖЕ карте. Расхождение двух чисел на одной карте
       говорит, что экспорт не равен растру; совпадение — что виноват план. */
    const крюкГен=await p.evaluate(`(function(){
      const P=cur.places&&cur.places.list; if(!P||P.length<2) return null;
      const узел=new Int32Array(W*H).fill(-1), zу=new Float32Array(W*H);
      for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
        const a=y*W+x,b=a+1,c=a+W,d=c+1;
        if(!cur.g[a]||!cur.g[b]||!cur.g[c]||!cur.g[d]) continue;
        узел[a]=1; zу[a]=Math.max(cur.zfield[a],cur.zfield[b],cur.zfield[c],cur.zfield[d]); }
      const UPZ=59/72, D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      const волна=(s0)=>{ const d=new Int32Array(W*H).fill(-1), q=new Int32Array(W*H);
        let h=0,t=0; d[s0]=0; q[t++]=s0;
        while(h<t){ const j=q[h++], x=j%W, y=(j/W)|0;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
            const k=ny*W+nx; if(узел[k]<0||d[k]>=0||zу[k]-zу[j]>UPZ) continue;
            d[k]=d[j]+1; q[t++]=k; } } return d; };
      const ближ=(cx,cy,r)=>{ let bs=-1,bd=1e9;
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          const x=cx+dx,y=cy+dy; if(x<0||y<0||x>=W-1||y>=H-1) continue;
          const j=y*W+x; if(узел[j]<0) continue; const q=dx*dx+dy*dy;
          if(q<bd){bd=q;bs=j;} } return bs; };
      const т=P.map(q=>ближ(q.x,q.y,6));
      const кр=[]; let нет=0;
      for(let i=0;i<P.length;i++){ if(т[i]<0) continue; let d=null;
        for(let j=i+1;j<P.length;j++){ if(т[j]<0) continue;
          const пр=Math.hypot(P[i].x-P[j].x,P[i].y-P[j].y)*CELL;
          if(пр>1800||пр<200) continue;
          if(!d) d=волна(т[i]);
          const dd=d[т[j]];
          if(dd<0) нет++; else кр.push([dd*CELL/пр,(P[i].им||'?')+'->'+(P[j].им||'?')]); } }
      кр.sort((a,b)=>b[0]-a[0]);
      return {пар:кр.length, хуже2:кр.filter(k=>k[0]>2).length,
              максимум:кр.length?+кр[0][0].toFixed(2):0, путиНет:нет,
              худшая:кр.length?кр[0][1]:'',
              все:кр.map(k=>[+k[0].toFixed(2), k[1]])};
    })()`);
    const st=await p.evaluate(`JSON.stringify({
      сид:cur.seed, аим:cur.__aim, ков:cur.coverSeed, surf:cur.__surf, block:cur.__block, palas:cur.__palas, degen:(cur.__degen||[]).length,
      спавновT:cur.__spT, спавновC:cur.__spC,
      мест:(cur.places&&cur.places.count)||0, укрытий:(cur.cover||[]).length,
      предметов:(cur.lmarks||[]).length, балок:cur.__beams, csg:cur.__csg,
      замокСтоп:(cur.det||{}).замокСтоп||0, проруб:(cur.det||{}).проруб||0 })`);
    итог.push(Object.assign(JSON.parse(st), {файл, мс:Date.now()-t0, крюкГен,
      каллаутов:(txt.match(/env_cs_place/g)||[]).length,
      цветUndefined:(txt.match(/"color" "undefined"/g)||[]).length,
      брашей:(txt.match(/\tsolid/g)||[]).length }));
    console.error(`  карта ${k+1}/${N} собрана, сид ${итог[k].сид}`);
  }
  fs.writeFileSync(`${куда}/gen.json`, JSON.stringify({карты:итог, ошибкиСтраницы:ошибки},null,1));
  await b.close();
})();
