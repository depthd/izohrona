/* ============ план структур: тоннели / здания / дверные проёмы (общий для рендера и VMF) ============ */
// детерминирован сидом; тоннели/здания/двери НЕ трогают g — баланс их не видит, менять безопасно
function planStructures(cur,tunP){ tunP=tunP==null?0.5:tunP;
  const g=cur.g, rr=mulberry32((cur.seed^0xC0FFEE)>>>0);
  const fl=(x,y)=>x>0&&x<W-1&&y>0&&y<H-1&&g[y*W+x];
  // клетки внутри комнат-узлов (bbox) и на плато (палас/остров) — не коридор
  const inRoom=new Uint8Array(W*H);
  for(const k in cur.px){ const n=cur.px[k], rw=(n.room[0]>>1)+1, rh=(n.room[1]>>1)+1;
    for(let y=Math.max(0,n.y-rh);y<=Math.min(H-1,n.y+rh);y++)for(let x=Math.max(0,n.x-rw);x<=Math.min(W-1,n.x+rw);x++) inRoom[y*W+x]=1; }
  const plate=new Uint8Array(W*H);
  const mkPl=p=>{ for(let y=p.y0;y<=p.y1;y++)for(let x=p.x0;x<=p.x1;x++) if(x>=0&&x<W&&y>=0&&y<H) plate[y*W+x]=1;
    if(p.rampCells) for(const c of p.rampCells) plate[c[1]*W+c[0]]=1; };
  if(cur.palaces) for(const p of cur.palaces) mkPl(p);
  if(cur.island) mkPl(cur.island);
  // компоненты коридоров -> часть накрываем крышей (тоннели)
  const corr=new Uint8Array(W*H); for(let i=0;i<W*H;i++) corr[i]=(g[i]&&!inRoom[i]&&!plate[i])?1:0;
  const compId=new Int32Array(W*H).fill(-1); const comps=[];
  for(let i0=0;i0<W*H;i0++){ if(!corr[i0]||compId[i0]>=0) continue;
    const cells=[i0]; compId[i0]=comps.length;
    for(let h=0;h<cells.length;h++){ const c=cells[h],x=c%W,y=(c/W)|0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue;
        const j=ny*W+nx; if(corr[j]&&compId[j]<0){compId[j]=comps.length;cells.push(j);} } }
    comps.push(cells); }
  const tun=new Uint8Array(W*H), tunComps=[];
  for(const cells of comps){ if(cells.length<8) continue;
    let pitN=0; if(cur.pitMask) for(const c of cells) if(cur.pitMask[c]) pitN++;
    const isPit=pitN>=cells.length*0.3;                       // яма -> всегда крытый андерпасс
    if(isPit||rr()<tunP){ for(const c of cells) tun[c]=1; tunComps.push(cells); } }
  // ЗАЛЫ ПАЛАСОВ: всегда под крышей и со светом — это интерьер здания, не открытая дорожка
  if(cur.halls) for(const hl of cur.halls){ const hc=[];
    for(const [x,y] of hl.cells){ const i=y*W+x; if(cur.g[i]&&Math.abs(cur.zfield[i]-hl.zt)<0.01){ tun[i]=1; hc.push(i); } }
    if(hc.length) tunComps.push(hc); }
  // здания: 1-2 коннектора (крыша 192u + двери на входах + свет) и иногда закрытый B-сайт (крыша 256u)
  const conns=['AM','BM','AC','BC','ML','SR','SL'].filter(k=>cur.px[k]);
  for(let i=conns.length-1;i>0;i--){const j=(rr()*(i+1))|0;[conns[i],conns[j]]=[conns[j],conns[i]];}
  const builds=[];
  // КЛАМП: без него узел у края карты давал здание с x0<0 или x1>W, и его крыша (плита 16u)
  // вылетала на 1-2 клетки ЗА оболочку карты — плавающий кусок пола снаружи, плюс раздутый габарит.
  const mkB=(key,roofH)=>{ const n=cur.px[key]; const cl=(v,hi)=>Math.max(0,Math.min(hi,v));
    const x0=cl(n.x-(n.room[0]>>1),W), x1=cl(n.x+(n.room[0]>>1)+1,W);
    const y0=cl(n.y-(n.room[1]>>1),H), y1=cl(n.y+(n.room[1]>>1)+1,H);
    // после клампа прямоугольник может схлопнуться в нуль (узел целиком за краем) —
    // такое здание даёт вырожденный браш нулевой ширины. Не создаём его вовсе.
    if(x1-x0<1 || y1-y0<1) return;
    builds.push({key, x0, x1, y0, y1, z:(n.z||0), roofH}); };
  for(let b=0;b<Math.min(1+(rr()<0.6?1:0),conns.length);b++) mkB(conns[b],192);
  if(rr()<0.20) mkB('B',448);   // v60 L4: закрытый B — редкий архетип, и потолок 448u, а не 256u
  // v37: дверь/арка на ЛЮБОМ сужении шириной 1..4 (реальные горловины 3-4 клетки)
  const seen=new Uint8Array(W*H); const doors=[];
  const runW=(x,y,ax)=>{ let a=0,b=0;
    if(ax==='Y'){ while(fl(x-a-1,y))a++; while(fl(x+b+1,y))b++; }
    else       { while(fl(x,y-a-1))a++; while(fl(x,y+b+1))b++; }
    return {w:a+b+1, s:(ax==='Y'?x-a:y-a)}; };
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){ const i=y*W+x; if(!fl(x,y)||seen[i]) continue;
    const rx=runW(x,y,'Y'), ry=runW(x,y,'X');
    if(rx.w<=2 && fl(x,y-1) && fl(x,y+1) && rx.w<ry.w){
      let y1=y; while(y1+1<H-2 && fl(x,y1+1) && runW(x,y1+1,'Y').w<=4) y1++;
      for(let yy=y;yy<=y1;yy++) for(let k=0;k<rx.w;k++) seen[yy*W+rx.s+k]=1;
      if(y1-y>=1 && !doors.some(d=>Math.abs(d.x-(rx.s+(rx.w>>1)))+Math.abs(d.y-((y+y1)>>1))<3) && rr()<0.85) doors.push({x:rx.s+(rx.w>>1), y:(y+y1)>>1, axis:'Y', w:rx.w});
      continue; }
    if(ry.w<=2 && fl(x-1,y) && fl(x+1,y) && ry.w<rx.w){
      let x1=x; while(x1+1<W-2 && fl(x1+1,y) && runW(x1+1,y,'X').w<=4) x1++;
      for(let xx=x;xx<=x1;xx++) for(let k=0;k<ry.w;k++) seen[(ry.s+k)*W+xx]=1;
      if(x1-x>=1 && !doors.some(d=>Math.abs(d.x-((x+x1)>>1))+Math.abs(d.y-(ry.s+(ry.w>>1)))<3) && rr()<0.85) doors.push({x:(x+x1)>>1, y:ry.s+(ry.w>>1), axis:'X', w:ry.w});
      continue; } }
  // ДВЕРИ-В-УСТЬЯХ: где коридор входит в комнату. Скан границы bbox комнаты: пробег пола шириной <=4,
  // ограниченный стенами с обеих сторон (косяки), = устье -> перемычка. Это и есть "дверной проход между зонами".
  const nearDoor=(x,y)=>doors.some(d=>Math.abs(d.x-x)+Math.abs(d.y-y)<3);
  for(const k in cur.px){ const n=cur.px[k], rw=(n.room[0]>>1)+1, rh=(n.room[1]>>1)+1;
    const bx0=n.x-rw, bx1=n.x+rw, by0=n.y-rh, by1=n.y+rh;
    const scanRow=(y,ax)=>{ if(y<2||y>H-3) return; let x=Math.max(2,bx0);
      const xe=Math.min(W-3,bx1);
      while(x<=xe){ if(!fl(x,y)){x++;continue;}
        let x1=x; while(x1+1<=xe&&fl(x1+1,y))x1++;
        const wRun=x1-x+1;
        if(wRun<=(V63.archW3?3:2)&&!fl(x-1,y)&&!fl(x1+1,y)&&fl(x,y-1)&&fl(x,y+1)&&!nearDoor(x,y)&&rr()<0.9)
          doors.push({x,y,axis:'Y',w:wRun,mouth:1});
        x=x1+1; } };
    const scanCol=(x)=>{ if(x<2||x>W-3) return; let y=Math.max(2,by0);
      const ye=Math.min(H-3,by1);
      while(y<=ye){ if(!fl(x,y)){y++;continue;}
        let y1=y; while(y1+1<=ye&&fl(x,y1+1))y1++;
        const hRun=y1-y+1;
        if(hRun<=(V63.archW3?3:2)&&!fl(x,y-1)&&!fl(x,y1+1)&&fl(x-1,y)&&fl(x+1,y)&&!nearDoor(x,y)&&rr()<0.9)
          doors.push({x,y,axis:'X',w:hRun,mouth:1});
        y=y1+1; } };
    scanRow(by0); scanRow(by1); scanCol(bx0); scanCol(bx1); }
  return {tun,tunComps,builds,doors};
}

