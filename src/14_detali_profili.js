/* ============ v98. СЛОЙ ДЕТАЛЕЙ: план на 96u, растр на 16u ============
   Решения (узлы, рёбра, полосы, баланс) остаются на 96u — там они и принимались
   девяносто версий. Меняется только то, ЧТО из этих решений рисуется.
   Готовый план поднимается в растр 16u, и по нему проходят четыре операции,
   каждую из которых на 96u выразить было нечем:
     стены   — толщина 32 или 64u вместо «ровно одна клетка 96u»;
     проёмы  — вход сужается до 112u, длина проёма равна толщине стены;
     перегородки — большой пустой зал делится надвое стеной с проёмом;
     укрытия — реальные габариты 32..64 x 76..132u вместо квадрата 96x96.
   ГЛАВНОЕ ПРАВИЛО: всё это пишется В РАСТР, а не только в экспорт. Иначе
   укрытия, дейкстра, зоны и замер видят карту, которой нет (SVODKA_2 §5.6). */
/* v108. wall (утоньшение стен) ВЫКЛЮЧЕНО. Замер: оно отдавало полу 870k u², то есть
   +10% площади, и двигало ширину прохода вверх. У dust2 медиана толщины перегородки
   80u — стена в одну клетку 96u это почти точное попадание, утоньшать её было нечего.
   narrow (сужение широких проходов) — новое и включено. */
const DET={on:false, проруб:false, wall:false, door:true, zonewall:true, part:true, cover:true, narrow:true,
           voidfill:true, shot:true, stepfix:true, deadend:true, lmark:true, cutdead:true, tier:true, seal:true, thickwall:true, deadplace:true,
           /* v139: сверка связности с геометрией — «видно рядом, идти далеко» */
           сшивка:true,
           /* v123: замуровывание спавна выключено. Это была починка не той
              проблемы: спавны ломались не проходимостью, а тем, что точки
              стояли в стенах и на ступеньках. Механизм оставлен на случай
              по-настоящему открытого спавна. */
           spawnwall:false};
/* v107. Два числа-цели, взяты из замеров реальных карт в SVODKA_2:
   пустота — у dust2 максимум 459u, у tuscan 256u. Ставим предел 384u: дальше этого
     от любой точки пола обязана быть преграда, иначе это «широко, но пусто»;
   прострел — у dust2 медиана луча 1128u, у tuscan 816u. Режем всё длиннее 1400u:
     на такой прямой игрок видит другого через полкарты. */
/* ============ v110. ПРОФИЛИ ============
   Раньше каждая ручка стояла в середине диапазона, и карта попадала внутрь полосы
   между dust2 и tuscan по всем метрикам сразу — то есть не походила ни на что
   (SVODKA_2 §0.3). Профиль убирает усреднение: он ставит все ручки разом под характер
   одной конкретной карты. Числа-ориентиры и характер каждого профиля — в PROFILES.md.
   Совпадают СТАТИСТИКИ, а не форма: мидовые двери миража и два этажа нюка —
   решения планировщика, ручками их не достать. */
const PROF={
  /* v111. ПЕРЕКАЛИБРОВКА. Все прежние значения целились в числа из сводки, снятые
     по наву на сетке 2u: ширина медиана 100..176u. Но это ДРУГОЙ прибор. Растеризовав
     те же навы на нашей клетке 16u (tools/ref16.py), получаем совсем другое:
        карта     мед   p90   <192u  >448u  лучМакс  пол/оболочка
        dust2     416   832    10%    46%    3872      53%
        mirage    320   816    22%    27%    2784      50%
        inferno   320   864    17%    29%    2144      48%
        ancient   336   768    13%    40%    2224      46%
        cache     480   944     7%    56%    2256      58%
        tuscan    320   800    17%    32%    2192      47%
     То есть реальные карты ШИРЕ, чем я считал, и держат длинные прострелы: у dust2
     максимум 3872u, p90 944u. Я резал всё длиннее 832u — то есть убивал то, что
     на настоящих картах是 главный приём (лонг, мид). И сужал до 30% пола уже 192u
     при 10% у dust2 — отсюда ощущение жёваного сыра.
     Ниже цели взяты из таблицы выше, в юнитах: narrowTgt — медиана ширины профиля,
     shotMax — предел прострела чуть ниже реального максимума. */
  dust2:   {ttl:'dust2 — просторно, длинные прострелы, перекос обороны',
            size:3, width:1,  vert:1.25, ring:0.50, cov:7, tun:0.5,
            narrowTgt:26, elong:2.2, shotMax:216, emptyR:13, zwallMax:30},
  mirage:  {ttl:'mirage — теснее прочих, мелкие частые перепады',
            size:2, width:0,  vert:1.2, ring:0.60, cov:8, tun:0.6,
            narrowTgt:20, elong:2.0, shotMax:160, emptyR:12, zwallMax:26},
  inferno: {ttl:'inferno — тесные связки между крупными узлами',
            size:2, width:0,  vert:1.2, ring:0.35, cov:6, tun:0.7,
            narrowTgt:20, elong:2.2, shotMax:128, emptyR:13, zwallMax:34},
  ancient: {ttl:'ancient — средняя ширина, компактная упаковка',
            size:2, width:0,  vert:0.9, ring:0.40, cov:5, tun:0.4,
            narrowTgt:21, elong:2.4, shotMax:132, emptyR:14, zwallMax:30},
  cache:   {ttl:'cache — просторно, плоско, бой на дистанции',
            size:3, width:2,  vert:0.5, ring:0.30, cov:4, tun:0.3,
            narrowTgt:30, elong:2.8, shotMax:136, emptyR:16, zwallMax:30},
  tuscan:  {ttl:'tuscan — закоулки и вертикаль',
            size:1, width:0,  vert:1.6, ring:0.75, cov:8, tun:0.6,
            narrowTgt:20, elong:2.0, shotMax:132, emptyR:12, zwallMax:22}
};
let PROFILE='dust2';
function applyProfile(k){ const P=PROF[k]; if(!P) return; PROFILE=k;
  const set=(id,v)=>{ const e=document.getElementById(id); if(!e) return;
    e.value=v; e.dispatchEvent(new Event('input')); };
  set('sSize',P.size); set('sWidth',P.width); set('sVert',P.vert);
  set('sRing',P.ring); set('sCov',P.cov); set('sTun',P.tun);
  PWIDTH=P.width; TUNP=P.tun;
  const s=SIZES[P.size]; if(s) setSize(s[0],s[1]);
  V108.narrowTgt=P.narrowTgt; V108.elong=P.elong; V108.zwallMax=P.zwallMax;
  V107.shotMax=P.shotMax; V107.emptyR=P.emptyR;
}
const V109={ minRun:4,     // уступ короче 64u не делаем — это зазубрина, а не грань
             maxRun:16,    // и не длиннее 256u — иначе стена уезжает ровной линейкой
             skip:0.45 };  // доля кусков, которые остаются на месте
const V108={ narrowTgt:12,        // проход шире 192u по короткой оси — сужаем
             narrowMin:8,         // уже 128u не делаем
             elong:2.0,           // «проход», а не зал: длинная сторона вдвое больше короткой
             zwallMax:30 };       // стык длиннее 480u стеной не режем — это не горло, а полоса
const V107={ shotMax:64,          // прогон длиннее 1024u ломаем
             emptyR:12,           // дальше 192u от любого тела — «пусто, прятаться не за чем»
             crateMin:2, crateMax:4, crateLong:5, crateLongMax:8 };
const DETK=6;                                    // 96/16

