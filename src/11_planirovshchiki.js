/* ==================== РЕЖИМ 2: ОРТОГОНАЛЬНЫЙ ПАРТИШН ====================
   Комнаты-прямоугольники тайлят карту и делят стены. Проход = проём в общей стене.
   Коридоров через пустоту нет. Возвращает ту же структуру, что build() — солвер,
   укрытия, двери и VMF работают без изменений.                              */
/* ======================= v92 =======================
   Замер 7 реальных карт (нав-разметка Valve против геометрии):
   • граница зоны — это СКАЧОК ОБЗОРА, а не сужение.
     скачок обзора на границе / контроль при той же близости к стене:
     dust2 2.06, tuscan 2.28, inferno 1.95, ancient 1.28, anubis 1.34,
     cache 4.88, overpass 1.64 — все семь больше единицы.
     ширина на границе / ширина везде: медиана 0.75, но tuscan 1.17 и
     overpass 1.00 — как определение не работает.
   => проём не самоцель. Поворот и перепад дают тот же скачок и доступны
      на сетке 96u уже сейчас, без подклеточных стен.
   • зон у реальных 13–26, у генератора было 9 (ZONEOF схлопывал узлы).
   ==================================================== */
/* v96. door и turn ВЫКЛЮЧЕНЫ. Замер, 12 карт на конфигурацию:
   доля мест шире 448u — v91 14.5%, только door 15.0%, только turn 17.0%, оба 19.1%
   луч p90 — v91 2064u, только door 2142u, только turn 2112u, оба 2246u
   У реальных карт мест шире 448u 0.5–9.3%. Обе правки сделали хуже; тумблеры
   оставлены, чтобы можно было посмотреть глазами, но в дефолт не идут. */
let V92={ door:false, doorLen:1, gateLen:1,  // проём фикс. длины у концов прохода
          turn:false, turnMin:14, turnOff:4, // излом посередине длинного прохода
          zones14:true,                       // 14 зон вместо 9
          audit:true };                       // панель показаний
/* ================== v93. КЛЕТКА ПЕРЕСТАЁТ БЫТЬ ЕДИНИЦЕЙ ЗАМЫСЛА ==================
   Замер реальных карт, в юнитах:
     перегородка между пространствами  dust2 80u · mirage 16u · tuscan 64u (кв. 32..128)
     узкое место: ШИРИНА               dust2 112u · tuscan 128u (кв. 64..144)
     узкое место: ДЛИНА                dust2 16u · tuscan 24u  (p90 250/368)
     укрытие                           28..64 x 76..132u, высота 32u (кв. 24..54)
   Проём длиной 16-24u нельзя нарисовать клеткой 96u — он вчетверо короче пикселя.
   Поэтому: план хранится ФИГУРАМИ В ЮНИТАХ, растр из них выводится, клетка 16u.
   Правило растеризации: клетка — стена, если её задевает перегородка (стена
   побеждает пол). Иначе перегородки тоньше клетки схлопнутся и дейкстра решит,
   что там проход.
   ================================================================================= */
/* ===================== v94 =====================
   Две противоположные поломки v93, померенные:
     ФИГУРЫ  — помещение это один прямоугольник, поэтому пустых залов
               1584k u² против 683k у dust2 и 0 у tuscan; до стены p90
               333u против 248u/132u. Коробки.
     ОБЪЁМЫ  — pbsp режет листья 3..7 клеток, то есть 288..672u, все
               примерно одинаковые. Реальные помещения 400..1300u+.
               Одинаковый размер и даёт ощущение backrooms.
   Лечится в обоих случаях одним и тем же: РАЗНОРАЗМЕРНОСТЬЮ и внутренней
   структурой. Помещение перестаёт быть прямоугольником, лист BSP
   перестаёт быть стандартным.
   ================================================ */
let V94={ inner:true,      // внутренние перегородки и колонны в помещениях (фигуры)
          stubs:3,         // сколько перегородок максимум на крупное помещение
          cols:3,          // сколько колонн максимум
          uneven:false, bspMin:5, bspMax:10 };   // ВЫКЛ: замер показал ухудшение, см. ниже   // листья BSP: минимум и максимум в клетках 96u
/* ===================== v95 =====================
   Ошибка сравнения: режим ФИГУР отличался от коридорного не только клеткой,
   но и тем, что планировщик написан с нуля за один заход, а коридорный
   вылизывался шестьдесят версий. Структура была не от 96u, а от накопленной
   логики: путевые точки с промежуточными зонами, кольца, Г/T-форма зон,
   растяжка полос, вертикальные профили.
   Поэтому здесь СТАРЫЙ планировщик переносится на клетку 16u. rs() уже
   масштабируется от размера сетки сам, остальное — полтора десятка литералов,
   выраженных в клетках. SC = 96/CELL.
   Проём теперь задаётся В ЮНИТАХ, а не в клетках: ширина 112u, длина 48u
   (замер: реальный проём 112–128u шириной и 16–24u длиной).
   ================================================ */
let V95={ fine:false, fastSolve:false };   // fine — клетка 16u; fastSolve — перенос решения между разрешениями (НЕ РАБОТАЕТ, см. ниже)          // коридорный и объёмный планировщики на клетке 16u
let SC=1;                       // во сколько раз клетка мельче исходных 96u
let CELL=96;                    // юнитов в клетке растра; 96 у старых режимов, 16 у 'shapes'
let MODE='corridor';            // 'corridor' | 'partition' | 'shapes'           // 'corridor' | 'partition'
const PANCH={T:[0.50,0.90],CT:[0.50,0.09],A:[0.82,0.30],B:[0.18,0.30],M:[0.50,0.52],
             ML:[0.50,0.70],SR:[0.78,0.62],SL:[0.22,0.62],AM:[0.86,0.46],BM:[0.14,0.46],
             AC:[0.66,0.38],BC:[0.34,0.38]};