/* ==================================================================================
   ЗОНАЛЬНАЯ СИСТЕМА (v58). Разделение карты на ИМЕНОВАННЫЕ ОБЛАСТИ + палитры.
   Логику/баланс/нав НЕ трогает. Считается после build(), как planStructures.

   Зачем: до v57 весь пол — один материал, все стены — один. Карта нечитаема:
   игрок не понимает, где он. Замер dust2: 9 именованных зон покрывают 100% пола,
   медиана площади зоны ~900k u2, заполнение bbox 48% (зоны Г-образные).
   Здесь карта режется ровно на 9 областей — по одной на смысловой участок.
   ================================================================================== */
/* ---------- ПАЛИТРЫ v59. Правится ТОЛЬКО здесь. ----------
   Каталог и обоснование: MATERIALS.md / materials_catalog.json.

   ПРАВИЛО 1. Только классы flat и noise. Материал со структурой (кладка, плитка,
   профлист, доски) требует масштаба И смещения под размер элемента, а генератор
   кладёт браши произвольных размеров и подобрать их не может. Плюс всё, что имеет
   альфу или читается как законченный предмет (забор, ящик с рамой), запрещено.

   ПРАВИЛО 2. Девять зон цветом стены НЕ РАЗВОДЯТСЯ. Перебор всех 11736 раскладок
   двенадцати цветов семейства 002 дал потолок 22 dE по худшей паре — мало.
   Поэтому зоны схлопнуты в СЕМЬ ВИДИМЫХ ОБЛАСТЕЙ: связка наследует цвет плента,
   к которому ведёт. Стало 30 dE. Заодно вернее по геймплею: подход к сайту
   читается как «я уже почти там». У dust2 девять именованных зон, но пять плато
   держат 89% пола — глазами это столько же мест.

   ПРАВИЛО 3. Пол — второй канал. Цвет стены говорит, где ты; семейство пола
   дублирует это на случай, если стена не в кадре.

   ПРАВИЛО 4. Укрытие и тримм НЕ задаются вручную, а выводятся из светлоты стены
   (см. derive ниже): |L(укрытие) - L(стена)| >= 25, иначе силуэт не читается.

   [OK] путь встречен в настоящем vmap или в подписи Asset Browser.
   [?]  выведен по аналогии.                                                          */