function detRefine(src){
  const K=DETK, sW=W, sH=H;
  const Wf=sW*K, Hf=sH*K, N=Wf*Hf;
  const gc=src.g, zc=src.zfield;
  const gf=new Uint8Array(N), zff=new Float32Array(N);
  for(let y=0;y<Hf;y++){ const cy=(y/K)|0;
    for(let x=0;x<Wf;x++){ const ci=cy*sW+((x/K)|0);
      if(gc[ci]){ const j=y*Wf+x; gf[j]=1; zff[j]=zc?zc[ci]:0; } } }
  const rng=mulberry32((src.seed^0xD37A11)>>>0);
  const ix=(x,y)=>y*Wf+x, inb=(x,y)=>x>=0&&x<Wf&&y>=0&&y<Hf;
  const D4=[[1,0],[-1,0],[0,1],[0,-1]];
  const stat={wall:0, door:0, zwall:0, zskip:0, narrow:0, part:0, fill:0, chic:0, cut:0, cross:0};

  /* 1. ТОЛЩИНА СТЕН. У стены в одну крупную клетку ровно шесть мелких.
     Снимаем 1 или 2 слоя с каждой стороны — остаётся 64u или 32u, отвоёванное
     уходит полу с высотой ближайшей клетки. Глубже двух не снимаем: на трёх
     стена исчезнет и две комнаты сольются. */
  if(DET.wall){
    const d=new Uint8Array(N), zn=new Float32Array(N);
    let q=[], q2=[];
    for(let y=0;y<Hf;y++)for(let x=0;x<Wf;x++){ const i=ix(x,y); if(!gf[i]) continue;
      for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
        const j=ix(nx,ny); if(!gf[j]&&!d[j]){ d[j]=1; zn[j]=zff[i]; q.push(j); } } }
    for(let lvl=1; lvl<2 && q.length; lvl++){
      for(const j of q){ const x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k=ix(nx,ny); if(!gf[k]&&!d[k]){ d[k]=lvl+1; zn[k]=zn[j]; q2.push(k); } } }
      q=q2; q2=[]; }
    /* Толщина выбирается НА ВЕСЬ ОТРЕЗОК СТЕНЫ, а не на каждую клетку отдельно.
       Случайная глубина на клетку рвала грань в зубцы: соседние куски стены
       уходили на 32u и 64u вперемешку, жадная склейка переставала работать,
       и стена уезжала в экспорт сотнями лезвий 16x64 высотой под 700 — именно
       они и торчали в проходах. Сегмент = прямой прогон стены вдоль одной оси. */
    const isW=(x,y)=>x>=0&&x<sW&&y>=0&&y<sH&&!gc[y*sW+x];
    const pick=h=>{ const r=((Math.sin(h*12.9898)*43758.5453)%1+1)%1; return r<0.42?2:1; };
    const tOf=new Uint8Array(sW*sH);
    for(let cy=0;cy<sH;cy++)for(let cx=0;cx<sW;cx++){
      if(!isW(cx,cy)) continue;
      const horiz=(!isW(cx,cy-1)||!isW(cx,cy+1)), vert=(!isW(cx-1,cy)||!isW(cx+1,cy));
      let h=0;
      if(horiz&&!vert){ let s=cx; while(isW(s-1,cy)&&(!isW(s-1,cy-1)||!isW(s-1,cy+1))) s--; h=cy*7919+s+1; }
      else if(vert&&!horiz){ let s=cy; while(isW(cx,s-1)&&(!isW(cx-1,s-1)||!isW(cx+1,s-1))) s--; h=cx*104729+s+0.5; }
      tOf[cy*sW+cx] = h ? pick(h) : 1;           // угол и толстый массив — ровно 64u
    }
    for(let cy=0;cy<sH;cy++)for(let cx=0;cx<sW;cx++){
      if(gc[cy*sW+cx]) continue;
      const th=tOf[cy*sW+cx]||1;                 // 32u или 64u, одинаково по всему отрезку
      for(let oy=0;oy<K;oy++)for(let ox=0;ox<K;ox++){
        const j=ix(cx*K+ox, cy*K+oy);
        if(d[j] && d[j]<=th){ gf[j]=1; zff[j]=zn[j]; stat.wall++; } } }
  }

  /* заливка по связности от спавна T — сторож для всего, что УБИРАЕТ пол */
  /* точка старта: центр крупной клетки спавна может оказаться не полом
     (плато, рампа, ядро плента), поэтому ищем любую половую внутри неё,
     а если и там нет — расширяем поиск на соседние. */
  const anyFloor=(p,rad)=>{ for(let r=0;r<=rad;r++)
      for(let oy=-r*K;oy<=(r+1)*K-1;oy++)for(let ox=-r*K;ox<=(r+1)*K-1;ox++){
        const x=p.x*K+ox, y=p.y*K+oy; if(!inb(x,y)) continue;
        const j=ix(x,y); if(gf[j]) return j; }
    return -1; };
  /* v108. Заливка сторожа шла по четырём направлениям, а дейкстра генератора ходит
     по восьми. Пока стены утоньшались, углы были широкими и разница не всплывала.
     Стоило перестать утоньшать — проходы, связанные только по диагонали, для сторожа
     стали разрывом, он объявлял карту несвязной и откатывал АБСОЛЮТНО ВСЁ:
     сужений 0, зонных стен 0, изломов 0 при сотне откатов.
     Сторож обязан ходить так же, как ходит расчёт. */
  const D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  /* v131: прежний reach() (просто заливка «дошли/не дошли») удалён — его место
     занял dists(), который даёт расстояния. seesNode остаётся: им пользуется
     отдельная проверка прыжков ниже по файлу. */
  const seesNode=(v,p)=>{ if(!p) return true;
    for(let oy=-K;oy<2*K;oy++)for(let ox=-K;ox<2*K;ox++){
      const x=p.x*K+ox, y=p.y*K+oy; if(!inb(x,y)) continue;
      const j=ix(x,y); if(gf[j]&&v[j]) return true; }
    return false; };
  /* v108. Сторож был абсолютным: требовал, чтобы от спавна T доходило до A, B, CT и M.
     Но встречаются карты, где какой-то узел недостижим по растру ЕЩЁ ДО правок —
     и тогда сторож заворачивал всё подряд: на такой карте сужений 0, зонных стен 0,
     изломов 0 при 128 откатах, то есть слой деталей молча ничего не делал.
     Правильная постановка: правка не имеет права УХУДШИТЬ связность. Снимаем слепок
     достижимости до всех правок и сверяемся с ним, а не с идеалом. */
  const KEYS=['A','B','CT','M'];

  /* ============ v131. СТОРОЖ СЧИТАЕТ ДЛИНУ, А НЕ ФАКТ ============
     Было: правка разрешена, если после неё от спавна T всё ещё ДОХОДИТ до A, B,
     CT и M. Это ловит только полный разрыв. Но проход можно закрыть, не разорвав
     карту: обход останется, просто станет вчетверо длиннее. Каждая отдельная
     правка при этом честно проходит проверку.

     Замер по экспорту (tools/reach.py) на присланной карте:
       Mid Pillar -> Middle   3552u по земле против 949u напрямую   крюк x3.74
       Middle -> BombsiteA    5024u против 1748u                    крюк x2.87
       TSpawn -> Middle       4480u против 2016u                    крюк x2.22
     Связность при этом ЦЕЛАЯ. Сторож не соврал — он мерил не то.

     Смерть от тысячи порезов: правок в слое деталей сотни, каждая добавляет к
     маршруту по чуть-чуть, и ни одна не выглядит виноватой. Поэтому сравнение
     идёт не с предыдущим состоянием, а со СЛЕПКОМ ДО ВСЕХ ПРАВОК: суммарный
     рост маршрута тогда ограничен порогом, а не количеством правок.

     Проверяются не четыре узла, а редкая сетка проб по всему полу (каждая
     PROBE-я клетка) плюс сами узлы: барикада между двумя местами в стороне от
     линии T->A может не тронуть ни один из четырёх узлов, а игрока тронет.
     Проб выходит около N/49 — на замер это копейки, обход тот же O(N). */
  const РОСТ=1.5;      // во сколько раз маршруту разрешено удлиниться против слепка
  const ЗАПАС=12;      // ...плюс столько клеток (192u) — на косяки дверей и утолщение стен
  const PROBE=7;       // шаг сетки проб по полу, клеток (112u)

  const NOWAY=-1;
  const _q=new Int32Array(N), _d=new Int32Array(N);
  /* Волна в ширину от спавна T: даёт РАССТОЯНИЕ до каждой клетки, а не только факт. */
  const dists=()=>{ const s0=anyFloor(src.px.T,2);
    if(s0<0){ stat.why='нет пола на спавне T'; return null; }
    _d.fill(NOWAY); let h=0,t=0; _d[s0]=0; _q[t++]=s0;
    while(h<t){ const j=_q[h++], x=j%Wf, y=(j/Wf)|0, dj=_d[j]+1;
      for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=Wf||ny>=Hf) continue;
        const k=ny*Wf+nx; if(gf[k]&&_d[k]===NOWAY){ _d[k]=dj; _q[t++]=k; } } }
    return _d; };
  const узелКлетка=p=>{ if(!p) return -1;
    for(let oy=-K;oy<2*K;oy++)for(let ox=-K;ox<2*K;ox++){
      const x=p.x*K+ox, y=p.y*K+oy; if(!inb(x,y)) continue;
      const j=ix(x,y); if(gf[j]) return j; }
    return -1; };

  let base=null, пробы=null, узлы4=null;
  const linked=()=>{ const d=dists(); if(!d) return false;
    if(!base){
      /* слепок «как было»: расстояния до проб и до узлов ДО всех правок */
      base=new Int32Array(N); base.set(d);
      пробы=[]; for(let y=0;y<Hf;y+=PROBE)for(let x=0;x<Wf;x+=PROBE){
        const j=y*Wf+x; if(base[j]>=0) пробы.push(j); }
      узлы4=[]; for(const k of KEYS){ const j=узелКлетка(src.px[k]); if(j>=0) узлы4.push([k,base[j]]); }
      return true; }
    for(const [k,b] of узлы4){ const j=узелКлетка(src.px[k]);
      if(j<0 || d[j]===NOWAY){ stat.why='потеряли '+k; return false; }
      if(d[j] > b*РОСТ + ЗАПАС){ stat.why='маршрут до '+k+' вырос'; return false; } }
    let плохо=0;
    for(const j of пробы){
      if(!gf[j]) continue;                       // клетку закрыли — это её право
      const dj=d[j];
      if(dj===NOWAY){ плохо++; if(плохо>2) { stat.why='отрезали пол'; return false; } continue; }
      if(dj > base[j]*РОСТ + ЗАПАС){ stat.why='крюк по полу'; return false; } }
    return true; };
  linked();                                  // слепок «как было»

  /* правка, которая убирает пол, применяется только если связность И ДЛИНЫ выжили */
  const guarded=(cells)=>{ if(!cells.length) return false;
    const undo=[];
    for(const j of cells){ if(gf[j]){ undo.push(j); gf[j]=0; } }
    if(linked()) return true;
    for(const j of undo) gf[j]=1; stat.cut++; return false; };

  /* 2. ПРОЁМЫ. Вход между зонами сейчас — дыра во всю клетку, 192u и шире.
     Сужаем до 112u, длина проёма равна толщине стены. Ровно то, что на 96u
     невыразимо: 112 — это 1.17 клетки. */
  if(DET.door && src.plan && src.plan.doors) for(const dr of src.plan.doors){
    /* v138. Та же болезнь, что у стыка зон: проём сужался до 112u при ЛЮБОЙ
       ширине пролёта. Пролёт в три клетки плана (288u) получал ту же дырку, что
       пролёт в полторы. Оставляем ДОЛЮ, а не константу. */
    const runF=(dr.w||1)*K;
    const keep=Math.max(7, Math.round(runF*0.55));
    if(runF<=keep+2) continue;
    const off=1+((rng()*(runF-keep-2))|0);
    const th=2+((rng()*2)|0);                             // косяк 32..48u
    const cells=[];
    if(dr.axis==='Y'){                                    // проём тянется по X
      const y0=dr.y*K+((K-th)>>1);
      for(let t=0;t<th;t++)for(let s=0;s<runF;s++){
        if(s>=off&&s<off+keep) continue;
        const x=dr.x*K+s, y=y0+t; if(inb(x,y)) cells.push(ix(x,y)); }
    } else {                                              // проём тянется по Y
      const x0=dr.x*K+((K-th)>>1);
      for(let t=0;t<th;t++)for(let s=0;s<runF;s++){
        if(s>=off&&s<off+keep) continue;
        const x=x0+t, y=dr.y*K+s; if(inb(x,y)) cells.push(ix(x,y)); }
    }
    if(guarded(cells)) stat.door++;
  }

  /* 3. ГРАНИЦА ЗОНЫ СТАНОВИТСЯ СТЕНОЙ.
     Главный дефект карты: четырнадцать зон существуют только в разметке, а в геометрии
     пол перетекает из одной в другую без единой преграды — получается не четырнадцать
     мест, а одна каша, один сплошной пустырь. Лечение прямое: на каждом участке
     соприкосновения двух зон ставится стена 32u, в ней оставляется один проём 112u
     (два, если участок длиннее 768u). Зона перестаёт быть раскраской и становится
     помещением. Каждый участок проходит через сторожа связности с откатом. */
  if(DET.zonewall && src.zones && src.zones.zid){
    const zid=new Uint8Array(N);
    for(let y=0;y<Hf;y++){ const cy=(y/K)|0;
      for(let x=0;x<Wf;x++) zid[ix(x,y)]=src.zones.zid[cy*sW+((x/K)|0)]; }
    /* пары соприкасающихся клеток, по одной записи на стык */
    const pairs=new Map();
    for(let y=1;y<Hf-1;y++)for(let x=1;x<Wf-1;x++){
      const i=ix(x,y); if(!gf[i]) continue; const a=zid[i]; if(a===255) continue;
      for(const [dx,dy] of [[1,0],[0,1]]){
        const j=ix(x+dx,y+dy); if(!gf[j]) continue; const b=zid[j];
        if(b===255||b===a) continue;
        const k=(a<b?a:b)+'|'+(a<b?b:a);
        let L=pairs.get(k); if(!L){ L=[]; pairs.set(k,L); }
        L.push([i,j]); } }
    /* каждый стык режем на связные участки: два помещения могут касаться в двух местах */
    /* v118. ТУПИК — ЭТО ЗОНА С ОДНИМ ВЫХОДОМ. Красный дефект с первых скриншотов.
       Искать его по клеткам бесполезно: после слоя деталей коридоров в одну клетку
       не осталось, и поиск горла не находил ничего. Правильный уровень — зона:
       она и есть комната. Считаем выходы у каждой зоны, пока режем стены, и если
       их меньше двух, прорезаем ещё один на самом длинном стыке этой зоны. */
    const zOpen={}, contacts=[];
    for(const [kk,L] of pairs){
      const pr=kk.split('|'), a2=+pr[0], b2=+pr[1];
      const own=new Map(); for(const e of L) own.set(e[0],e);
      const seen=new Set();
      for(const e0 of L){
        if(seen.has(e0[0])) continue;
        const comp=[], st=[e0]; seen.add(e0[0]);
        while(st.length){ const e=st.pop(); comp.push(e);
          const x=e[0]%Wf, y=(e[0]/Wf)|0;
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            if(!dx&&!dy) continue; const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
            const n=own.get(ix(nx,ny)); if(n&&!seen.has(n[0])){ seen.add(n[0]); st.push(n); } } }
        if(comp.length<6) continue;                      // пятачок меньше 96u — не стена
        contacts.push({a:a2,b:b2,comp:comp.slice()});
        /* v108. Длинный стык — это НЕ дверной проём между комнатами, это граница,
           идущая ВДОЛЬ широкого прохода. Стена по ней делит проход надвое и даёт
           две параллельные полосы — на реальных картах такого почти нет.
           Режем стеной только короткие стыки: они работают как горло. */
        (stat.стыки=stat.стыки||[]).push([comp.length, comp.length>V108.zwallMax?'открыт':'стена']);
        if(comp.length>V108.zwallMax){ stat.zskip++;
          zOpen[a2]=(zOpen[a2]||0)+1; zOpen[b2]=(zOpen[b2]||0)+1;   // длинный стык открыт — тоже выход
          continue; }
        /* вдоль какой оси тянется участок */
        let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
        for(const e of comp){ const x=e[0]%Wf, y=(e[0]/Wf)|0;
          if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
        const byX=(x1-x0)>=(y1-y0);
        comp.sort((p,q)=>byX ? (p[0]%Wf)-(q[0]%Wf) : ((p[0]/Wf)|0)-((q[0]/Wf)|0));
        /* ============ v138. ПРОЁМ ЗАВИСИТ ОТ ДЛИНЫ СТЫКА ============
           Было: проём 112u при ЛЮБОЙ длине стыка, и ровно один. Стык в 480 юнитов
           получал ту же дырку, что стык в 112. Вместе с порогом zwallMax это
           давало карту из двух крайностей: стык короче 480u — стена с одной
           замочной скважиной, длиннее 512u — открытый фронт целиком, между ними
           ничего. Отсюда «почему оно барикадирует избирательно»: правило жёсткое,
           а граница невидима, и два одинаковых на вид перекрёстка получают
           противоположное обращение.
           Ветка «два прохода» при этом была МЁРТВОЙ: nh=(n>48?2:1), а выше стоит
           `if(n>zwallMax) continue` при zwallMax=22..34. Условие n>48 недостижимо,
           и за всю историю ни одна стена не получила второго прохода. Замер это
           подтвердил: дыр ровно столько же, сколько стен, на каждой карте.
           Теперь открытой остаётся ДОЛЯ стыка, а не фиксированные 112u, и стык
           от 384u режется двумя проходами вместо одного. */
        const n=comp.length;
        const ДОЛЯ=0.45;                                 // столько стыка остаётся открытым
        const nh=(n>=24?2:1);                            // от 384u — два прохода
        const keep=Math.max(7, Math.round(n*ДОЛЯ/nh));   // но не уже 112u
        const holes=[];
        stat.дыр=(stat.дыр||0)+nh; stat.стен=(stat.стен||0)+1;
        for(let h=0;h<nh;h++){
          const сег=n/nh;
          const lo=Math.round(h*сег + Math.max(0,(сег-keep))*(0.25+rng()*0.5));
          holes.push(Math.max(0,Math.min(n-keep,lo))); }
        const cells=[];
        for(let s=0;s<n;s++){
          if(holes.some(h=>s>=h&&s<h+keep)) continue;
          cells.push(comp[s][0], comp[s][1]);            // обе стороны стыка — стена 32u
        }
        if(guarded(cells)){ stat.zwall++;
          zOpen[a2]=(zOpen[a2]||0)+holes.length; zOpen[b2]=(zOpen[b2]||0)+holes.length; }
        else { zOpen[a2]=(zOpen[a2]||0)+1; zOpen[b2]=(zOpen[b2]||0)+1; }   // откат — стык остался открыт
      } }

    const seenZ=new Set();
    for(const zi2 in zOpen){
      if((zOpen[zi2]|0)>=2 || seenZ.has(zi2)) continue; seenZ.add(zi2);
      const mine=contacts.filter(c=>String(c.a)===zi2||String(c.b)===zi2)
                         .sort((x,y)=>y.comp.length-x.comp.length);
      for(const ct of mine){
        const comp=ct.comp, n=comp.length; if(n<12) continue;
        const keep=7, off=Math.max(0,Math.min(n-keep,Math.round(n*0.5)-(keep>>1)));
        for(let s=off;s<off+keep&&s<n;s++){ const e=comp[s];
          if(!gf[e[0]]){ gf[e[0]]=1; zff[e[0]]=zff[e[1]]||0; }
          if(!gf[e[1]]){ gf[e[1]]=1; zff[e[1]]=zff[e[0]]||0; } }
        stat.deadend=(stat.deadend||0)+1; break; } }
  }

  /* 4. ПЕРЕГОРОДКИ. Пустой зал — место, которому нельзя дать имя.
     Ищем прямоугольные куски пола крупнее 640u по обеим сторонам и режем
     стеной 48u с проёмом 112u. Стена ставится поперёк ДЛИННОЙ оси — только так
     она реально делит зал, а не откусывает уголок. */
  if(DET.part){
    const MIN=40;                                          // 40 мелких клеток = 640u
    const seen=new Uint8Array(N);
    for(let cy=2;cy<Hf-2;cy++)for(let cx=2;cx<Wf-2;cx++){
      const i=ix(cx,cy); if(!gf[i]||seen[i]) continue;
      /* максимальный свободный пробег по осям из этой точки */
      let rx=1,ry=1,k;
      for(k=cx-1;k>0&&gf[ix(k,cy)];k--)rx++;  for(k=cx+1;k<Wf&&gf[ix(k,cy)];k++)rx++;
      for(k=cy-1;k>0&&gf[ix(cx,k)];k--)ry++;  for(k=cy+1;k<Hf&&gf[ix(cx,k)];k++)ry++;
      if(Math.min(rx,ry)<MIN) continue;
      if(stat.part>=12) continue;                          // больше дюжины — это уже лабиринт
      const vert = rx>=ry;                                 // режем поперёк длинной
      const th=3, keep=7, MAXLEN=40;                       // стена не длиннее 640u
      const cells=[];
      /* проём не один: на стене длиннее 24 клеток (384u) их два, иначе обход
         становится длиннее самого зала и маршруты уезжают через всю карту */
      const holes=(len)=>{ const n=len>24?2:1, hs=[];
        for(let k=0;k<n;k++){ const lo=2+Math.round((len-keep-4)*(k+0.35+rng()*0.3)/n);
          hs.push(Math.max(2,Math.min(len-keep-2,lo))); }
        return hs; };
      const inHole=(s,hs)=>hs.some(h=>s>=h&&s<h+keep);
      if(vert){ let y0=cy,y1=cy;
        while(y0>1&&gf[ix(cx,y0-1)]&&cy-y0<MAXLEN/2)y0--;
        while(y1<Hf-2&&gf[ix(cx,y1+1)]&&y1-cy<MAXLEN/2)y1++;
        const len=y1-y0+1; if(len<keep+6) continue;
        const hs=holes(len);
        for(let t=0;t<th;t++)for(let y=y0;y<=y1;y++){
          if(inHole(y-y0,hs)) continue; const x=cx+t; if(inb(x,y)) cells.push(ix(x,y)); }
      } else { let x0=cx,x1=cx;
        while(x0>1&&gf[ix(x0-1,cy)]&&cx-x0<MAXLEN/2)x0--;
        while(x1<Wf-2&&gf[ix(x1+1,cy)]&&x1-cx<MAXLEN/2)x1++;
        const len=x1-x0+1; if(len<keep+6) continue;
        const hs=holes(len);
        for(let t=0;t<th;t++)for(let x=x0;x<=x1;x++){
          if(inHole(x-x0,hs)) continue; const y=cy+t; if(inb(x,y)) cells.push(ix(x,y)); }
      }
      if(guarded(cells)) stat.part++;
      for(let y=Math.max(0,cy-MIN);y<Math.min(Hf,cy+MIN);y++)
        for(let x=Math.max(0,cx-MIN);x<Math.min(Wf,cx+MIN);x++) seen[ix(x,y)]=1;
    }
  }

  /* 4б. ШИРОКИЙ ПРОХОД СУЖАЕТСЯ, А НЕ ДЕЛИТСЯ НАДВОЕ.
     Замер: медиана ширины 576u на плане и 480u после деталей против 256u у dust2
     и 128u у tuscan; шире 448u у нас больше половины пола против 9% у dust2.
     Делить такой проход продольной стенкой неправильно — получаются две параллельные
     полосы, которых на реальных картах почти нет. Правильно — отъесть лишнее с краёв.
     Съедаем только там, где место ВЫТЯНУТО (длинная сторона вдвое больше короткой),
     то есть это проход, а не зал; и только с краю, и не сплошь, а через раз —
     тогда грань прохода получается изломанной, как на настоящих картах. */
  if(DET.narrow){
    for(let pass=0; pass<5; pass++){
      /* 1. кандидаты: клетки на краю ВЫТЯНУТОГО места шире цели */
      const cand=[];
      for(let y=1;y<Hf-1;y++)for(let x=1;x<Wf-1;x++){
        const i=ix(x,y); if(!gf[i]) continue;
        let rx=1,k; for(k=x-1;k>=0&&gf[ix(k,y)];k--)rx++; for(k=x+1;k<Wf&&gf[ix(k,y)];k++)rx++;
        let ry=1; for(k=y-1;k>=0&&gf[ix(x,k)];k--)ry++; for(k=y+1;k<Hf&&gf[ix(x,k)];k++)ry++;
        const mn=Math.min(rx,ry), mx=Math.max(rx,ry);
        if(mn<=V108.narrowTgt || mx<mn*V108.elong) continue;
        const alongX=(rx>ry);
        const edge = alongX ? (!gf[ix(x,y-1)]||!gf[ix(x,y+1)])
                            : (!gf[ix(x-1,y)]||!gf[ix(x+1,y)]);
        if(edge) cand.push(i);
      }
      if(!cand.length) break;

      /* 2. v109. Раньше здесь стоял случайный отсев ПОКЛЕТОЧНО, и грань превращалась
         в гребёнку с зубом в одну клетку — 16 юнитов. Это не излом, это шум, и на
         радаре он читается как забор из пикселей.
         Теперь кандидаты собираются в цепочки вдоль грани, цепочка режется на куски
         по 64..256u, и кусок либо съедается ЦЕЛИКОМ, либо не трогается вовсе.
         Тогда грань ступает крупно, как на настоящих картах, и брашей меньше. */
      const inSet=new Uint8Array(N); for(const i of cand) inSet[i]=1;
      const seen=new Uint8Array(N); const cells=[];
      for(const i0 of cand){
        if(seen[i0]) continue;
        const run=[], st=[i0]; seen[i0]=1;
        while(st.length){ const j=st.pop(); run.push(j); const x=j%Wf, y=(j/Wf)|0;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
            const k2=ix(nx,ny); if(inSet[k2]&&!seen[k2]){ seen[k2]=1; st.push(k2); } } }
        if(run.length<V109.minRun) continue;               // короче 64u — не уступ, а зазубрина
        let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9;
        for(const j of run){ const x=j%Wf, y=(j/Wf)|0;
          if(x<bx0)bx0=x; if(x>bx1)bx1=x; if(y<by0)by0=y; if(y>by1)by1=y; }
        const byX=(bx1-bx0)>=(by1-by0);
        run.sort((a,b)=>byX ? (a%Wf)-(b%Wf) : ((a/Wf)|0)-((b/Wf)|0));
        for(let s=0;s<run.length;){
          const chunk=V109.minRun+((rng()*(V109.maxRun-V109.minRun+1))|0);
          const e=Math.min(run.length,s+chunk);
          if(e-s>=V109.minRun && rng()>=V109.skip)
            for(let q=s;q<e;q++) cells.push(run[q]);
          s=e;
        }
      }
      if(!cells.length) break;
      const before=stat.cut;
      if(guarded(cells)) stat.narrow+=cells.length;
      else { stat.cut=before; let done=0;
        for(let s=0;s<cells.length;s+=64){ const part=cells.slice(s,s+64);
          if(guarded(part)) done+=part.length; }
        stat.narrow+=done;
        if(!done) break; }
    }
  }

  /* 5. ПУСТО — ЗНАЧИТ НЕ ЗА ЧЕМ ПРЯТАТЬСЯ.
     Первая попытка мерила расстояние до СТЕНЫ и говорила, что пустот нет: максимум 368u
     при 459u у dust2. Но глазом видно обратное, потому что «пусто» — это не «далеко до
     стены», а «нечем воспользоваться»: широкий зал, разделённый тонкими стенками, но
     без единого тела внутри. Поэтому расстояние считается до ближайшего ТЕЛА —
     стены или укрытия выше 40u, — и туда, где оно больше предела, ставится ящик
     настоящих габаритов. Пол не убираем: на реальных картах пространство заполняют
     телами, а не колоннами посреди зала. */
  const emptyFill=()=>{
    for(let pass=0; pass<5; pass++){
      const blk=new Uint8Array(N);
      for(let i=0;i<N;i++) if(!gf[i]) blk[i]=1;
      /* ============ v141. ДВА РАЗНЫХ ВОПРОСА, А МАСКА БЫЛА ОДНА ============
         «Далеко ли до того, за чем можно спрятаться» и «свободно ли тут место»
         — это не одно и то же, а мерились одной маской, куда попадали только
         тела ВЫШЕ 40u. Ящик высотой 40 — самый частый на карте — для этого паса
         не существовал вовсе, и он ставил новый ящик прямо в него.
         Его слова по скриншоту: «что это за столпотворение рандомных углов и
         обрезанного множества мелких ящиков». Вот оно: два тела в одном месте,
         вычитание крошит младшее, а рама вокруг щепок остаётся целой.
         Теперь `blk` (расстояние до укрытия) считается по-прежнему по телам
         выше 40, а занятость — по СЛЕДУ ЛЮБОГО тела, отдельной маской. */
      for(const c of cov){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=40) continue;
        for(let oy=0;oy<c.h;oy++)for(let ox=0;ox<c.w;ox++){
          const x=c.x+ox, y=c.y+oy; if(inb(x,y)) blk[ix(x,y)]=1; } }
      const стоит=new Uint8Array(N);
      for(const c of cov)
        for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
          const x=c.x+ox, y=c.y+oy; if(inb(x,y)) стоит[ix(x,y)]=1; }
      const d=new Int32Array(N).fill(-1), q=[];
      for(let i=0;i<N;i++) if(blk[i]){ d[i]=0; q.push(i); }
      for(let qi=0; qi<q.length; qi++){ const j=q[qi], x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k=ix(nx,ny); if(d[k]<0){ d[k]=d[j]+1; q.push(k); } } }
      const cand=[];
      for(let i=0;i<N;i++) if(gf[i]&&d[i]>V107.emptyR) cand.push(i);
      if(!cand.length) break;
      cand.sort((a,b)=>d[b]-d[a]);
      const busy=new Uint8Array(N); let put=0;
      for(const i of cand){
        if(busy[i]) continue;
        const x=i%Wf, y=(i/Wf)|0;
        const along=rng()<0.5;
        const sS=V107.crateMin+((rng()*(V107.crateMax-V107.crateMin+1))|0);
        const lS=V107.crateLong+((rng()*(V107.crateLongMax-V107.crateLong+1))|0);
        const w=along?lS:sS, h=along?sS:lS;
        let ok=true;
        for(let oy=0;oy<h&&ok;oy++)for(let ox=0;ox<w&&ok;ox++){
          const nx=x-(w>>1)+ox, ny=y-(h>>1)+oy;
          if(!inb(nx,ny)||!gf[ix(nx,ny)]||стоит[ix(nx,ny)]) ok=false; }
        if(ok){ const нов={x:x-(w>>1), y:y-(h>>1), w, h, kind:'crate',
                          hgt:(rng()<0.45?40:64), rot:0};
          cov.push(нов); put++; stat.fill++;
          for(let oy=0;oy<h;oy++)for(let ox=0;ox<w;ox++){
            const nx=нов.x+ox, ny=нов.y+oy; if(inb(nx,ny)) стоит[ix(nx,ny)]=1; } }
        const R=V107.emptyR;
        for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){
          const nx=x+ox, ny=y+oy; if(inb(nx,ny)) busy[ix(nx,ny)]=1; }
      }
      if(!put) break;
    }
  };

  /* 6. ПРОСТРЕЛЫ. Прямая, по которой видно через полкарты. Ищем прогоны свободного
     пола длиннее предела и ставим поперёк ИЗЛОМ: короткий выступ от одной стенки,
     перекрывающий больше половины ширины. Проход остаётся, прямая линия — нет.
     Сужать проход целиком бессмысленно: это опровергалось ещё до кода — сужение
     не даёт коротких узких мест, оно даёт длинную узкую трубу. */
  if(DET.shot){
    const L=V107.shotMax;
    const runAxis=(horiz)=>{
      const mark=new Uint8Array(N);
      if(horiz){ for(let y=0;y<Hf;y++){ let s=-1;
          for(let x=0;x<=Wf;x++){ const on=(x<Wf&&gf[ix(x,y)]);
            if(on&&s<0) s=x;
            else if(!on&&s>=0){ if(x-s>L) for(let k=s;k<x;k++) mark[ix(k,y)]=1; s=-1; } } } }
      else { for(let x=0;x<Wf;x++){ let s=-1;
          for(let y=0;y<=Hf;y++){ const on=(y<Hf&&gf[ix(x,y)]);
            if(on&&s<0) s=y;
            else if(!on&&s>=0){ if(y-s>L) for(let k=s;k<y;k++) mark[ix(x,k)]=1; s=-1; } } } }
      /* связные полосы простреливаемого пола */
      const seen=new Uint8Array(N);
      for(let i=0;i<N;i++){
        if(!mark[i]||seen[i]) continue;
        const comp=[], st=[i]; seen[i]=1;
        while(st.length){ const j=st.pop(); comp.push(j); const x=j%Wf, y=(j/Wf)|0;
          for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
            const k=ix(nx,ny); if(mark[k]&&!seen[k]){ seen[k]=1; st.push(k); } } }
        if(comp.length<L) continue;
        let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
        for(const j of comp){ const x=j%Wf, y=(j/Wf)|0;
          if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
        const len=horiz?(x1-x0+1):(y1-y0+1), wid=horiz?(y1-y0+1):(x1-x0+1);
        if(len<=L||wid<3) continue;
        /* Один выступ прямую не убирает: он перекрывает 62% ширины, а через оставшиеся
           38% линия по-прежнему проходит насквозь. Ставим ПАРУ встречных выступов
           со сдвигом вдоль прохода — вместе они перекрывают больше ширины, и прямой
           линии не остаётся ни одной, а пройти можно: путь идёт зигзагом. */
        const nb=Math.min(3,Math.floor(len/L));
        const step=Math.max(4,Math.round(wid*0.9));        // сдвиг пары вдоль прохода
        for(let b=1;b<=nb;b++){
          const at=(horiz?x0:y0)+Math.round(len*b/(nb+1));
          const cut=Math.max(2,Math.round(wid*0.62));
          for(let side=0; side<2; side++){
            const a0=at+(side? step:0)-1;
            const fromLo=(side===0)===(rng()<0.5?true:true);
            const cells=[];
            for(let tk=0;tk<3;tk++)for(let w=0;w<cut;w++){
              const a=a0+tk;
              const s2=(side===0)?((horiz?y0:x0)+w):((horiz?y1:x1)-w);
              const nx=horiz?a:s2, ny=horiz?s2:a;
              if(inb(nx,ny)&&gf[ix(nx,ny)]) cells.push(ix(nx,ny)); }
            if(cells.length>=cut && guarded(cells)) stat.chic++;
          }
        }
      }
    };
    runAxis(true); runAxis(false);
  }

  /* ============ v120. 3.5 ПРЕДМЕТ И ИМЯ НА КАЖДОЕ МЕСТО ============
     По числам генератор внутри полосы реальных карт почти везде: мест 22 при
     медиане 23, площадь места 369k при 358k, ширина и прострелы в допуске.
     А глазами карта всё равно читается как пустырь. Значит дело не в габаритах.
     OVERPASS.md §3: из 44 названий Overpass ни одно не происходит от формы стен —
     все от предмета (Truck, Rock, Fountain), постройки (Bank, Toilets), перепада
     (Heaven, Pit) или даже звука (Squeaky). Пустырь — это не «место без укрытий»,
     а МЕСТО, КОТОРОМУ НЕЛЬЗЯ ДАТЬ ИМЯ. Одинаковые ящики именем не становятся.

     Здесь каждое место получает имя, а те, куда влезает предмет, — ещё и один
     силуэт, не похожий на соседние. Имя уходит на карту и в .vmf как env_cs_place,
     то есть работает в игре настоящим каллаутом. */
  let PLC_R=computePlaces(gf,Wf,Hf,16);

  /* ============ v120. ЩЕЛЬ — ЭТО НЕ ПРОХОД ============
     «Слишком много проходов» — замечание с самого начала, и оно подтвердилось.
     Считаем одним прибором с реальными картами: при пороге входа 96u у настоящих
     карт входов в место максимум 4..7, у нас 8..9 — то есть чуть выше полосы.
     Но при пороге 32u у нас 9..15 против 5..10, и вся разница — в трёх десятках
     полос уже 96u на карту. Это не двери, это щели: проём в 32-80u игрок проходит
     боком, он не читается как вход и не даёт ни укрытия, ни угла. Место с четырьмя
     дверями и восемью щелями — не комната, а решето, и именно так карта и
     ощущается однобокой: заходить можно откуда угодно, а войти некуда.
     Щели закрываются, двери остаются. Под охраной связности и с условием, что
     ни одно из двух мест не станет тупиком. */
  if(DET.seal){
    let closed=0, tries=0, skipped=0;
    for(let round=0; round<2; round++){
      const ent=PLC_R.list.map(p=>p.ent);
      const cand=[];
      for(const pl of PLC_R.list) for(const s of pl.strips)
        if(s.n<6) cand.push({a:pl.id, b:s.b, n:s.n, cells:s.cells});
      if(!cand.length) break;
      cand.sort((u,v)=>u.n-v.n);                       // самые узкие первыми
      /* ============ v126. ЩЕЛЬ ИЛИ КОРИДОР ============
         Здесь была ошибка, из-за которой на картах появлялись стены поперёк ровных
         прямых проходов. Пасс закрывал ЛЮБУЮ полосу уже 96u, считая её щелью.
         Но вход в коридор шириной 80u выглядит ровно так же, как щель, — а это
         нормальный проход, по нему ходят. Сторож связности не возражал, потому что
         обход всегда находился: он бережёт СВЯЗНОСТЬ, а не МАРШРУТ. Генератор,
         как и было сказано, просто не понимал, что загородил то, что не должен.

         Отличаем по цене обхода. Щель — это дыра рядом с настоящей дверью: закрыл,
         и путь удлинился на сотню-другую юнитов. Коридор — самостоятельный маршрут:
         закрыл, и обход вырастает на тысячи или пропадает вовсе. Считаем длину пути
         между двумя сторонами полосы ДО и ПОСЛЕ закладки; дороже порога — не трогаем. */
      const обход=(cells,c)=>{
        /* точка со стороны a и точка со стороны b, вплотную к полосе */
        let sa=-1, sb=-1;
        for(const i of c.cells){ const x=i%Wf, y=(i/Wf)|0;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
            const j=ix(nx,ny); if(!gf[j]||cells.has(j)) continue;
            if(PLC_R.pid[j]===c.a && sa<0) sa=j;
            if(PLC_R.pid[j]===c.b && sb<0) sb=j; } }
        if(sa<0||sb<0) return 0;                       // одна из сторон исчезает — это не щель
        const dist=(закрыто)=>{ const D=new Int32Array(N).fill(-1); D[sa]=0;
          const q=[sa];
          for(let h=0;h<q.length;h++){ const j=q[h];
            if(j===sb) return D[j];
            const x=j%Wf, y=(j/Wf)|0;
            for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
              const k2=ix(nx,ny); if(!gf[k2]||D[k2]>=0) continue;
              if(закрыто&&cells.has(k2)) continue;
              D[k2]=D[j]+1; q.push(k2); } }
          return -1; };
        const было=dist(false), стало=dist(true);
        if(стало<0) return 1e9;                        // обхода нет вовсе
        return (стало-было)*16;                        // насколько длиннее, в юнитах
      };
      const ПОРОГ=512;                                 // дороже полутысячи юнитов — это маршрут
      for(const c of cand){
        if(ent[c.a]<=2 || ent[c.b]<=2) continue;       // тупика не делаем
        tries++;
        /* стена в две клетки: полоса со своей стороны плюс смежные клетки чужой */
        const cells=new Set(c.cells);
        for(const i of c.cells){ const x=i%Wf, y=(i/Wf)|0;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
            const j=ix(nx,ny); if(gf[j]&&PLC_R.pid[j]===c.b) cells.add(j); } }
        const цена=обход(cells,c);
        if(цена>ПОРОГ){ skipped++; continue; }         // это не щель, это проход
        if(guarded([...cells])){ closed++; ent[c.a]--; ent[c.b]--; }
      }
      if(!closed) break;
      PLC_R=computePlaces(gf,Wf,Hf,16);                // границы поехали — пересчитываем
    }
    stat.seal=closed; stat.sealTry=tries; stat.sealKeep=skipped;
  }

  /* ============ v122. КРУПНЫЙ ТУПИК — ЛИБО ВТОРОЙ ВЫХОД, ЛИБО ЕГО НЕТ ============
     Приёмка v120 считала тупик допустимым, если в нём стоит предмет. Правило
     неверное, и это видно на карте: «Barrels 2» и «Nook 2» висят отростками на
     краю, игрок зайдёт туда один раз, увидит бочки и больше не вернётся.
     У реальных карт тупики есть (dust2 1, mirage 3, nuke 11), но это НИША на
     боевом маршруте: закуток, откуда держат угол, куда прыгают с буста, где
     сажают бомбу. Ниша маленькая и лежит вплотную к тому, за что дерутся.
     Комната в четверть мегаюнита на отшибе — не ниша, а мёртвый груз: она стоит
     времени компиляции, света, брашей и ничего не даёт.
     Поэтому: маленький тупик остаётся. Крупному сначала ищется второй выход —
     если рядом, за тонкой стеной, есть ДРУГОЕ место, прорезается проём 112u.
     Не нашлось — место стирается из растра. Пол, на который никто не ходит,
     хуже, чем отсутствие пола: у нас его и так на 15% больше, чем у dust2. */
  if(DET.deadplace){
    const KEYC=['A','B','T','CT','M'];
    let прорезано=0, стёрто=0, оставлено=0;
    for(let round=0; round<3; round++){
      /* место с ключевым узлом неприкосновенно, каким бы оно ни было */
      const свято=new Set();
      for(const kk of KEYC){ const pt=src.px[kk]; if(!pt) continue;
        for(let r=0;r<=K*2;r++){ let hit=-1;
          for(let oy=-r;oy<=r&&hit<0;oy++)for(let ox=-r;ox<=r;ox++){
            const x=pt.x*K+ox, y=pt.y*K+oy; if(!inb(x,y)) continue;
            const q=PLC_R.pid[ix(x,y)]; if(q>=0){ hit=q; break; } }
          if(hit>=0){ свято.add(hit); break; } } }
      const тупики=PLC_R.list.filter(pl=>pl.ent<2 && !свято.has(pl.id));
      if(!тупики.length) break;
      let было=прорезано+стёрто;
      for(const pl of тупики){
        if(pl.area<=120){ оставлено++; continue; }       // ниша до 120k u² — оставляем
        const сосед=pl.strips.length?pl.strips[0].b:-1;
        /* --- 1. второй выход: ищем чужое место за тонкой стеной --- */
        let прорез=null;
        for(let i=0;i<N&&!прорез;i++){
          if(PLC_R.pid[i]!==pl.id) continue;
          const x=i%Wf, y=(i/Wf)|0;
          for(const [dx,dy] of D4){
            let k2=1, cx=x+dx, cy=y+dy;
            while(k2<=5 && inb(cx,cy) && !gf[ix(cx,cy)]){ k2++; cx+=dx; cy+=dy; }
            if(k2>5 || !inb(cx,cy) || !gf[ix(cx,cy)]) continue;
            const цель=PLC_R.pid[ix(cx,cy)];
            if(цель<0 || цель===pl.id || цель===сосед) continue;
            прорез={x,y,dx,dy,len:k2}; break; }
        }
        if(прорез){
          /* проём 112u = 7 клеток поперёк направления прокопки */
          const {x,y,dx,dy,len}=прорез, px2=-dy, py2=dx;
          let z0=0, n2=0;
          for(let s=-3;s<=3;s++)for(let k2=0;k2<=len;k2++){
            const cx=x+dx*k2+px2*s, cy=y+dy*k2+py2*s; if(!inb(cx,cy)) continue;
            if(gf[ix(cx,cy)]){ z0+=zff[ix(cx,cy)]; n2++; } }
          const zср=n2?z0/n2:0;
          for(let s=-3;s<=3;s++)for(let k2=0;k2<=len;k2++){
            const cx=x+dx*k2+px2*s, cy=y+dy*k2+py2*s; if(!inb(cx,cy)) continue;
            const j=ix(cx,cy); if(!gf[j]){ gf[j]=1; zff[j]=zср; } }
          прорезано++; continue;
        }
        /* --- 2. не к чему подключать: место стирается --- */
        const cells=[]; for(let i=0;i<N;i++) if(PLC_R.pid[i]===pl.id) cells.push(i);
        if(cells.length && guarded(cells)) стёрто++;
      }
      if(прорезано+стёрто===было) break;
      PLC_R=computePlaces(gf,Wf,Hf,16);
    }
    stat.dpCut=прорезано; stat.dpDel=стёрто; stat.dpKeep=оставлено;
  }

  /* ============ v122. СПАВН — ЭТО КОМНАТА С ДВУМЯ ВЫХОДАМИ ============
     Спавны стоят голыми посреди карты: со стороны мида в них простреливается всё,
     и первые секунды раунда решает не выбор маршрута, а то, кто раньше повернул
     голову. На реальных картах спавн замурован и выпускает наружу двумя-тремя
     горловинами — поэтому «выход со спавна» вообще существует как понятие.
     Здесь: место со спавном оставляет две самые широкие горловины, остальные
     закладываются. Стена ставится с обеих сторон стыка (32u), под охраной
     связности — если закладка что-то отрезает, она откатывается. */
  if(DET.spawnwall){
    let заложено=0;
    for(const kk of ['T','CT']){
      const pt=src.px[kk]; if(!pt) continue;
      let id=-1;
      for(let r=0;r<=K*2&&id<0;r++)
        for(let oy=-r;oy<=r&&id<0;oy++)for(let ox=-r;ox<=r;ox++){
          const x=pt.x*K+ox, y=pt.y*K+oy; if(!inb(x,y)) continue;
          const q=PLC_R.pid[ix(x,y)]; if(q>=0){ id=q; break; } }
      if(id<0) continue;
      const pl=PLC_R.list[id]; if(!pl||pl.strips.length<=2) continue;
      /* две самые широкие горловины — это и есть выходы со спавна */
      const по=pl.strips.slice().sort((a,b)=>b.n-a.n);
      for(let s=2;s<по.length;s++){
        const st=по[s];
        const cells=new Set(st.cells);
        for(const i of st.cells){ const x=i%Wf, y=(i/Wf)|0;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
            const j=ix(nx,ny); if(gf[j]&&PLC_R.pid[j]===st.b) cells.add(j); } }
        if(guarded([...cells])) заложено++;
      }
    }
    if(заложено){ PLC_R=computePlaces(gf,Wf,Hf,16); }
    stat.spawnWall=заложено;
  }

  /* ============ v120. У КАЖДОГО МЕСТА СВОЯ ОТМЕТКА ============
     Приёмка показала: у трети мест высота такая же, как у всех соседей. Тогда
     граница между ними не читается — идёшь и не понимаешь, что попал в другое
     место. Это и есть «однобокий, неинтересный проход» с лаймовой пометки:
     перепад не работает, потому что его нет.
     Соседние места разводятся по трём уровням (-64 / 0 / +64) жадной раскраской
     по графу смежности. Дальше поле уклона ОГРАНИЧИВАЕТСЯ: 8 юнитов на клетку,
     то есть половина шага. Значит переход между уровнями сам растягивается
     примерно на 128u и остаётся ходибельным, а середина крупного места успевает
     набрать свою отметку целиком. Мелкое место ограничение сплющит — и правильно:
     на сотне юнитов своя отметка не читается всё равно. */
  if(DET.tier && PLC_R.count>1){
    const L=PLC_R.list, pid=PLC_R.pid, NL=PLC_R.count;
    const lvl=new Int8Array(NL).fill(9);
    for(const pl of L.slice().sort((a,b)=>b.area-a.area)){
      const занято=new Set();
      for(const n of pl.nb) if(lvl[n]!==9) занято.add(lvl[n]);
      /* крупному месту охотнее даём ноль: пусть выделяются мелкие, а не наоборот */
      const порядок = pl.area>420 ? [0,1,-1] : [1,-1,0];
      let v=порядок.find(k=>!занято.has(k));
      if(v===undefined) v=порядок[(rng()*3)|0];
      lvl[pl.id]=v; }
    /* v121. ПЕРЕПАД ДЕЛАЕТСЯ МАРШЕМ, А НЕ ПОЛЕМ.
       В v120.2 отметка расползалась от места плавным полем с ограничением уклона,
       и это поле потом резалось по клеткам 16u. На косом направлении из этого
       выходила пиксельная диагональ: зубчатая каша вместо лестницы, а заодно
       полоски пола в одну клетку шириной, торчащие как стенки.
       Правильно так, как это делают руками: место ПЛОСКОЕ целиком, а весь перепад
       собран в один прямой марш поперёк прохода. Проход между двумя местами уже
       посчитан — это полоса входа (strips), у неё есть своя ось. Марш кладётся
       перпендикулярно ей, ступенями по 16u через две клетки, и получается
       «площадка — марш — площадка». */
    const UP48=48/72, ST16=16/72;
    const dz=new Float32Array(N);
    for(let i=0;i<N;i++) if(gf[i]&&pid[i]>=0) dz[i]=lvl[pid[i]]*UP48;

    let маршей=0;
    for(const pl of L) for(const s of pl.strips){
      const dl=lvl[s.b]-lvl[pl.id]; if(!dl) continue;
      if(pl.id>s.b) continue;                      // пара обрабатывается один раз
      /* ось полосы: вдоль неё вход широкий, поперёк — идти */
      let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      for(const i of s.cells){ const x=i%Wf, y=(i/Wf)|0;
        if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
      const вдольX=(x1-x0)>=(y1-y0);               // полоса тянется по X -> идём по Y
      const шагов=Math.max(1,Math.round(Math.abs(dl)*48/16));   // ступеней по 16u
      const R=шагов;                               // по две клетки на ступень
      const cx=((x0+x1)>>1), cy=((y0+y1)>>1);
      /* какая сторона выше: смотрим, где лежит место s.b относительно полосы */
      let sgn=0;
      { let sx=0, sy=0, n2=0;
        for(let oy=-4;oy<=4;oy++)for(let ox=-4;ox<=4;ox++){
          const x=cx+ox, y=cy+oy; if(!inb(x,y)) continue;
          if(pid[ix(x,y)]===s.b){ sx+=ox; sy+=oy; n2++; } }
        if(n2) sgn=Math.sign(вдольX ? sy : sx) || 1; else sgn=1; }
      for(let k=-R;k<=R;k++){
        /* t идёт от -1 (сторона pl) до +1 (сторона s.b) */
        const t=k/R;
        const ступень=Math.round((t*sgn>=0? t*sgn : t*sgn)*шагов)/шагов;
        const знач=lvl[pl.id]*UP48 + dl*UP48*Math.max(0,Math.min(1,(k*sgn/R+1)/2));
        const кв=Math.round(знач/ST16)*ST16;
        for(let m2=-1;m2<=Math.max(x1-x0,y1-y0)+1;m2++){
          const x = вдольX ? (x0+m2) : (cx+k*sgn);
          const y = вдольX ? (cy+k*sgn) : (y0+m2);
          if(!inb(x,y)||!gf[ix(x,y)]) continue;
          dz[ix(x,y)]=кв; }
      }
      маршей++;
    }
    /* Страховка: после маршей соседние клетки не должны расходиться больше чем
       на ступень. Там, где два марша сошлись рядом, поле подрезается — это
       редкий случай, и лучше подрезать, чем оставить непроходимый уступ. */
    for(let pass=0; pass<8; pass++){ let ch=0;
      const fwd=(pass&1)===0;
      const ya=fwd?1:Hf-2, yb=fwd?Hf-1:0, ys=fwd?1:-1;
      const xa=fwd?1:Wf-2, xb=fwd?Wf-1:0, xs=fwd?1:-1;
      for(let y=ya;y!==yb;y+=ys)for(let x=xa;x!==xb;x+=xs){ const i=ix(x,y); if(!gf[i]) continue;
        let m=1e9;
        for(const [dx2,dy2] of D4){ const nx=x+dx2, ny=y+dy2; if(!inb(nx,ny)) continue;
          const j=ix(nx,ny); if(!gf[j]) continue; if(dz[j]+ST16<m) m=dz[j]+ST16; }
        if(m<dz[i]-1e-6){ dz[i]=Math.round(m/ST16)*ST16; ch++; } }
      if(!ch) break; }
    let сдв=0;
    for(let i=0;i<N;i++){ if(!gf[i]||pid[i]<0) continue;
      if(Math.abs(dz[i])>1e-4) сдв++;
      zff[i]=zff[i]+dz[i]; }
    stat.tier=сдв; stat.marsh=маршей;
  }

  /* ============ v135. ПЛАТО ПАЛАСА ВОЗВРАЩАЕТСЯ ПОСЛЕ ЯРУСОВ ============
     Плато задаётся высотой ещё в крупном плане (`zfield = topZ`), а рампа наверх
     получает линейный профиль. Слой деталей про паласы не знает вовсе: пас
     ярусов раздаёт высоту ПО МЕСТАМ и затирает и плато, и рампу.
     Экспорт при этом печатает плато по topZ из cur.palaces. Итог — та же
     болезнь, что была с пандусами, только пятном: замер cur.__palas показал
     492..540 клеток расхождения на 48 юнитов. Последствия обе:
       дейкстра считает подъём на плато свободным, а в игре там ступень 88u;
       рампы наверх в растре нет, значит в экспорте её тоже нет, и плато
       доступно только через дроп-край, то есть в одну сторону.
     Именно так «мид» оказывался отрезанным: сверка пара-в-пару (tools/sverka.py)
     дала группу пар, где растр говорит x0.79..0.97, а экспорт — пути нет вовсе,
     и все они про Middle.
     Возвращаем отметки после ярусов. Наружный конец рампы берётся ПОСЛЕ пасa,
     то есть подстраивается под ту высоту, которую ярусы дали окрестности. */
  /* v136. Возврата мало: за ярусами идут ещё два паса, которые пишут в zff —
     ступени на обрывах (stepfix опускает клетку до «сосед плюс прыжок») и
     проруб (кладёт пол по прямой). Оба ничего не знают про плато, и любая их
     правка внутри плато снова разводит растр с печатью: экспорт печатает плато
     ОДНОЙ плоской коробкой по topZ, безусловно. Гейт ловил это как ровно
     одинаковые «пол против растра 14» и «плато паласа 14» — те же клетки.
     Поэтому отметка не просто возвращается, а ЗАПИРАЕТСЯ: ЗАМОК помнит, где
     высота продиктована печатью, ЗАМОКZ — какая именно. Последующие пасы
     обязаны её уважать. */
  const ЗАМОК=new Uint8Array(N), ЗАМОКZ=new Float32Array(N);
  const запереть=(j,z)=>{ ЗАМОК[j]=1; ЗАМОКZ[j]=z; if(gf[j]) zff[j]=z; };
  if(src.palaces) for(const q of src.palaces){
    for(let y=Math.max(0,q.y0*K); y<=Math.min(Hf-1,q.y1*K+K-1); y++)
      for(let x=Math.max(0,q.x0*K); x<=Math.min(Wf-1,q.x1*K+K-1); x++)
        запереть(ix(x,y), q.topZ);
    const rc=q.rampCells||[]; if(!rc.length) continue;
    let RL=0; for(const c of rc) if(c[2]>RL) RL=c[2];
    /* высота у подножия: что ярусы оставили на самой дальней клетке рампы */
    let низ=null;
    for(const [cx,cy,st] of rc){ if(st!==RL) continue;
      const j=ix(Math.min(Wf-1,cx*K), Math.min(Hf-1,cy*K));
      if(gf[j]){ низ=zff[j]; break; } }
    if(низ===null) низ=q.topZ;
    for(const [cx,cy,st] of rc){
      const z=q.topZ+(низ-q.topZ)*(st/(RL+1));
      for(let oy=0;oy<K;oy++)for(let ox=0;ox<K;ox++){
        const x=cx*K+ox, y=cy*K+oy; if(!inb(x,y)) continue;
        const j=ix(x,y);
        /* внутри самого плато рампы нет: там печатается плоская коробка по topZ,
           и профиль поверх неё был бы расхождением, а не подъёмом */
        if(ЗАМОК[j] || !gf[j]) continue;
        zff[j]=z; } }
  }

  const LMKS=[];
  if(DET.lmark){
    const busy=new Uint8Array(N);
    /* ядра плентов и спавны неприкосновенны: там предмет закроет точку закладки */
    for(const kk of ['A','B','T','CT']){ const p=src.px[kk]; if(!p) continue;
      const R=(kk==='A'||kk==='B')?4*K:2*K;
      for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){
        const x=p.x*K+ox, y=p.y*K+oy; if(inb(x,y)) busy[ix(x,y)]=1; } }

    /* ---- проверка проходимости ДО постановки ----
       Раньше предмет ставился, а пробку разгребала общая чистка укрытий — и по три
       предмета с карты уезжало задним числом. Дешевле спросить заранее: игрок
       шириной 32u, то есть две клетки, поэтому модель та же, что у укрытий (2x2). */
    const erodeL=(m)=>{ const o=new Uint8Array(N);
      for(let y=0;y<Hf-1;y++)for(let x=0;x<Wf-1;x++){ const i=ix(x,y);
        if(m[i]&&m[i+1]&&m[i+Wf]&&m[i+Wf+1]) o[i]=1; }
      return o; };
    const floodL=(m)=>{ const v=new Uint8Array(N), st=[];
      let s0=-1;
      for(let r=0;r<=3&&s0<0;r++)
        for(let oy=-r*K;oy<=(r+1)*K-1&&s0<0;oy++)for(let ox=-r*K;ox<=(r+1)*K-1&&s0<0;ox++){
          const x=src.px.T.x*K+ox, y=src.px.T.y*K+oy;
          if(inb(x,y)&&m[ix(x,y)]) s0=ix(x,y); }
      if(s0<0) return v;
      v[s0]=1; st.push(s0);
      while(st.length){ const j=st.pop(), x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(m[k2]&&!v[k2]){ v[k2]=1; st.push(k2); } } }
      return v; };
    const markLM=(m,L)=>{ const V=LMBY[L.k];
      if(V&&V.solid==='posts'){                            // навес: мешают только стойки
        for(const [ox,oy] of [[0,0],[L.w-1,0],[0,L.h-1],[L.w-1,L.h-1]])
          for(let a2=0;a2<2;a2++)for(let b2=0;b2<2;b2++){
            const x=L.x+ox+(ox?-a2:a2), y=L.y+oy+(oy?-b2:b2);
            if(inb(x,y)) m[ix(x,y)]=0; }
        return; }
      for(let oy=0;oy<L.h;oy++)for(let ox=0;ox<L.w;ox++){
        const x=L.x+ox, y=L.y+oy; if(inb(x,y)) m[ix(x,y)]=0; } };
    const baseL=floodL(erodeL(gf));
    /* Та же поправка, что в чистке укрытий: след предмета не «потеря связности»,
       он просто занят. Потеря — это годная позиция игрока, до которой не дойти. */
    const lmPasses=(cand)=>{ const m=new Uint8Array(N);
      for(let i=0;i<N;i++) m[i]=gf[i];
      for(const L of LMKS) markLM(m,L); markLM(m,cand);
      const e=erodeL(m), v=floodL(e);
      for(let i=0;i<N;i++) if(e[i]&&baseL[i]&&!v[i]) return false;
      return true; };

    /* ---- имена ----
       Внутренние коды узлов (AM2, BC, SL) игроку ничего не говорят: «AM2 Area» —
       это не каллаут, а протечка кода наружу. Перевод в слова, которыми на реальных
       картах называют половины: сторона A, сторона B, мид, вылазка. */
    const KEY={A:'BombsiteA', B:'BombsiteB', T:'TSpawn', CT:'CTSpawn', M:'Middle'};
    const QUAL={ A:'A', AM:'A', AM2:'A', AC:'A', B:'B', BM:'B', BM2:'B', BC:'B',
                 M:'Mid', ML:'Mid', SR:'Side', SL:'Side', T:'T', CT:'CT' };
    const nodeOf=(px_,py_)=>{ let best=null,bd=1e9;
      for(const kk in src.px){ const p=src.px[kk]; if(!p) continue;
        const d=(p.x*K-px_)**2+(p.y*K-py_)**2; if(d<bd){ bd=d; best=kk; } }
      return QUAL[best]||''; };
    /* Узел может попасть на стену или на неразмеченную клетку — тогда сайт остаётся
       без имени, и на карте нет BombsiteA. Ищем в окрестности узла, а не в точке. */
    const nodeNear=(pl)=>{ for(const kk in KEY){ const p=src.px[kk]; if(!p) continue;
        for(let r=0;r<=K;r++){ let hit=false;
          for(let oy=-r;oy<=r&&!hit;oy++)for(let ox=-r;ox<=r;ox++){
            const x=p.x*K+ox, y=p.y*K+oy; if(!inb(x,y)) continue;
            const q=PLC_R.pid[ix(x,y)]; if(q<0) continue;
            if(q===pl.id) return kk; hit=true; break; }
          if(hit) break; } }
      return null; };
    /* Форма тоже даёт имя, и на реальных картах чаще, чем предмет: Long, Short,
       Connector, Ramp. Вытянутое место — коридор, и предмет ему не нужен. */
    const shapeName=(pl)=>{ const lo=Math.min(pl.w,pl.h), hi=Math.max(pl.w,pl.h);
      if(hi/Math.max(1,lo) >= 2.0){
        if(pl.nb.size>=4) return 'Connector';
        return hi>=1100 ? 'Long' : 'Short'; }
      if(pl.R*32 < 352) return pl.nb.size<=1 ? 'Nook' : (pl.nb.size>=4 ? 'Junction' : 'Corner');
      return null; };

    const used=new Map(), claimed=[];
    const sosed=(p)=>{ const s=new Set();
      for(const nb of p.nb){ const t=claimed[nb]; if(t) s.add(t); } return s; };
    const byArea=PLC_R.list.slice().sort((a,b)=>b.area-a.area);
    let tries=0;
    for(const pl of byArea){
      pl.узел=nodeNear(pl);
      if(pl.узел){ pl.им=KEY[pl.узел]; }                   // сайт/спавн/мид называются собой
      const wu=Math.round(pl.R*2*16);                      // ширина места в юнитах
      const форма=shapeName(pl);
      let cand=LMV.filter(v=>v.minW<=wu);
      /* Тумба влезает почти везде и потому забирала половину карты: шесть «Crate»
         из девятнадцати имён. Мелочь берётся только когда крупного не поместилось. */
      if(cand.length>1) cand=cand.filter(v=>v.k!=='crate1');
      if(cand.length && !(форма && rng()<0.45)){
        /* Порядок перебора, а не жребий. Раньше на каждой неудачной попытке жребий
           кидался заново, мелкие предметы срабатывали чаще — и на карте выходило
           шесть «Barrels» из двадцати двух имён. Теперь список строится один раз:
           реже всего использованный тип впереди, при равенстве — крупный впереди,
           и по нему просто идут сверху вниз. Тип, уже стоящий у соседа, уходит
           в конец: место узнаётся именно тем, чем не похоже на смежное. */
        const bad=sosed(pl);
        const кап=Math.ceil(PLC_R.count/Math.max(3,LMV.length-1))+1;
        let pool=cand.filter(v=>(used.get(v.k)||0)<кап); if(!pool.length) pool=cand.slice();
        pool.sort((a,b)=>{ const ba=bad.has(a.k)?1:0, bb=bad.has(b.k)?1:0;
          return (ba-bb) || ((used.get(a.k)||0)-(used.get(b.k)||0)) || (b.minW-a.minW); });
        for(let t=0;t<pool.length;t++){
          const V=pool[t];
          tries++;
          const cw=Math.max(1,Math.round(V.w/16)), ch=Math.max(1,Math.round(V.h/16));
          const need=Math.ceil(Math.max(cw,ch)/2)+1;
          /* точка: самая «серединная» клетка места, не занятая ядром */
          let bi=-1,bd=-1;
          for(let i=0;i<N;i++){ if(PLC_R.pid[i]!==pl.id||busy[i]) continue;
            const d=PLC_R.D[i]; if(d<need) continue;
            const jit=d+rng()*0.6; if(jit>bd){ bd=jit; bi=i; } }
          if(bi<0) continue;
          const cx=bi%Wf, cy=(bi/Wf)|0, x0=cx-(cw>>1), y0=cy-(ch>>1);
          let inside=true;
          for(let oy=-1;oy<=ch&&inside;oy++)for(let ox=-1;ox<=cw;ox++){
            const x=x0+ox, y=y0+oy; if(!inb(x,y)||!gf[ix(x,y)]){ inside=false; break; } }
          if(!inside) continue;
          const L={ k:V.k, ру:V.ру, x:x0, y:y0, w:cw, h:ch, place:pl.id, cx, cy };
          if(!lmPasses(L)){ stat.lmSkip=(stat.lmSkip||0)+1; continue; }
          /* Имя от предмета берётся, только если место — комната. В тесном проходе
             предмет всё равно нужен (это укрытие и точка привязки), но называется
             такое место по форме: Long, Short, Connector, Corner — как на реальных
             картах. Иначе полкарты зовётся «Crate», и каллаут перестаёт работать. */
          if(!pl.им) pl.им = (wu>=352) ? V.en : (форма || (nodeOf(cx,cy)+' Area').trim());
          L.им=pl.им;
          pl.lm=V.k; LMKS.push(L);
          claimed[pl.id]=V.k; used.set(V.k,(used.get(V.k)||0)+1);
          for(let oy=-1;oy<=ch;oy++)for(let ox=-1;ox<=cw;ox++){
            const x=x0+ox, y=y0+oy; if(inb(x,y)) busy[ix(x,y)]=1; }
          break;
        }
      }
      /* Безымянных мест не бывает: если в него нельзя ткнуть словом — это дыра. */
      if(!pl.им) pl.им = форма || ((nodeOf(pl.x,pl.y)+' Area').trim());
    }
    /* Два «Pillar» на карте — это не два имени, а одно, сказанное дважды.
       Разводим здесь, а не в экспорте: подпись на карте и каллаут в игре обязаны
       совпадать, иначе игрок говорит одно, а видит другое. */
    { /* РАЗВЕДЕНИЕ ОДИНАКОВЫХ ИМЁН. Три уточнения подряд, каждое применяется только
         если реально делит группу: сторона (A / B / Mid / Side), ярус (Upper / Lower),
         удалённость от T (Front / Back). Ровно так уточняют на настоящих картах:
         Upper Tunnels, A Long, Back Alley. Номер — последнее средство, потому что
         «Side Corner 4» это не каллаут, а отписка. */
      const zOf=pl=>{ const i=Math.min(N-1,Math.max(0,pl.y*Wf+pl.x)); return (zff[i]||0)*72; };
      const dT=pl=>{ const p=src.px.T; return p?Math.hypot(pl.x-p.x*K, pl.y-p.y*K):0; };
      const bySide=gp=>{ const q=gp.map(p=>nodeOf(p.x,p.y));
        return new Set(q).size>1 ? q : null; };
      const byTier=gp=>{ const z=gp.map(zOf), lo=Math.min(...z), hi=Math.max(...z);
        if(hi-lo<64) return null; const mid=(hi+lo)/2;
        return z.map(v=>v>=mid?'Upper':'Lower'); };
      const byDist=gp=>{ const d=gp.map(dT), lo=Math.min(...d), hi=Math.max(...d);
        if(hi-lo<6*K) return null; const mid=(hi+lo)/2;
        return d.map(v=>v<=mid?'Front':'Back'); };
      /* Уточнение ровно одно. Три подряд дают «Back Upper A Corner» — такое
         в голосовой связи не выговаривают, и как каллаут оно мертво. */
      { const group=new Map();
        for(const pl of PLC_R.list){ if(!pl.им) continue;
          let arr=group.get(pl.им); if(!arr){ arr=[]; group.set(pl.им,arr); } arr.push(pl); }
        for(const [,gp] of group){ if(gp.length<2) continue;
          for(const disc of [bySide,byTier,byDist]){ const w=disc(gp); if(!w) continue;
            gp.forEach((pl,i)=>{ if(w[i] && !pl.им.startsWith(w[i]+' ') && pl.им!==w[i])
              pl.им=w[i]+' '+pl.им; });
            break; } } }
      /* Ключевые имена назначаются последними и поверх всего: место, в котором
         лежит точка закладки, обязано называться BombsiteA, чем бы его ни назвали
         раньше. Иначе на карте бывает BombsiteB и нет BombsiteA — а это то самое
         имя, ради которого каллауты и заводятся. */
      for(const kk in KEY){ const p=src.px[kk]; if(!p) continue;
        let id=-1;
        for(let r=0;r<=K*2&&id<0;r++)
          for(let oy=-r;oy<=r&&id<0;oy++)for(let ox=-r;ox<=r;ox++){
            const x=p.x*K+ox, y=p.y*K+oy; if(!inb(x,y)) continue;
            const q=PLC_R.pid[ix(x,y)]; if(q>=0){ id=q; break; } }
        if(id>=0) PLC_R.list[id].им=KEY[kk]; }
      const seen2=new Set();
      for(const pl of PLC_R.list){ if(!pl.им) continue;
        let nm=pl.им, n=2; while(seen2.has(nm)) nm=pl.им+' '+(n++);
        pl.им=nm; seen2.add(nm); }
      for(const L of LMKS){ const pl=PLC_R.list[L.place]; if(pl) L.им=pl.им; } }
    stat.lmark=LMKS.length; stat.places=PLC_R.count; stat.lmTry=tries;
  }


  /* 4. УКРЫТИЯ СЧИТАЮТСЯ ПО ФИНАЛЬНОМУ РАСТРУ.
     v117. Раньше расстановка бралась готовой с КРУПНОГО растра — то есть до сужений,
     зонных стен, изломов и перегородок. Половина тел потом оказывалась в местах,
     которых уже нет, и проверка проходимости выбрасывала 51..78 укрытий из ~110.
     Лечение не в чистке, а в порядке: сначала весь слой деталей, потом расстановка.
     coverAtCell сам огрубляет поданный ему растр до 96u, ставит тела накопленной
     за девяносто версий логикой и возвращает координаты обратно в мелкие клетки —
     значит вся эта логика работает, но уже по той карте, которая реально получилась. */
  let cov=[];
  { const sw=W, sh=H, scell=CELL, ssc=SC;
    try{
      setSize(Wf,Hf); CELL=16; SC=6;
      const pxF={}; for(const kk in src.px) pxF[kk]=Object.assign({},src.px[kk],
        {x:Math.min(Wf-2,src.px[kk].x*K+(K>>1)), y:Math.min(Hf-2,src.px[kk].y*K+(K>>1))});
      cov=coverAtCell(gf,pxF,(src.coverSeed>>>0)||((src.seed^0x5EED)>>>0))||[];
    } catch(e){ cov=[]; }
    finally { setSize(sw,sh); CELL=scell; SC=ssc; } }

  /* габариты в юнитах: 28..64 x 76..132 вместо квадрата в клетку (SVODKA_2 §5.7).
     Координаты уже мелкие — coverAtCell вернул их умноженными на K. */
  { const raw=cov; cov=[];
  for(const c of raw){
    const cwF=(c.w||1), chF=(c.h||1);
    const x0=c.x, y0=c.y;
    if(c.kind==='wall'){                                   // стенка: длину держим, толщину режем
      const th=2+((rng()*2)|0);                            // 32..48u
      const along = cwF>=chF;
      cov.push(Object.assign({},c,{ x:x0, y:y0,
        w: along?cwF:th, h: along?th:chF }));
    } else {                                               // ящик: 32..64 x 76..132
      const shortS=2+((rng()*3)|0);                        // 32..64u
      const longS =5+((rng()*4)|0);                        // 80..128u
      const along = cwF>=chF;
      let w=along?Math.min(cwF,longS):shortS, h=along?shortS:Math.min(chF,longS);
      const px2=x0+((rng()*Math.max(1,cwF-w))|0), py2=y0+((rng()*Math.max(1,chF-h))|0);
      cov.push(Object.assign({},c,{x:px2,y:py2,w,h}));
    }
  } }
  /* v103. КРЕСТЫ. Две стенки-укрытия под прямым углом пересекались и давали крест:
     тонкая стена ни с того ни с сего проходит сквозь другую, и это читается как ошибка.
     Оставляем длинную, короткую выбрасываем. Крест как приём — решение планировщика,
     а не побочный эффект расстановки. */
  { const WL=cov.filter(c=>c.kind==='wall');
    WL.sort((a,b)=>(b.w*b.h)-(a.w*a.h));
    const kill=new Set();
    for(let i=0;i<WL.length;i++){ const a=WL[i]; if(kill.has(a)) continue; const aH=a.w>=a.h;
      for(let j=i+1;j<WL.length;j++){ const b2=WL[j]; if(kill.has(b2)) continue;
        if((b2.w>=b2.h)===aH) continue;                    // одна ось — не крест
        if(a.x<b2.x+b2.w && b2.x<a.x+a.w && a.y<b2.y+b2.h && b2.y<a.y+a.h) kill.add(b2); } }
    if(kill.size) cov=cov.filter(c=>!kill.has(c));
    stat.cross=kill.size; }
  /* коробка не должна стоять там, где мы только что поставили стену */
  cov=cov.filter(c=>{ let free=0,tot=0;
    for(let oy=0;oy<c.h;oy++)for(let ox=0;ox<c.w;ox++){ const x=c.x+ox,y=c.y+oy;
      tot++; if(inb(x,y)&&gf[ix(x,y)]) free++; }
    return tot&&free/tot>0.6; });
  /* v120. Предмет места главнее россыпи: ящик, налезший на колонну или на навес,
     стирает силуэт — а силуэт и есть весь смысл лендмарка. Снимаем ящики с его
     следа плюс клетка вокруг, чтобы предмет читался отдельно стоящим. */
  if(LMKS.length){ const lz=new Uint8Array(N);
    for(const L of LMKS) for(let oy=-1;oy<=L.h;oy++)for(let ox=-1;ox<=L.w;ox++){
      const x=L.x+ox, y=L.y+oy; if(inb(x,y)) lz[ix(x,y)]=1; }
    const before=cov.length;
    cov=cov.filter(c=>{ for(let oy=0;oy<c.h;oy++)for(let ox=0;ox<c.w;ox++){
        const x=c.x+ox, y=c.y+oy; if(inb(x,y)&&lz[ix(x,y)]) return false; }
      return true; });
    stat.lmClr=before-cov.length; }

  /* px: и координата, и ГАБАРИТ комнаты в клетках. Не масштабировать room — значит
     отдать экспорту комнату вшестеро мельче: палубы, рампы и перила схлопываются. */
  if(DET.voidfill) emptyFill();      // ящики в пустые залы — после пересчёта укрытий в юниты

  /* v116. УКРЫТИЕ НЕ ИМЕЕТ ПРАВА ЗАКРЫТЬ ПРОХОД.
     Раньше проёмы чистились от укрытий на КРУПНОМ растре (clearDoorways, §5.6), но
     слой деталей потом режет новые проёмы и ставит новые ящики — и никто уже не
     проверяет, что после них можно пройти. Отсюда перегородки поперёк прохода.
     Проверка простая и честная: заливка по полу БЕЗ тел и заливка по полу С телами,
     причём вторая — с эрозией на клетку, чтобы щель в одну клетку не считалась
     проходом. Всё, что потерялось, отдаётся обратно: тела на границе потери снимаются,
     пока карта не станет проходимой. */
  if(DET.cover){
    /* v120. Лендмарки входят в проверку наравне с ящиками, но кандидатами на снятие
       не становятся: предмет — смысл места, а ящик рядом с ним заменим. Если пробку
       делает сам предмет, снимется его сосед; если и это не помогло, предмет уедет
       позже (ниже по коду), а не молча запечатает проход. */
    const lmBlock=(m)=>{ for(const L of LMKS){ const V=LMBY[L.k];
        if(V&&V.solid==='posts'){                       // навес: мешают только стойки
          for(const [ox,oy] of [[0,0],[L.w-1,0],[0,L.h-1],[L.w-1,L.h-1]]){
            for(let a=0;a<2;a++)for(let b2=0;b2<2;b2++){
              const x=L.x+ox+(ox?-a:a), y=L.y+oy+(oy?-b2:b2);
              if(inb(x,y)) m[ix(x,y)]=0; } }
          continue; }
        for(let oy=0;oy<L.h;oy++)for(let ox=0;ox<L.w;ox++){
          const x=L.x+ox, y=L.y+oy; if(inb(x,y)) m[ix(x,y)]=0; } }
      return m; };
    const blockOf=(list)=>{ const m=new Uint8Array(N);
      for(let i=0;i<N;i++) m[i]=gf[i];
      for(const c of list){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=40) continue;
        for(let oy=0;oy<c.h;oy++)for(let ox=0;ox<c.w;ox++){
          const x=c.x+ox, y=c.y+oy; if(inb(x,y)) m[ix(x,y)]=0; } }
      return lmBlock(m); };
    /* v117. Было: эрозия на клетку, то есть проход считался проходимым, только если
       вокруг свободен квадрат 3x3 — 48 юнитов во все стороны. Игрок в CS шириной
       32u, то есть ДВЕ наши клетки, и коридор в три клетки он проходит спокойно.
       Из-за перестраховки проверка объявляла пробкой любое тело в узком месте
       и выбрасывала по 76 укрытий из ста. Теперь модель честная: положение игрока
       допустимо, если свободен квадрат 2x2. */
    const erode1=(m)=>{ const o=new Uint8Array(N);
      for(let y=0;y<Hf-1;y++)for(let x=0;x<Wf-1;x++){ const i=ix(x,y);
        if(m[i]&&m[i+1]&&m[i+Wf]&&m[i+Wf+1]) o[i]=1; }
      return o; };
    /* ============ v136. РАЗЛИВ СЧИТАЕТ ВЫСОТУ ============
       Здесь была дыра, через которую уходила почти вся разница между растром и
       игрой. Разлив ходил по клеткам БЕЗ ОГЛЯДКИ НА ВЫСОТУ: ящик признавался
       пробкой, только если после него до места нельзя дойти ВООБЩЕ, хоть через
       обрыв в двести юнитов. Ящик, закрывший единственный пологий вход, честно
       проходил проверку — обход-то «есть», просто по нему не подняться.
       Замер (tools/oba.py, растр и печать одной меркой, сид 3551506459):
         с телами   3254 клетки проходимы в растре и непроходимы в печати (9.4%),
                    крупнейшее пятно 1421 клетка — плент A целиком;
         без тел    15 клеток (0.0%).
       То есть тела давали 99.5% всего расхождения, а чистка их не видела.
       Теперь разлив — та же модель, что у приёмки: блок 2x2, отметка = максимум
       по блоку, подъём не выше ПРЫЖОК, спуск свободный. */
    const ПРЫЖОК=59/72;                    // 59 юнитов: шаг 18u плюс прыжок
    const zБл=i=>Math.max(zff[i],zff[i+1],zff[i+Wf],zff[i+Wf+1]);
    const flood=(m)=>{ const v=new Uint8Array(N), st=[];
      let s0=-1;
      for(let r=0;r<=3&&s0<0;r++)
        for(let oy=-r*K;oy<=(r+1)*K-1&&s0<0;oy++)for(let ox=-r*K;ox<=(r+1)*K-1&&s0<0;ox++){
          const x=src.px.T.x*K+ox, y=src.px.T.y*K+oy;
          if(inb(x,y)&&m[ix(x,y)]) s0=ix(x,y); }
      if(s0<0) return v;
      v[s0]=1; st.push(s0);
      while(st.length){ const j=st.pop(), x=j%Wf, y=(j/Wf)|0, zj=zБл(j);
        for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(!m[k2]||v[k2]) continue;
          if(zБл(k2)-zj>ПРЫЖОК) continue;
          v[k2]=1; st.push(k2); } }
      return v; };
    /* ============ v120. ЧТО ЗНАЧИТ «УКРЫТИЕ ЗАКРЫЛО ПРОХОД» ============
       Здесь была подмена, из-за которой чистка снимала по 60 тел из 120.
       Потерянной считалась любая клетка, достижимая ДО расстановки и недостижимая
       ПОСЛЕ. Но клетка, на которой ящик стоит, недостижима по определению — она
       занята. То есть каждое тело «теряло» само себя плюс кайму, где перестал
       помещаться квадрат 2x2. В список потерь попадали ВСЕ тела, снятие одного
       чужую кайму не возвращало, и цикл выносил подряд всё, до чего дотягивался.
       Это мерило площади пола, а не проходимости.
       Правильно: клетка потеряна, если она ОСТАЛАСЬ годной позицией игрока
       (в эродированной маске С телами) и при этом до неё больше не дойти.
       След тела и кайма из эродированной маски выпадают сами и в счёт не идут. */
    const eBase=erode1(gf);
    const base=flood(eBase);
    let removed=0;
    for(let pass=0; pass<4; pass++){
      const eCov=erode1(blockOf(cov));
      const withCov=flood(eCov);
      const lost=[];
      for(let i=0;i<N;i++) if(eCov[i]&&base[i]&&!withCov[i]) lost.push(i);
      if(!lost.length) break;
      const lostSet=new Uint8Array(N); for(const i of lost) lostSet[i]=1;
      /* v116.1. Снимать разом всё, что касается потерянной области, — слишком грубо:
         на трёх картах так выбрасывалось 60..86 тел при 56 оставшихся, то есть больше
         половины расстановки. Виновата обычно ОДНА пробка, а рядом стоят невиновные.
         Поэтому кандидаты сортируются по площади пятна и снимаются ПО ОДНОМУ,
         с перепроверкой после каждого: как только проход открылся, остальные остаются. */
      const cand=[];
      for(const c of cov){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=40) continue;
        let touches=false;
        for(let oy=-1;oy<=c.h&&!touches;oy++)for(let ox=-1;ox<=c.w&&!touches;ox++){
          const x=c.x+ox, y=c.y+oy; if(inb(x,y)&&lostSet[ix(x,y)]) touches=true; }
        if(touches) cand.push(c); }
      if(!cand.length) break;
      cand.sort((a,b)=>(b.w*b.h)-(a.w*a.h));
      let opened=false;
      for(const c of cand){
        const idx=cov.indexOf(c); if(idx<0) continue;
        cov.splice(idx,1); removed++;
        const eChk=erode1(blockOf(cov)), chk=flood(eChk);
        let still=0; for(const i of lost) if(eChk[i]&&!chk[i]){ still=1; break; }
        if(!still){ opened=true; break; }
      }
      if(!opened && !cand.length) break;
    }
    stat.probka=removed;
    /* ============ v139. ЩЕЛЬ МЕЖДУ ТЕЛОМ И СТЕНОЙ — ОТКРЫТЫЙ ВОПРОС ============
       Контрфакт по присланной карте однозначен. Маршрутов, где самое узкое место
       уже 128 юнитов:
         с телами   33 из 83 (из них 12 уже 96u, худший 32u);
         без тел     0 из 83.
       Щели делают ТЕЛА, целиком. Стены сами по себе ни одного горла уже 128u не
       создают — лесенка контура тут ни при чём, это была моя неверная версия.
       Чистка укрытий проверяет СВЯЗНОСТЬ («после тела до места не дойти») и с
       v139 высоту, но ширину оставшегося прохода не проверяет никто.
       ПЕРВАЯ ПОПЫТКА ПРАВКИ ОТКАЧЕНА. Идея была: тело, оставившее щель шире нуля
       и уже 96u, придвигается вплотную к стене — укрытие сохраняется, щель
       исчезает. На замере вышло ХУЖЕ: медиана горла 128u -> 64..96u, маршрутов
       через щель 7 -> 7..57. Маска свободного пола бралась один раз до цикла, и
       каждое следующее тело мерилось по устаревшим позициям; придвинутые тела
       налезали друг на друга и рождали новые щели уже там.
       Правильно, видимо, не двигать по одному, а решать расстановку целиком с
       ограничением на минимальный зазор. Не сделано. */
    /* Ящики кончились, а проход всё ещё закрыт — значит виноват сам предмет.
       Тогда уезжает он: место останется без силуэта, но проходимость важнее. */
    { let cut=0;
      for(let pass=0; pass<3 && LMKS.length; pass++){
        const eAll=erode1(blockOf(cov)), withAll=flood(eAll);
        const lost=[]; for(let i=0;i<N;i++) if(eAll[i]&&base[i]&&!withAll[i]) lost.push(i);
        if(!lost.length) break;
        const lostSet=new Uint8Array(N); for(const i of lost) lostSet[i]=1;
        let hit=-1;
        for(let n=0;n<LMKS.length&&hit<0;n++){ const L=LMKS[n];
          for(let oy=-1;oy<=L.h&&hit<0;oy++)for(let ox=-1;ox<=L.w;ox++){
            const x=L.x+ox, y=L.y+oy; if(inb(x,y)&&lostSet[ix(x,y)]){ hit=n; break; } } }
        if(hit<0) break;
        LMKS.splice(hit,1); cut++; }
      stat.lmCut=cut; }

    /* ============ v125. КОНТРОЛЬНЫЙ ПРОХОД ПО ФАКТУ ============
       Замер по готовому .vmf (tools/blocked.js) показал: собственная проверка выше
       рапортует ноль потерь, а в файле от спавна T отрезано до пятисот клеток пола,
       и на каждой третьей карте недостижим мид. Виновник каждый раз конкретный —
       длинная тонкая перегородка-укрытие, которую цикл выше почему-то не увидел.
       Разбираться, на каком проходе он её потерял, дороже, чем проверить заново:
       здесь ещё раз, начисто, считается достижимость со всеми телами разом, и
       всё, что режет, снимается по одному, пока не перестанет.
       Дублирование намеренное: цикл выше оптимизирует (снимает минимум тел),
       этот — гарантирует. Стоит один проход заливки на тело-кандидат. */
    { const eB=erode1(gf), vB=flood(eB);
      /* След тела раздувается на клетку во все стороны. Замер по .vmf показывал
         потери там, где модель их не видела: модель и файл расходятся на границе
         тела (поворот, подрезка вычитанием, округление координат). Раздутый след
         делает проверку заведомо строже реальности — если она говорит «чисто»,
         в файле тем более чисто. Цена — иногда снимем лишнее тело. */
      const blockOf2=(list)=>{ const m=blockOf(list), o=new Uint8Array(N);
        for(let i=0;i<N;i++) o[i]=m[i];
        for(let y=1;y<Hf-1;y++)for(let x=1;x<Wf-1;x++){ const i=ix(x,y); if(!m[i]) continue;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(inb(nx,ny)) o[ix(nx,ny)]=0; } }
        return o; };
      let снято=0;
      for(let pass=0; pass<6; pass++){
        const mAll=blockOf2(cov), eA=erode1(mAll), vA=flood(eA);
        const lost=[];
        for(let i=0;i<N;i++) if(eA[i]&&vB[i]&&!vA[i]) lost.push(i);
        if(!lost.length) break;
        const ls=new Uint8Array(N); for(const i of lost) ls[i]=1;
        /* кандидат — тело, касающееся потерянной области; берём самое крупное */
        let best=-1, bestA=-1;
        for(let n=0;n<cov.length;n++){ const c=cov[n];
          const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=40) continue;
          let touch=false;
          for(let oy=-1;oy<=c.h&&!touch;oy++)for(let ox=-1;ox<=c.w;ox++){
            const x=c.x+ox, y=c.y+oy; if(inb(x,y)&&ls[ix(x,y)]){ touch=true; break; } }
          if(touch){ const a=c.w*c.h; if(a>bestA){ bestA=a; best=n; } } }
        if(best<0) break;
        cov.splice(best,1); снято++; }
      stat.probka2=снято; }
  }

  const px={}; for(const k in src.px){ const s=src.px[k];
    px[k]=Object.assign({},s,{ x:Math.min(Wf-2,s.x*K+((K/2)|0)), y:Math.min(Hf-2,s.y*K+((K/2)|0)),
      room: s.room ? [s.room[0]*K, s.room[1]*K] : s.room }); }

  /* план структур поднимается как есть: тоннели/здания — маски и рамки в клетках */
  let plan=null;
  if(src.plan){ const tun=new Uint8Array(N);
    if(src.plan.tun) for(let y=0;y<Hf;y++){ const cy=(y/K)|0;
      for(let x=0;x<Wf;x++) if(src.plan.tun[cy*sW+((x/K)|0)]) tun[ix(x,y)]=1; }
    /* компоненты тоннелей пересобираются на мелком растре: от них зависят и крыша,
       и свет под ней. Пустой список означал бы карту без тоннелей и без ламп в них. */
    const tunComps=[], seenT=new Uint8Array(N);
    for(let i=0;i<N;i++){ if(!tun[i]||seenT[i]) continue;
      const comp=[], st=[i]; seenT[i]=1;
      while(st.length){ const j=st.pop(); comp.push(j); const x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(tun[k2]&&!seenT[k2]){ seenT[k2]=1; st.push(k2); } } }
      tunComps.push(comp); }
    plan={ tun, tunComps, builds:(src.plan.builds||[]).map(b=>Object.assign({},b,
      {x0:b.x0*K,y0:b.y0*K,x1:b.x1*K,y1:b.y1*K})),
      doors:(src.plan.doors||[]).map(d=>Object.assign({},d,{x:d.x*K,y:d.y*K,w:(d.w||1)*K})) };
  }

  /* маски-спутники растра поднимаются вместе с ним. Без них экспорт молча теряет
     лестницы, ямы, залы и террасы — ровно те двенадцать масок, которые несут то,
     что растр выбросил (METOD §3.1). */
  const up=m=>{ if(!m||m.length!==sW*sH) return m;
    const o=new (m.constructor)(N);
    for(let y=0;y<Hf;y++){ const cy=(y/K)|0; for(let x=0;x<Wf;x++) o[ix(x,y)]=m[cy*sW+((x/K)|0)]; }
    return o; };
  const rc=r=>Object.assign({},r,{x0:r.x0*K,y0:r.y0*K,x1:r.x1*K+K-1,y1:r.y1*K+K-1});
  /* v114. СТУПЕНИ НА ОБРЫВАХ. Проверка прыжком (ниже) находила отрезанные ногами куски:
     обрыв выше 64u, залезть нельзя, а сторож связности этого не видел, потому что
     ходит по полу без оглядки на высоту. Раньше такие места спасала угловая лесенка,
     но её пришлось выключить на мелкой клетке (v105).
     Лечим не геометрией поверх, а самим полем высот: клетка на той стороне обрыва,
     до которой не допрыгнуть, опускается до «сосед плюс прыжок». За несколько
     проходов обрыв превращается в лестницу, и она сама попадает и в растр, и в замер,
     и в экспорт — отдельных брашей не нужно. */
  if(DET.stepfix){
    const JUMP=64/72, D8c=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let pass=0; pass<6; pass++){
      const v=new Uint8Array(N), st=[];
      const s0=anyFloor(src.px.T,2); if(s0<0) break;
      v[s0]=1; st.push(s0);
      while(st.length){ const j=st.pop(), x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D8c){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(!gf[k2]||v[k2]) continue;
          if(zff[k2]-zff[j] > JUMP) continue;
          v[k2]=1; st.push(k2); } }
      let fixed=0;
      for(let y=0;y<Hf;y++)for(let x=0;x<Wf;x++){
        const i2=ix(x,y); if(!gf[i2]||v[i2]) continue;
        if(ЗАМОК[i2]){ stat.замокСтоп=(stat.замокСтоп||0)+1; continue; }  // v136: плато печатается плоским
        let best=-1e9;
        for(const [dx,dy] of D8c){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(gf[k2]&&v[k2]&&zff[k2]>best) best=zff[k2]; }
        if(best<-1e8) continue;                       // рядом нет достижимого — не обрыв, а остров
        if(zff[i2]-best>JUMP){ zff[i2]=best+JUMP*0.95; fixed++; }
      }
      stat.steps=(stat.steps||0)+fixed;
      if(!fixed) break;
    }
  }

  /* ============ v121. СТЕНА ТОНЬШЕ 32u — ЭТО ЛЕЗВИЕ ============
     Прямой ответ на «узкие торчащие стены»: да, это следствие сетки. Там, где
     план оставил между двумя полами зазор ровно в одну клетку, в экспорт уходит
     перегородка 16 юнитов толщиной и метра три высотой. У реальных карт медиана
     толщины перегородки 80u, шестнадцать не бывает нигде.
     Замер по готовому .vmf: из 943 узких высоких брашей 796 — стены.
     Лечится в растре, а не в экспорте: клетка пола, у которой стена с одной
     стороны толщиной в одну клетку, отдаётся стене. Под охраной связности —
     если от этого что-то отваливается, правка откатывается. */
  if(DET.thickwall){
    let толщ=0, отказ=0;
    for(let pass=0; pass<2; pass++){
      const тонкие=[];
      for(let y=1;y<Hf-1;y++)for(let x=1;x<Wf-1;x++){ const i=ix(x,y); if(gf[i]) continue;
        /* стена в одну клетку по X: пол слева и справа */
        if(gf[ix(x-1,y)]&&gf[ix(x+1,y)]) тонкие.push([i,1,0]);
        else if(gf[ix(x,y-1)]&&gf[ix(x,y+1)]) тонкие.push([i,0,1]); }
      if(!тонкие.length) break;
      let было=толщ;
      for(const [i,dx,dy] of тонкие){
        const x=i%Wf, y=(i/Wf)|0;
        if(gf[i]) continue;                                  // уже утолщена соседом
        /* забираем ту сторону, где пол шире: узкий проход не должен исчезнуть */
        const рядом=(sx,sy)=>{ let n=0,cx=x+sx,cy=y+sy;
          while(n<6&&inb(cx,cy)&&gf[ix(cx,cy)]){ n++; cx+=sx; cy+=sy; } return n; };
        const a=рядом(dx,dy), b2=рядом(-dx,-dy);
        if(Math.max(a,b2)<3) continue;                       // с обеих сторон тесно — не трогаем
        const sx=(a>=b2)?dx:-dx, sy=(a>=b2)?dy:-dy;
        const j=ix(x+sx,y+sy);
        if(!inb(x+sx,y+sy)||!gf[j]) continue;
        if(guarded([j])) толщ++; else отказ++;
      }
      if(толщ===было) break;
    }
    stat.thick=толщ; stat.thickNo=отказ;
  }

  /* ============ v120. ПОЛ, ДО КОТОРОГО НЕ ДОЙТИ, — НЕ ПОЛ ============
     Это и есть «пустая тупиковая комната, куда нельзя залезть» со скриншотов.
     Берётся она не из планировщика: сужения и зонные стены иногда отрезают карман,
     а сторож связности этого не запрещает — он следит только за тем, чтобы не стало
     ХУЖЕ по ключевым узлам, и терять боковой карман ему разрешено. Ступенчатая
     правка обрывов (stepfix) чинит только то, до чего есть сосед; отрезанный
     стеной кусок она не видит.
     Раньше такой кусок всё равно уезжал в экспорт: пол, стены, свет, укрытия —
     полноценная комната, в которую нельзя войти. Теперь он просто перестаёт быть
     полом. Стены сомкнутся сами, потому что стена — это отсутствие пола. */
  if(DET.cutdead){
    const JUMP=64/72, D8c=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const v=new Uint8Array(N), st=[];
    const s0=anyFloor(src.px.T,2);
    if(s0>=0){ v[s0]=1; st.push(s0);
      while(st.length){ const j=st.pop(), x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D8c){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(!gf[k2]||v[k2]) continue;
          if(zff[k2]-zff[j] > JUMP) continue;
          v[k2]=1; st.push(k2); } }
      let cut=0;
      for(let i=0;i<N;i++) if(gf[i]&&!v[i]){ gf[i]=0; cut++; }
      if(cut){
        /* тела и предметы, оставшиеся на срезанном полу, уходят вместе с ним */
        const alive=c=>{ for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
            const x=c.x+ox, y=c.y+oy; if(inb(x,y)&&gf[ix(x,y)]) return true; }
          return false; };
        const c0=cov.length, l0=LMKS.length;
        cov=cov.filter(alive);
        for(let n=LMKS.length-1;n>=0;n--) if(!alive(LMKS[n])) LMKS.splice(n,1);
        stat.cutCov=(c0-cov.length)+(l0-LMKS.length);
      }
      stat.cutDead=Math.round(cut*16*16/1000);            // срезано, k u²
    }
  }

  /* v113. ПРОВЕРКА ПРОХОДИМОСТИ ПО-ИГРОЦКИ. Сторож связности ходит по полу без оглядки
     на высоту, а игрок не запрыгнет выше 64u. После того как на мелкой клетке была
     выключена угловая лесенка (v105), обрывы выше прыжка остались вообще без ступеней,
     и часть карты могла стать недостижимой ногами при формально «связном» растре.
     Здесь заливка с правилом прыжка: подъём не выше JUMP, спуск не ограничен. */
  { const JUMP=64/72, D8b=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const v=new Uint8Array(N), st=[];
    const s0=anyFloor(src.px.T,2);
    if(s0>=0){ v[s0]=1; st.push(s0);
      while(st.length){ const j=st.pop(), x=j%Wf, y=(j/Wf)|0;
        for(const [dx,dy] of D8b){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const k2=ix(nx,ny); if(!gf[k2]||v[k2]) continue;
          if(zff[k2]-zff[j] > JUMP) continue;            // выше прыжка — не залезть
          v[k2]=1; st.push(k2); } } }
    /* v114. Узел считается потерянным, только если рядом с ним ЕСТЬ пол и он весь
       недостижим. Раньше в список попадал узел, у которого пола рядом нет вовсе —
       центр мида нередко приходится на стену или на плато, — и проверка кричала
       «недостижимо M» при нуле отрезанного пола. Ложная тревога хуже отсутствия
       проверки: на неё перестают смотреть. */
    const hasFloorNear=(pnt)=>{ if(!pnt) return false;
      for(let oy=-K;oy<2*K;oy++)for(let ox=-K;ox<2*K;ox++){
        const x=pnt.x*K+ox, y=pnt.y*K+oy; if(!inb(x,y)) continue;
        if(gf[ix(x,y)]) return true; }
      return false; };
    const lost=[];
    for(const kk of ['A','B','CT','M']){ const pnt=src.px[kk];
      if(hasFloorNear(pnt) && !seesNode(v,pnt)) lost.push(kk); }
    let cnt=0; for(let i=0;i<N;i++) if(gf[i]&&!v[i]) cnt++;
    stat.noJump=lost.join(',')||'—';
    stat.otrezano=Math.round(cnt*16*16/1000);            // отрезанный пол, k u²
  }

  /* ============ v139. ВИДНО РЯДОМ — ИДТИ ДАЛЕКО ============
     Человек двадцать раз показывал пальцем «тут должен быть проход», и все мои
     мерки говорили, что всё в порядке: ширина в норме, связность есть, крюк
     между каллаутами мал. Мерки были не про то. Он тыкал туда, где ДВА КУСКА
     ПОЛА ЛЕЖАТ В ЧЕТЫРЁХ КЛЕТКАХ ДРУГ ОТ ДРУГА, А ПЕШКОМ МЕЖДУ НИМИ ПОЛКАРТЫ.
     Глаз видит продолжение, ноги упираются в перегородку. Проверено на его
     шести метках (карта 86890799): пять из шести попали в пятно этой мерки,
     четыре точно в ноль, и всего таких пятен на карте оказалось восемь — то
     есть мерка не красит полкарты, а показывает ровно то, на что он тыкал.

     ПОЧЕМУ ОНО ВОЗНИКАЕТ. Генератор решает, ЧТО с чем соединено, раньше, чем
     решает, ГДЕ что стоит: makeEdges() возвращает жёсткий список из 18 коридоров
     между 13 комнатами, и список этот не менялся с первого коммита. Дальше
     раскладка ставит комнаты, куда велит сид, и придаёт им случайную форму. Две
     комнаты, которых нет в списке, спокойно оказываются в 16 юнитах друг от
     друга — и никто никогда не возвращается сверить решение о связности с
     получившейся геометрией. Отсюда перегородка в одну клетку, по обе стороны
     пол, а в обход 400..700 юнитов.

     ЧТО ЗДЕСЬ ДЕЛАЕТСЯ. Недостающая сверка. Не косая просека через полкарты
     (это старая пробивка ниже, она выключена и за неё уже досталось), а ДВЕРЬ:
     находим самое тонкое ОСЕВОЕ место перегородки и прорубаем проём 112u
     поперёк неё. Перепад берёт на себя сама перемычка: клетки проёма получают
     промежуточную отметку, так что ни один шаг не выше 48u. Правка идёт в РАСТР
     до слоя деталей, поэтому дейкстра, тайминги и баланс видят новую дверь
     (правило 5). Не помогло — откат. */
  if(DET.сшивка){
    const UPZ=59/72, ШАГZ=48/72;
    const БЛИЗКО=4;          // клеток по прямой: 64u. Дальше — это уже не «видно рядом»
    const ПРЕДЕЛ=20;         // шагов пешком: 320u. Дальше — обход, который человек и заметил
    const ШИР=3;             // полуширина проёма: 7 клеток = 112u, как ПРОСВЕТ у косяков
    const ТОЛЩ=6;            // толще 96u — это уже здание, дверь в нём не наша забота
    const СВЕРОК=16;         // сколько раз пересобирать список пар
    const узел=new Uint8Array(N), zу=new Float32Array(N);
    const пересчёт=()=>{ узел.fill(0);
      for(let y=0;y<Hf-1;y++)for(let x=0;x<Wf-1;x++){
        const a=y*Wf+x; if(!gf[a]||!gf[a+1]||!gf[a+Wf]||!gf[a+Wf+1]) continue;
        узел[a]=1; zу[a]=Math.max(zff[a],zff[a+1],zff[a+Wf],zff[a+Wf+1]); } };
    /* здания трогать нельзя: там своя геометрия */
    const занято=new Uint8Array(N);
    if(src.plan&&src.plan.builds) for(const b of src.plan.builds)
      for(let y=b.y0*K;y<b.y1*K;y++)for(let x=b.x0*K;x<b.x1*K;x++)
        if(inb(x,y)) занято[ix(x,y)]=1;
    const _st=new Int32Array(N), _d=new Int32Array(N), _q=new Int32Array(N);
    let _эп=0;
    /* волна, обрезанная по ПРЕДЕЛ шагов: клеймо эпохи вместо чистки массива */
    const близко=(старт)=>{ _эп++; let h=0,t=0;
      _st[старт]=_эп; _d[старт]=0; _q[t++]=старт;
      while(h<t){ const j=_q[h++]; if(_d[j]>=ПРЕДЕЛ) continue;
        const x=j%Wf, y=(j/Wf)|0, nd=_d[j]+1;
        for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy;
          if(nx<0||ny<0||nx>=Wf-1||ny>=Hf-1) continue;
          const k=ny*Wf+nx; if(!узел[k]||_st[k]===_эп) continue;
          if(zу[k]-zу[j]>UPZ) continue;
          _st[k]=_эп; _d[k]=nd; _q[t++]=k; } } };
    const смещ=[];
    for(let dy=-БЛИЗКО;dy<=БЛИЗКО;dy++)for(let dx=-БЛИЗКО;dx<=БЛИЗКО;dx++){
      const m=Math.max(Math.abs(dx),Math.abs(dy));
      if(m<2||m>БЛИЗКО) continue;
      /* Смещения берутся ВСЕ, а не половина. Волна направленная: вниз с уступа
         игрок спрыгивает даром, наверх не залезет. У обрыва «сверху вниз» —
         один шаг, «снизу вверх» — полкарты, и если проверить только ту сторону,
         которая ближе по номеру клетки, половина обрывов не найдётся. */
      смещ.push([dx,dy]); }
    /* между точками обязан быть камень, иначе это просто открытое место */
    const перекрыто=(ax,ay,bx,by)=>{ const n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
      for(let k=1;k<n;k++){ const x=ax+Math.round((bx-ax)*k/n), y=ay+Math.round((by-ay)*k/n);
        if(!узел[y*Wf+x]) return true; }
      return false; };
    const парыПлохие=()=>{
      const из=[];
      for(let y=1;y<Hf-2;y++)for(let x=1;x<Wf-2;x++){
        const j=y*Wf+x; if(!узел[j]) continue;
        /* только кромка: у клетки в глубине зала камня рядом нет по определению */
        let кромка=false;
        for(const [dx,dy] of D8){ if(!узел[(y+dy)*Wf+(x+dx)]){ кромка=true; break; } }
        if(!кромка) continue;
        let цели=null;
        for(const [dx,dy] of смещ){ const nx=x+dx, ny=y+dy;
          if(nx<1||ny<1||nx>=Wf-2||ny>=Hf-2) continue;
          const k=ny*Wf+nx; if(!узел[k]) continue;
          if(!перекрыто(x,y,nx,ny)) continue;
          (цели||(цели=[])).push(k); }
        if(цели) из.push([j,цели]); }
      const плохо=[], видано=new Set();
      for(const [j,цели] of из){ близко(j);
        for(const k of цели){ if(_st[k]===_эп) continue;
          const ключ=(j<k)?(j*N+k):(k*N+j);              // пара одна, направлений два
          if(видано.has(ключ)) continue; видано.add(ключ);
          плохо.push([j,k]); } }
      return плохо; };
    /* Пятно = кучка плохих пар вокруг одного куска перегородки. Разводим по
       средней точке, слипание 3 клетки. */
    const впятна=(плохо)=>{
      const вес=new Map(), пары=new Map();
      for(const [a,b] of плохо){
        const c=((((a/Wf)|0)+((b/Wf)|0))>>1)*Wf + (((a%Wf)+(b%Wf))>>1);
        вес.set(c,(вес.get(c)||0)+1);
        (пары.get(c)||пары.set(c,[]).get(c)).push([a,b]); }
      const ост=new Set(вес.keys()), кл=[];
      while(ост.size){ const s=ост.values().next().value; ост.delete(s);
        const ст=[s], гр=[s];
        while(ст.length){ const p=ст.pop(), px=p%Wf, py=(p/Wf)|0;
          for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
            const q=(py+dy)*Wf+(px+dx);
            if(ост.has(q)){ ост.delete(q); ст.push(q); гр.push(q); } } }
        const сп=[]; for(const p of гр) for(const пр of (пары.get(p)||[])) сп.push(пр);
        кл.push({вес:гр.reduce((s2,p)=>s2+вес.get(p),0), гр, пары:сп}); }
      кл.sort((a,b)=>b.вес-a.вес);
      return кл; };
    /* Самое тонкое ОСЕВОЕ пересечение перегородки в окрестности пятна.
       Осевое — потому что дверь должна стоять поперёк стены, а не наискось:
       косая просека уже была и человек назвал её костылём. */
    const проём=(гр)=>{
      let луч=null;
      const видели=new Set();
      for(const c of гр){ const cx=c%Wf, cy=(c/Wf)|0;
        for(let oy=-3;oy<=3;oy++)for(let ox=-3;ox<=3;ox++){
          const x=cx+ox, y=cy+oy, j=y*Wf+x;
          if(x<2||y<2||x>=Wf-3||y>=Hf-3||узел[j]||видели.has(j)) continue;
          видели.add(j);
          for(const [dx,dy] of [[1,0],[0,1]]){
            /* прогон камня, содержащий эту клетку, вдоль оси */
            let s=0; while(s<ТОЛЩ && !узел[(y-(s+1)*dy)*Wf+(x-(s+1)*dx)]) s++;
            let e=0; while(e<ТОЛЩ && !узел[(y+(e+1)*dy)*Wf+(x+(e+1)*dx)]) e++;
            const t=s+e+1; if(t>ТОЛЩ) continue;
            const p0=(y-(s+1)*dy)*Wf+(x-(s+1)*dx), p1=(y+(e+1)*dy)*Wf+(x+(e+1)*dx);
            if(!узел[p0]||!узел[p1]) continue;
            const пер=Math.abs(zу[p1]-zу[p0]);
            if(пер/(t+1)>ШАГZ) continue;                  // такой ступени не взять
            const цена=t*100+пер;
            if(!луч||цена<луч.цена)
              луч={цена,t,dx,dy,x:x-s*dx,y:y-s*dy,p0,p1}; } } }
      return луч; };
    /* ЗАПАСНОЙ ВАРИАНТ: СРЕЗ УГЛА.
       Осевого прокола хватает не всегда. Остаток — не перегородка, а УГОЛ: две
       комнаты сходятся по диагонали, на луче зрения камня три клетки, а поперёк
       осей его 150..200 юнитов, и дверь такой длины была бы тоннелем. Замер на
       остатке: 144u по Y при перепаде 48u, 208u при 24u, 160u при 32u.
       Правильный ответ для угла — не тоннель, а срез: убрать сам угловой кусок.
       Режем ПРЯМОУГОЛЬНИК (габарит пары, максимум 5x5 клеток = 80u), потому что
       всё остальное в этой карте прямоугольное, а косая просека уже была и
       человек назвал её костылём. */
    const срезУгла=(пары)=>{
      if(!пары||!пары.length) return false;
      const л=пары.slice().sort((p,q)=>{
        const d1=Math.max(Math.abs(p[0]%Wf-p[1]%Wf), Math.abs(((p[0]/Wf)|0)-((p[1]/Wf)|0)));
        const d2=Math.max(Math.abs(q[0]%Wf-q[1]%Wf), Math.abs(((q[0]/Wf)|0)-((q[1]/Wf)|0)));
        return d1-d2; });
      for(const [a,b] of л.slice(0,6)){
        const ax=a%Wf, ay=(a/Wf)|0, bx=b%Wf, by=(b/Wf)|0;
        const шаг=Math.max(Math.abs(bx-ax), Math.abs(by-ay));
        const пер=Math.abs(zу[b]-zу[a]);
        if(пер/(шаг+1)>ШАГZ) continue;
        const x0=Math.min(ax,bx), x1=Math.max(ax,bx), y0=Math.min(ay,by), y1=Math.max(ay,by);
        if(x1-x0>4||y1-y0>4) continue;
        let занят=false, откат=[];
        for(let y=y0;y<=y1&&!занят;y++)for(let x=x0;x<=x1;x++){
          if(!inb(x,y)){ занят=true; break; }
          const j=ix(x,y);
          if(gf[j]) continue;
          if(занято[j]||ЗАМОК[j]){ занят=true; break; }
          /* отметка по расстоянию до дальнего конца: ступеньками, не обрывом */
          const t=(шаг?Math.max(Math.abs(x-ax),Math.abs(y-ay))/шаг:0);
          откат.push([j, zff[j], zу[a]+(zу[b]-zу[a])*Math.max(0,Math.min(1,t))]); }
        if(занят||!откат.length) continue;
        for(const [j,,z] of откат){ gf[j]=1; zff[j]=z; }
        пересчёт();
        близко(a);
        if(_st[b]===_эп) return true;
        for(const [j,z] of откат){ gf[j]=0; zff[j]=z; }
        пересчёт(); }
      return false; };
    пересчёт();
    let сшито=0, попыток=0, врётДо=0, пятенДо=0, врётПосле=0, пятенПосле=0;
    const почему={негде:0, занято:0, неПомог:0};
    for(let сверка=0; сверка<СВЕРОК; сверка++){
      const плохо=парыПлохие();
      const кл=впятна(плохо);
      if(!сверка){ врётДо=плохо.length; пятенДо=кл.length; }
      врётПосле=плохо.length; пятенПосле=кл.length;
      if(!плохо.length) break;
      let сдвинулось=false;
      for(const {гр, пары} of кл){
        const л=проём(гр);
        if(!л){ if(срезУгла(пары)){ сшито++; сдвинулось=true; } else почему.негде++; continue; }
        попыток++;
        const px=-л.dy, py=л.dx;                          // поперёк проёма
        const z0=zу[л.p0], z1=zу[л.p1];
        const откат=[];
        for(const знак of [0,1]) for(let o=(знак?1:0); o<=ШИР; o++){
          const oo=знак?-o:o;
          /* проём расширяем, пока по обе стороны перегородки на этом отступе
             действительно есть пол: иначе дверь ведёт в камень */
          const a0=л.p0+oo*(py*Wf+px), a1=л.p1+oo*(py*Wf+px);
          if(a0<0||a1<0||a0>=N||a1>=N||!gf[a0]||!gf[a1]) break;
          let можно=true;
          for(let k2=0;k2<л.t;k2++){
            const x=л.x+k2*л.dx+oo*px, y=л.y+k2*л.dy+oo*py;
            if(!inb(x,y)){ можно=false; break; }
            const j=ix(x,y);
            if(занято[j]||ЗАМОК[j]){ можно=false; break; } }
          if(!можно) break;
          for(let k2=0;k2<л.t;k2++){
            const j=ix(л.x+k2*л.dx+oo*px, л.y+k2*л.dy+oo*py);
            if(gf[j]) continue;
            откат.push([j,zff[j]]);
            gf[j]=1; zff[j]=z0+(z1-z0)*(k2+1)/(л.t+1); } }
        if(!откат.length){ почему.занято++; continue; }
        пересчёт();
        /* помогло ли: пара из этого пятна должна сойтись в предел */
        близко(л.p0);
        if(_st[л.p1]!==_эп){ почему.неПомог++;
          for(const [j,z] of откат){ gf[j]=0; zff[j]=z; } пересчёт(); continue; }
        сшито++; сдвинулось=true; }
      if(!сдвинулось) break; }
    stat.сшито=сшито; stat.сшивкаTry=попыток; stat.сшивкаПочему=почему;
    stat.врётДо=врётДо; stat.врётПятенДо=пятенДо;
    stat.врёт=врётПосле; stat.врётПятен=пятенПосле;
  }

  /* ============ v131. ПРОБИТЬ ПРОХОД МЕЖДУ СОСЕДНИМИ МЕСТАМИ ============
     Жалоба «опять забаррикадировал проход» повторялась четыре раза, и каждый раз
     я искал виновный браш. Виновного браша нет. Замер (tools/krjukgen.js) на трёх
     картах: крюк между соседними местами хуже x2 встречается 4..14 раз ЕЩЁ ДО
     слоя деталей, а слой деталей его даже слегка сокращает. Значит схему выдаёт
     крупный планировщик, и сторож тут бессилен по построению: он запрещает
     УХУДШАТЬ, а здесь плохо с самого начала.
     Поэтому не запрет, а действие. Берём худшую пару соседних мест и ПРОБИВАЕМ
     между ними коридор по прямой. Не помогло — откат.

     Почему именно «соседние места»: место — это то, во что игрок тычет пальцем и
     называет одним словом. Если два таких куска рядом, а идти между ними втрое
     дальше прямой, игрок читает это как забаррикадированный проход, чем оно и
     является. Пары дальше PR_БЛИЗКО не трогаем: разные концы карты и должны быть
     разнесены. */
  const PR_БЛИЗКО=Math.round(1800/16), PR_МИН=Math.round(200/16);
  const PR_ПЛОХО=2.0;                      // крюк, с которого начинаем пробивать
  const PR_МАКС=Math.round(512/16);        // самый длинный СПЛОШНОЙ завал, который считаем проходом,
                                           // а не зданием: 512u стены — это уже не дверь пробить
  const PR_ШИР=3;                          // полуширина коридора: 3 клетки в каждую сторону = 112u
  const PR_ПЕРЕПАД=1.5;                    // разница отметок в клетках высоты (108u): выше — не пробиваем
  const PR_ЛИМИТ=24;                       // сколько проходов пробиваем максимум
  /* v137. Пробивка ВЫКЛЮЧЕНА по умолчанию.
     Она чинила симптом: находила пару мест с крюком хуже x2 и прорубала между
     ними коридор по прямой. Косая просека посреди карты — это и есть те
     «диагональные костыли», на которые указал человек, и они делали хуже вдвойне:
     уродовали план и ПРЯТАЛИ настоящую причину. А причина в другом месте — разрез
     между мидом и плентом 80 юнитов, одна дверь (tools/dorogi.py). Пока планировщик
     не научится давать пленту несколько независимых заходов, пробивку держим
     выключенной: пусть дефект будет виден. Код и счётчики остаются. */
  {
    /* Модель узла. Игрок 32x32 накрывает блок 2x2 клеток по 16u и стоит на САМОЙ
       ВЫСОКОЙ опоре под собой. Требовать, чтобы весь блок был на одной отметке —
       ошибка: у уступа в 48u такого блока нет ни сверху, ни снизу, полоса клеток
       вдоль каждого уступа выпадает, и прибор объявляет обрывом то, куда игрок
       спокойно заходит шагом. Именно на этот фантом пробивка и охотилась: она
       прорубала коридор, а крюк не менялся ни на юнит, потому что мешал не завал,
       а мнимый обрыв. Отметка узла = максимум по блоку, ограничение только на
       ПОДЪЁМ между соседями. */
    const UPZ=59/72;
    const узел=new Uint8Array(N), zу=new Float32Array(N);
    const пересчёт=()=>{ узел.fill(0);
      for(let y=0;y<Hf-1;y++)for(let x=0;x<Wf-1;x++){
        const a=y*Wf+x, b=a+1, c=a+Wf, d=c+1;
        if(!gf[a]||!gf[b]||!gf[c]||!gf[d]) continue;
        узел[a]=1; zу[a]=Math.max(zff[a],zff[b],zff[c],zff[d]); } };
    const _pd=new Int32Array(N), _pq=new Int32Array(N);
    const волна=(старт)=>{ _pd.fill(-1); let h=0,t=0; _pd[старт]=0; _pq[t++]=старт;
      while(h<t){ const j=_pq[h++], x=j%Wf, y=(j/Wf)|0, nd=_pd[j]+1;
        for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy;
          if(nx<0||ny<0||nx>=Wf-1||ny>=Hf-1) continue;
          const k=ny*Wf+nx; if(!узел[k]||_pd[k]>=0) continue;
          if(zу[k]-zу[j]>UPZ) continue;                   // выше прыжка не залезть
          _pd[k]=nd; _pq[t++]=k; } }
      return _pd; };
    const ближУзел=(cx,cy,r)=>{ let best=-1,bd=1e9;
      for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
        const x=cx+dx, y=cy+dy; if(x<0||y<0||x>=Wf-1||y>=Hf-1) continue;
        const j=y*Wf+x; if(!узел[j]) continue;
        const q=dx*dx+dy*dy; if(q<bd){bd=q;best=j;} }
      return best; };
    /* здания трогать нельзя: там своя геометрия, коридор сквозь них бессмыслен */
    const занято=new Uint8Array(N);
    if(src.plan&&src.plan.builds) for(const b of src.plan.builds)
      for(let y=b.y0*K;y<b.y1*K;y++)for(let x=b.x0*K;x<b.x1*K;x++)
        if(inb(x,y)) занято[ix(x,y)]=1;

    пересчёт();
    let PL=computePlaces(gf,Wf,Hf,16);
    let пробито=0, попыток=0;
    const почему={далеко:0, здание:0, нечего:0, неПомог:0};
    for(let раунд=0; DET.проруб && раунд<PR_ЛИМИТ; раунд++){
      const L=PL.list; if(!L||L.length<2) break;
      const точки=L.map(p=>ближУзел(p.x,p.y,6));
      /* ищем худшую пару */
      let худ=null, парПросм=0, максK=0;
      for(let i=0;i<L.length;i++){
        if(точки[i]<0) continue;
        let d=null;
        for(let j=i+1;j<L.length;j++){
          if(точки[j]<0) continue;
          const пр=Math.hypot(L[i].x-L[j].x, L[i].y-L[j].y);
          if(пр>PR_БЛИЗКО||пр<PR_МИН) continue;
          if(Math.abs((zу[точки[i]]||0)-(zу[точки[j]]||0))>PR_ПЕРЕПАД) continue;
          if(!d) d=волна(точки[i]).slice();
          const dd=d[точки[j]];
          const k=(dd<0)?1e9:dd/пр;
          парПросм++; if(k<1e8&&k>максK) максK=k;
          if(k>PR_ПЛОХО && (!худ||k>худ.k)) худ={k, i, j, пр, a:точки[i], b:точки[j]};
        } }
      if(раунд===0){ stat.прорубПар=парПросм; stat.прорубМакс=+максK.toFixed(2);
                     stat.прорубМест=L.length; }
      if(!худ) break;
      попыток++;
      /* прорубаем коридор по прямой между узлами */
      const ax=худ.a%Wf, ay=(худ.a/Wf)|0, bx=худ.b%Wf, by=(худ.b/Wf)|0;
      const шагов=Math.max(Math.abs(bx-ax), Math.abs(by-ay));
      /* Мерить длину ВСЕГО отрезка неправильно: между местами 900 юнитов, а
         заперты из них 100 — это дверь, а не тоннель. Считаем самый длинный
         СПЛОШНОЙ завал по осевой линии; он и есть то, что придётся пробить. */
      { let завал=0, макс=0;
        for(let t=0;t<=шагов;t++){
          const cx=Math.round(ax+(bx-ax)*t/шагов), cy=Math.round(ay+(by-ay)*t/шагов);
          const j=(cy>=0&&cy<Hf&&cx>=0&&cx<Wf)?ix(cx,cy):-1;
          if(j<0||!gf[j]){ завал++; if(завал>макс) макс=завал; } else завал=0; }
        if(макс>PR_МАКС){ почему.далеко++; PL.list.splice(худ.j,1); continue; } }
      const za=zff[худ.a]||0, zb=zff[худ.b]||0;
      const откат=[];
      let врезались=false, закрыто=0;
      for(let t=0;t<=шагов && !врезались;t++){
        const cx=Math.round(ax+(bx-ax)*t/шагов), cy=Math.round(ay+(by-ay)*t/шагов);
        const zt=za+(zb-za)*t/шагов;
        for(let oy=-PR_ШИР;oy<=PR_ШИР;oy++)for(let ox=-PR_ШИР;ox<=PR_ШИР;ox++){
          const x=cx+ox, y=cy+oy;
          if(x<2||y<2||x>=Wf-2||y>=Hf-2) continue;
          const j=ix(x,y);
          if(занято[j]){ врезались=true; break; }
          /* v136: внутри плато высота продиктована печатью, коридор ложится по ней */
          if(!gf[j]){ откат.push([j,zff[j]]); gf[j]=1; закрыто++;
            if(ЗАМОК[j]){ zff[j]=ЗАМОКZ[j]; stat.замокСтоп=(stat.замокСтоп||0)+1; } else zff[j]=zt; }
        } }
      const вернуть=()=>{ for(const [j,z] of откат){ gf[j]=0; zff[j]=z; } пересчёт(); };
      if(врезались||!закрыто){ if(врезались) почему.здание++; else почему.нечего++;
        вернуть(); PL.list.splice(худ.j,1); continue; }
      пересчёт();
      const na=ближУзел(ax,ay,4), nb=ближУзел(bx,by,4);
      const d2=(na>=0)?волна(na):null;
      const стало=(d2&&nb>=0&&d2[nb]>=0)?d2[nb]/худ.пр:1e9;
      if(стало>=худ.k*0.85){ почему.неПомог++;
        let узлВКор=0; for(const [j] of откат) if(узел[j]) узлВКор++;
        stat.прорубПример='был x'+худ.k.toFixed(2)+' стал x'+(стало>1e8?'нет пути':стало.toFixed(2))
          +' | открыто '+откат.length+' клеток, из них узлами стали '+узлВКор
          +' | шагов '+шагов+' za='+za.toFixed(2)+' zb='+zb.toFixed(2)
          +' | na='+na+' nb='+nb;
        вернуть(); PL.list.splice(худ.j,1); continue; }  // не помогло
      пробито++;
      PL=computePlaces(gf,Wf,Hf,16);
    }
    stat.проруб=пробито; stat.прорубTry=попыток; stat.прорубПочему=почему;
    /* ============ v136.2. КРЮК ПОСЛЕ ПРОРУБA — ОДНОЙ МЕРКОЙ С ПРИЁМКОЙ ============
       Это единственное число о качестве плана, которое генератор знает про себя
       сам и получает даром; по нему решатель баланса выбирает карту из попыток.
       Первая редакция брала готовое максK из цикла пробивки — и промахнулась:
       тот скан ОТСЕИВАЕТ пары с разницей высот больше PR_ПЕРЕПАД, потому что
       такие пары пробивать нельзя. Для выбора цели это правильно, для оценки
       карты — нет: пара на разных ярусах и даёт самый большой крюк. Генератор
       показывал 1.3..1.9, приёмка на тех же картах 5..7.
       Здесь пары те же, что у приёмки: по прямой 200..1800u, без фильтра высот,
       «пути нет» считается как плохая пара. */
    /* Список мест берётся PLC_R — тот, что уходит в .vmf как env_cs_place, а не
       свежий computePlaces из самой пробивки. Разница не косметическая: PLC_R
       посчитан ДО ярусов и прорубa и с тех пор не пересчитывался, свежий — после.
       На одной карте свежий давал 2.03, PLC_R — 9.05, и приёмка по .vmf
       подтвердила 11.17 на той же паре. Мерить надо то, что видит игрок. */
    /* ============ v136.2. ЯКОРЬ МЕСТА СЧИТАЕТСЯ ЗДЕСЬ И ОДИН РАЗ ============
       Точка, которой место представлено в замерах, обязана быть той же, что
       уходит в .vmf как origin у env_cs_place. Иначе генератор меряет пары между
       одними точками, приёмка между другими, и спорить о цифрах бессмысленно:
       на одной карте у них даже наборы пар не совпадали.
       Якорь — клетка СВОЕГО места, свободная от тела, ближайшая к середине рамки.
       Свободная — потому что у места есть предмет, и ставится он по центру:
       каллаут иначе оказывается ВНУТРИ штабеля ящиков высотой 200u, а приёмка
       привязывается к его крышке, на которую нельзя залезть. */
    { const занТел=new Uint8Array(N);
      const пометь=(x,y,w,h)=>{ for(let oy=0;oy<(h||1);oy++)for(let ox=0;ox<(w||1);ox++){
        const a=x+ox, b=y+oy; if(inb(a,b)) занТел[ix(a,b)]=1; } };
      for(const c of (cov||[])){ const hh=(c.hgt==='full')?999:(c.hgt||40);
        if(hh>18) пометь(c.x,c.y,c.w,c.h); }
      for(const L2 of (LMKS||[])) пометь(L2.x,L2.y,L2.w,L2.h);
      for(const p of ((PLC_R&&PLC_R.list)||[])){
        let ax=p.x, ay=p.y, ad=1e18;
        const cx0=(p.minx+p.maxx)/2, cy0=(p.miny+p.maxy)/2;
        for(let y=p.miny;y<=p.maxy;y++)for(let x=p.minx;x<=p.maxx;x++){
          if(!inb(x,y)) continue; const i=ix(x,y);
          if(!gf[i] || (PLC_R.pid && PLC_R.pid[i]!==p.id) || занТел[i]) continue;
          const d=(x-cx0)*(x-cx0)+(y-cy0)*(y-cy0);
          if(d<ad){ ad=d; ax=x; ay=y; } }
        p.ax=ax; p.ay=ay; } }
    /* ============ v136.2. КРЮК СЧИТАЕТСЯ С ТЕЛАМИ ============
       Растр про ящики не знает, и крюк по нему выходил 1.84 там, где приёмка по
       .vmf на той же карте, с теми же якорями, давала 5.74: ящик закрывал
       короткий проход между двумя соседними местами, а обход у обоих от спавна
       оставался прежней длины — поэтому и мера «недоступно» этого не видела.
       Считаем крюк по маске С ТЕЛАМИ и берём худшее из двух. Модель тела та же,
       что в чистке укрытий: выше 40u — стена, ниже — переступается. */
    { const узелТ=new Uint8Array(N);
      const занВыс=new Uint8Array(N);
      const пометьВ=(x,y,w,h)=>{ for(let oy=0;oy<(h||1);oy++)for(let ox=0;ox<(w||1);ox++){
        const a=x+ox, b=y+oy; if(inb(a,b)) занВыс[ix(a,b)]=1; } };
      for(const c of (cov||[])){ const hh=(c.hgt==='full')?999:(c.hgt||40);
        if(hh>40) пометьВ(c.x,c.y,c.w,c.h); }
      for(const L2 of (LMKS||[])) пометьВ(L2.x,L2.y,L2.w,L2.h);
      for(let y=0;y<Hf-1;y++)for(let x=0;x<Wf-1;x++){ const a=y*Wf+x;
        if(!узел[a]) continue;
        if(занВыс[a]||занВыс[a+1]||занВыс[a+Wf]||занВыс[a+Wf+1]) continue;
        узелТ[a]=1; }
      const _td=new Int32Array(N), _tq=new Int32Array(N);
      const волнаТ=(старт)=>{ _td.fill(-1); let h=0,t=0; _td[старт]=0; _tq[t++]=старт;
        while(h<t){ const j=_tq[h++], x=j%Wf, y=(j/Wf)|0, nd=_td[j]+1;
          for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=Wf-1||ny>=Hf-1) continue;
            const k=ny*Wf+nx; if(!узелТ[k]||_td[k]>=0) continue;
            if(zу[k]-zу[j]>UPZ) continue;
            _td[k]=nd; _tq[t++]=k; } }
        return _td; };
      const близТ=(cx,cy,r)=>{ let best=-1,bd=1e9;
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          const x=cx+dx, y=cy+dy; if(x<0||y<0||x>=Wf-1||y>=Hf-1) continue;
          const j=y*Wf+x; if(!узелТ[j]) continue;
          const q=dx*dx+dy*dy; if(q<bd){bd=q;best=j;} }
        return best; };
      const L=(PLC_R&&PLC_R.list)||[];
      let мк=0, хуже=0, пар=0, нет=0;
      for(const [узм,бл,вл] of [[узел,ближУзел,волна],[узелТ,близТ,волнаТ]]){
        const т=L.map(p=>бл(p.ax,p.ay,6));
        for(let i=0;i<L.length;i++){ if(т[i]<0) continue; let d2=null;
          for(let j=i+1;j<L.length;j++){ if(т[j]<0) continue;
            const пр=Math.hypot(L[i].ax-L[j].ax, L[i].ay-L[j].ay);
            if(пр>PR_БЛИЗКО||пр<PR_МИН) continue;
            if(!d2) d2=вл(т[i]).slice();
            const dd=d2[т[j]];
            if(узм===узел) пар++;
            if(dd<0){ if(узм===узел){ нет++; хуже++; } continue; }
            const k=dd/пр; if(k>мк) мк=k;
            if(k>2 && узм===узел) хуже++; } } }
      stat.крюкМакс=+мк.toFixed(2); stat.крюкХуже2=хуже;
      stat.крюкПар=пар; stat.крюкНетПути=нет; }
  }

  return { g:gf, zfield:zff, px, cover:cov, plan, W:Wf, H:Hf, CELL:16,
           lmarks:LMKS, places:PLC_R,
           seed:src.seed, coverSeed:src.coverSeed, m:src.m, det:stat,
           stairMask:up(src.stairMask), rampMask:up(src.rampMask), vmask:up(src.vmask),
           pitMask:up(src.pitMask),
           halls:(src.halls||[]).map(h=>Object.assign({},h,{cells:[]})),
           terraces:(src.terraces||[]).map(rc),
           floorPieces:(src.floorPieces||[]).map(rc),
           palaces:(src.palaces||[]).map(q=>Object.assign({},q,
             {x0:q.x0*K,y0:q.y0*K,x1:q.x1*K+K-1,y1:q.y1*K+K-1,rampCells:[]})),
           vprof:src.vprof, zscale:src.zscale, interzones:src.interzones,
           bodies:null, zones:null, rings:src.rings, __coarse:src, __cw:sW, __ch:sH };
}
const f1=x=>x.toFixed(1).replace('.',','), f2=x=>x.toFixed(2).replace('.',',');
function paint(){ const m=cur.m;
  const row=(l,sub,tc,tt,mg)=>`<div class="site-row"><div class="badge">${l}<small>${sub}</small></div>
    <div class="times"><span class="ct">CT ${f1(tc)} с</span> &nbsp; <span class="t">T ${f1(tt)} с</span></div>
    <div class="marg">+${f1(mg)} с CT</div></div>`;
  document.getElementById('sites').innerHTML=row('A','откр',m.tCA,m.tTA,m.mA)+row('B','тесн',m.tCB,m.tTB,m.mB);
  document.getElementById('meta').innerHTML=
    `Мид: T ${f1(m.tTm)} с · CT ${f1(m.tCm)} с → контест (Δ ${f2(Math.abs(m.midDiff))} с)<br>`+
    `Ротация A↔B: <b>${f1(m.rot)} с</b> <span style='color:#7d92a4'>(цель 12–16)</span><br>Симметрия плентов: <b>${f2(Math.abs(m.mA-m.mB))} с</b> · колец <b>${cur.rings?cur.rings.length:0}</b><br>`+
    `seed геометрии <b>${cur.seed}</b> · укрытий <b>${cur.coverSeed}</b>`;
}