function pbsp(rng,x0,y0,x1,y1,depth,out){
  const w=x1-x0+1,h=y1-y0+1, MIN=((V94&&V94.uneven)?V94.bspMin:3)*SC;
  /* v94: было MAXW=MAXH=7 -> листья 288..672u, все одного порядка, отсюда backrooms.
     Реальные помещения 400..1300u+. Разрешаем крупные листья и раньше
     останавливаем деление, чтобы размах вырос. */
  const MAXW=((V94&&V94.uneven)?V94.bspMax:7)*SC, MAXH=((V94&&V94.uneven)?V94.bspMax:7)*SC;
  const must=(w>MAXW||h>MAXH);
  if(!must&&(depth>=6||rng()<((V94&&V94.uneven)?0.35:0.30)||(w<MIN*2+1&&h<MIN*2+1))){out.push({x0,y0,x1,y1});return;}
  const cv=w>=MIN*2+1, ch=h>=MIN*2+1;
  if(!cv&&!ch){out.push({x0,y0,x1,y1});return;}
  const vert=cv&&(!ch||(w>h?rng()<0.8:rng()<0.2));
  if(vert){const c=x0+MIN+Math.floor(rng()*(w-2*MIN));pbsp(rng,x0,y0,c,y1,depth+1,out);pbsp(rng,c+1,y0,x1,y1,depth+1,out);}
  else    {const c=y0+MIN+Math.floor(rng()*(h-2*MIN));pbsp(rng,x0,y0,x1,c,depth+1,out);pbsp(rng,x0,c+1,x1,y1,depth+1,out);}
}
function buildPartition(rng,laneA,laneB,jit,vert,ringP){
  vert=vert==null?1:vert; ringP=ringP==null?0.5:ringP;
  const rooms=[]; pbsp(rng,1,1,W-2,H-2,0,rooms); const N=rooms.length;
  rooms.forEach((r,i)=>{r.i=i;r.cx=(r.x0+r.x1)/2;r.cy=(r.y0+r.y1)/2;r.area=(r.x1-r.x0+1)*(r.y1-r.y0+1);});
  // якоря: A-сторона тянется laneA, B-сторона laneB -> солвер правит баланс
  const role={},taken=new Set(),ord=['T','CT','A','B','M','ML','SR','SL','AM','BM','AC','BC'];
  for(const k of ord){
    let ax=PANCH[k][0],ay=PANCH[k][1];
    const st=(ax>0.55?laneA:ax<0.45?laneB:1);
    ax=0.5+(ax-0.5)*st; ay=0.5+(ay-0.5)*(1+(st-1)*0.4);
    ax+=(rng()*2-1)*(jit||0); ay+=(rng()*2-1)*(jit||0);
    const tx=ax*W,ty=ay*H; let best=-1,bd=1e9;
    for(const r of rooms){ if(taken.has(r.i))continue; const d=(r.cx-tx)**2+(r.cy-ty)**2; if(d<bd){bd=d;best=r.i;} }
    if(best<0) continue; role[k]=best; taken.add(best); rooms[best].role=k;
  }
  if(role.T==null||role.CT==null||role.A==null||role.B==null||role.M==null) return null;
  // смежность
  const nbr=Array.from({length:N},()=>[]);
  for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){const a=rooms[i],b=rooms[j];
    const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)+1, oy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)+1;
    if((ox>=2&&(b.y0===a.y1+1||a.y0===b.y1+1))||(oy>=2&&(b.x0===a.x1+1||a.x0===b.x1+1))){nbr[i].push(j);nbr[j].push(i);} }
  const path=(s,t)=>{const pv=new Int32Array(N).fill(-2);pv[s]=-1;const q=[s];
    for(let h=0;h<q.length;h++){const u=q[h];if(u===t)break;for(const v of nbr[u])if(pv[v]===-2){pv[v]=u;q.push(v);}}
    if(pv[t]===-2)return null;const o=[];let c=t;while(c!==-1){o.push(c);c=pv[c];}return o;};
  const live=new Set(), mustDoor=new Set();
  // асимметрия сайтов: открытый сайт получает лишний прямой заход
  const OPEN = rng()<0.5?'A':'B';
  const legs=[[role.T,role.M],[role.M,role.CT],[role.T,role.A],[role.T,role.B],
              [role.CT,role.A],[role.CT,role.B],[role.M,role.A],[role.M,role.B]];
  if(role[OPEN]!=null&&role[OPEN==='A'?'AM':'BM']!=null) legs.push([role[OPEN==='A'?'AM':'BM'],role[OPEN]]);
  for(const [a,b] of legs){ if(a==null||b==null)continue; const p=path(a,b);
    if(p){p.forEach(v=>live.add(v)); for(let q=0;q+1<p.length;q++){const u=p[q],w2=p[q+1];mustDoor.add(u<w2?u+'|'+w2:w2+'|'+u);}} }
  const want=Math.round(N*0.52);
  const cand=[...new Set([].concat(...[...live].map(v=>nbr[v])))].filter(v=>!live.has(v));
  cand.sort((a,b)=>rooms[b].area-rooms[a].area);
  for(const v of cand){ if(live.size>=want)break; live.add(v); }
  // растеризация
  const g=new Uint8Array(W*H), zfield=new Float32Array(W*H), ramp=new Uint8Array(W*H), zm=new Int16Array(W*H).fill(-1);
  const ix=(x,y)=>y*W+x;
  const zOf=r=>{ if(r.role==='T')return 0; if(r.role==='CT')return -0.2*vert; if(r.role==='M')return -0.3*vert;
    if(r.role==='A'||r.role==='B')return 0; return Math.round(rng()*3-1)*0.35*vert; };
  for(const v of live){const r=rooms[v]; r.z=zOf(r);
    for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const i=ix(x,y);g[i]=1;zm[i]=v;zfield[i]=r.z;}}
  // стены на швах
  const wallOf=new Map(), mk=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=ix(x,y);if(!g[i]||zm[i]<0)continue;const a=zm[i];
    for(const [dx,dy] of [[1,0],[0,1]]){const nx=x+dx,ny=y+dy;if(nx>W-2||ny>H-2)continue;const j=ix(nx,ny);
      if(!g[j]||zm[j]<0)continue;const b=zm[j];
      if(b!==a){const k=a<b?a+'|'+b:b+'|'+a;if(!wallOf.has(k))wallOf.set(k,[]);wallOf.get(k).push([nx,ny]);mk.push(j);}}}
  for(const j of mk){g[j]=0;zm[j]=-9;}
  // ПРОЁМЫ: 1-2 клетки (реальные двери 128u / арки 129-256u), смещены от центра шва
  for(const [k,cells] of wallOf){
    const [ia,ib]=k.split('|').map(Number);
    if(!live.has(ia)||!live.has(ib)||cells.length<2) continue;
    if(!mustDoor.has(k)&&rng()>ringP) continue;
    const c0=Math.floor((0.25+rng()*0.5)*(cells.length-1));
    const dw=rng()<0.55?2:1;                      // 55% арок (2 клетки), 45% дверей (1)
    const za=rooms[ia].z, zb=rooms[ib].z;
    for(let t=0;t<dw;t++){const c=cells[Math.min(cells.length-1,c0+t)];if(!c)continue;
      const i=ix(c[0],c[1]);g[i]=1;zm[i]=-2;zfield[i]=(za+zb)/2;if(Math.abs(za-zb)>0.15)ramp[i]=1;}
  }
  // связность от T
  const rT=rooms[role.T]; let s0=ix(Math.round(rT.cx),Math.round(rT.cy));
  if(!g[s0])return null;
  const seen=new Uint8Array(W*H),st=[s0];seen[s0]=1;
  while(st.length){const i=st.pop(),x=i%W,y=(i/W)|0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<1||ny<1||nx>W-2||ny>H-2)continue;
      const j=ix(nx,ny);if(!g[j]||seen[j])continue;if(Math.abs(zfield[j]-zfield[i])>0.82&&!ramp[j]&&!ramp[i])continue;seen[j]=1;st.push(j);}}
  for(let i=0;i<W*H;i++) if(g[i]&&!seen[i]){g[i]=0;zm[i]=-1;}
  // px в формате v36
  const px={};
  for(const k of ord){ if(role[k]==null)continue; const r=rooms[role[k]]; if(!live.has(role[k]))continue;
    let bx=Math.round(r.cx),by=Math.round(r.cy);
    if(!g[ix(bx,by)]){outer:for(let rr=1;rr<10;rr++)for(let oy=-rr;oy<=rr;oy++)for(let ox=-rr;ox<=rr;ox++){
      const x=bx+ox,y=by+oy;if(x>0&&y>0&&x<W-1&&y<H-1&&g[ix(x,y)]){bx=x;by=y;break outer;}}}
    px[k]={x:bx,y:by,room:[r.x1-r.x0+1,r.y1-r.y0+1],z:r.z}; }
  for(const k of ['T','CT','A','B','M']) if(!px[k]) return null;
  return {g,zfield,ramp,zoneMap:zm,px,rooms,live:[...live],openSite:OPEN};
}

/* v92. buildPartition написан до слоёв v63–v89 и возвращает другой набор полей:
   не хватает floorPieces, stairMask, rampMask, vmask, pitMask, halls, terraces,
   bodies, interzones, rings, vprof, zscale. Без них экспорт .vmf в режиме объёмов
   не соберётся. Переходник добивает недостающее безопасными пустышками, а куски
   пола склеивает жадно из сетки — плоскую карту так экспортировать можно. */
function partitionShim(b){ const Z=W*H;
  const blank=k=>{ if(!b[k]) b[k]=new Uint8Array(Z); };
  blank('stairMask'); blank('rampMask'); blank('vmask'); blank('pitMask');
  for(const k of ['halls','terraces','bodies','interzones','rings']) if(!b[k]) b[k]=[];
  if(!b.vprof) b.vprof={};
  if(!b.zscale) b.zscale={Tsign:1,PU:72};
  if(!b.floorPieces){ b.floorPieces=[]; const seen=new Uint8Array(Z);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x;
      if(!b.g[i]||seen[i]) continue; const z=b.zfield[i];
      let x1=x; while(x1+1<W-1){ const j=y*W+x1+1; if(!b.g[j]||seen[j]||Math.abs(b.zfield[j]-z)>1e-6) break; x1++; }
      let y1=y; outer: while(y1+1<H-1){ for(let xx=x;xx<=x1;xx++){ const j=(y1+1)*W+xx;
          if(!b.g[j]||seen[j]||Math.abs(b.zfield[j]-z)>1e-6) break outer; } y1++; }
      for(let yy=y;yy<=y1;yy++)for(let xx=x;xx<=x1;xx++) seen[yy*W+xx]=1;
      b.floorPieces.push({x0:x,y0:y,x1:x1,y1:y1,zA:z,zB:z,ax:'F'}); } }
  return b; }
/* ===================== v93. ПЛАН ФИГУРАМИ =====================
   Планировщик не красит клетки. Он раскладывает прямоугольники в юнитах,
   а сетка выводится из них. Всё, что не выложено, — массив.
   Первая версия ПЛОСКАЯ: вертикаль это отдельный слой, здесь проверяется
   ровно одно — можно ли получить узкое место длиной 16..64u.
   ============================================================== */