/* ============ v66: ТАБЛИЦА МАТЕРИАЛОВ ============
   ТОЛЬКО пути, подтверждённые подсказкой Asset Browser на скриншотах.
   Ничего выведенного по конвенции — прошлый заход дал шашечки именно на них.
   Стены временно берутся из кирпичных «полов» инферно: hr-текстуры кладки,
   на вертикали читаются как стена. Заменить, когда пришлёшь настоящие стены. */
const M_ = {
  // --- СТЕНЫ (все пути подтверждены подсказкой Asset Browser) ---
  wSand  : "anubis/stone_wall03",                                  // тёплый песчаник
  wWhite : "de_ancient/hr_ancient_wall_stone_01_base",             // белый блок
  wBrick : "cs_italy/brickwall01",                                 // тёмный кирпич
  wRough : "de_inferno/stone/inferno_stone_wall_01",               // грубый камень
  wPale  : "de_anubis/stone_wall01",                               // светлый гладкий
  wSheet : "models/props/de_mirage/wall_hole/sheet_metal_panel",   // профлист
  wMetal : "cs_italy/metal/metal_basic_1",                         // гладкий металл
  // --- ПОЛЫ ---
  fTerra : "de_inferno/ground/inferno_stone_floor_03",
  fCobb  : "de_inferno/ground/inferno_stone_floor_04",
  fBrick : "de_inferno/ground/inferno_stone_floor_05",
  fBrkD  : "de_inferno/ground/inferno_stone_floor_05_dark",
  fTile  : "de_inferno/ground/inferno_tile_floor_01",
  fWood  : "de_inferno/wood/inferno_wood_floor_01",
  fItaly : "cs_italy/ground/tile_floor_diamond_1",
  fDust  : "de_dust/tilefloor02",
  fRub   : "ar_baggage/baggage_rubber_floor_dots_01",
  fAsph  : "de_nuke/hr_nuke/hr_asphalt_001",
  // --- УКРЫТИЯ ---
  crate1 : "cs_italy/picrate1",
  crate2 : "models/props/de_nuke/crate",
  brick  : "cs_italy/brickwall01",                                 // v70: имена, на которые ссылался V66
  brickD : "de_inferno/stone/inferno_stone_wall_01",
  stone4 : "de_ancient/hr_ancient_wall_stone_01_base",
  NODRAW : "TOOLS/TOOLSNODRAW",
};
const CONC="concrete/hr_c";        // [OK] подтверждено скриншотом: materials/concrete/hr_c/
const P2=c=>CONC+"/hr_concrete_wall_painted_002"+(c?"_"+c:"");   // семейство 002 — единственное без швов
const RF=n=>"dev/reflectivity_"+n; // [OK] только _30, остальные [?]
const DARKTRIM="de_nuke/hr_nuke/hr_asphalt_001";   // v67: подтверждённый путь   // [OK] тёмный, шумовой

// ВИДИМЫЕ ОБЛАСТИ. Индекс = регион, к которому приписана зона (см. REGOF).
const RN =['T','APPR_A','APPR_B','MID','SITE_A','SITE_B','CT'];
const RRU=['Т-спавн','подход A','подход B','мид','плент A','плент B','КТ-спавн'];
// зона (ZN, 9 шт.) -> видимая область (RN, 7 шт.). Связки наследуют цвет своего плента.
const REGOF9 =[0,1,2,3,1,2,4,5,6];
/* v92: 14 зон. Материалы и цвета НЕ меняются — каждая новая зона отображается
   в тот же видимый регион, что и раньше. Меняется только дробность разбиения:
   у реальных карт зон 13–26, схлопнутых девяти не бывает нигде. */
