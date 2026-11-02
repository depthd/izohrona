/* ПРИЗРАЧНЫЕ СТЕНЫ: клетки, которые генератор считает полом, а в экспорте на них
   стоит сплошной браш выше колена. Игрок туда не пройдёт, а вся логика — дейкстра,
   баланс, места, каллауты — уверена, что это проход.

   Растр и экспорт до сих пор нигде не сверялись между собой. Проверка простая:
   рисуем все выпущенные браши обратно на сетку и смотрим, что накрыто.

   node tools/blocked.js <билд.html> [сколько карт]
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BUILD = process.argv[2] || 'builds/izohrona_v139.html';
const N = +(process.argv[3] || 3);

const PROBE = `(function(){
  useCur();
  const vmf = buildVMF(cur);
  const g = cur.g, zf = cur.zfield, U = CELL;
  const N = W*H;
  /* --- разбор брашей: габарит + материал --- */
  const reSolid = /\\tsolid\\n/g;
  const parts = vmf.split('\\tsolid\\n').slice(1);
  const rePl = /"plane" "\\(([-\\d.e ]+)\\) \\(([-\\d.e ]+)\\) \\(([-\\d.e ]+)\\)"/g;
  const reM  = /"material" "([^"]+)"/g;
  const blk = new Int32Array(N).fill(-1);      // индекс браша, накрывшего клетку
  const info = [];
  for (let n=0; n<parts.length; n++){
    const ch = parts[n];
    let m, xs=[], ys=[], zs=[];
    rePl.lastIndex=0;
    while((m=rePl.exec(ch))){
      for(let k=1;k<=3;k++){ const a=m[k].trim().split(/\\s+/).map(Number);
        if(a.length===3){ xs.push(a[0]); ys.push(a[1]); zs.push(a[2]); } } }
    if(!xs.length) continue;
    reM.lastIndex=0; const mats=[]; let mm;
    while((mm=reM.exec(ch))) mats.push(mm[1]);
    const mat = mats[0]||'?';
    if(/^tools\\//i.test(mat)) continue;                 // клип и триггеры не мешают
    const x0=Math.min(...xs), x1=Math.max(...xs);
    const y0=Math.min(...ys), y1=Math.max(...ys);
    const z0=Math.min(...zs), z1=Math.max(...zs);
    info.push({x0,y0,z0,x1,y1,z1,mat,n});
    const idx = info.length-1;
    /* клетки под следом браша */
    const cx0=Math.max(0,Math.floor(x0/U)), cx1=Math.min(W-1,Math.ceil(x1/U)-1);
    const cy0=Math.max(0,H-Math.ceil(y1/U)), cy1=Math.min(H-1,H-Math.floor(y0/U)-1);
    if((cx1-cx0+1)*(cy1-cy0+1) > 4000) continue;         // огромные плиты пола пропускаем
    for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){
      const i=cy*W+cx; if(!g[i]) continue;
      const ft = Math.round((zf[i]||0)*72/8)*8;          // отметка пола, как в экспорте
      /* ПРЕГРАДА — это браш, который СТОИТ НА ПОЛУ и выше прыжка.
         Плита пола и приподнятая площадка идут от базы далеко снизу: по ним ходят
         сверху, преградой они не являются. Перемычка над проёмом висит выше головы.
         Значит низ должен быть примерно на уровне пола, а верх — выше 64u,
         потому что 64u игрок запрыгивает. */
      if(z0 <= ft+32 && z0 >= ft-40 && z1 > ft+64){ if(blk[i]<0) blk[i]=idx; }
    }
  }
  /* --- что перекрыто --- */
  let nb=0; const byMat={};
  for(let i=0;i<N;i++) if(g[i]&&blk[i]>=0){ nb++;
    const b=info[blk[i]];
    const key=b.mat.split('/').pop()+' '+Math.round(b.x1-b.x0)+'x'+Math.round(b.y1-b.y0)+'x'+Math.round(b.z1-b.z0);
    byMat[key]=(byMat[key]||0)+1; }
  /* --- рвёт ли это карту: заливка по полу МИНУС перекрытые клетки --- */
  const D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const free=new Uint8Array(N);
  for(let i=0;i<N;i++) free[i] = (g[i] && blk[i]<0) ? 1 : 0;
  /* эрозия 2x2 — игрок шириной 32u */
  const er=(m)=>{ const o=new Uint8Array(N);
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){ const i=y*W+x;
      if(m[i]&&m[i+1]&&m[i+W]&&m[i+W+1]) o[i]=1; } return o; };
  const flood=(m,sx,sy)=>{ const v=new Uint8Array(N), st=[];
    let s=-1;
    for(let r=0;r<12&&s<0;r++)for(let oy=-r;oy<=r&&s<0;oy++)for(let ox=-r;ox<=r;ox++){
      const x=sx+ox,y=sy+oy; if(x<0||y<0||x>=W||y>=H) continue;
      if(m[y*W+x]){ s=y*W+x; break; } }
    if(s<0) return v;
    v[s]=1; st.push(s);
    while(st.length){ const j=st.pop(), x=j%W, y=(j/W)|0;
      for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const k=ny*W+nx; if(m[k]&&!v[k]){ v[k]=1; st.push(k); } } }
    return v; };
  const P=cur.m.pts;
  const eAll=er(g), eFree=er(free);
  const vAll = flood(eAll, P.T[0], P.T[1]);
  const vFree = flood(eFree, P.T[0], P.T[1]);
  /* ВАЖНО. В первой версии этой проверки я посчитал потерянной любую клетку,
     достижимую без тел и недостижимую с телами. Это ровно та подмена, которую я
     чинил в самом генераторе (v120): клетка под ящиком недостижима не потому, что
     проход закрыт, а потому что она занята. Отсюда брались «отрезано 2500» —
     следы тел и кайма вокруг них. Потеряна клетка, которая ОСТАЛАСЬ годной
     позицией игрока (входит в эродированную маску С телами) и при этом стала
     недостижимой. */
  let отрезано=0;
  for(let i=0;i<N;i++) if(eFree[i]&&vAll[i]&&!vFree[i]) отрезано++;
  const дошли={};
  for(const k of ['A','B','C','M']){ const p=P[k]; if(!p) continue;
    let ok=false;
    for(let r=0;r<=8&&!ok;r++)for(let oy=-r;oy<=r&&!ok;oy++)for(let ox=-r;ox<=r;ox++){
      const x=p[0]+ox,y=p[1]+oy; if(x<0||y<0||x>=W||y>=H) continue;
      if(vFree[y*W+x]){ ok=true; break; } }
    дошли[k]=ok; }
  /* --- КТО ИМЕННО РЕЖЕТ. Убираем по одному брашу-преграде и смотрим, сколько
         отрезанного возвращается. Кандидаты — только те, что стоят на границе
         между дошли/не дошли, иначе перебор бессмысленно длинный. --- */
  const lost=new Uint8Array(N);
  for(let i=0;i<N;i++) if(eFree[i]&&vAll[i]&&!vFree[i]) lost[i]=1;
  const cand=new Set();
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x;
    if(!lost[i]) continue;
    for(const [dx,dy] of D8){ const j=(y+dy)*W+(x+dx);
      if(blk[j]>=0) cand.add(blk[j]); } }
  const виновники=[];
  for(const idx of cand){
    const f2=new Uint8Array(N);
    for(let i=0;i<N;i++) f2[i] = (g[i] && (blk[i]<0 || blk[i]===idx)) ? 1 : 0;
    const e2=er(f2), v2=flood(e2, P.T[0], P.T[1]);
    let верн=0; for(let i=0;i<N;i++) if(lost[i]&&e2[i]&&v2[i]) верн++;
    if(верн>50){ const b=info[idx];
      /* ЗНАЕТ ЛИ О НЁМ ПРОВЕРКА. Чистка проходимости в слое деталей видит только
         cur.cover и cur.lmarks. Всё остальное — косяки, перемычки, пилястры, балки,
         плафоны, ступени помоста, палубы — выпускается ПОСЛЕ неё и ею не учтено.
         Если браш не совпадает ни с одним телом из расстановки, значит проход
         запечатало то, о чём генератор вообще не знает. */
      const cx0b=Math.floor(b.x0/U), cx1b=Math.ceil(b.x1/U)-1;
      const cy0b=H-Math.ceil(b.y1/U), cy1b=H-Math.floor(b.y0/U)-1;
      const пересек=(o)=>{ const ox0=o.x, oy0=o.y, ox1=o.x+(o.w||1)-1, oy1=o.y+(o.h||1)-1;
        return !(ox1<cx0b||ox0>cx1b||oy1<cy0b||oy0>cy1b); };
      let знает = (cur.cover||[]).some(пересек) || (cur.lmarks||[]).some(пересек);
      виновники.push({верн, знает, мат:b.mat.split('/').pop(),
        габ:Math.round(b.x1-b.x0)+'x'+Math.round(b.y1-b.y0)+'x'+Math.round(b.z1-b.z0),
        где:Math.round(b.x0)+' '+Math.round(b.y0)+' '+Math.round(b.z0)}); }
  }
  виновники.sort((a,b)=>b.верн-a.верн);
  /* --- ТОТ ЖЕ ПОДСЧЁТ, НО КРИТЕРИЕМ ГЕНЕРАТОРА ---
     Слой деталей считает тело преградой по полю hgt (>40) и по его следу в клетках.
     Если этот счёт даёт ноль, а счёт по настоящей геометрии — тысячи, значит
     расходятся не списки тел, а модель: генератор считает проходимым то, что
     в файле уже перекрыто. */
  const mGen=new Uint8Array(N);
  for(let i=0;i<N;i++) mGen[i]=g[i];
  const mark=(o,hh)=>{ if(hh<=40) return;
    for(let oy=0;oy<(o.h||1);oy++)for(let ox=0;ox<(o.w||1);ox++){
      const x=o.x+ox, y=o.y+oy; if(x>=0&&y>=0&&x<W&&y<H) mGen[y*W+x]=0; } };
  for(const c of (cur.cover||[])) mark(c, c.hgt==='full'?999:(c.hgt||40));
  for(const L of (cur.lmarks||[])) mark(L, 999);
  const vGen = flood(er(mGen), P.T[0], P.T[1]);
  const eGen = er(mGen);
  let потериГен=0;
  for(let i=0;i<N;i++) if(eGen[i]&&vAll[i]&&!vGen[i]) потериГен++;
  /* Клетки, которые перекрыты В ФАЙЛЕ, но в модели генератора свободны:
     это браши, выпущенные ПОСЛЕ чистки проходимости и ей не известные. */
  const чужие={};
  let nЧужих=0;
  for(let i=0;i<N;i++){
    if(!g[i]||blk[i]<0) continue;
    if(mGen[i]===0) continue;                 // генератор про это тело знает
    nЧужих++;
    const b=info[blk[i]];
    const key=b.mat.split('/').pop()+' '+Math.round(b.x1-b.x0)+'x'+Math.round(b.y1-b.y0)+'x'+Math.round(b.z1-b.z0);
    чужие[key]=(чужие[key]||0)+1; }
  /* --- ЗАПЕЧАТАННЫЕ СВЯЗИ МЕЖДУ МЕСТАМИ ---
     Сторож связности бережёт СВЯЗНОСТЬ: закрыть проход можно, если есть обход.
     Но игрок видит именно проход. Считаем: у скольких пар соседних мест ВСЯ полоса
     входа перекрыта телами, то есть проход между ними существует в растре и не
     существует в файле. */
  let запечатано=0, всегоСвязей=0; const примеры=[];
  const PL=cur.places;
  if(PL&&PL.list) for(const pl of PL.list) for(const s of (pl.strips||[])){
    if(pl.id>s.b) continue;
    всегоСвязей++;
    let свободных=0;
    for(const i of s.cells){ if(blk[i]<0) свободных++;
      const x=i%W, y=(i/W)|0;
      for(const [dx,dy] of D8){ const j=(y+dy)*W+(x+dx);
        if(j>=0&&j<N&&g[j]&&blk[j]<0&&PL.pid[j]===s.b) свободных++; } }
    if(свободных===0){ запечатано++;
      if(примеры.length<5) примеры.push((pl.им||('#'+pl.id))+' <-> '+((PL.list[s.b]||{}).им||('#'+s.b))+' (полоса '+s.n+' кл)'); } }
  const чуж=Object.entries(чужие).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const top=Object.entries(byMat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return { перекрыто:nb, отрезано, потериГен, дошли, top, чуж, nЧужих, запечатано, всегоСвязей, примеры, брашей:info.length, seed:cur.seed,
           виновники:виновники.slice(0,6), кандидатов:cand.size };
})()`;

(async () => {
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(require("fs").existsSync(EXE) ? { executablePath: EXE } : {});
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(BUILD));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 300000, polling: 400 });
  for (let k = 0; k < N; k++) {
    if (k) { const prev = await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${prev}`, null, { timeout: 300000, polling: 400 }); }
    await p.waitForTimeout(300);
    const r = await p.evaluate(PROBE);
    console.log(`\nкарта ${r.seed}: брашей ${r.брашей}`);
    console.log(`  клеток пола ПЕРЕКРЫТО брашем: ${r.перекрыто}`);
    console.log(`  потери КРИТЕРИЕМ ГЕНЕРАТОРА (по hgt и следу): ${r.потериГен} клеток`);
    console.log(`  потери ПО НАСТОЯЩЕЙ ГЕОМЕТРИИ: ${r.отрезано} клеток · дошли ` +
      Object.entries(r.дошли).map(([k2, v]) => k2 + (v ? '+' : ' НЕТ')).join(' '));
    console.log(`  ЗАПЕЧАТАННЫХ СВЯЗЕЙ между местами: ${r.запечатано} из ${r.всегоСвязей}`);
    for (const e of r.примеры) console.log(`       ${e}`);
    console.log(`  клеток перекрыто тем, о чём проверка не знает: ${r.nЧужих}`);
    for (const [k2, v] of r.чуж) console.log(`     ${String(v).padStart(5)}  ${k2}`);
    if (r.виновники.length) {
      console.log(`  КТО РЕЖЕТ (снятие возвращает столько клеток), кандидатов ${r.кандидатов}:`);
      for (const v of r.виновники) console.log(`     +${String(v.верн).padStart(5)}  ${v.габ.padEnd(16)} ${(v.знает?'[учтён]':'[НЕ УЧТЁН]').padEnd(12)} ${v.мат.padEnd(20)} @ ${v.где}`);
    } else console.log('  одного виновника нет — режет совокупность');
  }
  await b.close();
})();
