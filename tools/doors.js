/* ЗАЛОЖЕННЫЕ ДВЕРИ. Планировщик создаёт проходы между зонами явным списком
   (plan.doors). Если слой деталей потом закладывает такой проём стеной, игрок
   видит ровно то, что на скриншоте: коридор упирается в кладку.
   Здесь проверяется каждая запланированная дверь: осталась ли под ней проходимая
   полоса в финальном растре.

   node tools/doors.js <билд.html> [сколько карт] */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const BUILD=process.argv[2]||'builds/izohrona_v120.html', N=+(process.argv[3]||3);
const PROBE=`(function(){
  useCur();
  const g=cur.g, plan=cur.plan;
  if(!plan||!plan.doors) return {нет:1};
  const D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const er=(m)=>{ const o=new Uint8Array(W*H);
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){ const i=y*W+x;
      if(m[i]&&m[i+1]&&m[i+W]&&m[i+W+1]) o[i]=1; } return o; };
  const e=er(g);
  let всего=0, закрыто=0; const где=[];
  for(const d of plan.doors){
    всего++;
    /* полоса двери: d.x,d.y и d.w клеток вдоль оси */
    let открыт=0;
    for(let k=-1;k<=(d.w||1);k++){
      const x = d.axis==='Y' ? d.x+k : d.x;
      const y = d.axis==='Y' ? d.y : d.y+k;
      for(let r=-2;r<=2;r++){
        const cx = d.axis==='Y' ? x : x+r;
        const cy = d.axis==='Y' ? y+r : y;
        if(cx<0||cy<0||cx>=W||cy>=H) continue;
        if(e[cy*W+cx]) открыт++; } }
    if(!открыт){ закрыто++;
      if(где.length<6) где.push(Math.round(d.x*16)+' '+Math.round((H-d.y)*16)); }
  }
  return { всего, закрыто, где, det:cur.det, seed:cur.seed };
})()`;
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch({executablePath:EXE});
  const p=await b.newPage({viewport:{width:1000,height:800}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve(BUILD));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  for(let k=0;k<N;k++){
    if(k){ const prev=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${prev}`,null,{timeout:300000,polling:400}); }
    await p.waitForTimeout(300);
    const r=await p.evaluate(PROBE);
    if(r.нет){ console.log('плана нет'); continue; }
    const d=r.det||{};
    console.log(`карта ${r.seed}: дверей ${r.всего}, ЗАЛОЖЕНО ${r.закрыто}`
      +`   [seal ${d.seal||0} · thick ${d.thick||0} · dpDel ${d.dpDel||0} · cutDead ${d.cutDead||0} · zwall ${d.zwall||0} · part ${d.part||0} · narrow ${d.narrow||0}]`);
    if(r.где.length) console.log('   где:', r.где.join(' | '));
  }
  await b.close(); })();