const SHP={
  room:{ T:[1010,670], CT:[1010,670], A:[1140,1010], B:[1140,1050], M:[900,720],
         ML:[440,440], SR:[440,440], SL:[440,440], AM:[440,440], BM:[440,440],
         AC:[440,440], BC:[440,440], AM2:[440,440], BM2:[440,440] },
  wall:[32,48,64,80],            // толщина перегородки = длина проёма
  door:[96,112,128,144],         // ширина проёма
  corr:[128,160,192,256],        // ширина коридора
  arch:0.55                      // доля рёбер, получающих ещё и промежуточную арку
};
function buildShapes(rng,laneA,laneB,jit,vert,ringP){
  const U=CELL, WU=W*U, HU=H*U;
  const g=new Uint8Array(W*H), zfield=new Float32Array(W*H);
  const FLOORP=[], SHAPES=[], DOORS=[];
  OPENSITE = rng()<0.5?'A':'B'; EDGES=makeEdges();
  const N=baseNodes(), pick=a=>a[(rng()*a.length)|0];
  const px={};
  for(const k in N){
    const st=(N[k].x>0.55?laneA:N[k].x<0.45?laneB:1);
    const ax=0.5+(N[k].x-0.5)*st + (rng()*2-1)*(jit||0)*0.5;
    const ay=0.5+(N[k].y-0.5)*(1+(st-1)*0.4) + (rng()*2-1)*(jit||0)*0.5;
    const rw=SHP.room[k][0], rh=SHP.room[k][1];
    const ux=Math.min(WU-rw/2-U*2, Math.max(rw/2+U*2, Math.round(ax*WU)));
    const uy=Math.min(HU-rh/2-U*2, Math.max(rh/2+U*2, Math.round(ay*HU)));
    px[k]={ ux, uy, rw, rh, z:0, room:N[k].room, x:Math.round(ux/U), y:Math.round(uy/U) };
  }
  const paintU=(cx,cy,w,h)=>{
    if(w<U*0.6||h<U*0.6) return;
    const x0=Math.max(1,Math.round((cx-w/2)/U)), x1=Math.min(W-2,Math.round((cx+w/2)/U)-1);
    const y0=Math.max(1,Math.round((cy-h/2)/U)), y1=Math.min(H-2,Math.round((cy+h/2)/U)-1);
    if(x1<x0||y1<y0) return;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) g[y*W+x]=1;
    FLOORP.push({x0,y0,x1,y1,zA:0,zB:0,ax:'F'});
  };
  /* осевой отрезок переменной ширины: ширина задаётся функцией от пройденного
     расстояния В ЮНИТАХ, поэтому проём получает длину в юнитах, а не долю пути */
  const runAxis=(ax,ay,bx,by,wAt)=>{
    const horiz=(ay===by), L=horiz?Math.abs(bx-ax):Math.abs(by-ay);
    if(L<1) return;
    const dir=horiz?Math.sign(bx-ax):Math.sign(by-ay), a0=horiz?ax:ay;
    let s=0;
    while(s<L){
      const w=wAt(s); let e=s+U;
      while(e<L && wAt(e)===w) e+=U;
      const p0=a0+dir*s, p1=a0+dir*Math.min(e,L);
      if(horiz) paintU((p0+p1)/2, ay, Math.abs(p1-p0), w);
      else      paintU(ax, (p0+p1)/2, w, Math.abs(p1-p0));
      s=e;
    }
  };
  const carve=(P,Q,wide)=>{
    const wc = wide ? pick([192,256]) : pick(SHP.corr);
    const wd = Math.min(wc, pick(SHP.door));
    const lw = pick(SHP.wall);                      // длина проёма = толщина стены
    const kx = rng()<0.5 ? Q.ux : P.ux, ky = (kx===Q.ux) ? P.uy : Q.uy;
    const segs=[[P.ux,P.uy,kx,ky],[kx,ky,Q.ux,Q.uy]];
    const halfP = (P.ux===kx) ? P.rh/2 : P.rw/2;
    const halfQ = (Q.ux===kx) ? Q.rh/2 : Q.rw/2;
    const Ltot = Math.abs(kx-P.ux)+Math.abs(ky-P.uy)+Math.abs(Q.ux-kx)+Math.abs(Q.uy-ky);
    const arch = rng()<SHP.arch ? Ltot*(0.42+rng()*0.16) : -1;
    let done=0;
    for(const [ax,ay,bx,by] of segs){
      const segL = Math.abs(bx-ax)+Math.abs(by-ay);
      const base = done;
      runAxis(ax,ay,bx,by,(s)=>{
        const t = base+s, r = Ltot-t;
        if(t>=halfP && t<halfP+lw) return wd;        // проём на выходе из P
        if(r>=halfQ && r<halfQ+lw) return wd;        // проём на входе в Q
        if(arch>0 && t>=arch && t<arch+lw) return wd;// арка посередине
        return wc;
      });
      if(t_marks(base,halfP,lw,segL)) DOORS.push(1);
      done+=segL;
    }
    SHAPES.push({a:[P.ux,P.uy],k:[kx,ky],b:[Q.ux,Q.uy],wc,wd,lw});
  };
  const t_marks=()=>false;
  const cutU=(cx,cy,w,h)=>{
    const x0=Math.max(1,Math.round((cx-w/2)/U)), x1=Math.min(W-2,Math.round((cx+w/2)/U)-1);
    const y0=Math.max(1,Math.round((cy-h/2)/U)), y1=Math.min(H-2,Math.round((cy+h/2)/U)-1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) g[y*W+x]=0;
  };
  /* v94: помещение — не коробка. Внутрь ставятся перегородки, примыкающие
     к одной стороне и не пересекающие помещение насквозь (связность цела),
     и отдельно стоящие колонны. Режется ДО прокладки проходов: если проход
     пойдёт через перегородку, он прорежет в ней проём, а не оборвётся. */
  const furnish=(P)=>{
    paintU(P.ux,P.uy,P.rw,P.rh);
    if(!V94.inner) return;
    const big=Math.min(P.rw,P.rh)>=560;
    const nst=big?1+((rng()*V94.stubs)|0):(rng()<0.5?1:0);
    for(let i=0;i<nst;i++){
      const tw=pick(SHP.wall), horiz=rng()<0.5;
      if(horiz){
        const span=P.rw*(0.35+rng()*0.35);
        const y=P.uy+(rng()<0.5?-1:1)*(P.rh/2)*(0.28+rng()*0.42);
        const x=P.ux+(rng()*2-1)*Math.max(0,(P.rw-span)/2-U);
        cutU(x,y,span,tw);
      } else {
        const span=P.rh*(0.35+rng()*0.35);
        const x=P.ux+(rng()<0.5?-1:1)*(P.rw/2)*(0.28+rng()*0.42);
        const y=P.uy+(rng()*2-1)*Math.max(0,(P.rh-span)/2-U);
        cutU(x,tw>0?y:y,tw,span);
      }
    }
    const nc=big?1+((rng()*V94.cols)|0):0;
    for(let i=0;i<nc;i++){
      const s=96+((rng()*3)|0)*40;
      const rx=Math.max(0,P.rw/2-s-U*4), ry=Math.max(0,P.rh/2-s-U*4);
      cutU(P.ux+(rng()*2-1)*rx, P.uy+(rng()*2-1)*ry, s, s);
    }
  };
  for(const k in px) furnish(px[k]);
  const wideSet=new Set(['A','B','T','CT','M']);
  for(const [a,b] of EDGES) if(px[a]&&px[b]) carve(px[a],px[b], wideSet.has(a)&&wideSet.has(b));
  const OPT=[['SR','M'],['SL','M'],['AM','AC'],['BM','BC']];
  for(const e of OPT) if(rng()<ringP*0.5 && px[e[0]]&&px[e[1]]) carve(px[e[0]],px[e[1]],false);
  return { floorPieces:FLOORP, g, px, zfield, shapes:SHAPES,
           bodies:[], interzones:[], rings:[], terraces:[], halls:[],
           stairMask:new Uint8Array(W*H), rampMask:new Uint8Array(W*H),
           vmask:new Uint8Array(W*H), pitMask:new Uint8Array(W*H),
           vprof:{}, zscale:{Tsign:1,PU:72} };
}
/* укрытия писались под клетку 96u: на 16u ящик в одну клетку стал бы 16u.
   Гоняем makeCover на огрублённой вшестеро сетке и возвращаем короба в мелкую. */
