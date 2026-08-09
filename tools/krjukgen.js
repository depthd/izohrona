/* Крюк между соседними местами, посчитанный ВНУТРИ генератора — на его же
   растре, до и после слоя деталей. Нужен один вопрос: барикада рождается в
   крупном плане или её ставит слой деталей?

     node tools/krjukgen.js builds/izohrona_v138.html [карт]
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');

const PROBE=`(function(){
  /* Ходибельная сетка по растру: клетка проходима, если блок 2x2 стоит на
     отметках в пределах шага. Это грубее, чем по .vmf, но нам нужно СРАВНЕНИЕ
     двух состояний одним и тем же мерилом, а не абсолютная истина. */
  /* Узел: блок 2x2 весь пол, отметка узла = МАКСИМУМ по блоку (игрок стоит на
     самой высокой опоре). Требование «весь блок на одной отметке» выбрасывало
     полосу клеток вдоль каждого уступа и превращало шаг в 48u в мнимый обрыв. */
  function графа(g,zf,W,H,S){
    const узел=new Int32Array(W*H).fill(-1), zу=new Float32Array(W*H);
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
      const b=[y*W+x, y*W+x+1, (y+1)*W+x, (y+1)*W+x+1];
      if(!g[b[0]]||!g[b[1]]||!g[b[2]]||!g[b[3]]) continue;
      let mx=-1e9; for(const j of b){ const v=zf?zf[j]:0; if(v>mx)mx=v; }
      узел[y*W+x]=1; zу[y*W+x]=mx;
    }
    return {узел, zу};
  }
  function волна(g,zу,W,H,узел,старт){
    const d=new Int32Array(W*H).fill(-1), q=new Int32Array(W*H);
    const UPZ=59/72;
    let h=0,t=0; d[старт]=0; q[t++]=старт;
    const D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while(h<t){ const j=q[h++], x=j%W, y=(j/W)|0;
      for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
        const k=ny*W+nx; if(узел[k]<0||d[k]>=0) continue;
        const dz=zу[k]-zу[j];
        if(dz>UPZ) continue;                       // выше прыжка не залезть
        d[k]=d[j]+1; q[t++]=k; } }
    return d;
  }
  function ближ(узел,W,H,cx,cy,r){
    let best=-1,bd=1e9;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const x=cx+dx, y=cy+dy; if(x<0||y<0||x>=W-1||y>=H-1) continue;
      const j=y*W+x; if(узел[j]<0) continue;
      const q=dx*dx+dy*dy; if(q<bd){bd=q;best=j;} }
    return best;
  }
  function мера(g,zf,W,H,S,центры){
    const {узел,zу}=графа(g,zf,W,H,S);
    const точки=центры.map(c=>ближ(узел,W,H,c.x,c.y,Math.max(4,Math.round(96/S))));
    const крюки=[], нет=[];
    const БЛИЗКО=1800/S;
    for(let i=0;i<центры.length;i++){
      if(точки[i]<0) continue;
      let d=null;
      for(let j=i+1;j<центры.length;j++){
        if(точки[j]<0) continue;
        const пр=Math.hypot(центры[i].x-центры[j].x, центры[i].y-центры[j].y);
        if(пр>БЛИЗКО || пр<200/S) continue;
        if(!d) d=волна(g,zу,W,H,узел,точки[i]);
        const dd=d[точки[j]];
        if(dd<0) нет.push([центры[i].им,центры[j].им]);
        else крюки.push([dd/пр, центры[i].им, центры[j].им, Math.round(пр*S), Math.round(dd*S), Math.round(Math.abs(zу[точки[i]]-zу[точки[j]])*72)]);
      }
    }
    крюки.sort((a,b)=>b[0]-a[0]);
    const med=крюки.length?крюки[крюки.length>>1][0]:0;
    return {пар:крюки.length, медиана:+med.toFixed(2),
            максимум:крюки.length?+крюки[0][0].toFixed(2):0,
            хуже2:крюки.filter(k=>k[0]>2).length, путиНет:нет.length,
            худшие:крюки.slice(0,6).map(k=>'x'+k[0].toFixed(2)+' '+k[1]+'->'+k[2]+' ('+k[4]+'u/'+k[3]+'u, перепад '+k[5]+'u)'),
            перепадУплохих:крюки.filter(k=>k[0]>2).map(k=>k[5]).sort((a,b)=>a-b)};
  }
  const P=cur.places&&cur.places.list; if(!P) return {ошибка:'нет мест'};
  const центры=P.map(p=>({x:p.x,y:p.y,им:p.им||'?'}));
  const после=мера(cur.g,cur.zfield,W,H,CELL,центры);
  let до=null;
  const C=cur.__coarse;
  return {сид:cur.seed, послеДеталей:после};
})()`;

(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve(process.argv[2]),{timeout:120000});
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:150000,polling:400});
  for(let k=0;k<+(process.argv[3]||3);k++){
    if(k){ const pr=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${pr}`,null,{timeout:120000,polling:400}); }
    const r=await p.evaluate(PROBE);
    console.log(JSON.stringify(r,null,1).replace(/\n\s+/g,' ').slice(0,700));
  }
  await b.close(); })();