const REGOF14=[0, 1,1,1, 2,2,2, 3,3, 1, 2, 4, 5, 6];
let REGOF=REGOF9;
// цвет стены области. Замерено swatch.py с превью Asset Browser, разложено assign.py:
// мин. различие по смежным областям 36 dE, по всем парам 30 dE.
const REGC=[
  {c:'yellow_light', hex:[255,247,201], L:97},   // T
  {c:'orange',       hex:[204,147, 66], L:65},   // подход A
  {c:'yellow',       hex:[254,205, 52], L:84},   // подход B
  {c:'grey',         hex:[166,168,165], L:69},   // мид
  {c:'green',        hex:[156,178,120], L:70},   // плент A
  {c:'red',          hex:[174, 88, 59], L:47},   // плент B
  {c:'blue',         hex:[ 58,122,165], L:49},   // КТ
];
// пол по областям — второй канал. Все [OK], все noise.
const REGF=[
  "de_dust/hr_dust/hr_dust_sand_02",
  "de_dust/hr_dust/hr_dust_blend_floortile_01",
  "de_overpass/asphalt/asphalt_road_worn_02",
  "asphalt/hr_c/hr_asphalt_001",
  "de_dust/hr_dust/hr_dust_blend_floortile_03",
  "de_dust/hr_dust/hr_dust_blend_floortile_03",
  "de_nuke/hr_nuke/hr_asphalt_001",
];
// цвет зоны для 2D-карты и editor-цвета браша = ФАКТИЧЕСКИЙ цвет стены
let ZCOL=REGOF.map(r=>REGC[r].hex);
const ZN9 =['T','LANE_A','LANE_B','MID','LINK_A','LINK_B','SITE_A','SITE_B','CT'];
const ZN14=['T','LANE_A','A_ЗАХОД','A_ЗАХОД2','LANE_B','B_ЗАХОД','B_ЗАХОД2','ПОДМИД','MID','LINK_A','LINK_B','SITE_A','SITE_B','CT'];
let ZN=ZN9;
const ZRU=['Т-спавн','лейн A','лейн B','мид','связка A','связка B','плент A','плент B','КТ-спавн'];
const ZONEOF9 ={ T:0, SR:1, AM:1, AM2:1, SL:2, BM:2, BM2:2, ML:3, M:3, AC:4, BC:5, A:6, B:7, CT:8 };
const ZONEOF14={ T:0, SR:1, AM:2, AM2:3, SL:4, BM:5, BM2:6, ML:7, M:8, AC:9, BC:10, A:11, B:12, CT:13 };
let ZONEOF=ZONEOF9;
const MIDZONE=()=>(V92&&V92.zones14)?8:3;
function applyZoneMode(){ const w14=!!(V92&&V92.zones14);
  REGOF=w14?REGOF14:REGOF9; ZN=w14?ZN14:ZN9; ZONEOF=w14?ZONEOF14:ZONEOF9;
  ZCOL=REGOF.map(r=>REGC[r].hex); }
applyZoneMode();

/* Укрытие и ключ выводятся из светлоты стены, а не назначаются: стена светлая ->
   укрытие тёмное и наоборот. Гарантирует |dL| >= 25 в любой области. */
function derive(L){ return L>65 ? {c:P2('grey_dark'), k:P2('red')} : {c:P2('grey_warm'), k:P2('yellow')}; }

const PAL={
  // GREYBOX: различие только светлотой по РОЛИ. Масштаб не важен вообще, форму видно голой.
  greybox:{_all:{f:RF(50), w:RF(30), t:RF(10), c:RF(70), s:RF(90), k:RF(90)}},
  // FLAT: пол несёт область, стены серые. Страховка на случай, если CONC вдруг не тот.
  flat:{_reg:(r)=>({f:REGF[r], w:RF(r%2?30:50), t:DARKTRIM, c:RF(70), s:REGF[r], k:RF(90)})},
  // PAINT: боевая. Стена — цвет области, пол — второй канал, укрытие выведено из светлоты.
  paint:{_reg:(r)=>{ const d=derive(REGC[r].L);
    return {f:REGF[r], w:P2(REGC[r].c), t:DARKTRIM, c:d.c, s:REGF[r], k:d.k}; }}
};
/* v64: трезвая палитра. Стена не несёт цвет зоны — его несут пол и свет. */
PAL.sober={_reg:(r)=>({ f:REGF[r], w:P2(r===3?'grey':''), t:DARKTRIM,
                        c:DARKTRIM, s:REGF[r], k:P2('grey') })};
/* v66 STONE — палитра целиком из подтверждённых материалов.
   Зона различается кладкой стены и камнем пола, цветовой заливки нет. */
/* ЗОНИРОВАНИЕ ДЛЯ ЧИТАЕМОСТИ.
   Правило: у каждой из семи областей своя ПАРА стена+пол, и ни одна пара не
   повторяется. Два плента получают самые несхожие материалы во всём наборе
   (дерево против асфальта, светлый камень против профлиста) — чтобы по одному
   кадру было понятно, на A ты или на B. Мид нарочно нейтрально-серый: он
   ничей, и это должно читаться. Спавны — тёплый юг против холодного севера. */
/* ====== v79 ZONED — палитра по принципу доделанной карты ======
   Читаемость зоны несёт НЕ разная текстура, а один цвет: у каждой области своя
   крашеная бетонная лента (та же семья hr_concrete_wall_painted_001, что в ручной карте),
   она ложится на карниз поверх каждой стены и видна с любой точки. Сама стена при этом
   каменная и разная по кладке, пол — свой в каждой области. Все пути ниже подтверждены. */
const MZ={
  aztec:p=>"de_aztec/hr_aztec/hr_aztec_"+p, anc:p=>"de_ancient/hr_ancient_"+p,
  ovp:p=>"de_overpass/metal/"+p, conc:c=>"concrete/hr_c/hr_concrete_wall_painted_001_"+c,
  trB:p=>"de_train/hr_train_s2/brick/"+p, trR:p=>"de_train/hr_train_s2/roof/"+p,
  trW:p=>"de_train/hr_train_s2/wood/"+p, cch:p=>"de_cache/brick/"+p };