function coverAtCell(g,px,seed){
  if(CELL>=96) return makeCover(g,px,seed);
  const K=Math.round(96/CELL), Wc=Math.floor(W/K), Hc=Math.floor(H/K);
  const gc=new Uint8Array(Wc*Hc);
  for(let y=0;y<Hc;y++)for(let x=0;x<Wc;x++){ let c=0;
    for(let oy=0;oy<K;oy++)for(let ox=0;ox<K;ox++) if(g[(y*K+oy)*W+(x*K+ox)]) c++;
    if(c>=K*K*0.7) gc[y*Wc+x]=1; }
  const pxc={}; for(const k in px) pxc[k]=Object.assign({},px[k],{x:Math.round(px[k].x/K),y:Math.round(px[k].y/K)});
  const sw=W, sh=H; let out=[];
  try{ setSize(Wc,Hc); out=makeCover(gc,pxc,seed)||[]; } catch(e){ out=[]; } finally { setSize(sw,sh); }
  for(const c of out){ c.x*=K; c.y*=K; c.w=Math.max(1,(c.w||1)*K); c.h=Math.max(1,(c.h||1)*K); }
  return out;
}
function applyMode(){
  const s=(typeof sSize!=='undefined'&&sSize)?SIZES[+sSize.value]:[43,48];
  if(MODE==='shapes'){ CELL=16; setSize(258,288); }
  else if(V95.fine){ CELL=16; setSize(s[0]*6, s[1]*6); }
  else { CELL=96; setSize(s[0],s[1]); }
  SC=Math.round(96/CELL);
}
/* v95. Баланс — свойство планировки в масштабе карты, а не разрешения растра.
   На клетке 16u дейкстра по 74k клеток и медленнее в 20 раз, и неустойчива:
   поля времени начинают чувствовать мелкую фактуру. Поэтому решатель работает
   на огрублённой до 96u копии сетки, а полноразмерные поля времени считаются
   один раз для готовой карты — только чтобы нарисовать тепловую карту. */
function measureBalance(g,px,CTt,zf){
  if(SC<=1) return measure(g,px,CTt,zf);
  const K=SC, Wc=Math.max(6,Math.floor(W/K)), Hc=Math.max(6,Math.floor(H/K));
  const gc=new Uint8Array(Wc*Hc), zc=new Float32Array(Wc*Hc);
  for(let y=0;y<Hc;y++)for(let x=0;x<Wc;x++){ let c=0,zs=0;
    for(let oy=0;oy<K;oy++)for(let ox=0;ox<K;ox++){ const i=(y*K+oy)*W+(x*K+ox);
      if(g[i]){ c++; zs+=zf?zf[i]:0; } }
    if(c>=K*K*0.34){ gc[y*Wc+x]=1; zc[y*Wc+x]=zs/c; } }
  const pxc={}; for(const k in px) pxc[k]=Object.assign({},px[k],
    {x:Math.min(Wc-2,Math.max(1,Math.round(px[k].x/K))), y:Math.min(Hc-2,Math.max(1,Math.round(px[k].y/K)))});
  const sw=W, sh=H; let m=null;
  try{ setSize(Wc,Hc); m=measure(gc,pxc,CTt,zc); } finally { setSize(sw,sh); }
  return m;
}
function refineFields(r){
  if(SC<=1||!r||!r.m) return r;
  const g=r.g, px=r.px, zf=r.zfield;
  const T=nf(g,px.T.x,px.T.y), C=nf(g,px.CT.x,px.CT.y);
  r.m.dT=dijkstra(g,T[0],T[1],zf); r.m.dC=dijkstra(g,C[0],C[1],zf);
  r.m.pts={T:T,C:C,A:nf(g,px.A.x,px.A.y),B:nf(g,px.B.x,px.B.y),M:nf(g,px.M.x,px.M.y)};
  r.m.SEC=r.m.SEC/SC;                       // клетка вшестеро короче — секунда на клетку тоже
  return r;
}
/* v95. Итерационный решатель полос гонялся на мелкой сетке: 12 сборок по 160мс
   на попытку, и сходился хуже. Но полосы — величина безразмерная, а build с тем
   же зерном на любой сетке даёт ту же карту (rs() и все константы масштабируются).
   Поэтому: решаем на огрублённой, потом ОДИН раз собираем мелкую. */
function generateOne(seed,cfg){
  if(V95.fastSolve && SC>1 && MODE!=='shapes'){
    const fW=W,fH=H,fSC=SC,fC=CELL;
    setSize(Math.max(6,Math.round(fW/fSC)), Math.max(6,Math.round(fH/fSC))); SC=1; CELL=96;
    let coarse=null; try{ coarse=generateOneCore(seed,cfg); } finally { setSize(fW,fH); SC=fSC; CELL=fC; }
    if(!coarse) return null;
    const rng=mulberry32(seed);
    const la=Number.isFinite(coarse.laneA)?coarse.laneA:1, lb=Number.isFinite(coarse.laneB)?coarse.laneB:1;
    const b=(MODE==='partition'?buildPartition:build)(rng,la,lb,cfg.jit,cfg.vert,cfg.ringP);
    if(!b) return null;
    if(MODE!=='corridor') partitionShim(b);
    const m=measureBalance(b.g,b.px,cfg.CTtarget,b.zfield);
    if(!m) return null;
    const out=Object.assign({},b,{m:m,seed:seed,laneA:la,laneB:lb});
    out.W=W; out.H=H; return out;
  }
  return generateOneCore(seed,cfg);
}
function generateOneCore(seed,cfg){
  let laneA=1,laneB=1,out=null;
  for(let it=0;it<12;it++){ const rng=mulberry32(seed); const b=(MODE==='shapes'?buildShapes:MODE==='partition'?buildPartition:build)(rng,laneA,laneB,cfg.jit,cfg.vert,cfg.ringP); if(!b)continue; if(MODE!=='corridor') partitionShim(b); const m=measureBalance(b.g,b.px,cfg.CTtarget,b.zfield);
    if(!m){laneA=1;laneB=1;continue;} out=Object.assign({},b,{m:m,seed:seed,laneA:laneA,laneB:laneB});   // v95: полосы наружу СРАЗУ, иначе при досрочном выходе из цикла они не попадали в результат, в мелкую сборку прилетал undefined и прокладка коридора зацикливалась на NaN
    if(Math.abs(m.mA-cfg.M)<=cfg.tol&&Math.abs(m.mB-cfg.M)<=cfg.tol&&Math.abs(m.midDiff)<=cfg.tolMid)break;
    laneA=Math.max(.55,Math.min(1.7,laneA+0.09*(cfg.M-m.mA))); laneB=Math.max(.55,Math.min(1.7,laneB+0.09*(cfg.M-m.mB)));
    if(out){ out.W=W; out.H=H; }   // v58.1: карта помнит габарит, при котором построена
  } return out;
}

function generate(cfg){ applyMode();   // v93: режим задаёт клетку и сетку, откуда бы ни звали
  /* v136. Повтор карты по сиду. Гейт находит дефект на одной карте из двадцати;
     без этого крючка проверять правку приходится вслепую — прогонять два десятка
     новых карт и надеяться, что дефект попадётся снова. С ним воспроизводится
     ровно та карта: window.__SEED=659323758. Только для приборов. */
  if(typeof window!=='undefined' && window.__SEED){
    const r=generateOne(window.__SEED>>>0,cfg); return r?refineFields(r):null; }
  for(let a=0;a<(MODE==='shapes'?40:20);a++){ const seed=(Math.random()*4294967296)>>>0; const r=generateOne(seed,cfg);
    if(r&&r.m&&Math.abs(r.m.mA-cfg.M)<=cfg.tol&&Math.abs(r.m.mB-cfg.M)<=cfg.tol&&Math.abs(r.m.midDiff)<=cfg.tolMid) return refineFields(r); }
  return null;
}
/* v81 СГЛАЖИВАНИЕ ВЫСОТ. Одиночная клетка, отличающаяся по высоте от всех соседей, —
   это шум: она не читается как вертикаль, но требует своего клина и торчит комком.
   Медианный фильтр по 4 соседям, два прохода. g не трогается: маршруты и тайминги те же. */
