/* Контактная линия на проектных дорогах v142. Из корня репозитория:
   node tools/kontakt.js сид:цель:ковёр [ещё тройки]
   node tools/kontakt.js --etalon   (NAV из архивов Mirage и Dust2)
   Таблицы и планы пишутся в out/kontakt/<тройка>/. Начало координат — левый
   нижний угол плана, X вправо, Y вверх, юниты VMF. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const build = path.join(root, 'builds/izohrona_v142.html');
const url = pathToFileURL(build).href;

// Оси существуют лишь во время build(). Повторяем только выбранный крупный
// план в отдельном JS-контексте и записываем оси без вмешательства в страницу.
// Карта принимается только при побайтовом совпадении маски и всех высот.
function roadGeometry(map) {
  const vm = require('node:vm');
  const cfg = map.layout, grid = map.coarse;
  let src=fs.readFileSync(path.join(root,'src/10_yadro.js'),'utf8');
  for (const [needle,statement] of [
    ['const wp=waypoints(A,B,0);', `roads.push({name:[A,B].map(n=>Object.keys(px).find(k=>px[k]===n)).join('→'),parts:[]});`],
    ['corridorVar(pP,pQ, wCorr', 'roads.at(-1).parts.push({from:[P.x,P.y],to:[Q.x,Q.y]});'],
    ['const za=zA==null?0:zA', 'roads.at(-1).parts.at(-1).pts=pts;']
  ]) {
    if (src.split(needle).length!==2) throw Error(`Неоднозначная точка чтения оси: ${needle}`);
    src=src.replace(needle,statement+needle);
  }
  const sandbox={cfg, roads:[], SC:1, CELL:grid.cell, V92:cfg.v92};
  const replay=vm.runInNewContext(src+`
    setSize(cfg.w,cfg.h); PWIDTH=cfg.width; ISLAND=cfg.island; PALACE=cfg.palace;
    Object.assign(V61,cfg.v61);
    build(mulberry32(cfg.seed),cfg.laneA,cfg.laneB,cfg.jit,cfg.vert,cfg.ring);`,sandbox);
  for (const [actual,key] of [[replay.g,'floor'],[replay.zfield,'z']]) {
    if (!Buffer.from(actual.buffer,actual.byteOffset,actual.byteLength).equals(Buffer.from(grid[key],'base64'))) throw Error(`Оси не соответствуют карте: ${key}`);
  }
  const sorted=names=>names.map(s=>s.split('→').sort().join('→')).sort().join('|');
  if (sorted(cfg.edges)!==sorted(sandbox.roads.map(r=>r.name))) throw Error('Не совпал набор дорог и петель');
  return sandbox.roads;
}

async function openMap(page, code) {
  if (!await page.locator('#nomerVvod').isVisible()) await page.locator('#nomerVvod >> xpath=ancestor::details/summary').click();
  await page.locator('#nomerVvod').fill(code);
  await page.locator('#nomerVvod').press('Enter');
  const opened=await page.waitForFunction(() => {
    const msg=document.querySelector('#nomerMsg').textContent;
    return msg.startsWith('не собралась') ? msg : msg.startsWith('открыта карта') && НОМЕР.код();
  },null,{timeout:180000});
  const actual=await opened.jsonValue();
  if(actual!==code) throw Error(`Не открылась карта ${code}: ${actual}`);
  return page.evaluate(() => {
    // Компактная передача массивов без преобразования Infinity в JSON null.
    function bytes(a) {
      const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      let text = '';
      for (let i = 0; i < u.length; i += 8192) text += String.fromCharCode(...u.subarray(i, i + 8192));
      return btoa(text);
    }
    function grid(g, m, w, h, cell, measured=true) {
      if (!m || m.dT.dist.length !== w*h || m.dC.dist.length !== w*h) throw Error(`Нет полей measure() на ${cell}u`);
      return { w, h, cell, floor: bytes(g.g), z: bytes(Float32Array.from(g.zfield)), jump: JUMPZ,
        t: bytes(m.dT.dist), ct: bytes(m.dC.dist), sec: m.SEC, points: m.pts,
        checks: measured ? { A: m.mA, B: m.mB, M: m.midDiff } : null };
    }
    const coarse = cur.__coarse;
    const edges=[...EDGES.map(e=>e.slice(0,2).join('→')), ...coarse.rings.map(r=>r.replace('-', '→'))];
    return { coarse: grid(coarse, coarse.m, cur.__cw, cur.__ch, 96),
      fine: grid(cur, cur.mFine || cur.m, cur.W, cur.H, cur.CELL, !!cur.mFine),
      layout: {w:cur.__cw,h:cur.__ch,seed:cur.seed,laneA:coarse.laneA,laneB:coarse.laneB,
        width:PWIDTH,island:ISLAND,palace:PALACE,v61:V61,v92:V92,edges,jit:+sJit.value,vert:+sVert.value,ring:+sRing.value},
      places: cur.places.list.filter(p=>p.им).map(p=>({name:p.им, x:((p.ax??p.x)+.5)*cur.CELL, y:((p.ay??p.y)+.5)*cur.CELL})),
      profile: document.querySelector('#sProf').value, tempo: +sTempo.value };
  });
}

function field(raw) {
  for (const [key, type] of [['floor',Uint8Array], ['z',Float32Array], ['t',Float64Array], ['ct',Float64Array]]) {
    const buf = Buffer.from(raw[key], 'base64');
    raw[key] = new type(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return raw;
}

// Каждый проходимый квадрат делится на восемь треугольников. В центре берём
// точное значение measure(). На общей стороне — среднее её двух центров, в
// углу — среднее центров, достижимых в этом углу без стены и обрыва. Поэтому
// интерполяция определена даже в коридоре в одну клетку и обрывается у стен.
const rim = [[1,.5],[1,1],[.5,1],[0,1],[0,.5],[0,0],[.5,0],[1,0]];
function surface(grid) {
  const { w,h,cell,floor,z,t,ct,sec,jump } = grid;
  const ok = i => i >= 0 && i < w*h && floor[i] && Number.isFinite(t[i]) && Number.isFinite(ct[i]);
  const cache = new Map();
  function tile(x,y) {
    if (x<0 || y<0 || x>=w || y>=h) return null;
    const i = y*w+x;
    if (!ok(i)) return null;
    if (cache.has(i)) return cache.get(i);
    const vertex = (u,v,ids) => ({x:(x+u)*cell, y:(y+v)*cell,
      t:ids.reduce((a,k)=>a+t[k],0)*sec/ids.length, ct:ids.reduce((a,k)=>a+ct[k],0)*sec/ids.length});
    const boundary = rim.map(([u,v]) => {
      const dx = u===.5 ? 0 : 2*u-1, dy = v===.5 ? 0 : 2*v-1;
      const around = [[x,y],[x+dx,y],[x,y+dy],[x+dx,y+dy]].filter(([a,b])=>a>=0&&a<w&&b>=0&&b<h);
      const reachable = [i];
      for (const k of reachable) for (const [a,b] of around) {
        const j=b*w+a;
        if (Math.abs(k%w-a)+Math.abs(Math.floor(k/w)-b)===1 && ok(j) && !reachable.includes(j) && Math.abs(z[k]-z[j])<=jump) reachable.push(j);
      }
      return vertex(u,v,reachable);
    });
    const data = { center:vertex(.5,.5,[i]), boundary };
    cache.set(i,data);
    return data;
  }
  function triangle(x,y) {
    const u = x/cell, v = y/cell;
    const xs = Number.isInteger(u) ? [u,u-1] : [Math.floor(u)];
    const ys = Number.isInteger(v) ? [v,v-1] : [Math.floor(v)];
    for (const a of xs) for (const b of ys) {
      const data = tile(a,b);
      if (!data) continue;
      const angle = Math.atan2(v-b-.5,u-a-.5);
      const sector = (Math.floor(angle/(Math.PI/4))+8)%8;
      return [data.center,data.boundary[sector],data.boundary[(sector+1)%8]];
    }
    return null;
  }
  function contour() {
    const segments = [];
    for (let i=0;i<w*h;i++) {
      if (!ok(i)) continue;
      const x=i%w, y=Math.floor(i/w), sign=Math.sign(t[i]-ct[i]);
      let nearby=false;
      for (let b=Math.max(0,y-1); b<=Math.min(h-1,y+1); b++) for (let a=Math.max(0,x-1); a<=Math.min(w-1,x+1); a++) {
        const j=b*w+a;
        if (ok(j) && (!sign || Math.sign(t[j]-ct[j])!==sign)) nearby=true;
      }
      if (!nearby) continue;
      const { center, boundary } = tile(x,y);
      for (let n=0;n<8;n++) {
        const tri=[center,boundary[n],boundary[(n+1)%8]], pts=[];
        for (let e=0;e<3;e++) {
          const a=tri[e], b=tri[(e+1)%3], da=a.t-a.ct, db=b.t-b.ct;
          if (da===0) pts.push([a.x,a.y]);
          if (da*db<0) pts.push([lerp(a.x,b.x,da/(da-db)),lerp(a.y,b.y,da/(da-db))]);
        }
        if (pts.length===2) segments.push(pts);
        // Во всей грани времена совпали. Это область равенства, её нельзя
        // превращать в россыпь фиктивных отрезков: по её периметру уже пройдут
        // соседние незатронутые треугольники.
      }
    }
    return segments;
  }
  return {triangle,contour};
}
const lerp = (a,b,u) => a+(b-a)*u;
// Один корень на линейном отрезке поля — для оси генератора и ребра NAV.
function zeroBetween(a,b,axes) {
  const da=a.t-a.ct, db=b.t-b.ct, u=da/(da-db);
  return Object.fromEntries([...axes,'t','ct'].map(k=>[k,lerp(a[k],b[k],u)]));
}
function times(tri,x,y) {
  const [p,q,r] = tri, dx=x-p.x, dy=y-p.y;
  const det=(q.x-p.x)*(r.y-p.y)-(r.x-p.x)*(q.y-p.y);
  const v=(dx*(r.y-p.y)-dy*(r.x-p.x))/det, u=((q.x-p.x)*dy-(q.y-p.y)*dx)/det;
  const t=p.t+v*(q.t-p.t)+u*(r.t-p.t), ct=p.ct+v*(q.ct-p.ct)+u*(r.ct-p.ct);
  return {x,y,t,ct};
}

function roadLine(road) {
  const points=[];
  for (const part of road.parts) for (const [a,b] of [part.from,...part.pts,part.to]) {
    const x=(a+.5)*96, y=(b+.5)*96, last=points.at(-1);
    if (!last || last[0]!==x || last[1]!==y) points.push([x,y]);
  }
  return points;
}

function readRoad(line, grid, mesh) {
  const hits=[], runs=[], sides=new Set(), cell=grid.cell;
  let length=0, gap=0, run=null, previous=null;
  function observe(p) {
    // Округление только на уровне шума IEEE при интерполяции в общей вершине.
    const d=p.t-p.ct, sign=Math.abs(d)<=8*Number.EPSILON*Math.max(1,p.t,p.ct)?0:Math.sign(d);
    if (sign) sides.add(sign);
    if (!previous) { previous={...p,sign}; return; }
    if (previous.sign*sign<0) {
      const h=zeroBetween(previous,p,['x','y','s']);
      hits.push({...h,kind:'переход',direction:sign});
    }
    if (!sign && previous.sign) run={start:p,end:p,enter:previous.sign};
    if (!sign && !previous.sign && run) run.end=p;
    if (sign && !previous.sign) closeZero(sign);
    previous={...p,sign};
  }
  function closeZero(exit=0) {
    if (!previous?.sign && !run && previous) run={start:previous,end:previous,enter:0};
    if (!run) return;
    const {start,end,enter}=run, span=end.s-start.s;
    hits.push({...start, end:span>1e-7 ? end : undefined,
      kind:span>1e-7?'отрезок равенства':(!enter||!exit?'граница':enter===exit?'касание':'переход'), direction:enter&&exit&&enter!==exit?exit:0});
    run=null;
  }
  for (let i=1;i<line.length;i++) {
    const [x,y]=line[i-1], [bx,by]=line[i], dx=bx-x, dy=by-y, len=Math.hypot(dx,dy), cuts=[0,1];
    for (const [a,d,step] of [[x,dx,cell/2],[y,dy,cell/2],[x+y,dx+dy,cell],[x-y,dx-dy,cell]]) {
      const hi=Math.max(a,a+d), lo=Math.min(a,a+d);
      for (let k=Math.floor(lo/step)+1;k*step<hi;k++) cuts.push((k*step-a)/d);
    }
    cuts.sort((a,b)=>a-b);
    for (let j=1;j<cuts.length;j++) {
      const a=cuts[j-1], b=cuts[j]; if (b-a<1e-12) continue;
      const m=(a+b)/2, tri=mesh.triangle(x+dx*m,y+dy*m);
      if (!tri) {closeZero();previous=null;gap+=len*(b-a);continue;}
      const sample = u => ({...times(tri,x+dx*u,y+dy*u),s:length+len*u});
      const left=sample(a), right=sample(b);
      // Разрыв поля на кромке уступа, даже когда с двух сторон есть пол.
      if (previous && (Math.abs(previous.t-left.t)>1e-8 || Math.abs(previous.ct-left.ct)>1e-8)) {closeZero();previous=null;}
      if (!previous) {
        observe(left);
        if (!previous.sign) run={start:left,end:left,enter:0};
        runs.push([left.s,right.s]);
      } else runs.at(-1)[1]=right.s;
      observe(right);
    }
    length+=len;
  }
  closeZero();
  return {hits,gap,runs,sides:[...sides],length};
}

// Сохраняем порядок вдоль оси и направление смены знака. При разном числе
// корней подбираем максимальное число совместимых пар с наименьшей суммой
// продольных сдвигов. У оставшихся нет численного «сдвига».
function pairHits(a,b) {
  const memo=new Map();
  function best(i,j) {
    const key=`${i},${j}`;
    if (memo.has(key)) return memo.get(key);
    if (i===a.length && j===b.length) return {count:0,cost:0,pairs:[]};
    const choices=[];
    function take(p,q,di,dj) {
      const r=best(i+di,j+dj), match=di&&dj;
      choices.push({count:r.count+match,cost:r.cost+(match?Math.abs(p.s-q.s):0),pairs:[[p,q],...r.pairs]});
    }
    if (a[i] && b[j] && a[i].direction===b[j].direction && a[i].kind===b[j].kind) take(a[i],b[j],1,1);
    if (a[i]) take(a[i],null,1,0);
    if (b[j]) take(null,b[j],0,1);
    choices.sort((x,y)=>y.count-x.count || x.cost-y.cost);
    memo.set(key,choices[0]); return choices[0];
  }
  return best(0,0).pairs;
}
function status(r) {
  const n=r.hits.filter(h=>h.kind==='переход').length;
  let s=n>1?`${n} перехода`:n?'1 переход':r.sides.length===2?'оба знака на разорванной оси':r.sides.length?`ближе ${r.sides[0]<0?'T':'CT'}`:'нет данных';
  const extra=r.hits.filter(h=>h.kind!=='переход').map(h=>h.kind);
  return [s,...extra,...(r.runs.length>1 || r.gap>1e-7?['есть разрыв']:[])].join(' · ');
}
const rounded = (n,d=3) => Number.isFinite(n) ? n.toFixed(d) : '';
function tsv(headers,rows) {return [headers,...rows].map(row=>row.join('\t')).join('\n')+'\n';}
function write(dir,name,content) {fs.writeFileSync(path.join(dir,name),content);}
function analyse(code, map, dir) {
  const roadPaths=roadGeometry(map);
  const coarse=field(map.coarse), fine=field(map.fine), levels=[coarse,fine], meshes=levels.map(surface);
  const checkRows=[], coords=([x,y],g)=>[(x+.5)*g.cell,(y+.5)*g.cell];
  for (const [j,g] of levels.entries()) for (const k of ['A','B','M']) {
    const [x,y]=coords(g.points[k],g), tile=meshes[j].triangle(x,y);
    const [px,py]=g.points[k], i=py*g.w+px;
    const {t,ct}=tile ? times(tile,x,y) : {t:g.t[i]*g.sec,ct:g.ct[i]*g.sec};
    const d=t-ct;
    if (!g.checks) {checkRows.push([g.cell,k,t,ct,d,'','','measure() без результата']);continue;}
    const ref=g.checks[k], same=Object.is(d,ref);
    checkRows.push([g.cell,k,t,ct,d,ref,Number.isFinite(d)?d-ref:'',same?(Number.isFinite(d)?'PASS':'нет конечного времени'):'FAIL']);
    if (!same) throw Error(`Сверка ${g.cell}u ${k}: ${d} != ${ref}`);
  }
  const checks=tsv(['сетка_u','узел','T_с','CT_с','T−CT_с','measure_с','ошибка_с','итог'],checkRows);
  const rows=[], shiftRows=[], roads=[];
  const h=fine.h*fine.cell;
  const nearest=p=>map.places.reduce((best,a)=> Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?a:best).name;
  for (const [index,road] of roadPaths.entries()) {
    const id=String(index+1).padStart(2,'0'), line=roadLine(road), [c,f]=levels.map((g,j)=>readRoad(line,g,meshes[j]));
    for (const [j,r] of [c,f].entries()) {
      const hits=r.hits.length?r.hits:[null];
      for (const [k,p] of hits.entries()) {
        if (p) { p.id=id+(r.hits.length>1?String.fromCharCode(97+k):''); p.place=nearest(p); }
        rows.push([id,road.name,levels[j].cell,status(r),p?.id,p?.kind,p?.direction===1?'T→CT':p?.direction===-1?'CT→T':'',
          rounded(p?.s),rounded(p?.x),rounded(h-p?.y),p?.place,rounded(p?.t,9),rounded(p?.ct,9),rounded(p?.t-p?.ct,12),
          rounded(p?.end?.s),rounded(p?.end?.x),rounded(h-p?.end?.y),rounded(r.gap),r.runs.length]);
      }
    }
    for (const [p,q] of pairHits(c.hits,f.hits)) shiftRows.push([id,road.name,p?.id,q?.id,p&&q?'пара':q?'только 16u':'только 96u',
      rounded(p?.x),rounded(h-p?.y),rounded(q?.x),rounded(h-q?.y),rounded(q?.s-p?.s),rounded(Math.hypot(q?.x-p?.x,q?.y-p?.y))]);
    roads.push({id,name:road.name,line,c,f});
  }
  const table=tsv(['дорога','узлы','сетка_u','состояние','метка','тип','смена_ближайшей','вдоль_оси_u','X_u','Y_u','ближайший_каллаут','T_с','CT_с','T−CT_с','конец_равенства_вдоль_u','конец_X_u','конец_Y_u','нет_поля_u','целых_фрагментов'],rows);
  const shifts=tsv(['дорога','узлы','точка_96','точка_16','сопоставление','X96_u','Y96_u','X16_u','Y16_u','сдвиг_вдоль_u','расстояние_XY_u'],shiftRows);
  write(dir,'roads.tsv',table); write(dir,'shift.tsv',shifts); write(dir,'measure.tsv',checks);
  console.log(`\n${code}\n${table}\n${shifts}\n${checks}`);
  const points=Object.fromEntries(Object.entries(fine.points).map(([k,p])=>[k,coords(p,fine)]));
  const floorRows=[];
  for (let y=0;y<fine.h;y++) for (let x=0;x<fine.w;) {
    if (!fine.floor[y*fine.w+x]) {x++; continue;}
    const x0=x++; while(x<fine.w && fine.floor[y*fine.w+x]) x++;
    floorRows.push([x0,y,x-x0]);
  }
  return {code, profile:map.profile, tempo:map.tempo, places:map.places, roads, floorRows, points,
    w:fine.w*fine.cell,h,cell:fine.cell,calibration16:fine.checks?'measure() 16u':'refineFields(): SEC 96u / 6 (measure() 16u без результата)', contour:meshes[1].contour(),
    checks:checkRows, shifts:shiftRows.filter(r=>r[4]==='пара').map(r=>Number(r[10])),
    onlyCoarse:shiftRows.filter(r=>r[4]==='только 96u').length,onlyFine:shiftRows.filter(r=>r[4]==='только 16u').length};
}

// Canvas 2D в том же Chromium. Фиксированный масштаб 0.185 px/u и центр поля.
async function render(page,data,dir) {
  const encoded=await page.evaluate(d=>{
    const canvas=document.createElement('canvas'); canvas.width=1480; canvas.height=1260;
    const ctx=canvas.getContext('2d'), scale=.185, mapX=26, mapY=105, mapW=987, mapH=1103;
    const ox=mapX+(mapW-d.w*scale)/2, oy=mapY+(mapH-d.h*scale)/2;
    const screen=p=>[ox+p[0]*scale,oy+p[1]*scale];
    const bg='#10181f', panel='#17232c', muted='#aebfc7', white='#eff6f4', front='#6effc3', dot='#ffe475';
    function rect(x,y,w,h,color) {ctx.fillStyle=color; ctx.fillRect(x,y,w,h);}
    function txt(text,x,y,color=white,size=17,bold=false) {
      ctx.fillStyle=color; ctx.font=`${bold?'bold ':''}${size}px "DejaVu Sans", sans-serif`; ctx.fillText(text,x,y);
    }
    function line(points,color,width=1) {
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
    }
    function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();}
    rect(0,0,1480,1260,bg);rect(mapX,mapY,mapW,mapH,'#202c35');
    txt('Где встречаются T и CT',30,48,white,34,true);
    txt(`Карта ${d.code}     /     профиль ${d.profile}`,32,80,muted,18);
        ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    // Один fill для соседних прямоугольников без швов сглаживания.
    ctx.beginPath();for(const [x,y,w] of d.floorRows) ctx.rect(x*d.cell,y*d.cell,w*d.cell,d.cell);
    ctx.fillStyle='#536473';ctx.fill();ctx.restore();
    const colors={T:'#dca988',CT:'#91b2d8',other:'#c2c8cd'};
    for(const r of d.roads) {
      const tone=!r.f.hits.length && r.f.sides.length===1 ? colors[r.f.sides[0]<0?'T':'CT'] :colors.other;
      let s=0;
      for(let i=1;i<r.line.length;i++) {
        const a=r.line[i-1], b=r.line[i], len=Math.hypot(b[0]-a[0],b[1]-a[1]);
        for (const [start,end] of r.f.runs) {
          const lo=Math.max(s,start), hi=Math.min(s+len,end);
          if (hi<=lo) continue;
          const at=v=>screen(a.map((x,k)=>x+(b[k]-a[k])*(v-s)/len));
          line([at(lo),at(hi)],tone,r.f.hits.length>1?2.7:1.45);
        } s+=len;
      }
    }
    ctx.lineCap='round';
    for (const [a,b] of d.contour) line([screen(a),screen(b)],'#12342d',6.5);
    for (const [a,b] of d.contour) line([screen(a),screen(b)],front,3);
    const groups=new Map();
    for(const r of d.roads) for(const p of r.f.hits){
      const key=[p.x,p.y].map(q=>q.toFixed(4)).join('/');
      if(!groups.has(key)) groups.set(key,{...p,labels:[]}); groups.get(key).labels.push(p.id);
    }
    const reserved=[], labels=[];
    for(const [k,[x,y]] of Object.entries(d.points)) {
      const [sx,sy]=screen([x,y]), name=k==='C'?'CT':k==='M'?'MID':k;
      const color=k==='C'?colors.CT:k==='T'?colors.T:white;
      reserved.push([sx-14,sy-11,30,23]);rect(sx-14,sy-11,30,23,'#192831');
      ctx.textAlign='center';txt(name,sx+1,sy+5,color,13,true);ctx.textAlign='left';
    }
    for(const p of groups.values()) {
      const [x,y]=screen([p.x,p.y]);circle(x,y,6,'#132128');circle(x,y,3.5,dot);
      reserved.push([x-5,y-5,10,10]); labels.push({x,y,label:p.labels.join('/'),color:dot,size:14,weight:true});
    }
    for(const p of d.places) {
      const same={BombsiteA:'A',BombsiteB:'B',Middle:'M',TSpawn:'T',CTSpawn:'C'}[p.name];
      if(same && Math.hypot(p.x-d.points[same][0],p.y-d.points[same][1])*scale<8) continue;
      const [x,y]=screen([p.x,p.y]); circle(x,y,2.2,'#cfdae0');labels.push({x,y,label:p.name,color:'#dde7ea',size:13,weight:false});
    }
    const overlap=(a,b)=>Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
    for (const l of labels) {
      ctx.font=`${l.weight?'bold ':''}${l.size}px "DejaVu Sans",sans-serif`;
      const w=ctx.measureText(l.label).width+9,h=l.size+5;
      let best=null,score=Infinity;
      for(let radius=10;radius<165;radius+=10) for(let j=0;j<12;j++) {
        const a=j*Math.PI/6, cx=l.x+Math.cos(a)*(radius+w/2),cy=l.y+Math.sin(a)*(radius+h/2), box=[cx-w/2,cy-h/2,w,h];
        if(box[0]<mapX+3||box[1]<mapY+3||box[0]+w>mapX+mapW-3||box[1]+h>mapY+mapH-3) continue;
        const cost=reserved.reduce((v,b)=>v+overlap(box,b),0)*1000+radius+j*.01;
        if(cost<score){score=cost;best=box;}
      }
      if(!best) continue;
      reserved.push(best);const [x,y]=best;
      line([[l.x,l.y],[Math.max(x,Math.min(x+w,l.x)),Math.max(y,Math.min(y+h,l.y))]],l.color,.8);
      rect(x,y,w,h,'#22313b');txt(l.label,x+4,y+h-4,l.color,l.size,l.weight);
    }
    const side=1035;
    txt('Контакт на мелкой сетке',side,147,white,25,true);
    line([[side,178],[side+38,178]],front,3);txt('Равное время T и CT',side+49,184,white,17);
    circle(side+18,211,5,dot);txt('Пересечение с осью дороги',side+49,217,white,17);
    line([[side,244],[side+38,244]],colors.T,2);txt('Всю измеренную часть ближе T',side+49,250,muted,16);
    line([[side,274],[side+38,274]],colors.CT,2);txt('Всю измеренную часть ближе CT',side+49,280,muted,16);
    const top=336;
    txt('Дорога',side,top,white,19,true);txt('96u',side+208,top,white,17,true);txt('16u',side+265,top,white,17,true);txt('Ближе¹',side+326,top,white,16,true);
    d.roads.forEach((r,i)=>{
      const y=top+33+i*27;
      if(i%2===0) rect(side-3,y-19,415,26,panel);
      txt(`${r.id}   ${r.name}`,side+2,y,white,16);
      txt(String(r.c.hits.length),side+217,y,muted,16);
      txt(String(r.f.hits.length),side+274,y,r.f.hits.length?dot:muted,16,!!r.f.hits.length);
      const s=r.f.sides.length===1?(r.f.sides[0]<0?'T':'CT'):'—';
      const gap=r.f.gap>1e-7||r.f.runs.length>1;
      txt(s+(gap?' *':''),side+339,y,colors[s]||muted,16);
    });
    const foot=top+46+d.roads.length*27;
    txt('¹ На измеренной части оси, сетка 16u.',side,foot,muted,14);
    txt('* Ось прерывается стеной или уступом.',side,foot+23,muted,14);
    txt('a, b, c — контакты в порядке от первого узла.',side,foot+46,muted,14);
    const missing=d.checks.filter(row=>row[0]===16 && !Number.isFinite(row[4])).map(row=>row[1]);
    if(missing.length) txt(`Нет конечного времени в узле ${missing.join(', ')}.`,side,foot+75,dot,14);
    if(d.calibration16.startsWith('refineFields')) txt('Секунды 16u — по шкале крупной сетки.',side,foot+98,muted,14);
    const sy=1232;line([[mapX+3,sy],[mapX+3+500*scale,sy]],white,2);
    txt('500u',mapX+12+500*scale,sy+6,muted,15);txt('План сверху   ·   север / +Y вверх',mapX+240,sy+6,muted,15);
    return canvas.toDataURL('image/png').split(',')[1];
  },data);
  fs.writeFileSync(path.join(dir,'plan.png'),Buffer.from(encoded,'base64'));
}

// NAV хранит многослойный граф, без растра 96/16. Читаем штатное время
// EarliestOccupyTimes для каждой команды, включая исходный признак 120.
const navReader = String.raw`import io
import json
from pathlib import Path
import re
import struct
import sys
import zipfile

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
import navlib2


def read_archive(archive):
    with zipfile.ZipFile(archive) as z:
        nav_name, = (p for p in z.namelist() if p.endswith('.nav'))
        bsp_name, = (p for p in z.namelist() if p.endswith('.bsp'))
        data, bsp = z.read(nav_name), z.read(bsp_name)

    # Для каждой области navlib2 читает две пары float32: угловые высоты и
    # EarliestOccupyTimes. Вторая пара не входит в его результат. Перехватываем
    # обе и проверяем их порядок по высотам всех прочитанных областей.
    pairs = []
    class NavStruct:
        calcsize = staticmethod(struct.calcsize)

        @staticmethod
        def unpack_from(fmt, data, pos):
            values = struct.unpack_from(fmt, data, pos)
            if fmt == '<2f':
                pairs.append(values)
            return values

    navlib2.struct = NavStruct
    navlib2.open = lambda *_: io.BytesIO(data)
    nav = navlib2.read_nav2(nav_name)
    if len(pairs) != 2 * len(nav['areas']) or pairs[::2] != [(a['nez'], a['swz']) for a in nav['areas']]:
        raise ValueError('Изменился формат пар высоты и времени NAV')
    if nav['ver'] != 16:
        raise ValueError(f"Неизвестная версия NAV {nav['ver']}")
    areas = []
    for a, occupy in zip(nav['areas'], pairs[1::2]):
        x0, y0, _ = a['lo']
        x1, y1, _ = a['hi']
        z = (a['nw'][2] + a['se'][2] + a['nez'] + a['swz']) / 4
        areas.append(dict(id=a['id'], box=[x0, y0, x1, y1], z=z, times=occupy,
                          name=a['pname'], neighbors=[j for side in a['conns'] for j in side]))
    def lump(n):
        offset, size = struct.unpack_from('<ii', bsp, 8 + n * 16)
        return bsp[offset:offset + size]
    if bsp[:4] != b'VBSP':
        raise ValueError('Неизвестный BSP')
    entities = [dict(re.findall(r'"([^"]*)"\s+"([^"]*)"', b))
                for b in re.findall(r'\{([^{}]*)\}', lump(0).decode('latin1'))]
    marks = []
    for name, cls in [('T', 'info_player_terrorist'), ('CT', 'info_player_counterterrorist')]:
        spawn = [[float(v) for v in e['origin'].split()] for e in entities if e.get('classname') == cls]
        marks.append({'name': name, 'xyz': [sum(p[i] for p in spawn) / len(spawn) for i in range(3)]})
    models = lump(14)
    for e in entities:
        if e.get('classname') == 'func_bomb_target':
            # dmodel_t имеет 48 байт. Центр триггера — середина bbox, названия
            # A и B не присваиваются по надуманной ориентации плана.
            i = int(e['model'][1:])
            bounds = struct.unpack_from('<6f', models, i * 48)
            marks.append({'name': e.get('targetname') or f'плент *{i}',
                          'xyz': [(bounds[k] + bounds[k+3]) / 2 for k in range(3)]})
    return {'file': nav_name, 'areas': areas, 'marks': marks, 'places': nav['places']}


if __name__ == '__main__':
    json.dump(read_archive(Path(sys.argv[2])), sys.stdout, allow_nan=False)
`;
async function references(browser) {
  const { execFileSync }=require('node:child_process');
  const page=await browser.newPage();
  for (const archive of fs.readdirSync(path.join(root,'data/etalon_src')).filter(n=>n.endsWith('.zip')).sort()) {
    const data=JSON.parse(execFileSync('python3',['-B','-c',navReader,__dirname,path.join(root,'data/etalon_src',archive)],{maxBuffer:16*1024*1024}));
    const mapName=data.file.split('_')[1], dir=path.join(root,'out','kontakt',mapName);
    fs.mkdirSync(dir,{recursive:true});
    const nodes=new Map(data.areas.map(a=>[a.id,{...a,x:(a.box[0]+a.box[2])/2,y:(a.box[1]+a.box[3])/2,t:a.times[0],ct:a.times[1]}]));
    const nearestArea=(mark,areas)=>{
      const [x,y,z]=mark.xyz;
      return areas.reduce((best,a)=>Math.hypot(x-a.x,y-a.y,z-a.z)<Math.hypot(x-best.x,y-best.y,z-best.z)?a:best);
    };
    const spawnCheck={};
    for(const mark of data.marks){
      if(mark.name==='T'||mark.name==='CT') {
        const n=nearestArea(mark,[...nodes.values()]);
        if ((mark.name==='T' && n.t>=n.ct)||(mark.name==='CT' && n.ct>=n.t)) throw Error(`Не подтверждён порядок команд NAV: ${mark.name}`);
        spawnCheck[mark.name]={area:n.id,t:n.t,ct:n.ct};
      } else if(mark.name.startsWith('плент *')) {
        const sites=[...nodes.values()].filter(n=>n.name==='BombsiteA'||n.name==='BombsiteB');
        if(sites.length) mark.name=nearestArea(mark,sites).name;
      }
    }
    const rows=[],hits=[],seen=new Set();let skipped=0;
    for(const a of nodes.values()) for(const id of a.neighbors) {
      const key=[a.id,id].sort((i,j)=>i-j).join('↔');
      if(seen.has(key)) continue;
      seen.add(key);
      const b=nodes.get(id);
      if(!b) throw Error(`Нет области NAV ${id}`);
      const da=a.t-a.ct, db=b.t-b.ct;
      let p=null, state;
      if ([a.t,a.ct,b.t,b.ct].some(t=>!Number.isFinite(t)||t>=120)) {state='нет доступного времени';skipped++;}
      else if(da*db<0) {p=zeroBetween(a,b,['x','y','z']);state='переход';}
      else if(!da || !db) {p=!da?a:b;state=!da&&!db?'отрезок равенства':'граница';}
      else state=(da<0?'ближе T':'ближе CT');
      let label,mark;
      if(p) {
        const near=Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)<=Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z)?a:b;
        label=near.name || `NAV ${near.id}`; mark=`${hits.length+1}`;
        hits.push({id:mark,x:p.x,y:p.y,z:p.z,t:p.t,ct:p.ct,name:label,a:[a.x,a.y],b:[b.x,b.y]});
      }
      rows.push([`${a.id}↔${b.id}`,state,a.name,b.name,rounded(da,6),rounded(db,6),mark,rounded(p?.x),rounded(p?.y),rounded(p?.z),label,rounded(p?.t,9),rounded(p?.ct,9),rounded(p?.t-p?.ct,12)]);
    }
    const table=tsv(['области_NAV','состояние','название_1','название_2','T−CT_1_с','T−CT_2_с','метка','X_u','Y_u','Z_u','ближайшая_область','T_с','CT_с','T−CT_с'],rows);
    write(dir,'roads.tsv',table);console.log(`${mapName}\n${table}`);
    const stats={source:archive,model:'NAV v16 EarliestOccupyTimes, T=0, CT=1; 120 = недоступно',areas:nodes.size,edges:seen.size,unmeasured:skipped,
      contacts:hits.length,timeRange:[Math.min(...hits.map(p=>p.t)),Math.max(...hits.map(p=>p.t))],placeNames:data.places,spawnCheck,marks:data.marks};
    write(dir,'summary.json',JSON.stringify(stats,null,2)+'\n');
    const png=await page.evaluate(({areas,hits,marks,mapName,names,edges})=>{
      const canvas=document.createElement('canvas');canvas.width=1250;canvas.height=1090;
      const ctx=canvas.getContext('2d'), scale=.18, maxY=Math.max(...areas.map(a=>a.box[3])), minY=Math.min(...areas.map(a=>a.box[1])), minX=Math.min(...areas.map(a=>a.box[0])), maxX=Math.max(...areas.map(a=>a.box[2]));
      const xy=(x,y)=>[480+(x-(minX+maxX)/2)*scale,575-(y-(minY+maxY)/2)*scale];
      function text(s,x,y,c='#eff6f4',sz=16) {ctx.font=`${sz}px "DejaVu Sans",sans-serif`;ctx.fillStyle=c;ctx.fillText(s,x,y);}
      ctx.fillStyle='#10181f';ctx.fillRect(0,0,1250,1090);
      text(`${mapName==='dust2'?'Dust2':'Mirage'}  /  контакты графа NAV`,30,54,'#eff6f4',34);
      text('Время входа команд из NAV v16, секунды. Число у точки — метка в roads.tsv.',32,89,'#b9c8cd',17);
      for (const a of areas) {const [x0,y0,x1,y1]=a.box, [x,y]=xy(x0,y1);ctx.fillStyle='#526572';ctx.fillRect(x,y,Math.max(.6,(x1-x0)*scale),Math.max(.6,(y1-y0)*scale));}
      for(const p of hits){const [x,y]=xy(p.x,p.y);ctx.beginPath();ctx.moveTo(...xy(...p.a));ctx.lineTo(...xy(...p.b));ctx.strokeStyle='#73e9bb';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.fillStyle='#ffe475';ctx.fill();}
      const taken=[];
      for(const m of marks){const [x,y]=xy(...m.xyz);ctx.fillStyle='#152229';ctx.fillRect(x-5,y-12,Math.max(24,m.name.length*10+9),20);text(m.name,x-2,y+4,'#ffffff',14);taken.push([x-5,y-12,Math.max(24,m.name.length*10+9),20]);}
      for(const p of hits){const [x,y]=xy(p.x,p.y);let best=null;
        for(let r=10;r<135 && !best;r+=5) for(let i=0;i<16;i++){
          const a=i*Math.PI/8,l=x+Math.cos(a)*r-8,t=y+Math.sin(a)*r-7,w=18,h=14;
          if(taken.every(([a,b,c,d])=>l+w<a||l>a+c||t+h<b||t>b+d)){best=[l,t,w,h];break;}
        }
        if (!best) continue;
        taken.push(best);const [l,t,w,h]=best;ctx.strokeStyle='#f6e59f';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(l+w/2,t+h/2);ctx.stroke();ctx.fillStyle='#263039';ctx.fillRect(l,t,w,h);text(p.id,l+1,t+12,'#ffe475',12);
      }
      text(`${hits.length} контактов`,936,166,'#ffe475',26);
      text(`Из ${edges} связей NAV`,937,199);text('между соседними областями.',937,224);
      text('Время в точке равенства',937,292);text(`${Math.min(...hits.map(p=>p.t)).toFixed(2)}–${Math.max(...hits.map(p=>p.t)).toFixed(2)} с`,937,326,'#73e9bb',24);
      if(names.length){const counts={};for(const p of hits)counts[p.name]=(counts[p.name]||0)+1;let y=418;text('Ближайшие области',937,386);for(const [name,n] of Object.entries(counts).sort((a,b)=>b[1]-a[1])){text(`${name}   ${n}`,937,y);y+=27;}}
      else {text('В архивном NAV',937,386);text('названия областей пусты.',937,412);}
      text('Линия вдоль каждой связи',937,660);text('со сменой знака показана',937,684);text('зелёным. Жёлтая точка —',937,708);text('где T и CT равны.',937,732);
      text('Вид сверху  ·  +Y вверх  ·  масштаб 0,18 px/u',32,1058,'#b9c8cd',16);
      return canvas.toDataURL('image/png').split(',')[1];
    },{areas:data.areas,hits,marks:data.marks,mapName,names:data.places,edges:seen.size});
    fs.writeFileSync(path.join(dir,'plan.png'),Buffer.from(png,'base64'));console.error(JSON.stringify(stats));
  }
}

async function main() {
  let codes=process.argv.slice(2);
  if (codes.length===1 && codes[0]==='--etalon') {
    const browser=await chromium.launch();try {await references(browser);} finally {await browser.close();}return;
  }
  if (!codes.length || codes.some(c=>!/^\d+:-?\d+(?:\.\d+)?(?:e-?\d+)?:\d+$/.test(c))) throw Error('Запуск: node tools/kontakt.js сид:цель:ковёр [ещё тройки]');
  codes=codes.map(code=>{
    const [seed,aim,cover]=code.split(':').map(Number);
    if (!Number.isInteger(seed)||seed<=0||seed>0xffffffff||!Number.isFinite(aim)||!Number.isInteger(cover)||cover>0xffffffff) throw Error(`Недопустимый номер ${code}`);
    return [seed,aim,cover].join(':');
  });
  const start=performance.now(), browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(180000);
    await page.goto(url,{timeout:180000});
    await page.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:180000});
    for(const code of codes) {
      const a=performance.now(), data=await openMap(page,code), b=performance.now();
      const dir=path.join(root,'out','kontakt',code.replaceAll(':','_'));
      fs.mkdirSync(dir,{recursive:true});
      const result=analyse(code,data,dir);
      await render(page,result,dir);
      const c=performance.now();
      const summary={code,profile:result.profile,tempo:result.tempo,browser:browser.version(),renderer:'Chromium Canvas 2D, 1480×1260, 0.185 px/u',
        calibration16:result.calibration16,roads:result.roads.length,contacts96:result.roads.reduce((n,r)=>n+r.c.hits.length,0),contacts16:result.roads.reduce((n,r)=>n+r.f.hits.length,0),
        noContact16:result.roads.filter(r=>!r.f.hits.length).length,multiple16:result.roads.filter(r=>r.f.hits.length>1).map(r=>r.name),
        shiftsXY:result.shifts.sort((a,b)=>a-b),only96:result.onlyCoarse,only16:result.onlyFine,
        milliseconds:{startToOpen:+(a-start).toFixed(0),openMap:+(b-a).toFixed(0),measureAndRender:+(c-b).toFixed(0),elapsed:+(c-start).toFixed(0)}};
      write(dir,'summary.json',JSON.stringify(summary,null,2)+'\n'); console.error(JSON.stringify(summary));
    }
  } finally {await browser.close();}
}
if (require.main===module) main().catch(e=>{console.error(e);process.exitCode=1;});