const ZONED=[
 /* Палитра целиком песчаная: anubis + mirage. Зоны разводятся ФАКТУРОЙ и ТОНОМ
    (сырец, кирпич, скала, тёсаный камень, штукатурка, металл, плитняк), а цвет несут
    акцентные ленты карнизов. Помни про surfaceproperty: металл и дерево простреливаются
    легче камня, поэтому металл стоит только на пленте B. */
 /*0 T-спавн  */ {w:"anubis/mudbrick02",                       f:"anubis/hr_stone_ground02_sand",     k:MZ.conc('orange')},
 /*1 подход A */ {w:"de_mirage/brick/de_mirage_brick_ver1_diffuse", f:"anubis/hr_stone_ground03b_sand", k:MZ.conc('yellow')},
 /*2 подход B */ {w:"anubis/models/structures/cliff_wall003_color", f:"anubis/hr_stone_ground04_sand",  k:MZ.conc('green')},
 /*3 мид      */ {w:"anubis/stone_wall03",                     f:"de_mirage/ground/de_mirage_tilef_diffuse", k:MZ.conc('grey_warm')},
 /*4 ПЛЕНТ A  */ {w:"de_mirage/hr_mirage/mirage_plaster_1",    f:"anubis/hr_stone_floor03_sand",      k:MZ.conc('red')},
 /*5 ПЛЕНТ B  */ {w:"models/props/de_mirage/wall_hole/sheet_metal_panel", f:"anubis/anubis_wood_planks01", k:MZ.conc('blue')},
 /*6 КТ-спавн */ {w:"anubis/hr_stone_wall05_wall02",           f:"anubis/sandstone01",                k:MZ.conc('blue_light')},
];
const ZROOF="de_anubis/models/structures/stones_single";   // карнизы и трим — тёсаный камень
var PAL_ZONED={_reg:(r)=>({ f:ZONED[r].f, w:ZONED[r].w, t:ZROOF,
                        c:(r===4?"anubis/models/market/wood_planks_4":(r===5?"models/props/de_nuke/crate":"cs_italy/picrate1")),
                        s:ZONED[r].f, k:ZONED[r].k })};
const STONE=[
 /*0 T-спавн  */ {w:M_.wSand,  f:M_.fTerra},   // песчаник + терракота, тёплый
 /*1 подход A */ {w:M_.wWhite, f:M_.fTile},    // белый блок + охристая плитка
 /*2 подход B */ {w:M_.wBrick, f:M_.fItaly},   // тёмный кирпич + ромб
 /*3 мид      */ {w:M_.wRough, f:M_.fDust},    // грубый камень + светлая плитка
 /*4 ПЛЕНТ A  */ {w:M_.wPale,  f:M_.fWood},    // ДЕРЕВЯННЫЙ ПОЛ — только здесь
 /*5 ПЛЕНТ B  */ {w:M_.wSheet, f:M_.fAsph},    // ПРОФЛИСТ + АСФАЛЬТ — только здесь
 /*6 КТ-спавн */ {w:M_.wMetal, f:M_.fRub},     // металл + резина, холодный
];
PAL.stone={_reg:(r)=>({ f:STONE[r].f, w:STONE[r].w, t:M_.fBrkD,
                        c:(r===4?M_.crate2:M_.crate1), s:STONE[r].f, k:M_.fBrick })};
let PALMODE='paint';   // v59: CONC подтверждён, поэтому боевая палитра теперь дефолт

// разрешение материала: зона -> роль -> дефолт палитры -> дефолт greybox
function matOf(zi,role){
  if(V79&&V79.pal&&PAL_ZONED) { const st=PAL_ZONED._reg(REGOF[zi]||0); return st[role]||st.f; }
  const P=PAL[(V65&&V65.stone)?'stone':((V64&&V64.sober)?'sober':PALMODE)]||PAL.greybox;
  if(P._all) return P._all[role]||P._all.f;
  const set=P._reg(REGOF[zi]||0);
  return set[role]||set.f;
}
/* ============ v120. МЕСТА ============
   ЗОНА — решение планировщика: лейн, сайт, мид. Их четырнадцать, они заданы заранее
   и к тому, что видит игрок, отношения не имеют.
   МЕСТО — свойство самой геометрии: кусок пола, отделённый от соседей сужением.
   Именно в место игрок тычет пальцем и называет одним словом, и именно отсюда
   берутся каллауты (OVERPASS.md §3: ни одно имя не происходит от «прямоугольная
   комната 900x700» — все от предмета, постройки или перепада).

   Считается водоразделом по расстоянию до стены:
     пик расстояния        — середина комнаты, чем шире комната, тем выше пик;
     заливка вниз по склону — каждая клетка достаётся ближайшему пику «по ширине»;
     седло между областями  — самая широкая точка границы, то есть горловина;
     слияние                — если седло почти так же широко, как сами области,
                              это не граница, а продолжение той же комнаты.

   Пороги подобраны на настоящих навах (tools/places.py), не на генераторе. */