function smoothZ(cur){
  const zf=cur.zfield, g=cur.g; if(!zf) return 0; let n=0;
  for(let pass=0;pass<2;pass++){
    const src=Float64Array.from(zf);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]) continue;
      const nb=[]; for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const j=(y+d[1])*W+(x+d[0]); if(g[j]) nb.push(src[j]); }
      if(nb.length<3) continue;
      if(nb.every(v=>Math.abs(v-src[i])>1e-9)){ nb.sort((a,b)=>a-b); zf[i]=nb[nb.length>>1]; n++; } } }
  return n;
}
function makeCover(g,px,seed){
  const rng=mulberry32(seed^0x9e3779b9); const cov=[];
  const CORE=coreMask(px);                                            // v60: то же ядро, что в build()
  const fl=(x,y)=>x>0&&x<W-1&&y>0&&y<H-1&&g[y*W+x]&&!CORE[y*W+x];     // укрытие в ядро не ставится
  const wallNb=(x,y)=>!fl(x-1,y)||!fl(x+1,y)||!fl(x,y-1)||!fl(x,y+1);
  const nearNode=(node,x,y,r)=>Math.abs(x-node.x)<=r&&Math.abs(y-node.y)<=r;
  /* v64: свободный пробег через клетку по обеим осям. Ставить укрытие можно,
     только если после него в проходе останется >=1 клетка (96u) с каждой стороны. */
  const occ2=new Uint8Array(W*H);                       // v65: уже поставленные укрытия
  const fl2=(x,y)=>fl(x,y)&&!occ2[y*W+x];
  const fr=(x,y,dx,dy)=>{ let k=0,cx=x+dx,cy=y+dy; while(fl2(cx,cy)){k++;cx+=dx;cy+=dy;} return k; };
  const mrk=c=>{ if(c.hgt==='full'||c.hgt>18) for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
      const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) occ2[Y*W+X]=1; } };
  const blocks=(x,y,cw,ch)=>{ if(!V64.noblock) return false;
    const wx_=fr(x,y,-1,0)+cw+fr(x+cw-1,y,1,0), wy_=fr(x,y,0,-1)+ch+fr(x,y+ch-1,0,1);
    return (wx_-cw)<1 || (wy_-ch)<1; };
  /* ШИРИНА ПРОХОДА в клетке = min(сквозной пробег по X, сквозной пробег по Y) по чистому полу.
     В коридоре вдоль X пробег по X длинный, по Y равен ширине коридора -> min даёт ширину. */
  const runF=(x,y,dx,dy)=>{ let k=0,cx=x+dx,cy=y+dy; while(fl(cx,cy)){k++;cx+=dx;cy+=dy;} return k; };
  const cwid=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(!fl(x,y)) continue;
    const rx=1+runF(x,y,-1,0)+runF(x,y,1,0), ry=1+runF(x,y,0,-1)+runF(x,y,0,1);
    cwid[y*W+x]=Math.min(255,Math.min(rx,ry)); }
  /* Ширина берётся по ТЕКУЩЕМУ свободному полу (fl2 = пол минус уже поставленные тела).
     По чистому полу коридор в 3 клетки разрешал два тела подряд, и оставалось 96u. */
  const runB=(x,y,dx,dy)=>{ let k=0,cx=x+dx,cy=y+dy; while(fl2(cx,cy)){k++;cx+=dx;cy+=dy;} return k; };
  const wnow=(x,y)=>{ const rx=1+runB(x,y,-1,0)+runB(x,y,1,0), ry=1+runB(x,y,0,-1)+runB(x,y,0,1);
    return Math.min(rx,ry,cwid[y*W+x]||99); };
  const hcap=(x,y,cw,ch)=>{ let m=1e9;
    for(let oy=0;oy<ch;oy++)for(let ox=0;ox<cw;ox++){
      const X=x+ox,Y=y+oy; if(X<0||Y<0||X>=W||Y>=H||!fl(X,Y)) return -1;
      const w=wnow(X,Y), c=(w<=1)?V71H.w1:(w<V71.minw?V71H.w2:1e9);
      if(c<m) m=c; } return m; };
  const tight=(x,y,cw,ch)=>hcap(x,y,cw,ch)<1e8;
  let nSkip=0, nOver=0;
  /* ============ v141. ОДНА КЛЕТКА — ОДНО ТЕЛО ============
     Его скриншот: «что это за столпотворение рандомных углов и обрезанного
     множества мелких ящиков». Причина не в декоре и не в вычитании — в самой
     расстановке. `occ2` заводился ради ширины прохода и метился ТОЛЬКО телами
     выше 18u, а на вход в covPut занятость не проверялась вовсе: восемь путей
     постановки (зоны, пары, стопки, поля, DECOR) кладут тела независимо и
     спокойно попадают в одну клетку. Замер до правки: на карте 28..46
     пересекающихся пар из сотни тел.
     Пока телом была голая коробка, это было почти не видно — вычитание съедало
     младшее и на месте двух стоял один ящик. С рамой каждое такое место стало
     кучей обрезков: у младшего тела остаются щепки, а рама вокруг них целая.
     Теперь след КАЖДОГО принятого тела занимает клетки, и второе тело туда не
     встанет. Отказ дешёвый: у всех расстановщиков есть свои попытки, тело
     просто уедет на соседнюю клетку. */
  const занято=new Uint8Array(W*H);
  const свободно=(x,y,cw,ch)=>{ for(let oy=0;oy<ch;oy++)for(let ox=0;ox<cw;ox++){
      const X=x+ox, Y=y+oy;
      if(X<0||Y<0||X>=W||Y>=H||занято[Y*W+X]) return false; } return true; };
  const занять=c=>{ for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
      const X=c.x+ox, Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) занято[Y*W+X]=1; } };
  /* Гейт стоит В covPut, а не в вызывающих: путей постановки восемь, и половина из них
     раньше не проверяла ничего. Трим (<=18u) проходится шагом и под правило не попадает. */
  /* Поклеточная ширина не ловит главного: тело длиной 3 клетки поперёк коридора шириной
     3 клетки проходит все проверки и запечатывает его. Считаем, сколько СВОБОДНЫХ клеток
     остаётся снаружи следа тела по каждой оси, и берём худшую строку/столбец. */
  const spanOK=(x,y,cw,ch,hh)=>{ if(hh<=18) return true;
    const need=(hh>64)?2:1; let mx=1e9,my=1e9;
    for(let oy=0;oy<ch;oy++){ let l=0,r=0,cx=x-1;
      while(fl2(cx,y+oy)){l++;cx--;} cx=x+cw;
      while(fl2(cx,y+oy)){r++;cx++;} if(l+r<mx) mx=l+r; }
    for(let ox=0;ox<cw;ox++){ let u=0,d=0,cy=y-1;
      while(fl2(x+ox,cy)){u++;cy--;} cy=y+ch;
      while(fl2(x+ox,cy)){d++;cy++;} if(u+d<my) my=u+d; }
    return Math.min(mx,my)>=need; };
  const covPut=c=>{ const hh=(c.hgt==='full')?999:(c.hgt||40);
    if(!свободно(c.x,c.y,c.w||1,c.h||1)){ nOver++; return false; }
    if(V71.throat && (hh>hcap(c.x,c.y,c.w||1,c.h||1) || !spanOK(c.x,c.y,c.w||1,c.h||1,hh))){ nSkip++; return false; }
    cov.push(c); mrk(c); занять(c); return true; };
  // стена-перегородка: тонкая (1 клетка), длина 2..len, пол по обе стороны вдоль длины (обходится)
  const wallSeg=(node,maxLen,allowFull)=>{ const w=node.room[0],h=node.room[1];
    for(let t=0;t<10;t++){ const vert=rng()<0.5, len=2+((rng()*(maxLen-1))|0);
      const x=node.x-(w>>1)+2+((rng()*Math.max(1,w-4))|0), y=node.y-(h>>1)+2+((rng()*Math.max(1,h-4))|0); let ok=len>=2;
      for(let i=0;i<len&&ok;i++){ const cx=vert?x:x+i, cy=vert?y+i:y;
        if(!fl(cx,cy)||nearNode(node,cx,cy,1)||blocks(cx,cy,1,1)||tight(cx,cy,1,1)) ok=false;
        else if(vert){ if(!fl(cx-1,cy)&&!fl(cx+1,cy)) ok=false; }
        else { if(!fl(cx,cy-1)&&!fl(cx,cy+1)) ok=false; } }
      if(!ok) continue;
      const full=allowFull&&len<=3&&rng()<0.5;
      covPut({x,y,w:vert?1:len,h:vert?len:1,kind:'wall',hgt:full?'full':(rng()<0.3?48:112)}); return true; } return false; };
  const crate=(node,cnt)=>{ let done=0;
    for(let t=0;t<cnt*6&&done<cnt;t++){ const cw=rng()<0.3?2:1, ch=rng()<0.3?2:1; const w=node.room[0],h=node.room[1];
      const x=node.x-(w>>1)+1+((rng()*(w-cw-1))|0), y=node.y-(h>>1)+1+((rng()*(h-ch-1))|0);
      if(!fl(x,y)||!fl(x+cw-1,y+ch-1)||nearNode(node,x,y,1)||blocks(x,y,cw,ch)||tight(x,y,cw,ch)) continue;
      const hg=V61.coverH?pickCovH(rng):(rng()<0.4?64:40);
      /* v65: поворот на 6-18 градусов у части ящиков. rboxZ в экспорте это уже умел,
         но rot никто не выставлял — все укрытия стояли строго по осям. */
      const rt=(V65.varycov&&rng()<0.28)?((rng()<0.5?-1:1)*(6+((rng()*12)|0))):0;
      covPut({x,y,w:cw,h:ch,kind:'crate',hgt:hg,rot:rt}); done++;
      /* Г-СБОРКА: замер говорит, что одиночный объект укрытия не даёт (lift 0.58),
         а угол закрывает направление целиком. Приставляем второй кусок сбоку,
         другой высоты — получается уступ, а не куб. */
      if(V65.varycov&&V63.pair&&rng()<0.30){
        const dirs=[[cw,0],[-1,0],[0,ch],[0,-1]];
        const d2=dirs[(rng()*4)|0], nx=x+d2[0], ny=y+d2[1];
        if(fl(nx,ny)&&!nearNode(node,nx,ny,1)&&!blocks(nx,ny,1,1)){
          const h2=hg>=112?(rng()<0.5?64:80):(112+((rng()*4)|0)*24);
          covPut({x:nx,y:ny,w:1,h:1,kind:'crate',hgt:h2,rot:0}); } } } };
  // большие зоны: стены-перегородки создают углы (основа) + ящики точечно
  wallSeg(px.A,5,true); wallSeg(px.A,4,true); if(rng()<0.6) wallSeg(px.A,4,false); crate(px.A,2+((rng()*2)|0));
  wallSeg(px.M,4,true); if(rng()<0.7) wallSeg(px.M,4,false); crate(px.M,1+((rng()*2)|0));
  wallSeg(px.B,4,true); if(rng()<0.6) wallSeg(px.B,3,true); crate(px.B,1+((rng()*2)|0));
  if(rng()<0.6) wallSeg(px.CT,3,false); crate(px.CT,1+((rng()*2)|0)); crate(px.T,1+((rng()*2)|0));
  for(const k of ['AM','BM','ML','AC','BC','SR','SL']) if(px[k]&&rng()<0.6){ if(rng()<0.55) wallSeg(px[k],3,false); else crate(px[k],1); }
  // ===== ЗАПОЛНЕНИЕ ОТКРЫТЫХ ПОЛЕЙ: перегородки-ломатели прострелов + кластеры (плотность = COVDENS) =====
  // дистанция каждой клетки до ближайшей стены (multi-source BFS); большая = середина голого поля
  const wd=new Int16Array(W*H).fill(9999), q=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!fl(x,y)){wd[i]=0;q.push(i);} }
  for(let hd=0;hd<q.length;hd++){ const i=q[hd],x=i%W,y=(i/W)|0,nd=wd[i]+1;
    for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1]; if(nx<0||nx>=W||ny<0||ny>=H)continue; const j=ny*W+nx; if(wd[j]>nd){wd[j]=nd;q.push(j);} } }
  const nodes=Object.values(px), nearAny=(x,y,r)=>nodes.some(n=>Math.abs(n.x-x)<=r&&Math.abs(n.y-y)<=r);
  const run=(x,y,dx,dy)=>{ let k=0,cx=x+dx,cy=y+dy; while(fl(cx,cy)){k++;cx+=dx;cy+=dy;} return k; };
  const cand=[];
  if(V63.anchor){
    const edge=[],open=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ if(nearAny(x,y,1)) continue;
      const d=wd[y*W+x]; if(d===1) edge.push([x,y]); else if(d>=2) open.push([x,y]); }
    const sh=a=>{ for(let i=a.length-1;i>0;i--){const j=(rng()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];} };
    sh(edge); sh(open);
    let ei=0,oi=0;                       // чередование 2 пристенных : 1 открытая
    while(ei<edge.length||oi<open.length){
      if(ei<edge.length) cand.push(edge[ei++]);
      if(ei<edge.length) cand.push(edge[ei++]);
      if(oi<open.length) cand.push(open[oi++]); }
  } else {
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ if(wd[y*W+x]>=2 && !nearAny(x,y,1)) cand.push([x,y]); }
  }
  for(let i=cand.length-1;i>0;i--){const j=(rng()*(i+1))|0;[cand[i],cand[j]]=[cand[j],cand[i]];}
  const taken=new Uint8Array(W*H);
  const free=(x,y,r)=>{ for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){ const nx=x+ox,ny=y+oy; if(nx>=0&&nx<W&&ny>=0&&ny<H&&taken[ny*W+nx])return false; } return true; };
  const mark=(x,y,r)=>{ for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){ const nx=x+ox,ny=y+oy; if(nx>=0&&nx<W&&ny>=0&&ny<H)taken[ny*W+nx]=1; } };
  const dens=Math.max(0,Math.min(1,COVDENS));
  const sp=Math.max(2,Math.round(2+(1-dens)*3.0));   // COVDENS 0 → редко (расст ~5-6), 1 → плотно (расст 2)
  const cap=Math.min(200,(cand.length/5)|0);
  let opl=0;
  for(const [x,y] of cand){ if(opl>=cap) break; if(!free(x,y,sp)) continue; const di=wd[y*W+x];
    const openX=run(x,y,1,0)+run(x,y,-1,0), openY=run(x,y,0,1)+run(x,y,0,-1);
    if(di>=3 && rng()<0.18){ // ДИАГОНАЛЬНЫЙ забор — ломает осевую сетку и прострелы под углом
      if(fl(x+1,y)&&fl(x+2,y)&&fl(x,y+1)&&fl(x+2,y+1)){
        if(covPut({x,y,w:3,h:1,kind:'wall',hgt:rng()<0.5?48:112,rot:20+((rng()*50)|0)})){ mark(x,y,sp); opl++; } continue; } }
    if(di>=2 && rng()<0.6){ // перегородка ПОПЕРЁК длинного прострела (обходится с флангов)
      const vert=openX>openY, len=2+((rng()*3)|0); let ok=true;
      for(let s=0;s<len&&ok;s++){ const cx=vert?x:x+s, cy=vert?y+s:y; if(!fl(cx,cy)||wd[cy*W+cx]<2) ok=false; }
      if(ok){ const full=len<=3&&rng()<0.4;
        if(covPut({x,y,w:vert?1:len,h:vert?len:1,kind:'wall',hgt:full?'full':(rng()<0.35?48:112)})){ mark(x,y,sp); opl++; } continue; } }
    if(rng()<0.35 && fl(x+1,y)&&fl(x,y+1)&&fl(x+1,y+1)){ // 2x2 стопка-landmark
      /* v61: стопка = лесенка экспозиции. Низкий на подъём, высокий как основное укрытие. */
      const hb=V61.coverH?pickCovH(rng):64, hl=V61.coverH?(rng()<0.5?16:40):40;
      /* Ровно ОДИН низкий кусок на стопку: два низких + трим переполняют полосу <54u. */
      let ok4=false;
      if(covPut({x,y,w:1,h:1,kind:'crate',hgt:hb}))ok4=true;
      if(covPut({x:x+1,y,w:1,h:1,kind:'crate',hgt:hl}))ok4=true;
      if(covPut({x,y:y+1,w:1,h:1,kind:'crate',hgt:V61.coverH?pickCovH(rng):40}))ok4=true;
      if(covPut({x:x+1,y:y+1,w:1,h:1,kind:'crate',hgt:V61.coverH?pickCovH(rng):(rng()<0.5?64:96)}))ok4=true;
      if(ok4){ mark(x,y,sp); opl++; } }
    else { if(covPut({x,y,w:1,h:rng()<0.3?2:1,kind:'crate',hgt:V61.coverH?pickCovH(rng):(rng()<0.4?64:40)})){ mark(x,y,sp); opl++; } } }
  // ЭКСП. богатый декор: кластеры/баррикады/косые блоки — больше опорных точек и хаоса
  if(DECOR){
    const place=(x,y,w,h,hgt,rot)=>{ if(!fl(x,y)||!fl(x+w-1,y+h-1))return false; covPut({x,y,w,h,kind:'crate',hgt,rot:rot||0}); return true; };
    const inZone=(node,ox,oy)=>({x:node.x-(node.room[0]>>1)+1+ox, y:node.y-(node.room[1]>>1)+1+oy});
    // стопка ящиков (2x2 разной высоты) — читаемый landmark
    const stack=node=>{ const w=node.room[0],h=node.room[1];
      const bx=node.x-(w>>1)+2+((rng()*Math.max(1,w-4))|0), by=node.y-(h>>1)+2+((rng()*Math.max(1,h-4))|0);
      if(nearNode(node,bx,by,1))return; place(bx,by,1,1,64); place(bx+1,by,1,1,40); place(bx,by+1,1,1,40); place(bx+1,by+1,1,1,rng()<0.5?64:96); };
    // баррикада: линия ящиков с более высоким центром (как тележка+коробки)
    const barricade=node=>{ const w=node.room[0],h=node.room[1], vert=rng()<0.5, len=3+((rng()*2)|0);
      const x=node.x-(w>>1)+2+((rng()*Math.max(1,w-len-2))|0), y=node.y-(h>>1)+2+((rng()*Math.max(1,h-len-2))|0);
      for(let i=0;i<len;i++){ const cx=vert?x:x+i, cy=vert?y+i:y; if(nearNode(node,cx,cy,1))continue; place(cx,cy,1,1, i===(len>>1)?96:40); } };
    // косой блок (ротейт) — ломает осевую сетку, ставится у стены
    const skew=node=>{ const w=node.room[0],h=node.room[1];
      for(let t=0;t<8;t++){ const x=node.x-(w>>1)+2+((rng()*Math.max(1,w-4))|0), y=node.y-(h>>1)+2+((rng()*Math.max(1,h-4))|0);
        if(fl(x,y)&&wallNb(x,y)&&!nearNode(node,x,y,1)){ place(x,y,2,1,rng()<0.5?40:64, 30+((rng()*20)|0)); break; } } };
    // Г-стенка: два коротких сегмента углом (доп. к базовым wallSeg)
    for(const node of [px.A,px.B,px.M]){ if(rng()<0.75) stack(node); if(rng()<0.6) skew(node); }
    barricade(rng()<0.5?px.M:(rng()<0.5?px.A:px.B));
    for(const k of ['A','B']) if(rng()<0.5) skew(px[k]);
  }
  // ===== v61: ТЕЛА ВНУТРИ ПЛЕНТА =====
  // Реальный объём закладки занят телами на 21-29%. Пустой коробкой плент не бывает.
  // Ставим только ящики (не стены, не divider) и не в самую точку закладки.
  if(V61.corePerm){
    for(const k of ['A','B']){ const n=px[k]; if(!n) continue;
      const CR=coreR(k), cells=(CR*2+1)*(CR*2+1), want=Math.max(1,Math.round(cells*0.25));
      let put=0;
      for(let t=0;t<cells*4&&put<want;t++){
        const ox=((rng()*(CR*2+1))|0)-CR, oy=((rng()*(CR*2+1))|0)-CR;
        if(Math.abs(ox)<=0&&Math.abs(oy)<=0) continue;            // сама точка закладки свободна
        const x=n.x+ox, y=n.y+oy;
        if(x<1||x>=W-1||y<1||y>=H-1||!g[y*W+x]) continue;
        if(cov.some(c=>x>=c.x&&x<c.x+c.w&&y>=c.y&&y<c.y+c.h)) continue;
        covPut({x,y,w:1,h:1,kind:'crate',hgt:V61.coverH?pickCovH(rng):64}); put++; }
    }
  }
  // ===== v61: МЕЛОЧЬ 8-32u =====
  // 17-19% тел реальной карты ниже 32u, больше половины из них <=18u и проходятся шагом.
  // У v60 таких нет вообще. Риска для игры нет: движение они не меняют.
  if(V61.trim){
    const occupied=(x,y)=>cov.some(c=>x>=c.x&&x<c.x+c.w&&y>=c.y&&y<c.y+c.h);
    const spots=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      if(!fl(x,y)||occupied(x,y)||blocks(x,y,1,1)) continue;
      if(!wallNb(x,y)) continue;                                   // только вдоль края геометрии
      spots.push([x,y]); }
    for(let i=spots.length-1;i>0;i--){const j=(rng()*(i+1))|0;[spots[i],spots[j]]=[spots[j],spots[i]];}
    /* Доза привязана к числу укрытий, а не к числу мест: цель 19% тел ниже 54u. */
    const cap=V63.trim06 ? Math.max(18, Math.min(90, Math.round(cov.length*0.6)))
                         : Math.max(3, Math.min(24, Math.round(cov.length*0.12)));
    for(let i=0;i<cap&&i<spots.length;i++){
      const [x,y]=spots[i];
      const h=TRIMH[(rng()*TRIMH.length)|0];
      const long=rng()<0.35;
      covPut({x,y,w:long?2:1,h:1,kind:'crate',hgt:h}); }
  }
  /* ПЛЕНТ не должен быть голой площадкой: ставим по три тела вокруг точки закладки,
     не на неё саму. Правила горловины и связности к ним применяются как ко всем. */
  { let nsc=0;
    for(const k of ['A','B']){ const p=px[k]; if(!p) continue;
      for(const o of [[-2,-1],[2,1],[-1,2],[1,-2],[2,-2],[-2,2]]){
        const x=p.x+o[0], y=p.y+o[1];
        if(x<1||y<1||x>=W-1||y>=H-1||!fl(x,y)) continue;
        if(covPut({x:x,y:y,w:1,h:1,kind:'crate',hgt:V61.coverH?pickCovH(rng):64})) nsc++;
        if(nsc>=6) break; } }
    cov.__site=nsc; }
  /* ДОСЫПКА. Обычная россыпь ставит тела равномерно по кандидатам, поэтому большие открытые
     залы остаются пустыми. Здесь наоборот: ищем клетку, максимально удалённую от всего
     твёрдого, ставим тело туда, повторяем. Заполняются именно дыры. */
  let nFill=0, maxD0=0, maxD1=0;
  if(V71F.fill){
    const tried=new Uint8Array(W*H);
    /* источники — ТОЛЬКО тела. Расстояние до стены роли не играет: пустой зал у стены
       всё равно пустой зал. Стены при обходе просто непроходимы. */
    const far=()=>{ const D=new Int16Array(W*H).fill(-1), q=[];
      for(let i=0;i<W*H;i++) if(occ2[i]){ D[i]=0; q.push(i); }
      if(!q.length) return [-1,0];
      for(let h=0;h<q.length;h++){ const i=q[h],x=i%W,y=(i/W)|0;
        for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1];
          if(nx<0||nx>=W||ny<0||ny>=H) continue; const j=ny*W+nx;
          if(D[j]>=0||!g[j]) continue; D[j]=D[i]+1; q.push(j); } }
      let bi=-1,bd=0;
      for(let i=0;i<W*H;i++){ if(!g[i]||occ2[i]||tried[i]||D[i]<=bd) continue;
        const x=i%W,y=(i/W)|0; if(nearAny(x,y,1)) continue; bd=D[i]; bi=i; }
      return [bi,bd]; };
    let FR=V71F.fillR;
    try{ const e=document.getElementById('sCov'); if(e) FR=+e.value; }catch(_){}
    maxD0=far()[1];
    for(let it=0; it<V71F.fillMax*4; it++){ const [bi,bd]=far();
      if(bi<0||bd<FR) break;
      const x=bi%W, y=(bi/W)|0; tried[bi]=1;
      /* горловина может отказать — тогда просто пробуем следующую по пустоте клетку */
      let put=false;
      if(V72.variety){
        const r=rng();
        if(r<0.18){                                            // стопка 2x2 разной высоты
          put =covPut({x,y,w:1,h:1,kind:'crate',hgt:pickCovH(rng)});
          put|=covPut({x:x+1,y,w:1,h:1,kind:'crate',hgt:pickCovH(rng)});
          put|=covPut({x,y:y+1,w:1,h:1,kind:'crate',hgt:pickCovH(rng)});
          put|=covPut({x:x+1,y:y+1,w:1,h:1,kind:'crate',hgt:pickCovH(rng)});
        } else if(r<0.34){                                     // длинный низкий парапет
          put=covPut({x,y,w:rng()<0.5?3:2,h:1,kind:'wall',hgt:rng()<0.5?40:48});
        } else if(r<0.48){
          put=covPut({x,y,w:1,h:rng()<0.5?3:2,kind:'wall',hgt:rng()<0.5?40:48});
        } else if(r<0.60){                                     // высокий тонкий столб
          put=covPut({x,y,w:1,h:1,kind:'wall',hgt:144});
        } else if(r<0.72){                                     // повёрнутый ящик
          put=covPut({x,y,w:1,h:1,kind:'crate',hgt:pickCovH(rng),rot:8+((rng()*16)|0)});
        } else if(r<0.84){                                     // Г-сборка из двух
          put =covPut({x,y,w:1,h:1,kind:'crate',hgt:pickCovH(rng)});
          put|=covPut({x:x+1,y,w:1,h:1,kind:'crate',hgt:40});
        } else put=covPut({x,y,w:1,h:1,kind:'crate',hgt:pickCovH(rng)});
      } else put=covPut({x,y,w:1,h:1,kind:'crate',hgt:64});
      if(put){ nFill++; if(nFill>=V71F.fillMax) break; } }
    maxD1=far()[1];
  }
  /* СВЯЗНОСТЬ. Правило горловины не даёт перекрыть коридор одним телом, но два тела рядом
     в коридоре 3 клетки теоретически могут. Проверяем весь пол обходом и снимаем виновных. */
  let nCut=0;
  if(V71.connect){
    const blocked=()=>{ const b=new Uint8Array(W*H);
      for(const c of cov){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=18) continue;
        for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
          const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) b[Y*W+X]=1; } } return b; };
    const unreach=()=>{ const b=blocked(); let st=-1;
      for(const k of ['T','CT','A','B','M']){ const n=px[k]; if(!n) continue;
        const i=n.y*W+n.x; if(g[i]&&!b[i]){ st=i; break; } }
      if(st<0) return [];
      const seen=new Uint8Array(W*H), q=[st]; seen[st]=1;
      for(let h=0;h<q.length;h++){ const i=q[h],x=i%W,y=(i/W)|0;
        for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1];
          if(nx<0||nx>=W||ny<0||ny>=H) continue; const j=ny*W+nx;
          if(seen[j]||!g[j]||b[j]) continue; seen[j]=1; q.push(j); } }
      const bad=[]; for(let i=0;i<W*H;i++) if(g[i]&&!b[i]&&!seen[i]) bad.push(i);
      return bad; };
    for(let it=0; it<60; it++){ const bad=unreach(); if(!bad.length) break;
      const bs=new Set(bad); let vi=-1, best=-1;
      for(let ci=0;ci<cov.length;ci++){ const c=cov[ci];
        const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=18) continue;
        let sc=0;
        for(let oy=-1;oy<=(c.h||1);oy++)for(let ox=-1;ox<=(c.w||1);ox++){
          const X=c.x+ox,Y=c.y+oy; if(X<0||Y<0||X>=W||Y>=H) continue;
          if(bs.has(Y*W+X)) sc++; }
        if(sc>best){ best=sc; vi=ci; } }
      if(vi<0||best<=0) break;
      cov.splice(vi,1); nCut++; }
  }
  /* МАРШРУТЫ. Связность говорит только «дойти можно». Она не мешает телу перекрыть проход так,
     что обход идёт вокруг всей карты — снаружи это и выглядит тупиком. Сравниваем длину пути
     между узлами с эталоном по чистому полу и снимаем виновных, пока перебор не уйдёт. */
  let nRoute=0, worst=1;
  if(V72.routeGuard){
    const bfs=(sx,sy,blk)=>{ const D=new Int32Array(W*H).fill(-1);
      if(sx<0||sy<0||sx>=W||sy>=H||!g[sy*W+sx]) return D;
      const q=[sy*W+sx]; D[q[0]]=0;
      for(let h=0;h<q.length;h++){ const i=q[h],x=i%W,y=(i/W)|0;
        for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1];
          if(nx<0||nx>=W||ny<0||ny>=H) continue; const j=ny*W+nx;
          if(D[j]>=0||!g[j]||(blk&&blk[j])) continue; D[j]=D[i]+1; q.push(j); } }
      return D; };
    const pairs=[['T','A'],['T','B'],['T','M'],['CT','A'],['CT','B'],['M','A'],['M','B']];
    const blkOf=()=>{ const b=new Uint8Array(W*H);
      for(const c of cov){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=40) continue;
        for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
          const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) b[Y*W+X]=1; } } return b; };
    for(let it=0; it<40; it++){
      const b=blkOf(); let bad=null, bw=1;
      for(const pr of pairs){ const a=px[pr[0]], z=px[pr[1]]; if(!a||!z) continue;
        const D0=bfs(a.x,a.y,null), D1=bfs(a.x,a.y,b);
        const l0=D0[z.y*W+z.x], l1=D1[z.y*W+z.x];
        if(!(l0>0)) continue;
        const rr=(l1<0)?99:(l1/l0);
        if(rr>bw){ bw=rr; bad=[a,z,D0]; } }
      worst=bw;
      if(!bad || bw<=V72.routeMax) break;
      const a=bad[0], z=bad[1], D0=bad[2];
      let cx=z.x, cy=z.y; const ps=new Set();
      for(let st=D0[cy*W+cx]; st>0; st--){ ps.add(cy*W+cx); let mv=false;
        for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=cx+d[0],ny=cy+d[1];
          if(nx<0||nx>=W||ny<0||ny>=H) continue; const j=ny*W+nx;
          if(g[j]&&D0[j]===st-1){ cx=nx; cy=ny; mv=true; break; } }
        if(!mv) break; }
      let vi=-1,vh=-1;
      for(let ci=0;ci<cov.length;ci++){ const c=cov[ci];
        const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=40) continue;
        let on=false;
        for(let oy=0;oy<(c.h||1)&&!on;oy++)for(let ox=0;ox<(c.w||1)&&!on;ox++)
          if(ps.has((c.y+oy)*W+(c.x+ox))) on=true;
        if(on&&hh>vh){ vh=hh; vi=ci; } }
      if(vi<0) break;
      cov.splice(vi,1); nRoute++; }
  }
  /* ФИНАЛЬНАЯ ЗАЧИСТКА. spanOK проверяет тело в момент постановки, но сосед, поставленный
     позже, может закрыть последнюю щель рядом с уже стоящим. Проходим по итоговой картине. */
  let nSweep=0;
  for(let it=0; it<30; it++){
    const b=new Uint8Array(W*H);
    for(const c of cov){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=18) continue;
      for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
        const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) b[Y*W+X]=1; } }
    const fr3=(x,y)=> fl(x,y) && !b[y*W+x];
    let vi=-1;
    for(let ci=0;ci<cov.length;ci++){ const c=cov[ci];
      const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=18) continue;
      const cw=c.w||1, ch=c.h||1; let mx=1e9,my=1e9;
      for(let oy=0;oy<ch;oy++){ let l=0,r=0,x2=c.x-1;
        while(fr3(x2,c.y+oy)){l++;x2--;} x2=c.x+cw;
        while(fr3(x2,c.y+oy)){r++;x2++;} if(l+r<mx) mx=l+r; }
      for(let ox=0;ox<cw;ox++){ let u=0,d2=0,y2=c.y-1;
        while(fr3(c.x+ox,y2)){u++;y2--;} y2=c.y+ch;
        while(fr3(c.x+ox,y2)){d2++;y2++;} if(u+d2<my) my=u+d2; }
      if(Math.min(mx,my)<1){ vi=ci; break; } }
    if(vi<0) break;
    cov.splice(vi,1); nSweep++; }
  { const occ3=new Uint8Array(W*H), keep=[];
      const order=cov.slice().sort((a,b)=>((b.hgt==='full')?999:(b.hgt||40))-((a.hgt==='full')?999:(a.hgt||40)));
      for(const c of order){ let hit=false;
        for(let oy=0;oy<(c.h||1)&&!hit;oy++)for(let ox=0;ox<(c.w||1);ox++){
          const X=c.x+ox,Y=c.y+oy; if(X<0||Y<0||X>=W||Y>=H){hit=true;break;} if(occ3[Y*W+X]){hit=true;break;} }
        if(hit) continue;
        for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
          const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) occ3[Y*W+X]=1; }
        keep.push(c); }
      cov.__over=cov.length-keep.length; cov.length=0; for(const c of keep) cov.push(c); }
  cov.__sweep=nSweep;
  cov.__route=nRoute; cov.__worst=Math.round(worst*100)/100;
  cov.__skip=nSkip; cov.__cut=nCut; cov.__minw=V71.minw;
  cov.__fill=nFill; cov.__d0=maxD0; cov.__d1=maxD1;
  return cov;
}