const PLC={ minR:96, mergeK:0.72, minArea:96000, entMin:2 };   // юниты / доля / u²
/* ============ v120. СЛОВАРЬ СИЛУЭТОВ ============
   Семь предметов, у каждого свой профиль сверху и сбоку. Именно РАЗНЫЕ силуэты,
   а не разная высота одного куба: место узнаётся по тому, чем оно не похоже на
   соседнее. Габариты в ЮНИТАХ (не в клетках — на 16u «ящик в клетку» это 16u).

     minW — какой ширины должно быть место (2 x расстояние до стены в его пике),
            чтобы предмет туда встал и остался обходимым с двух сторон;
     solid — что из предмета мешает пройти: 'full' весь след, 'posts' только стойки;
     en    — имя для env_cs_place, то есть каллаут в игре. Латиница: кириллицу
             в HUD каллаутов лучше не проверять на живом человеке.

   Порядок от мелкого к крупному — подбирается самый крупный, который влезает. */
const LMV=[
  {k:'crate1', en:'Crate',     ру:'Тумба',     w:96, h:96,  minW:256, solid:'full'},
  {k:'pillar', en:'Pillar',    ру:'Колонна',   w:112,h:112, minW:352, solid:'full'},
  {k:'barrels',en:'Barrels',   ру:'Бочки',     w:160,h:160, minW:384, solid:'full'},
  {k:'stack',  en:'Stack',     ру:'Штабель',   w:192,h:192, minW:416, solid:'full'},
  {k:'wallg',  en:'Wall',      ру:'Стенка',    w:288,h:64,  minW:416, solid:'full'},
  {k:'truck',  en:'Container', ру:'Контейнер', w:320,h:144, minW:544, solid:'full'},
  {k:'canopy', en:'Canopy',    ру:'Навес',     w:288,h:288, minW:640, solid:'posts'},
  {k:'deck',   en:'Platform',  ру:'Помост',    w:320,h:320, minW:704, solid:'full'},
];
const LMBY={}; for(const v of LMV) LMBY[v.k]=v;
function computePlaces(g,W,H,U,opt){
  opt=opt||{}; const minR=(opt.minR||PLC.minR)/U, mergeK=(opt.mergeK!==undefined?opt.mergeK:PLC.mergeK);
  const minArea=(opt.minArea!==undefined?opt.minArea:PLC.minArea)/(U*U);
  const N=W*H, INF=1e9, S2=1.4142;
  const D=new Float32Array(N);
  for(let i=0;i<N;i++) D[i]=g[i]?INF:0;
  /* Клетка пола на самой кромке растра граничит с «наружу», а наружу — не пол.
     Проходы чамфера идут с отступом в клетку, поэтому кромку они не трогают: у карт
     генератора там всегда стена, и это сходило с рук. У настоящего нава пол доходит
     до края, D остаётся бесконечностью — и подавление немаксимумов уходит в радиус
     в миллиард клеток, то есть намертво. */
  for(let x=0;x<W;x++){ if(g[x]) D[x]=1; const j=(H-1)*W+x; if(g[j]) D[j]=1; }
  for(let y=0;y<H;y++){ const a=y*W, b2=a+W-1; if(g[a]) D[a]=1; if(g[b2]) D[b2]=1; }
  for(let y=1;y<H;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]) continue;
    D[i]=Math.min(D[i],D[i-W]+1,D[i-1]+1,D[i-W-1]+S2,D[i-W+1]+S2); }
  for(let y=H-2;y>=0;y--)for(let x=W-2;x>=1;x--){ const i=y*W+x; if(!g[i]) continue;
    D[i]=Math.min(D[i],D[i+W]+1,D[i+1]+1,D[i+W+1]+S2,D[i+W-1]+S2); }

  const order=[]; for(let i=0;i<N;i++) if(g[i]) order.push(i);
  order.sort((a,b)=>D[b]-D[a]);
  const lab=new Int32Array(N).fill(-1), peaks=[];
  const D8P=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  /* пик — клетка, вокруг которой в радиусе собственной ширины ещё никто не сидит.
     Радиус подавления равен D: большая комната отдаёт один пик, а не сотню. */
  const seedRound=(thresh)=>{
    for(const i of order){ if(D[i]<thresh||lab[i]>=0) continue;
      const r=Math.max(1,Math.min(64,Math.round(D[i]))), x=i%W, y=(i/W)|0;
      let ok=true;
      for(let oy=-r;oy<=r&&ok;oy++){ const ny=y+oy; if(ny<0||ny>=H) continue;
        for(let ox=-r;ox<=r;ox++){ const nx=x+ox; if(nx<0||nx>=W) continue;
          if(lab[ny*W+nx]>=0){ ok=false; break; } } }
      if(!ok) continue;
      const pid=peaks.length; peaks.push({x,y,R:D[i],i});
      for(let oy=-r;oy<=r;oy++){ const ny=y+oy; if(ny<0||ny>=H) continue;
        for(let ox=-r;ox<=r;ox++){ const nx=x+ox; if(nx<0||nx>=W) continue;
          if(ox*ox+oy*oy>r*r) continue; const j=ny*W+nx;
          if(g[j]&&lab[j]<0) lab[j]=pid; } } } };
  /* заливка строго по убыванию ширины: корзины по половине клетки */
  const flood=()=>{ const B=[];
    const push=(i,k)=>{ (B[k]||(B[k]=[])).push(i); };
    let top=0;
    for(let i=0;i<N;i++) if(lab[i]>=0){ const k=Math.round(D[i]*2); if(k>top) top=k; push(i,k); }
    for(let k=top;k>=0;k--){ const q=B[k]; if(!q) continue;
      for(let h=0;h<q.length;h++){ const i=q[h], x=i%W, y=(i/W)|0;
        for(const [dx,dy] of D8P){ const nx=x+dx, ny=y+dy;
          if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx;
          if(!g[j]||lab[j]>=0) continue; lab[j]=lab[i];
          const kk=Math.min(k,Math.round(D[j]*2));
          if(kk===k) q.push(j); else push(j,kk); } } } };

  seedRound(minR); flood();
  for(let guard=0; guard<40; guard++){                     // компоненты уже minR целиком
    let rest=-1; for(const i of order) if(lab[i]<0){ rest=i; break; }
    if(rest<0) break; seedRound(D[rest]-1e-9); flood(); }

  /* ---- слияние по седлу ---- */
  const par=new Int32Array(peaks.length); for(let i=0;i<par.length;i++) par[i]=i;
  const find=a=>{ while(par[a]!==a){ par[a]=par[par[a]]; a=par[a]; } return a; };
  const sad=new Map();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!g[i]) continue; const a=lab[i];
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){ const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(!g[j]) continue;
      const b=lab[j]; if(a===b) continue;
      const key=(Math.min(a,b)<<16)|Math.max(a,b), v=Math.min(D[i],D[j]);
      if(!(sad.get(key)>=v)) sad.set(key,v); } }
  const pairs=[...sad.entries()].sort((p,q)=>q[1]-p[1]);
  const Rof=new Float32Array(peaks.length); for(let i=0;i<peaks.length;i++) Rof[i]=peaks[i].R;
  for(let pass=0; pass<6; pass++){ let ch=0;
    for(const [key,s] of pairs){ const a=find(key>>16), b=find(key&0xffff);
      if(a===b) continue;
      if(s>=mergeK*Math.min(Rof[a],Rof[b])){ const r=Math.min(a,b), o=Math.max(a,b);
        par[o]=r; Rof[r]=Math.max(Rof[a],Rof[b]); ch++; } }
    if(!ch) break; }
  /* крошки прилипают к соседу: место меньше 96k u² словом не называют */
  const cnt=new Map();
  const tally=()=>{ cnt.clear(); for(let i=0;i<N;i++) if(g[i]){ const r=find(lab[i]); cnt.set(r,(cnt.get(r)||0)+1); } };
  tally();
  for(let pass=0; pass<4; pass++){ let ch=0;
    for(const [key,s] of pairs){ const a=find(key>>16), b=find(key&0xffff);
      if(a===b) continue;
      if((cnt.get(a)||0)<minArea || (cnt.get(b)||0)<minArea){
        const r=Math.min(a,b), o=Math.max(a,b);
        par[o]=r; Rof[r]=Math.max(Rof[a],Rof[b]);
        cnt.set(r,(cnt.get(a)||0)+(cnt.get(b)||0)); cnt.set(o,0); ch++; } }
    if(!ch) break; }
  tally();

  /* компактная нумерация + сводка по каждому месту */
  const remap=new Map(); const list=[];
  for(const [r,c] of cnt){ if(!c) continue; remap.set(r,list.length);
    list.push({id:list.length, cells:c, x:0, y:0, R:Rof[r], zsum:0, minx:1e9,maxx:-1e9,miny:1e9,maxy:-1e9}); }
  const pid=new Int32Array(N).fill(-1);
  for(let i=0;i<N;i++){ if(!g[i]) continue; const k=remap.get(find(lab[i]));
    if(k===undefined) continue; pid[i]=k; const p=list[k], x=i%W, y=(i/W)|0;
    p.x+=x; p.y+=y;
    if(x<p.minx)p.minx=x; if(x>p.maxx)p.maxx=x; if(y<p.miny)p.miny=y; if(y>p.maxy)p.maxy=y; }
  for(const p of list){ p.x=Math.round(p.x/p.cells); p.y=Math.round(p.y/p.cells);
    p.area=Math.round(p.cells*U*U/1000); p.w=(p.maxx-p.minx+1)*U; p.h=(p.maxy-p.miny+1)*U; }
  /* центр может попасть в стену (место подковой) — сдвигаем на ближайший свой пол */
  for(const p of list){ const i0=p.y*W+p.x;
    if(pid[i0]===p.id) continue;
    let best=-1,bd=1e9;
    for(let i=0;i<N;i++) if(pid[i]===p.id){ const x=i%W,y=(i/W)|0, d=(x-p.x)*(x-p.x)+(y-p.y)*(y-p.y);
      if(d<bd){ bd=d; best=i; } }
    if(best>=0){ p.x=best%W; p.y=(best/W)|0; } }

  /* ВХОДЫ. Клетка своего пола, у которой есть сосед из чужого места. Связные куски
     такой каймы, разделённые по разным соседям, — это и есть отдельные входы.
     Место с одним входом — тупик, ровно то, что было обведено красным. */
  for(const p of list){ p.ent=0; p.nb=new Set(); p.strips=[]; }
  const entMin=(opt.entMin!==undefined?opt.entMin:PLC.entMin);
  { const bord=new Int32Array(N).fill(-1);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; const a=pid[i]; if(a<0) continue;
      for(const [dx,dy] of D8P){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const b=pid[ny*W+nx]; if(b>=0&&b!==a){ bord[i]=b; list[a].nb.add(b); break; } } }
    const seen=new Uint8Array(N);
    for(let i=0;i<N;i++){ if(bord[i]<0||seen[i]) continue;
      const a=pid[i], b=bord[i], st=[i]; seen[i]=1; let n=0; const comp=[];
      while(st.length){ const j=st.pop(); n++; comp.push(j); const x=j%W, y=(j/W)|0;
        for(const [dx,dy] of D8P){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
          const k2=ny*W+nx; if(seen[k2]||bord[k2]!==b||pid[k2]!==a) continue; seen[k2]=1; st.push(k2); } }
      /* Проём уже игрока (32u = две клетки) проходом не считается. Порог вынесен
         в настройку, потому что от него зависит вся статистика входов, и сверять
         себя с реальными картами можно только при ОДНОМ его значении на обе стороны. */
      if(n>=entMin){ list[a].ent++; list[a].strips.push({b, n, cells:comp}); } } }
  return { pid, D, list, count:list.length };
}
/* ---------- РАЗМЕТКА КЛЕТОК ПО ЗОНАМ ----------
   Многоисточниковая волна по полу от центров узлов; ближайший по ПРОХОДИМОСТИ узел выигрывает.
   Не евклидово: за стеной зона не «протекает», граница садится ровно на устье прохода —
   то есть туда, где её и видит игрок. */
function computeZones(cur){
  const g=cur.g, px=cur.px, zf=cur.zfield;
  const zid=new Uint8Array(W*H).fill(255), dist=new Int32Array(W*H).fill(1<<30);
  const q=[]; let qh=0;
  const seed=(k)=>{ const n=px[k]; if(!n||ZONEOF[k]===undefined) return;
    // якорь: ближайшая клетка пола к центру узла
    let bx=n.x,by=n.y;
    if(!g[by*W+bx]){ outer: for(let r=1;r<10;r++) for(let oy=-r;oy<=r;oy++) for(let ox=-r;ox<=r;ox++){
      const x=n.x+ox,y=n.y+oy; if(x>0&&y>0&&x<W-1&&y<H-1&&g[y*W+x]){bx=x;by=y;break outer;} } }
    const i=by*W+bx; if(!g[i]) return;
    if(dist[i]>0){ dist[i]=0; zid[i]=ZONEOF[k]; q.push(i); } };
  for(const k in ZONEOF) seed(k);
  while(qh<q.length){ const i=q[qh++], x=i%W, y=(i/W)|0, nd=dist[i]+1;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(!g[j]) continue;
      if(zf && Math.abs(zf[j]-zf[i])>1.2) continue;          // через обрыв зона не перетекает
      if(dist[j]<=nd) continue; dist[j]=nd; zid[j]=zid[i]; q.push(j); } }
  // остатки (оторванные куски) — ближайшая зона по евклиду от любого размеченного соседа
  for(let pass=0;pass<8;pass++){ let ch=0;
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]||zid[i]!==255) continue;
      for(const d of [1,-1,W,-W]){ const j=i+d; if(g[j]&&zid[j]!==255){ zid[i]=zid[j]; ch++; break; } } }
    if(!ch) break; }
  // ЗОНА СТЕНЫ: наследует зону соседнего пола (иначе стены всей карты — один материал,
  // и границу области видно только под ногами). Внутренние массивы получают BULK=255.
  const wzid=new Uint8Array(W*H).fill(255);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(g[i]) continue;
    const cnt={}; let best=-1,bn=0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx;
      if(!g[j]||zid[j]===255) continue; const z=zid[j]; cnt[z]=(cnt[z]||0)+1; if(cnt[z]>bn){bn=cnt[z];best=z;} }
    if(best>=0) wzid[i]=best; }
  // сводка площадей — для readout и для контроля «зона не выродилась»
  const area=new Array(ZN.length).fill(0); let tot=0;
  for(let i=0;i<W*H;i++) if(g[i]&&zid[i]!==255){ area[zid[i]]++; tot++; }
  // РАЗВИЛКИ: клетка пола, из которой ведут >=3 разных направления И которая граничит
  // с >=2 зонами -> сюда просится лендмарк (уникальный объект, по которому игрок себя находит)
  const junc=[];
  { const seenJ=new Uint8Array(W*H);
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){ const i=y*W+x; if(!g[i]||seenJ[i]) continue;
      const zs=new Set(); let deg=0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const j=(y+dy)*W+(x+dx); if(g[j]){deg++; if(zid[j]!==255) zs.add(zid[j]);} }
      if(deg>=3 && zs.size>=2){
        if(junc.some(p=>Math.abs(p.x-x)+Math.abs(p.y-y)<5)) continue;
        junc.push({x,y,z:zid[i]}); for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++) seenJ[(y+oy)*W+(x+ox)]=1; } } }
  return {zid,wzid,area,tot,junc};
}

