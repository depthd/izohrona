/* ============ VMF-экспорт в браузере (VIS-чистый, с высотами) ============ */
function buildVMF(cur){
  const ramps=RAMPS;
  const g=cur.g, zf=cur.zfield, P=cur.m.pts;
  const S=CELL, ZS=72, STEP=8;            // v93: юнитов в клетке берётся из режима
  const cells=u=>Math.max(1,Math.round(u/S));
  /* v113. Смещения 48, 36, 60 — это «половина клетки» и её доли, записанные числом
     при клетке 96u. На клетке 16u они уезжают на две-четыре клетки от своего места:
     арка встаёт поперёк прохода и наглухо его закрывает, притолока висит в стороне.
     hc — половина клетки, fr(u) — доля клетки, заданная в старых 96-х. */
  const hc=S>>1, fr=u=>Math.round(S*u/96);

  let idc=0; const nid=()=>(++idc);
  const wx=cx=>Math.round(cx*S), wy=cy=>Math.round((H-cy)*S), zu=zc=>Math.round(zc*ZS);
  const qz=zc=>Math.round(zu(zc)/STEP)*STEP;
  let zmin=1e9,zmax=-1e9; for(let i=0;i<W*H;i++) if(g[i]){ if(zf[i]<zmin)zmin=zf[i]; if(zf[i]>zmax)zmax=zf[i]; }
  const baseZ=zu(zmin)-64, CEIL=zu(zmax)+(V70.sky?2048:448);   // v70: небо далеко, иначе крышка читается как потолок
  /* ===== МАТЕРИАЛЫ CS2 (Source 2) =====
     Путь пишется как в Asset Browser, но БЕЗ префикса materials/ и БЕЗ .vmat.
     Правило выведено из того, что TOOLS/TOOLSSKYBOX резолвится в materials/tools/toolsskybox.vmat.
     s = юнитов на пиксель: 0.25 = текстура 512px ложится на 128 юнитов. Тайл мелкий -> увеличь s. */
  /* v129. ЗАМЕР ВМЕСТО ПАМЯТИ. Здесь стояло 8 с комментарием «импортёр делит на 64,
     8/64 = 0.125 = нативный дефолт Source 2». Оба числа были неверны, и оба тянулись
     с v57 по памяти, ни разу не проверенные.
     Линейка tools/uvruler.py (десять кубов 128u, у каждого свой скейл) в CS2 дала:
       uscale 4  -> панель показывает 0.2500, на грани 128u два ящика по 64u;
       uscale 8  -> на грани 128u ровно один ящик, то есть период 128u.
     Значит делитель РОВНО 16, а скейл Source 2 — это юниты на тексель.
     Третье подтверждение задним числом: грань 96u из сборки с подгонкой уходила
     со скейлом 24, и панель показала 1.5 = 24/16.
     0.25 — дефолт редактора, при 256-пиксельной текстуре это 4 пикселя на юнит.
     Отсюда UVS=4: раньше стояло 8, то есть вся карта была вдвое крупнее нормы. */
  const UVS=4;
  /* v58.1: таблица MAT удалена. Материал теперь берётся из PAL по ЗОНЕ и РОЛИ
     (см. matOf выше по файлу). Здесь оставлены только UVS и хелперы разбора. */
  const mp=m=>(typeof m==="string")?m:m.p;
  const ms=m=>(typeof m==="string")?UVS:(m.s!==undefined?m.s:UVS);
  const MS=m=>(m&&m.t)?m:{t:m,w:m,b:m};        // набор граней: верх / боковины / низ
  const AX={ux:"1 0 0 0", uy:"0 1 0 0", vy:"0 -1 0 0", vz:"0 0 -1 0"};
  const A=(v,s)=>`[${v}] ${s}`;
  /* ===== v127. ПОДГОН ТЕКСТУРЫ ПОД ГРАНЬ =====
     Формат VMF: "uaxis" "[ux uy uz uoffset] uscale", и тексель считается как
        u = (точка · ось) / uscale + uoffset.
     Отсюда два следствия, на которых стоит вся подгонка:
       период в юнитах = uscale · (текселей в повторе);
       текстура начинается там, где u = 0, то есть в точке (точка·ось) = -uoffset·uscale.
     Опорная точка ЗАМЕРЕНА (см. V127 и tools/uvref.js): при скейле UVS повтор
     занимает V127.unit юнитов, значит текселей в повторе = unit/UVS.
     Чтобы повтор занял ровно P юнитов, нужен скейл UVS·P/unit.
     Чтобы шов сел на край браша c0, нужно смещение -c0/скейл.
     Обе формулы точные, приближения нет.

     Смещение НЕ сворачивается по модулю. Свёртка держала бы числа в файле
     маленькими, но она верна только пока unit угадан правильно; без неё точка
     старта текстуры садится на ребро при ЛЮБОМ размере текстуры, а ошибка в unit
     портит лишь число повторов. Файл текстовый, длинные числа ему не мешают. */
  const AXV={ux:"1 0 0", uy:"0 1 0", vy:"0 -1 0", vz:"0 0 -1"};
  let UVFIT={fit:0, grid:0, stretch:0};              // счётчик для панели приёмки
  function fitAx(vec, c0, L, T, n, s0){
    const grid=()=>{ UVFIT.grid++; return `[${vec} 0] ${s0}`; };
    if(!V127.fit || !(L>0) || !(T>0)) return grid();
    const U=V127.unit>0?V127.unit:32;
    /* Грань короче МИН — это трим, торец, обвязка. Целая картинка ящика,
       натянутая на торец в 8 юнитов, — мазня; он поймал это скриншотом на
       цифрах-плитках. Такая грань уходит на СЕТКУ МИРА: рисунок продолжается
       с куска на кусок, и буква из плиток перестаёт быть мозаикой из
       одинаковых штампов (проверено на tools/uvlab3.py). */
    if(L < (V127.мин||24)) return grid();
    let reps = n|0;
    if(!reps){
      reps = Math.max(1, Math.round(L/T));
      /* Ближайшее целое иногда требует растянуть повтор в полтора раза.
         Порог snap ограничивает перекос: за ним берём соседнее число повторов. */
      const K=Math.max(V127.snap,1.02), k=L/(reps*T);
      if(k>K) reps=Math.max(1,Math.ceil(L/(T*K)));
      else if(k<1/K) reps=Math.max(1,Math.floor(L*K/T));
    }
    const sc = L*UVS/(U*reps);
    const off = -c0/sc;
    UVFIT.fit++;
    const kk=(L/reps)/U; if(kk>4||kk<0.5) UVFIT.stretch++;   // во сколько раз против натурального
    return `[${vec} ${+off.toFixed(4)}] ${+sc.toFixed(6)}`;
  }
  /* Какого размера хочется видеть повтор У ЭТОГО материала: собственный скейл
     материала остаётся смыслом «мельче/крупнее», но влияет только на выбор
     ЧИСЛА повторов, а не на итоговый скейл — иначе подгонка его же и затрёт. */
  const tileOf=mm=>V127.want*ms(mm)/UVS;
  /* Шесть граней осевой коробки одним вызовом. n — принудительное число повторов
     (1 = «текстура ровно по брашу», для ящиков и контейнеров), 0 = автоматически. */
  function uvBox(x0,y0,z0,x1,y1,z1,m,n){
    const q=MS(m), Lx=x1-x0, Ly=y1-y0, Lz=z1-z0;
    return {
      ut:fitAx(AXV.ux, x0, Lx, tileOf(q.t), n, ms(q.t)),
      vt:fitAx(AXV.vy, -y1, Ly, tileOf(q.t), n, ms(q.t)),
      ub:fitAx(AXV.ux, x0, Lx, tileOf(q.b), n, ms(q.b)),
      vb:fitAx(AXV.vy, -y1, Ly, tileOf(q.b), n, ms(q.b)),
      uY:fitAx(AXV.uy,  y0, Ly, tileOf(q.w), n, ms(q.w)),
      uX:fitAx(AXV.ux,  x0, Lx, tileOf(q.w), n, ms(q.w)),
      vw:fitAx(AXV.vz, -z1, Lz, tileOf(q.w), n, ms(q.w)) };
  }
  /* Мировая сетка — прежнее поведение: нулевое смещение, общий скейл. Нужно для
     СПЛОШНЫХ поверхностей: соседние плиты пола нарезаны жадным мешером как попало,
     и если каждой дать свой период, рисунок разъедется на каждом стыке. */
  function uvGrid(m){ const q=MS(m); UVFIT.grid+=7; return {
      ut:A(AX.ux,ms(q.t)), vt:A(AX.vy,ms(q.t)), ub:A(AX.ux,ms(q.b)), vb:A(AX.vy,ms(q.b)),
      uY:A(AX.uy,ms(q.w)), uX:A(AX.ux,ms(q.w)), vw:A(AX.vz,ms(q.w)) }; }
  /* fitN: 0/undefined — сетка мира (М), 'a' — ОДНА картинка на грань (Ф),
     число — столько целых повторов (П).
     'a' раньше значило «сколько влезет». Человек сказал прямо: «один сплошной
     ящик выглядит естественнее, чем несколько», поэтому у предмета всегда одна
     картинка, какого бы он ни был размера. П осталось для длинных поверхностей,
     где картинка обязана повторяться, а швы — сесть на оба конца. */
  const fitReps=fitN=>(!V127.fit||(!fitN&&!V127.all))?null
    :((fitN==='a'||fitN===true)?1:(fitN|0));
  const uvFor=(x0,y0,z0,x1,y1,z1,m,fitN)=>{ const n=fitReps(fitN);
    return n===null ? uvGrid(m) : uvBox(x0,y0,z0,x1,y1,z1,m,n); };
  let ECOL="0 180 220";                       // v58: editor-цвет браша = цвет зоны. Виден в 2D-видах Хаммера.
  const UX="[1 0 0 0] 0.25", UY="[0 1 0 0] 0.25", VY="[0 -1 0 0] 0.25", VZ="[0 0 -1 0] 0.25";
  const S6=(p1,p2,p3,mat,ua,va)=>`\tside\n\t\t{\n\t\t"id" "${nid()}"\n\t\t"plane" "(${p1}) (${p2}) (${p3})"\n\t\t"material" "${mat}"\n\t\t"uaxis" "${ua}"\n\t\t"vaxis" "${va}"\n\t\t"rotation" "0"\n\t\t"lightmapscale" "16"\n\t\t"smoothing_groups" "0"\n\t\t}`;
  /* v112. ВЫРОЖДЕННЫЙ БРАШ. В экспорте нашлось 2723 солида с нулевой толщиной по X:
     все грани в одной плоскости, у части плоскостей две точки из трёх совпадают.
     Для компилятора это невалидная геометрия — карта падала на стадии света,
     без лога. В рабочем файле таких было 0.
     Правило простое и на все времена: коробка с неположительным габаритом хотя бы
     по одной оси не выпускается вообще, а вызов записывается со стеком, чтобы
     виновника было видно, а не искать его по симптомам. */
  /* ============ v115. ВЫЧИТАНИЕ ПЕРЕСЕЧЕНИЙ ============
     Наложенные объёмы (две видимые поверхности в одном месте) я до сих пор чинил
     по одному виновнику: балка, плент, карниз, низ коробки. Эмиттеров восемьдесят
     пять, и после каждой правки находился следующий. Тупиковый путь.
     Теперь общее правило: коробка не пишется в файл сразу, а регистрируется. Перед
     сборкой файла каждая коробка ВЫЧИТАЕТ из себя все, что выпущены РАНЬШЕ неё,
     и распадается на непересекающиеся куски. Порядок выпуска и есть старшинство:
     пол и стены идут первыми, декор последним, значит декор уступает, а не спорит.
     Разрез осевой коробки осевой же коробкой даёт до шести кусков и точен —
     никакого приближения. Если кусков выходит больше предела, коробка выбрасывается
     целиком: значит она почти вся внутри чужого объёма и не нужна. */
  const REG=[];                       // {id,x0,y0,z0,x1,y1,z1,m}
  const ЯДРА=[];                      // {ядро, рама:[...]} — ящик как одно целое
  const ВЫБР={};                      // кого выбросило по пределу кусков, по строке кода
  const ПОГЛ={};                      // кого поглотило целиком, по строке кода
  const РЕЗРАМОЙ=[];                  // кому рама прорезала паз (правило 5.4)
  const РАМЫ=[];                      // рамы ящиков: выпускаются последними, см. v141.1
  const TOK=n=>String.fromCharCode(0)+'B'+n+String.fromCharCode(0);
  function boxAABB(x0,y0,z0,x1,y1,z1,m,fitN){
    if(!(x1>x0 && y1>y0 && z1>z0)){
      const st=(new Error()).stack||''; const at=(st.split('\n')[2]||'?').trim();
      DEGEN.push(`${Math.round(x1-x0)}x${Math.round(y1-y0)}x${Math.round(z1-z0)} @ ${at}`);
      return ''; }
    /* v127. UV считается ЗДЕСЬ, по ЦЕЛОЙ коробке, и дальше только копируется.
       Вычитание режет ящик на куски; если каждому куску подогнать текстуру по его
       собственному габариту, на месте разреза рисунок прыгнет. А оси и смещения
       заданы в мировых координатах, поэтому кусок с ними ложится в общий узор сам. */
    const __rec={x0,y0,z0,x1,y1,z1,m,col:ECOL,uv:uvFor(x0,y0,z0,x1,y1,z1,m,fitN)};
    /* отладка: кто именно выпустил коробку. Включается извне, чтобы не платить
       за построение стека на каждой из тридцати тысяч коробок обычного экспорта. */
    if(typeof window!=='undefined' && window.__TAGBOX){
      const st=((new Error()).stack||'').split('\n');
      __rec.at=(st[3]||st[2]||'').trim().replace(/^.*izohrona_v\d+\.html:/,'стр ').slice(0,20); }
    REG.push(__rec);
    return TOK(REG.length-1);
  }
  /* A минус B для осевых коробок: до шести кусков, точно */
  function subAABB(a,b){
    if(a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0||a.z1<=b.z0||b.z1<=a.z0) return [a];
    const out=[], cp=(x0,y0,z0,x1,y1,z1)=>{ if(x1>x0&&y1>y0&&z1>z0)
      out.push({x0,y0,z0,x1,y1,z1,m:a.m,col:a.col,uv:a.uv}); };
    const mx0=Math.max(a.x0,b.x0), mx1=Math.min(a.x1,b.x1);
    cp(a.x0,a.y0,a.z0, mx0,a.y1,a.z1);                       // слева
    cp(mx1,a.y0,a.z0, a.x1,a.y1,a.z1);                       // справа
    const my0=Math.max(a.y0,b.y0), my1=Math.min(a.y1,b.y1);
    cp(mx0,a.y0,a.z0, mx1,my0,a.z1);                         // спереди
    cp(mx0,my1,a.z0, mx1,a.y1,a.z1);                         // сзади
    const mz0=Math.max(a.z0,b.z0), mz1=Math.min(a.z1,b.z1);
    cp(mx0,my0,a.z0, mx1,my1,mz0);                           // снизу
    cp(mx0,my0,mz1, mx1,my1,a.z1);                           // сверху
    return out;
  }
  function resolveREG(){
    const G=512, grid=new Map();                              // сетка для поиска соседей
    const key=(gx,gy)=>gx*100003+gy;
    const put=(i,b)=>{ for(let gx=Math.floor(b.x0/G);gx<=Math.floor(b.x1/G);gx++)
      for(let gy=Math.floor(b.y0/G);gy<=Math.floor(b.y1/G);gy++){
        const k=key(gx,gy); let L=grid.get(k); if(!L){L=[];grid.set(k,L);} L.push(i); } };
    const MAXP=8;
    const res=new Array(REG.length);
    for(let i=0;i<REG.length;i++){
      const a=REG[i];
      const near=new Set();
      for(let gx=Math.floor(a.x0/G);gx<=Math.floor(a.x1/G);gx++)
        for(let gy=Math.floor(a.y0/G);gy<=Math.floor(a.y1/G);gy++){
          const L=grid.get(key(gx,gy)); if(L) for(const j of L) near.add(j); }
      let parts=[a];
      for(const j of near){
        if(j>=i) continue;
        /* «Паз есть, рамы нет». Рама выпускается ПОЗЖЕ своего ядра, но РАНЬШЕ
           всего, что печатается после этого укрытия. Всё, что она успела
           порезать, останется с пазом даже если саму раму потом снимут.
           Считаем это отдельно — иначе дефект видно только его глазами. */
        if(REG[j].__рама && !a.__рама){
          const b0=REG[j];
          if(!(a.x1<=b0.x0||b0.x1<=a.x0||a.y1<=b0.y0||b0.y1<=a.y0||a.z1<=b0.z0||b0.z1<=a.z0)){
            РЕЗРАМОЙ.push(i); a.__резРамой=(a.__резРамой||0)+1; } }
        const b=REG[j];
        const nxt=[];
        for(const q of parts){ const s=subAABB(q,b); for(const r of s) nxt.push(r); }
        parts=nxt;
        if(!parts.length){                                    // целиком внутри чужого объёма
          if(REG[i].at){ const к=REG[i].at+' <- '+(b.at||'?');
            ПОГЛ[к]=(ПОГЛ[к]||0)+1; }
          REG[i].__ел=(b.at||'?');                            // кто съел — для разбора пропаж
          break; }
        if(parts.length>MAXP){
          /* v140. РЕШАЕТ ОБЪЁМ, А НЕ ЧИСЛО КУСКОВ. Здесь стояло «кусков больше
             восьми — выбросить целиком», с объяснением «значит она почти вся
             внутри чужого объёма». Объяснение неверно: коробка разлетается на
             куски не только когда её съели, но и когда её РЕЖУТ КРАЯ соседних
             плит. Пол нарезан жадным мешером на прямоугольники, и тело, чьи
             грани не совпали с их границами, режется каждой.
             Поймано на ящике с бортами: ядро утоплено на вылет рамы, перестало
             совпадать с сеткой пола — и выбрасывалось. На карте оставались
             голые скелеты: рама есть, ящика внутри нет. Замер: ядер выброшено
             15 из 115 против 2 у прежнего ядра по клетке.
             Теперь смотрим, сколько объёма ОСТАЛОСЬ. Меньше двадцатой части —
             коробку и правда съели, выбрасываем. Иначе держим самые крупные
             куски: дырка в невидимом месте лучше, чем пропавшее тело. */
          const V=q=>(q.x1-q.x0)*(q.y1-q.y0)*(q.z1-q.z0);
          const ост=parts.reduce((s,q)=>s+V(q),0);
          /* Контрфакт по самому правилу: env 'БЕЗ=объём' возвращает старое
             «кусков больше восьми — выбросить». Без него нельзя честно сказать,
             что новая красная строка гейта пришла именно отсюда. */
          if(без('объём') || ост < V(a)*0.05){
            if(REG[i].at) ВЫБР[REG[i].at]=(ВЫБР[REG[i].at]||0)+1;
            REG[i].__ел='предел кусков';
            parts=[]; break; }
          parts.sort((p,q)=>V(q)-V(p)); parts.length=MAXP; }
      }
      res[i]=parts;
      for(const q of parts) put(i,q);                          // в сетку идут уже обрезанные куски
      REG[i].__parts=parts;
    }
    return res;
  }
  function emitAABB(q){ const sid=nid(), qq=MS(q.m);
    const x0=q.x0,y0=q.y0,z0=q.z0,x1=q.x1,y1=q.y1,z1=q.z1;
    const U=q.uv||uvGrid(q.m);
    const ut=U.ut, vt=U.vt, ub=U.ub, vb=U.vb, uY=U.uY, uXw=U.uX, vw=U.vw;
    const s=[ S6(`${x0} ${y1} ${z1}`,`${x1} ${y1} ${z1}`,`${x1} ${y0} ${z1}`,mp(qq.t),ut,vt),
      S6(`${x0} ${y0} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y1} ${z0}`,mp(qq.b),ub,vb),
      S6(`${x0} ${y1} ${z1}`,`${x0} ${y0} ${z1}`,`${x0} ${y0} ${z0}`,mp(qq.w),uY,vw),
      S6(`${x1} ${y1} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y0} ${z1}`,mp(qq.w),uY,vw),
      S6(`${x1} ${y1} ${z1}`,`${x0} ${y1} ${z1}`,`${x0} ${y1} ${z0}`,mp(qq.w),uXw,vw),
      S6(`${x1} ${y0} ${z0}`,`${x0} ${y0} ${z0}`,`${x0} ${y0} ${z1}`,mp(qq.w),uXw,vw)];
    return `\tsolid\n\t{\n\t"id" "${sid}"\n${s.join("\n")}\n\t\teditor { "color" "${q.col}" }\n\t}`; }

  /* v116. ИНСТРУМЕНТАЛЬНЫЕ БРАШИ МИМО ВЫЧИТАНИЯ.
     Клип, триггер и скайбокс выпускаются последними, поэтому вычитание обрезало их
     всей геометрией, выпущенной раньше: player clip рассыпался на лоскуты, а зона
     закладки исчезла совсем. Это не украшение, которое обязано уступать, — это
     невидимые объёмы, и пересекаться с миром для них нормально и обязательно.
     Они не участвуют в вычитании ни как жертва, ни как резак. */
  const __toolPath=x=>(typeof x==='string')?x:((x&&x.p)||'');
  function isTool(m){
    if(!m) return false;
    if(typeof m==='string') return /^tools\//i.test(m);
    if(m.p) return /^tools\//i.test(m.p);
    for(const k of ['t','w','b']) if(m[k] && /^tools\//i.test(__toolPath(m[k]))) return true;
    return false; }
  function box(x0,y0,z0,x1,y1,z1,m,fitN){
    if(BOXREG && !isTool(m)) return boxAABB(x0,y0,z0,x1,y1,z1,m,fitN);
    if(!(x1>x0 && y1>y0 && z1>z0)){
      const st=(new Error()).stack||''; const at=(st.split('\n')[2]||'?').trim();
      DEGEN.push(`${Math.round(x1-x0)}x${Math.round(y1-y0)}x${Math.round(z1-z0)} @ ${at}`);
      return ''; }
    const sid=nid(), q=MS(m);
    const U=isTool(m)?uvGrid(m):uvFor(x0,y0,z0,x1,y1,z1,m,fitN);
    const ut=U.ut, vt=U.vt, ub=U.ub, vb=U.vb, uY=U.uY, uXw=U.uX, vw=U.vw;
    const s=[ S6(`${x0} ${y1} ${z1}`,`${x1} ${y1} ${z1}`,`${x1} ${y0} ${z1}`,mp(q.t),ut,vt),
      S6(`${x0} ${y0} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y1} ${z0}`,mp(q.b),ub,vb),
      S6(`${x0} ${y1} ${z1}`,`${x0} ${y0} ${z1}`,`${x0} ${y0} ${z0}`,mp(q.w),uY,vw),
      S6(`${x1} ${y1} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y0} ${z1}`,mp(q.w),uY,vw),
      S6(`${x1} ${y1} ${z1}`,`${x0} ${y1} ${z1}`,`${x0} ${y1} ${z0}`,mp(q.w),uXw,vw),
      S6(`${x1} ${y0} ${z0}`,`${x0} ${y0} ${z0}`,`${x0} ${y0} ${z1}`,mp(q.w),uXw,vw)];
    return `\tsolid\n\t{\n\t"id" "${sid}"\n${s.join("\n")}\n\t\teditor { "color" "${ECOL}" }\n\t}`; }
  // клин по Y. UV верхней грани идёт ВДОЛЬ СКАТА — иначе проекция сверху растягивает текстуру на 1/cos наклона.
  function wedgeY(x0,y0,z0,x1,y1,ta,tb,m,fitN){ if(ta===tb) return box(x0,y0,z0,x1,y1,ta,m,fitN); const sid=nid(), q=MS(m);
    const dy=y1-y0, dz=tb-ta, Ln=Math.hypot(dy,dz)||1;
    const U=uvFor(x0,y0,z0,x1,y1,Math.max(ta,tb),m,fitN);
    const ut=U.ut, ub=U.ub, vb=U.vb, uY=U.uY, uXw=U.uX, vw=U.vw;
    /* v127. Скат: ось V идёт ВДОЛЬ ската, поэтому и подгонять её надо по ДЛИНЕ ската,
       а не по проекции. c0 — самый дальний конец ската в проекции на эту ось. */
    const sv=`0 ${(-dy/Ln).toFixed(6)} ${(-dz/Ln).toFixed(6)}`;
    const pv=(y,z)=>(-dy*y-dz*z)/Ln, fn=fitReps(fitN);
    const vt=(fn===null)?`[${sv} 0] ${ms(q.t)}`
      :fitAx(sv, Math.min(pv(y0,ta),pv(y1,tb)), Ln, tileOf(q.t), fn, ms(q.t));
    const s=[ S6(`${x0} ${y1} ${tb}`,`${x1} ${y1} ${tb}`,`${x1} ${y0} ${ta}`,mp(q.t),ut,vt),
      S6(`${x0} ${y0} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y1} ${z0}`,mp(q.b),ub,vb),
      S6(`${x0} ${y1} ${tb}`,`${x0} ${y0} ${ta}`,`${x0} ${y0} ${z0}`,mp(q.w),uY,vw),
      S6(`${x1} ${y1} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y0} ${ta}`,mp(q.w),uY,vw),
      S6(`${x1} ${y1} ${tb}`,`${x0} ${y1} ${tb}`,`${x0} ${y1} ${z0}`,mp(q.w),uXw,vw),
      S6(`${x1} ${y0} ${z0}`,`${x0} ${y0} ${z0}`,`${x0} ${y0} ${ta}`,mp(q.w),uXw,vw)];
    return `\tsolid\n\t{\n\t"id" "${sid}"\n${s.join("\n")}\n\t\teditor { "color" "${ECOL}" }\n\t}`; }
  // клин по X. То же самое, скат вдоль X.
  function wedgeX(x0,y0,z0,x1,y1,ta,tb,m,fitN){ if(ta===tb) return box(x0,y0,z0,x1,y1,ta,m,fitN); const sid=nid(), q=MS(m);
    const dx=x1-x0, dz=tb-ta, Ln=Math.hypot(dx,dz)||1;
    const U=uvFor(x0,y0,z0,x1,y1,Math.max(ta,tb),m,fitN);
    const vt=U.vt, ub=U.ub, vb=U.vb, uY=U.uY, uXw=U.uX, vw=U.vw;
    const su=`${(dx/Ln).toFixed(6)} 0 ${(dz/Ln).toFixed(6)}`;
    const pu=(x,z)=>(dx*x+dz*z)/Ln, fn=fitReps(fitN);
    const ut=(fn===null)?`[${su} 0] ${ms(q.t)}`
      :fitAx(su, Math.min(pu(x0,ta),pu(x1,tb)), Ln, tileOf(q.t), fn, ms(q.t));
    const s=[ S6(`${x0} ${y1} ${ta}`,`${x1} ${y1} ${tb}`,`${x1} ${y0} ${tb}`,mp(q.t),ut,vt),
      S6(`${x0} ${y0} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y1} ${z0}`,mp(q.b),ub,vb),
      S6(`${x0} ${y1} ${ta}`,`${x0} ${y0} ${ta}`,`${x0} ${y0} ${z0}`,mp(q.w),uY,vw),
      S6(`${x1} ${y1} ${z0}`,`${x1} ${y0} ${z0}`,`${x1} ${y0} ${tb}`,mp(q.w),uY,vw),
      S6(`${x1} ${y1} ${tb}`,`${x0} ${y1} ${ta}`,`${x0} ${y1} ${z0}`,mp(q.w),uXw,vw),
      S6(`${x1} ${y0} ${z0}`,`${x0} ${y0} ${z0}`,`${x0} ${y0} ${ta}`,mp(q.w),uXw,vw)];
    return `\tsolid\n\t{\n\t"id" "${sid}"\n${s.join("\n")}\n\t\teditor { "color" "${ECOL}" }\n\t}`; }
  function rboxZ(x0,y0,z0,x1,y1,z1,deg,m,fitN){ if(!deg) return box(x0,y0,z0,x1,y1,z1,m,fitN); const sid=nid(), q=MS(m);
    const cx=(x0+x1)/2, cy=(y0+y1)/2, th=deg*Math.PI/180, c=Math.cos(th), sn=Math.sin(th);
    const P=(x,y,z)=>{ const X=cx+(x-cx)*c-(y-cy)*sn, Y=cy+(x-cx)*sn+(y-cy)*c; return `${Math.round(X)} ${Math.round(Y)} ${z}`; };
    /* v127. У повёрнутой коробки грани повёрнуты, а оси UV были мировые: текстура
       ложилась на грань наискось и на стыке двух граней ломалась. Оси теперь
       СОБСТВЕННЫЕ, вдоль рёбер коробки.
       Проекция точки на локальную ось раскладывается на постоянную и локальную
       координату: p·(cos,sin,0) = (cx·cos + cy·sin) + (x - cx). Отсюда c0 сразу. */
    const fn=fitReps(fitN);
    const K1=cx*c+cy*sn, K2=-cx*sn+cy*c;
    const aU=`${c.toFixed(6)} ${sn.toFixed(6)} 0`;          // вдоль локального X
    const aV=`${(-sn).toFixed(6)} ${c.toFixed(6)} 0`;       // вдоль локального Y
    const aVn=`${sn.toFixed(6)} ${(-c).toFixed(6)} 0`;      // против локального Y (верх/низ)
    const Lx=x1-x0, Ly=y1-y0, Lz=z1-z0;
    const F=(vec,c0,L,mm,fb)=>(fn===null)?A(fb,ms(mm)):fitAx(vec,c0,L,tileOf(mm),fn,ms(mm));
    const ut =F(aU,  K1+x0-cx, Lx, q.t, AX.ux);
    const vt =F(aVn,-(K2+y1-cy), Ly, q.t, AX.vy);
    const ub =F(aU,  K1+x0-cx, Lx, q.b, AX.ux);
    const vb =F(aVn,-(K2+y1-cy), Ly, q.b, AX.vy);
    const uY =F(aV,  K2+y0-cy, Ly, q.w, AX.uy);
    const uXw=F(aU,  K1+x0-cx, Lx, q.w, AX.ux);
    const vw =F(AXV.vz, -z1,   Lz, q.w, AX.vz);
    const s=[ S6(P(x0,y1,z1),P(x1,y1,z1),P(x1,y0,z1),mp(q.t),ut,vt), S6(P(x0,y0,z0),P(x1,y0,z0),P(x1,y1,z0),mp(q.b),ub,vb),
      S6(P(x0,y1,z1),P(x0,y0,z1),P(x0,y0,z0),mp(q.w),uY,vw), S6(P(x1,y1,z0),P(x1,y0,z0),P(x1,y0,z1),mp(q.w),uY,vw),
      S6(P(x1,y1,z1),P(x0,y1,z1),P(x0,y1,z0),mp(q.w),uXw,vw), S6(P(x1,y0,z0),P(x0,y0,z0),P(x0,y0,z1),mp(q.w),uXw,vw)];
    return `\tsolid\n\t{\n\t"id" "${sid}"\n${s.join("\n")}\n\t\teditor { "color" "${ECOL}" }\n\t}`; }
  function greedy(mask,maxW,maxH){ const used=new Uint8Array(W*H), R=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x;
      if(mask[i]&&!used[i]){ let w=1; while(x+w<W&&(!maxW||w<maxW)&&mask[y*W+x+w]&&!used[y*W+x+w])w++;
        let h=1,ok=true; while(y+h<H&&(!maxH||h<maxH)&&ok){ for(let xx=x;xx<x+w;xx++) if(!mask[(y+h)*W+xx]||used[(y+h)*W+xx]){ok=false;break;} if(ok)h++; }
        for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)used[yy*W+xx]=1; R.push([x,y,w,h]); } }
    return R; }
  const solids=[]; const DEGEN=[]; cur.__degen=DEGEN; const BOXREG=true;
  let БОРТОВ=0;                       // сколько ящиков получили раму по рёбрам
  /* v136: выключатель отдельного эмиттера для контрфакта, см. tools/oba.py */
  const без=имя=>(typeof window!=='undefined' && typeof window.__БЕЗ==='string'
                  && window.__БЕЗ.split(',').indexOf(имя)>=0);
  /* v58: МАТЕРИАЛ ЗАВИСИТ ОТ ЗОНЫ, а не один на карту.
     Верх плиты — пол зоны, боковины — тримм (тёмный, чтобы перепад высоты читался как обрез).
     Укрытие — контрастный акцент: игрок обязан с одного взгляда понимать, за чем прячется. */
  const Z=cur.zones||(cur.zones=computeZones(cur));
  const ZF=[],ZW=[],ZC=[],ZP=[],ZE=[];
  for(let z=0;z<ZN.length;z++){
    const f={p:matOf(z,'f'),s:UVS}, t={p:matOf(z,'t'),s:UVS}, w={p:matOf(z,'w'),s:UVS}, c={p:matOf(z,'c'),s:UVS}, sp={p:matOf(z,'s'),s:UVS};
    ZF[z]={t:f,w:t,b:t}; ZW[z]={t:w,w:w,b:w}; ZC[z]={t:c,w:c,b:c}; ZP[z]={t:sp,w:t,b:t};
    ZE[z]=ZCOL[z].join(' '); }
  const BULK={t:{p:matOf(3,'w'),s:UVS},w:{p:matOf(3,'w'),s:UVS},b:{p:matOf(3,'w'),s:UVS}};   // внутренние массивы стен: нейтраль мида
  const zAt=i=>{ const v=Z.zid[i]; return v===255?MIDZONE():v; };
  const wzAt=i=>Z.wzid[i];
  // площадка плента (3x3 вокруг точки закладки) получает материал плента — единственное
  // насыщенное пятно в зоне, видно откуда угодно.
  const siteCell=new Uint8Array(W*H);
  for(const k of ['A','B']){ const p=cur.m&&cur.m.pts?cur.m.pts[k]:null; if(!p) continue;
    for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){ const x=p[0]+ox,y=p[1]+oy;
      if(x>0&&x<W-1&&y>0&&y<H-1) siteCell[y*W+x]=1; } }
  /* v58.1: лендмарк на развилке — ВРОВЕНЬ с полом, отдельным куском той же высоты,
     но материалом-ключом. Прежняя плита +8u ходьбу не трогала, но плодила лишний
     уровень высоты на каждую развилку: levels.py показывал 24.6 уровня вместо 17.7.
     Метрика важнее, а вровень читается ровно так же. */
  const lmCell=new Uint8Array(W*H);
  if(LMARK) for(const j of Z.junc){ const i=j.y*W+j.x; if(g[i]&&!siteCell[i]) lmCell[i]=1; }
  const PCLIP="TOOLS/TOOLSPLAYERCLIP";   // v70: держит игрока, пропускает пули и гранаты
  const FLOORMAT=ZF[3], WALLMAT=BULK, COVMAT=ZC[3];   // дефолты для структур, у которых зона не определена
  const plan=cur.plan||(cur.plan=planStructures(cur,TUNP));
  // плато паласов: исключаем из клин-мешера (иначе обрыв размажется в пандус) и кладём плоскими коробками
  const pal=new Uint8Array(W*H);
  if(cur.palaces) for(const p of cur.palaces) for(let y=p.y0;y<=p.y1;y++)for(let x=p.x0;x<=p.x1;x++) pal[y*W+x]=1;
  // ПОЛ v34: плоские террасы -> коробки по уровням (чёткие обрезы + широкие 18u-ступени лестниц).
  // Клинья ТОЛЬКО на рампах паласа/острова (перепад за клетку >18u — коробкой была бы непроходимая ступень),
  // и на лестницах, если включён тумблер «пандусы» (ramps).
  /* ============ v128. НАСТОЯЩАЯ ПОВЕРХНОСТЬ ПОЛА ============
     Пандусы кладутся КЛИНЬЯМИ по концевым отметкам полосы, а всё остальное —
     плоскими коробками по zfield. На клине это два РАЗНЫХ числа: у Т-спавна
     zfield говорил 24, а верх клина в той же точке был 168, и отряд оказывался
     замурован в пандусе на 140 юнитов ниже его поверхности. Тем же промахом
     висели в воздухе ящики и предметы: низ ставился на qz(zf), а под ним склон.
     Замер по экспорту (tools/vise.py): спавнов в теле или без пола 8 из 16,
     тел без опоры 59.
     Лечится не подпорками, а одним общим ответом на вопрос «какая тут высота
     пола НА САМОМ ДЕЛЕ». SURF заполняется тем же кодом, который печатает пол:
     на клине — линейной интерполяцией по его концам, на плоскости — qz(zf),
     на плато паласа — его отметкой. RAMPC помечает клетки, где пол наклонный.
     Дальше спавны и тела спрашивают SURF, а не zfield. */
  const RAMPC=new Uint8Array(W*H), SURF=new Float32Array(W*H); SURF.fill(NaN);
  if(cur.floorPieces && cur.floorPieces.length){
    /* ====== ПОЛ РАВЕН zfield ПО ПОСТРОЕНИЮ ======
       Раньше высота бралась из zA куска. Но куски и zfield разрешают перекрытия
       ПО-РАЗНОМУ: zfield — «последний победил», геометрия — «самый высокий победил».
       Плюс полоса пола коридора берёт ширину в начале отрезка, а прокопка меняет
       ширину по ходу, и полоса накрывает чужие клетки со своей высотой.
       Замер до правки: высоты расходились на 50.4% ходибельных клеток (худшее 288u),
       связность от CT по zf 100%, а по фактическому полу 52% — дейкстра считала
       баланс по одной карте, игрок ходил по другой.
       Теперь наклонные полосы (пандусы) кладутся клиньями как раньше, а ВСЁ остальное —
       плоскими коробками строго по zfield. Совпадение гарантировано, наложений нет. */
    const FP=cur.floorPieces;
    const rampCell=new Uint8Array(W*H);
    /* v132: при plain клиньев нет вовсе — наклонные полосы идут через общий
       мешер по qz(zfield), и rampCell остаётся пустым. */
    if(!V132.plain) for(const p of FP){ if(p.ax==='F') continue;
      for(let y=Math.max(0,p.y0);y<=Math.min(H-1,p.y1);y++)
        for(let x=Math.max(0,p.x0);x<=Math.min(W-1,p.x1);x++) rampCell[y*W+x]=1; }
    if(!V132.plain) for(const p of FP){ if(p.ax==='F') continue;
      const X0=wx(p.x0), X1=wx(p.x1+1), Y0=wy(p.y1+1), Y1=wy(p.y0);
      if(X1-X0<1 || Y1-Y0<1) continue;
      const zi=zAt(((p.y0+p.y1)>>1)*W+((p.x0+p.x1)>>1)); ECOL=ZE[zi];   // v58: пандус наследует зону
      /* Верх клина линеен: у wedgeX ta стоит на X0 и tb на X1, у wedgeY ta на Y0
         и tb на Y1. Значит поверхность в центре клетки берётся ровно так же. */
      if(p.ax==='X'){ const zL=p.rev?p.zB:p.zA, zR=p.rev?p.zA:p.zB;
        const ta=qz(zL), tb=qz(zR);
        solids.push(wedgeX(X0,Y0,baseZ, X1,Y1, ta, tb, ZF[zi]));
        for(let y=Math.max(0,p.y0);y<=Math.min(H-1,p.y1);y++)
          for(let x=Math.max(0,p.x0);x<=Math.min(W-1,p.x1);x++)
            SURF[y*W+x]=ta+(tb-ta)*((wx(x)+hc-X0)/Math.max(1,X1-X0)); }
      else { const zN=p.rev?p.zA:p.zB, zS=p.rev?p.zB:p.zA;
        const ta=qz(zN), tb=qz(zS);
        solids.push(wedgeY(X0,Y0,baseZ, X1,Y1, ta, tb, ZF[zi]));
        for(let y=Math.max(0,p.y0);y<=Math.min(H-1,p.y1);y++)
          for(let x=Math.max(0,p.x0);x<=Math.min(W-1,p.x1);x++)
            SURF[y*W+x]=ta+(tb-ta)*((wy(y+1)+hc-Y0)/Math.max(1,Y1-Y0)); }
    } ECOL="0 180 220";
    for(let i=0;i<W*H;i++) if(rampCell[i]) RAMPC[i]=1;
    /* v58: ключ жадного мешера = уровень + ЗОНА + флаг плента.
       Раньше ключом был только уровень, поэтому одна плита переходила из зоны в зону
       и текстурной границы не было в принципе. Теперь шов браша совпадает с границей области. */
    { const lv={};
      /* v105: плато паласов кладутся своими плитами от базы (ниже по коду), поэтому
         их клетки обязаны выпасть из общего пола. Во второй ветке исключение было,
         здесь — забыли, и над каждым плато лежала вторая плита в том же объёме.
         Это и давало пересечения пола, самые крупные из оставшихся. */
      for(let i=0;i<W*H;i++) if(g[i]&&!rampCell[i]&&!pal[i]){
        /* v114. Было: плита развилки красилась акцентным материалом (sf=2), а пол плента —
           особым (sf=1). В игре это читается как детские опознавательные знаки —
           цветные квадраты на полу. Убрано: пол везде обычный, материал зоны.
           Косяки дверей и лендмарки-габариты остаются, красится только пол. */
        const k=qz(zf[i])+'|'+zAt(i)+'|0'; (lv[k]=lv[k]||new Uint8Array(W*H))[i]=1; }
      for(const k in lv){ const pr=k.split('|'), zt=parseInt(pr[0]), zi=+pr[1], sf=+pr[2];
        ECOL=ZE[zi];
        const km={p:matOf(zi,'k'),s:UVS};
        const mat = sf===2 ? {t:km,w:{p:matOf(zi,'t'),s:UVS},b:{p:matOf(zi,'t'),s:UVS}} : (sf?ZP[zi]:ZF[zi]);
        for(const [x,y,w,h] of greedy(lv[k]))
          solids.push(box(wx(x),wy(y+h),baseZ, wx(x+w),wy(y),zt, mat)); } ECOL="0 180 220"; }
  } else
  { const rmp=cur.rampMask||new Uint8Array(W*H), stm=cur.stairMask||new Uint8Array(W*H);
    const wc=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++) if(g[i]&&!pal[i]&&(rmp[i]||(ramps&&stm[i]))) wc[i]=1;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!wc[i]) continue; const zi=zf[i];
      const zWn=(x>0&&g[i-1])?zf[i-1]:zi, zEn=(x<W-1&&g[i+1])?zf[i+1]:zi;
      const zNn=(y>0&&g[i-W])?zf[i-W]:zi, zSn=(y<H-1&&g[i+W])?zf[i+W]:zi;
      RAMPC[i]=1;
      if(Math.abs(zEn-zWn)>=Math.abs(zNn-zSn)){
        const ta=qz((zWn+zi)/2), tb=qz((zi+zEn)/2);
        solids.push(wedgeX(wx(x),wy(y+1),baseZ, wx(x+1),wy(y), ta, tb, FLOORMAT));
        SURF[i]=(ta+tb)/2;
      } else {
        const ta=qz((zSn+zi)/2), tb=qz((zi+zNn)/2);
        solids.push(wedgeY(wx(x),wy(y+1),baseZ, wx(x+1),wy(y), ta, tb, FLOORMAT));
        SURF[i]=(ta+tb)/2; } }
    const levels={}; for(let i=0;i<W*H;i++) if(g[i]&&!pal[i]&&!wc[i]){ const lv=qz(zf[i]); (levels[lv]=levels[lv]||new Uint8Array(W*H))[i]=1; }
    for(const lv in levels){ const top=parseInt(lv); for(const [x,y,w,h] of greedy(levels[lv]))
      solids.push(box(wx(x),wy(y+h),baseZ, wx(x+w),wy(y),top, FLOORMAT)); } }
  // плато паласов: плоские коробки от базы до topZ, обрыв остаётся резким (дроп-край)
  if(cur.palaces) for(const p of cur.palaces){
    solids.push(box(wx(p.x0),wy(p.y1+1),baseZ, wx(p.x1+1),wy(p.y0),qz(p.topZ), FLOORMAT));
    const tz=qz(p.topZ);
    for(let y=Math.max(0,p.y0);y<=Math.min(H-1,p.y1);y++)
      for(let x=Math.max(0,p.x0);x<=Math.min(W-1,p.x1);x++) SURF[y*W+x]=tz; }
  /* всё, что не клин и не плато, напечатано плоской коробкой строго по zfield */
  for(let i=0;i<W*H;i++) if(g[i] && !(SURF[i]===SURF[i])) SURF[i]=qz(zf[i]||0);
  /* Настоящая отметка пола под прямоугольником клеток. min — потому что предмет
     обязан ОПИРАТЬСЯ: на уступе он врежется в верхнюю ступень, но не повиснет
     над нижней, а висящий в воздухе ящик видно сразу, утопленный — почти нет. */
  const surfMin=(x0,y0,x1,y1)=>{ let m=Infinity;
    for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)
      for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++){
        const i=y*W+x; if(g[i] && SURF[i]<m) m=SURF[i]; }
    return m===Infinity?null:Math.round(m); };
  const rampAny=(x0,y0,x1,y1)=>{
    for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)
      for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++) if(RAMPC[y*W+x]) return true;
    return false; };
  /* Занятость телами: спавн не должен оказаться внутри ящика. Именно так вышло
     у КТ — точка на -128 попала в ящик -144..-112 всеми девятью углами. */
  const OCC=new Uint8Array(W*H);
  const занять=(x0,y0,w,h)=>{ for(let oy=0;oy<h;oy++)for(let ox=0;ox<w;ox++){
    const x=x0+ox, y=y0+oy; if(x>=0&&y>=0&&x<W&&y<H) OCC[y*W+x]=1; } };
  if(cur.cover) for(const c of cur.cover){ const hh=(c.hgt==='full')?999:(c.hgt||40);
    if(hh>18) занять(c.x,c.y,c.w||1,c.h||1); }
  if(cur.lmarks) for(const L of cur.lmarks) занять(L.x,L.y,L.w,L.h);

  /* ====== ЗАПЛАТКА ДЫР ======
     Стены строятся как wm[i]=!g[i], пол — из независимого списка floorPieces.
     Эти два источника нигде не сверялись, поэтому клетка могла оказаться и не стеной,
     и не полом -> сквозная дыра в пустоту (чёрный прямоугольник в Хаммере).
     Здесь ставится инвариант: КАЖДАЯ клетка g накрыта полом. Дыра невозможна по построению. */
  const covered=new Uint8Array(W*H);
  { const mark=(x0,y0,x1,y1)=>{ // мировые координаты -> клетки
      const cx0=Math.max(0,Math.round(Math.min(x0,x1)/S)), cx1=Math.min(W,Math.round(Math.max(x0,x1)/S));
      const cy0=Math.max(0,H-Math.round(Math.max(y0,y1)/S)), cy1=Math.min(H,H-Math.round(Math.min(y0,y1)/S));
      for(let y=cy0;y<cy1;y++)for(let x=cx0;x<cx1;x++) covered[y*W+x]=1; };
    if(cur.floorPieces) for(const p of cur.floorPieces) mark(wx(p.x0),wy(p.y1+1),wx(p.x1+1),wy(p.y0));
    if(cur.palaces)     for(const p of cur.palaces)     mark(wx(p.x0),wy(p.y1+1),wx(p.x1+1),wy(p.y0));
  }
  const patch=new Uint8Array(W*H); let nPatch=0;
  for(let i=0;i<W*H;i++) if(g[i]&&!covered[i]){ patch[i]=1; nPatch++; }
  if(nPatch){ const lv={};
    for(let i=0;i<W*H;i++) if(patch[i]){ const k=qz(zf[i])+'|'+zAt(i); (lv[k]=lv[k]||new Uint8Array(W*H))[i]=1; }
    for(const k in lv){ const pr=k.split('|'), zi=+pr[1]; ECOL=ZE[zi];
      for(const [x,y,w,h] of greedy(lv[k]))
        solids.push(box(wx(x),wy(y+h),baseZ, wx(x+w),wy(y),parseInt(pr[0]), ZF[zi])); } ECOL="0 180 220"; }
  cur.__holesPatched=nPatch;
  cur.__ftopC=null;   // выставляется ниже, когда карта высот пола готова (для диагностики)
  // стены: не-пол -> пол..потолок (включая периметр острова — он emergent из g). VIS-чисто до крышки.
  const wm=new Uint8Array(W*H); for(let i=0;i<W*H;i++) wm[i]= g[i]?0:1;
  /* v119.2. ЛЕЗВИЯ В СТЕНАХ. Стена группируется по «зона + отметка верха» и внутри
     группы склеивается жадно. На мелкой клетке принадлежность стены зоне шумит по
     границам: соседние клетки одной и той же стены попадают в разные группы, склейка
     обрывается, и стена уезжает в файл лоскутами 16x80 высотой под 700 — те самые
     тонкие пластины, торчащие в воздухе.
     Сглаживаем принадлежность по большинству в окне 96u: шов между материалами
     остаётся на границе области (ради этого группировка по зонам и делалась, v58),
     но перестаёт дрожать от клетки к клетке. */
  const wzSm=new Uint8Array(W*H);
  { const R=Math.max(1,Math.round(48/S));
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x;
      if(!wm[i]){ wzSm[i]=255; continue; }
      const cnt={};
      for(let oy=-R;oy<=R;oy++){ const ny=y+oy; if(ny<0||ny>=H) continue;
        for(let ox=-R;ox<=R;ox++){ const nx=x+ox; if(nx<0||nx>=W) continue;
          const j=ny*W+nx; if(!wm[j]) continue;
          const z=Z.wzid[j]; cnt[z]=(cnt[z]||0)+1; } }
      let bz=Z.wzid[i], bc=-1;
      for(const kk in cnt) if(cnt[kk]>bc){ bc=cnt[kk]; bz=+kk; }
      wzSm[i]=bz; } }
  if(!FINEW){
    /* v58: стена берёт материал ЗОНЫ СОСЕДНЕГО ПОЛА. Иначе игрок видит границу области
       только под ногами, а стены на всю карту одинаковые — глаз её не ловит. */
    const hs7=(p,q,c)=>{ let h=((p*374761393)^(q*668265263)^(c*2246822519)^(cur.seed>>>0))>>>0;
      h=Math.imul(h^(h>>>13),1274126177)>>>0; return (h^(h>>>16))>>>0; };
    const isF7=(x,y)=> x>=0&&y>=0&&x<W&&y<H&&!!g[y*W+x];
    const brd=(x,y)=> x<2||y<2||x>=W-2||y>=H-2;
    if(V70.sky){
      /* высота стены: своя на каждый блок 4x4 клетки -> ломаная линия крыш, а не забор */
      /* отсчёт ведём от САМОГО ВЫСОКОГО соседнего пола, а не от отметки под самой стеной:
         иначе у поднятого участка стена окажется ниже гарантии и с него станет видно поверх. */
      /* v121. ОТСЧЁТ ПОЛА — ПО БЛОКУ, А НЕ ПО КЛЕТКЕ.
         Ключ склейки стены — «зона плюс отметка верха», а отметка считалась от
         самого высокого пола в кольце 3x3 вокруг КАЖДОЙ клетки. Пока пол был
         ровным, вдоль длинной стены выходило одно и то же число и стена
         склеивалась в одну коробку. С отметками мест пол вдоль стены гуляет,
         число пересекает границу округления в случайных местах — и стена
         рассыпается на куски по одной-две клетки. Это и есть «узкие торчащие
         стены»: из 943 узких высоких брашей 796 оказались стенами.
         Теперь отсчёт берётся на блок 96u: внутри блока он один, значит стена
         не может дробиться мельче шести клеток. */
      /* v121.1. Блок отсчёта берётся ТОТ ЖЕ, что у разброса высот (384u), а не свой
         96u. Замер снял вопрос: в растре перегородки нормальной толщины — медиана
         96u при 80u у реальных карт, ровно 16u нет вообще. Значит торчащие лезвия
         это не тонкие стены, а куски толстых: ключ склейки менялся каждые 96u,
         на каждой границе жадный мешер отрезал полоску в одну клетку, и она
         торчала над соседкой на ступень округления. Когда отсчёт и разброс идут
         одним блоком, отметка верха постоянна на 384u — стена склеивается в
         длинную коробку, а ломаную линию крыш по-прежнему даёт разброс. */
      const WBLK=Math.max(1,Math.round(384/S));   // блок одинаковой высоты стены — 384 юнита
      const FB=WBLK;
      const bw=Math.ceil(W/FB), bh=Math.ceil(H/FB), blk=new Int32Array(bw*bh).fill(-1e9);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const j=y*W+x; if(!g[j]) continue;
        const b=((y/FB)|0)*bw+((x/FB)|0), v=qz(zf[j]||0); if(v>blk[b]) blk[b]=v; }
      const locF=(x,y)=>{ let m=-1e9;
        /* блок стены и все соседние: стена обязана быть выше самого высокого
           пола, который к ней примыкает, иначе с поднятого места видно поверх */
        for(let by=-1;by<=1;by++)for(let bx=-1;bx<=1;bx++){
          const cx=((x/FB)|0)+bx, cy=((y/FB)|0)+by;
          if(cx<0||cy<0||cx>=bw||cy>=bh) continue;
          const v=blk[cy*bw+cx]; if(v>m) m=v; }
        return m<-1e8 ? qz(zf[y*W+x]||0) : m; };
      const wlf=new Int32Array(W*H), wtop=new Int32Array(W*H);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!wm[i])continue;
        const st=brd(x,y)?V70H.outer:V70H.inner;
        /* v102: блок случайной высоты задавался как x>>2 — «четыре клетки».
           На 96u это 384 юнита, на 16u — 64: стена меняла высоту каждые 64u,
           жадная склейка резала её на лезвия 16x64 высотой под 700, и в игре
           это читалось как пила из треугольников. Блок теперь в ЮНИТАХ. */
        /* v120. Верх стены КВАНТУЕТСЯ по 64u. Ключ склейки — «зона плюс абсолютная
           отметка верха», а отметка считается от самого высокого соседнего пола.
           Пока пол был плоским, у длинной стены верх был один и она склеивалась в
           одну коробку. С отметками мест пол вдоль стены гуляет на десятки юнитов —
           и та же стена рассыпается на полсотни групп по одной клетке, то есть на
           лезвия. Округление до 64u возвращает склейку, а ломаную линию крыш даёт
           не оно, а разброс st по блокам в 384u — он остаётся. */
        wlf[i]=locF(x,y);
        /* v124. Пробовал брать разброс высоты крыши ПО ЗОНЕ, а не по блоку 384u:
           казалось логичнее — у каждой области своя высота застройки. Замер: торчащих
           стен 71 -> 147, вдвое хуже. Границы зон рваные (заливка от центров узлов),
           поэтому отметка начинает меняться по кривой линии вместо прямой линии сетки,
           и зубцов становится больше. Блок остаётся. */
        wtop[i]=Math.round((wlf[i]+st[hs7((x/WBLK)|0,(y/WBLK)|0,11)%st.length])/64)*64; }
      /* v124. ЗУБЕЦ НА ГРАНИЦЕ БЛОКА.
         Отметка верха постоянна внутри блока 384u, поэтому граница между блоками —
         прямая линия, и перепад крыш по ней выглядит нормально. Зуб появляется,
         когда КРАЙ стены попадает на клетку-две внутрь блока: этому огрызку
         достаётся своя отметка, и он торчит на 64..320u при ширине 16u.
         Замер: из 76 торчащих узких стен 50 сидят ровно на границе блока.

         Первая попытка — фильтр по большинству в окне 96u — сделала втрое хуже
         (85 -> 267). Причина понятна задним числом: на ПРЯМОЙ границе блока голоса
         делятся пополам, клетки начинают перебегать туда-сюда, и одна ровная линия
         превращается в гребёнку. Сглаживать надо не большинство, а ЯВНОЕ
         МЕНЬШИНСТВО: клетка меняет отметку, только если своих вокруг неё меньше
         четверти. Тогда прямая граница (половина на половину) остаётся нетронутой,
         а одиночный зуб (одна из двадцати пяти) исчезает.
         Замер на шести картах: торчащих стен 83 -> 71. Немного, но в ту сторону. */
      /* Два признака, и оба нужны. Первый ловит ОДИНОЧНЫЙ зуб: своих вокруг меньше
         четверти. Второй ловит ПОЛОСУ в одну клетку: вдоль неё своих хватает, и по
         первому признаку она проходит, но в кольце 3x3 у неё меньше четырёх своих —
         значит область тоньше двух клеток и в экспорте это лезвие 16u. Два прохода:
         после первого зубцы исчезают, и становятся видны полосы под ними. */
      for(let pass=0; pass<2; pass++){
        const sm=new Int32Array(W*H), R2=Math.max(1,Math.round(32/S));
        let flip=0;
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!wm[i]) continue;
          const cnt={}; let tot=0;
          for(let oy=-R2;oy<=R2;oy++){ const ny=y+oy; if(ny<0||ny>=H) continue;
            for(let ox=-R2;ox<=R2;ox++){ const nx=x+ox; if(nx<0||nx>=W) continue;
              const j=ny*W+nx; if(!wm[j]) continue;
              const v=wtop[j]; cnt[v]=(cnt[v]||0)+1; tot++; } }
          /* Пробовал добавить второй признак — «в кольце 3x3 своих меньше четырёх»,
             чтобы ловить не только одиночный зуб, но и полосу в одну клетку. На шести
             картах: 73 против 71 без него, то есть в пределах разброса. Не оставлен:
             переворот полосы порождает новую полосу на её прежней границе. */
          const своих=cnt[wtop[i]]||0;
          if(tot>=6 && своих/tot<0.25){
            let bv=wtop[i], bc=-1;
            for(const kk in cnt){ if(+kk===wtop[i]) continue;
              if(cnt[kk]>bc){ bc=cnt[kk]; bv=+kk; } }
            if(bc>0){ sm[i]=bv; flip++; } else sm[i]=wtop[i];
          } else sm[i]=wtop[i]; }
        for(let i=0;i<W*H;i++) if(wm[i]) wtop[i]=sm[i];
        if(!flip) break; }
      /* группа = зона + АБСОЛЮТНАЯ отметка верха: иначе слияние смешает разные крыши в одну коробку */
      const wgrp={};
      for(let i=0;i<W*H;i++) if(wm[i]){ const k=wzSm[i]+'|'+wtop[i]; (wgrp[k]=wgrp[k]||new Uint8Array(W*H))[i]=1; }
      const rects=[];
      /* v124. ДИАГНОСТИКА НАРЕЗКИ. Замер показал: маска стен толстая (медиана 192u
         вглубь, клеток толщиной ровно в одну — ноль), а в экспорт уходит 40% брашей
         шириной 16u. Значит режет не геометрия, а ключ склейки. Считаем это прямо
         здесь, чтобы больше не гадать: сколько групп, сколько прямоугольников,
         каких размеров и сколько клеток в самых мелких группах. */
      { const gr=Object.keys(wgrp); let cellsTot=0; const small={};
        for(const k of gr){ let c=0; const m=wgrp[k]; for(let i=0;i<W*H;i++) if(m[i]) c++;
          cellsTot+=c; small[c]=(small[c]||0)+1; }
        cur.__wallDiag={групп:gr.length, клеток:cellsTot, поРазмеру:small}; }
      for(const k in wgrp){ const pr=k.split('|'), zi=+pr[0], top=+pr[1];
        for(const [x,y,w,h] of greedy(wgrp[k])){ let lf=-1e9;
          for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){ const v=wlf[yy*W+xx]; if(v>lf) lf=v; }
          rects.push({x:x,y:y,w:w,h:h,top:top,lf:lf,zi:zi,terr:false,cnp:false}); } }
      /* террасы выбираем ДО эмита: под террасой стена ниже на 64u, иначе настил утонет */
      let nT=0; const used=[];
      if(V70.terrace) for(const r of rects){
        if(nT>=12) break;
        if(brd(r.x,r.y)||brd(r.x+r.w-1,r.y+r.h-1)) continue;          // периметр — задник, не терраса
        /* v119. Порог был в КЛЕТКАХ: «две на две или три в длину». На клетке 96u это
           192x192u — нормальная терраса. На 16u это 32x32u, и террасой становится
           любой огрызок стены: отсюда странные площадки, на которые нельзя залезть.
           Порог переведён в юниты: 192x192 или 288 в длину. */
        if(!((r.w>=cells(192)&&r.h>=cells(192))||r.w>=cells(288)||r.h>=cells(288))) continue;
        if(r.top-64 < r.lf+384) continue;                             // под террасой стена ниже гарантии -> нельзя
        let touch=false;
        for(let y=r.y;y<r.y+r.h&&!touch;y++)for(let x=r.x;x<r.x+r.w&&!touch;x++)
          if(isF7(x-1,y)||isF7(x+1,y)||isF7(x,y-1)||isF7(x,y+1)) touch=true;
        if(!touch) continue;                                          // не видно с игровой части — не нужна
        if(hs7(r.x,r.y,21)%100>=45) continue;
        const apart=cells(480);   // v119: «не кучей» было 5 клеток — 480u на крупной, 80u на мелкой
        if(used.some(p=>Math.abs(p[0]-r.x)<apart&&Math.abs(p[1]-r.y)<apart)) continue;
        r.terr=true; r.cnp=(hs7(r.x,r.y,33)%3===0 && r.w>=cells(192) && r.h>=cells(192));   // навес только над крупной террасой
        used.push([r.x,r.y]); nT++; }
      cur.__terr=nT;
      { let mc=1e9,mt=1e9;                                    // гарантия в числах, а не на слово
        for(const r of rects){ const c=(r.terr?r.top-64:r.top)-r.lf; if(c<mc)mc=c;
          if(r.terr&&r.top-64-r.lf<mt) mt=r.top-64-r.lf; }
        cur.__minClear=mc; cur.__minTerr=(mt>1e8?null:mt); }
      for(const r of rects){ const mat=(r.zi===255)?BULK:ZW[r.zi]; ECOL=(r.zi===255)?"70 80 92":ZE[r.zi];
        solids.push(box(wx(r.x),wy(r.y+r.h),baseZ, wx(r.x+r.w),wy(r.y), r.terr?r.top-64:r.top, mat)); }
      ECOL="0 180 220";
      if(V70.cornice){
        /* Раньше карниз рос на 12u во все стороны. У двух соседних стен одной высоты карнизы
           налезали друг на друга на 24u — два браша в одном объёме, отсюда ребристость.
           Теперь вылет только с той стороны, где за стеной пол. */
        const sf=(r,d)=>{ const n=(d<2)?r.h:r.w;
          for(let k=0;k<n;k++){ const x=(d===0)?r.x-1:(d===1)?r.x+r.w:r.x+k;
            const y=(d<2)?r.y+k:((d===2)?r.y-1:r.y+r.h);
            if(x>=0&&y>=0&&x<W&&y<H&&g[y*W+x]) return 12; } return 0; };
        for(const r of rects){ if(r.terr) continue;
          const ac=(V79.accent&&V79.pal)?{p:matOf(r.zi===255?3:r.zi,'k'),s:UVS}:{p:DARKTRIM,s:UVS};
          solids.push(box(wx(r.x)-sf(r,0), wy(r.y+r.h)-sf(r,3), r.top,
                          wx(r.x+r.w)+sf(r,1), wy(r.y)+sf(r,2), r.top+24, {t:ac,w:ac,b:ac})); } }
      { const dk={p:M_.fWood,s:UVS}, DK={t:dk,w:dk,b:dk};
        const rl={p:M_.wMetal,s:UVS}, RL={t:rl,w:rl,b:rl};
        const cn={p:DARKTRIM,s:UVS}, CN={t:cn,w:cn,b:cn};
        for(const r of rects){ if(!r.terr) continue;
          const X0=wx(r.x),X1=wx(r.x+r.w),Y0=wy(r.y+r.h),Y1=wy(r.y), d=r.top-64, T=8, RH=48;
          solids.push(box(X0,Y0,d, X1,Y1,d+16, DK));                                   // настил
          solids.push(box(X0,Y0,d+16, X1,Y0+T,d+16+RH, RL));                           // перила x4
          solids.push(box(X0,Y1-T,d+16, X1,Y1,d+16+RH, RL));
          solids.push(box(X0,Y0,d+16, X0+T,Y1,d+16+RH, RL));
          solids.push(box(X1-T,Y0,d+16, X1,Y1,d+16+RH, RL));
          const ph=r.cnp?152:72;
          for(const p of [[X0,Y0],[X1-20,Y0],[X0,Y1-20],[X1-20,Y1-20]])
            solids.push(box(p[0],p[1],d+16, p[0]+20,p[1]+20,d+16+ph, RL));              // столбики
          if(r.cnp) solids.push(box(X0-12,Y0-12,d+168, X1+12,Y1+12,d+192, CN)); }       // навес
      }
    } else {
      const wgrp={};
      for(let i=0;i<W*H;i++) if(wm[i]){ const k=String(wzSm[i]); (wgrp[k]=wgrp[k]||new Uint8Array(W*H))[i]=1; }
      for(const k in wgrp){ const zi=+k; const mat=(zi===255)?BULK:ZW[zi]; ECOL=(zi===255)?"70 80 92":ZE[zi];
        for(const [x,y,w,h] of greedy(wgrp[k])) solids.push(box(wx(x),wy(y+h),baseZ, wx(x+w),wy(y),CEIL, mat)); }
      ECOL="0 180 220";
    }
  } else {
    /* ====== ТОНКИЕ СТЕНЫ ======
       Логика, баланс, нав, g — НЕ ТРОГАЮТСЯ. Меняется только то, ГДЕ внутри клетки 96u
       стоит грань стены. Раньше: клетка не-пол = сплошная колонна 96x96 -> проём читается
       как устье тоннеля, а не как дверь. Теперь: перегородка 16-48u, остаток полосы отдан полу.
       Отступ дрожит от сида -> край перестаёт быть идеально прямым на 96u.
       Замер по 7 реальным картам: плотность периметра 0.0111; без этого блока 0.0069. */
    const hsh=(a,b,c)=>{ let h=((a*374761393)^(b*668265263)^(c*2246822519)^(cur.seed>>>0))>>>0;
      h=Math.imul(h^(h>>>13),1274126177)>>>0; return (h^(h>>>16))>>>0; };
    const INS=[16,32,48];
    const isF=(x,y)=> x>=0&&y>=0&&x<W&&y<H&&!!g[y*W+x];
    const bnd=new Uint8Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!wm[i])continue;
      if(isF(x-1,y)||isF(x+1,y)||isF(x,y-1)||isF(x,y+1)) bnd[i]=1; }
    // внутренние массивы стен — как раньше, жадно слитыми коробками (брашей мало)
    const inner=new Uint8Array(W*H); for(let i=0;i<W*H;i++) inner[i]=(wm[i]&&!bnd[i])?1:0;
    if(V66.backdrop){
      /* ЗАДНИК: каждый слитый массив глубоких стен — дом своей высоты.
         Сверху карниз с напуском 8u, у части — башенка. Над всем NODRAW до потолка. */
      const ND={p:M_.NODRAW,s:UVS}, NDM={t:ND,w:ND,b:ND};
      const ROOFH=[256,320,384,448,512,608,704];
      for(const [x,y,w,h] of greedy(inner)){
        const X0=wx(x),Y0=wy(y+h),X1=wx(x+w),Y1=wy(y);
        const hh=hsh(x,y,7), ft=qz(zf[Math.min(H-1,y)*W+Math.min(W-1,x)]||0);
        const top=ft+ROOFH[hh%ROOFH.length];
        const bm=(hh>>>3)%3===0?M_.brickD:((hh>>>3)%3===1?M_.brick:M_.stone4);
        const BM={p:bm,s:UVS}, BMS={t:BM,w:BM,b:BM};
        solids.push(box(X0,Y0,baseZ, X1,Y1, top, BMS));                    // дом
        if(X1-X0>=64&&Y1-Y0>=64)
          solids.push(box(X0-8,Y0-8,top, X1+8,Y1+8, top+16, {t:{p:M_.stone4,s:UVS},w:{p:M_.stone4,s:UVS},b:{p:M_.stone4,s:UVS}})); // карниз
        if((hh>>>6)%4===0 && X1-X0>=96 && Y1-Y0>=96){                        // башенка
          const cx=(X0+X1)>>1, cy=(Y0+Y1)>>1, r=Math.min(64,(X1-X0)>>2);
          solids.push(box(cx-r,cy-r,top+16, cx+r,cy+r, top+16+128+((hh>>>8)%3)*64, BMS)); }
        solids.push(box(X0,Y0,top+16, X1,Y1, CEIL, NDM));                   // невидимая крышка
      }
    } else {
      for(const [x,y,w,h] of greedy(inner)) solids.push(box(wx(x),wy(y+h),baseZ, wx(x+w),wy(y),CEIL, WALLMAT));
    }
    // граничные — по коробке на клетку, с отступом с каждой стороны, где сосед пол
    let nApron=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!bnd[i])continue;
      let iw=isF(x-1,y)?INS[hsh(x,y,1)%3]:0, ie=isF(x+1,y)?INS[hsh(x,y,2)%3]:0;
      let is=isF(x,y+1)?INS[hsh(x,y,3)%3]:0, inn=isF(x,y-1)?INS[hsh(x,y,4)%3]:0;
      // перегородка не тоньше 32u: если пол с обеих сторон, ужимаем отступы
      if(iw+ie>64){ const k=64/(iw+ie); iw=Math.round(iw*k/8)*8; ie=Math.round(ie*k/8)*8; }
      if(is+inn>64){ const k=64/(is+inn); is=Math.round(is*k/8)*8; inn=Math.round(inn*k/8)*8; }
      const X0=wx(x)+iw, X1=wx(x+1)-ie, Y0=wy(y+1)+is, Y1=wy(y)-inn;
      if(X1-X0>=16 && Y1-Y0>=16){
        if(V66.facade){
          const WH=[288,320,352,384,416][hsh(x,y,9)%5];
          const ftw=qz(zf[i]||0), wtop=ftw+WH;
          solids.push(box(X0,Y0,baseZ, X1,Y1, wtop, WALLMAT));
          const ND2={p:M_.NODRAW,s:UVS};
          solids.push(box(X0,Y0,wtop, X1,Y1, CEIL, {t:ND2,w:ND2,b:ND2}));
        } else solids.push(box(X0,Y0,baseZ, X1,Y1,CEIL, WALLMAT)); }
      // фартук пола в отвоёванной полосе, на высоте соседа. БЕЗ него полоса стала бы новой дырой.
      const ap=(ax0,ay0,ax1,ay1,nx,ny)=>{ if(ax1-ax0<8||ay1-ay0<8) return;
        solids.push(box(ax0,ay0,baseZ, ax1,ay1, qz(zf[ny*W+nx]), FLOORMAT)); nApron++; };
      if(iw)  ap(wx(x),       wy(y+1),    wx(x)+iw,   wy(y),      x-1, y);
      if(ie)  ap(wx(x+1)-ie,  wy(y+1),    wx(x+1),    wy(y),      x+1, y);
      if(is)  ap(wx(x)+iw,    wy(y+1),    wx(x+1)-ie, wy(y+1)+is, x,   y+1);
      if(inn) ap(wx(x)+iw,    wy(y)-inn,  wx(x+1)-ie, wy(y),      x,   y-1);
    }
    cur.__aprons=nApron;
  }
  /* v79 СТУПЕНЬКИ. Один уровень zfield = 72u, то есть каждый перепад требовал прыжка.
     Любой стык двух соседних клеток пола с разницей больше шага игрока (18u) и не больше
     stepMax получает клин на всю ширину клетки: уклон 72/96 = 37 градусов, идётся ходьбой. */
  /* v80 СТУПЕНЬКИ БЕЗ МУСОРА. Клин на каждый стык клеток давал пилу из 95 брашей.
     Собираем стыки в СПЛОШНЫЕ ОТРЕЗКИ вдоль перепада и кладём один клин на весь отрезок:
     то же самое ходится, но это склон, а не зубцы, и брашей втрое меньше. */
  /* v83 ПЛЕНТ. Площадка закладки ничем не выделялась. Обводим её бортиком 12u высотой
     в цвет зоны (тот же крашеный бетон, что на карнизах) и ставим четыре угловые тумбы.
     Бортик 12u ниже шага игрока (18u) — через него просто идёшь, геймплей не меняется. */
  if(V83.site){ let nsb=0;
    for(const k of ['A','B']){ const p=cur.m&&cur.m.pts?cur.m.pts[k]:null; if(!p) continue;
      const zi=zAt(p[1]*W+p[0]);
      const ac={p:matOf(zi,'k'),s:UVS}, AC={t:ac,w:ac,b:ac};
      const hs9=(q,w)=>{ let h=((q*73856093)^(w*19349663)^(cur.seed>>>0))>>>0;
        return (Math.imul(h^(h>>>13),1274126177)>>>0)^(h>>>16); };
      const R=2+(hs9(p[0],p[1])%2), ft=qz(zf[p[1]*W+p[0]]);
      for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){
        if(Math.max(Math.abs(ox),Math.abs(oy))!==R) continue;       // только контур
        const corner=(Math.abs(ox)===R&&Math.abs(oy)===R);
        if(!corner && (hs9(p[0]+ox,p[1]+oy)%3)===0) continue;        // рваная линия, а не рамка
        const x=p[0]+ox, y=p[1]+oy; if(x<1||y<1||x>=W-1||y>=H-1||!g[y*W+x]) continue;
        const X0=wx(x),X1=wx(x+1),Y0=wy(y+1),Y1=wy(y), T=14;
        if(ox===-R) solids.push(box(X0,Y0,ft,X0+T,Y1,ft+5,AC));
        if(ox=== R) solids.push(box(X1-T,Y0,ft,X1,Y1,ft+5,AC));
        if(oy=== R) solids.push(box(X0,Y0,ft,X1,Y0+T,ft+5,AC));
        if(oy===-R) solids.push(box(X0,Y1-T,ft,X1,Y1,ft+5,AC));
        if(Math.abs(ox)===R&&Math.abs(oy)===R){                      // угловая тумба
          const cx=(ox<0)?X0:X1-40, cy=(oy>0)?Y0:Y1-40;
          solids.push(box(cx,cy,ft,cx+40,cy+40,ft+56,AC)); }
        nsb++; } }
    cur.__site=nsb; }
  if(V79.steps){ const seg={};
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]) continue;
      const z0=qz(zf[i]);
      for(const d of [[1,0],[0,1]]){ const nx=x+d[0], ny=y+d[1], j=ny*W+nx;
        if(!g[j]) continue; const z1=qz(zf[j]), dz=z1-z0;
        if(Math.abs(dz)<=18 || Math.abs(dz)>V79.stepMax) continue;
        const lo=Math.min(z0,z1), hi=Math.max(z0,z1);
        if(d[0]){ const lx=(dz>0)?x:nx, k='X|'+lx+'|'+lo+'|'+hi+'|'+(dz>0?1:0);
          (seg[k]=seg[k]||{d:'X',f:lx,lo:lo,hi:hi,up:dz>0,v:[]}).v.push(y); }
        else { const ly=(dz>0)?y:ny, k='Y|'+ly+'|'+lo+'|'+hi+'|'+(dz>0?1:0);
          (seg[k]=seg[k]||{d:'Y',f:ly,lo:lo,hi:hi,up:dz>0,v:[]}).v.push(x); } } }
    let ns=0;
    for(const k in seg){ const S2=seg[k]; S2.v.sort((a,b)=>a-b);
      let a=S2.v[0], p=a;
      const flush=(a,b)=>{ ns++;
        /* v136. Фаска лежит В НИЖНЕЙ клетке и поднимается до верхнего уровня, а
           SURF этой клетки говорит нижний. Для спавнов это значило «площадка
           ровная» там, где под ногами скат 56u: коробка игрока входила в камень.
           Гейт ловил это как «спавнов плохих 2», а причина — не спавны, а то,
           что фаска нигде не отмечена. Помечаем её как пандус: RAMPC уже значит
           «сюда ни спавн, ни тело», и печатается фаска именно наклонной. */
        if(S2.d==='X'){ for(let q=a;q<=b;q++){ const j=q*W+S2.f; if(j>=0&&j<W*H) RAMPC[j]=1; } }
        else          { for(let q=a;q<=b;q++){ const j=S2.f*W+q; if(j>=0&&j<W*H) RAMPC[j]=1; } }
        if(S2.d==='X'){ const zi=zAt(((a+b)>>1)*W+S2.f); ECOL=ZE[zi];
          /* v83: было от baseZ — получалась глыба в полный рост, и её бока торчали сквозь
             соседний пол. Теперь клин лежит НА полу, утопленный на 8u: пересечение спрятано
             внутри половой коробки, наружу выходит только сам скат. */
          solids.push(wedgeX(wx(S2.f),wy(b+1),S2.lo-8, wx(S2.f+1),wy(a),
                             S2.up?S2.lo:S2.hi, S2.up?S2.hi:S2.lo, ZF[zi])); }
        else { const zi=zAt(S2.f*W+((a+b)>>1)); ECOL=ZE[zi];
          solids.push(wedgeY(wx(a),wy(S2.f+1),S2.lo-8, wx(b+1),wy(S2.f),
                             S2.up?S2.hi:S2.lo, S2.up?S2.lo:S2.hi, ZF[zi])); } };
      /* v86: одиночный стык в одну клетку давал тонкий клин-щепку. Такие пропускаем,
         клин ставим только на сплошную сторону от minRun клеток и длиннее. */
      /* v124. Порог был V79.minRun=1 — «одна КЛЕТКА». На 96u это 96 юнитов, то есть
         фаска строилась только на приличном шве. На 16u это шестнадцать юнитов, и
         косой шов высот рассыпается на одиночные клетки, каждая получает свой клин
         16x16 — та самая зубчатая пиксельная лестница из наклонных плиток.
         Собственный комментарий рядом («одиночный стык в одну клетку давал тонкую
         щепку, такие пропускаем») всё это время не работал. Порог в юнитах. */
      const MRU=Math.max(1,Math.round(96/S));
      const fl2r=(a,b)=>{ if(b-a+1>=MRU) flush(a,b); };
      for(let n=1;n<S2.v.length;n++){ if(S2.v[n]===p+1){ p=S2.v[n]; continue; }
        fl2r(a,p); a=p=S2.v[n]; }
      fl2r(a,p); }
    ECOL="0 180 220"; cur.__steps=ns; }
  /* v81 ЛЕСТНИЦА. Ставится только на обрыв выше stepMax — то есть туда, где склон не строился
     и запрыгнуть нельзя. Проверяем, что рядом нет тела, с которого можно залезть:
     высота ближайшего укрытия плюс 64 должна быть меньше обрыва. 1-2 на карту, врозь. */
  /* v89 УГЛОВАЯ ЛЕСЕНКА. Перепад выше 96u склона не получал и оставался обрывом.
     Вместо длинного пандуса кладём в нижнюю клетку 1-2 прямоугольные площадки уступами
     к стене: шаг выходит меньше 64u, значит поднимаешься сам, а брашей два, а не двадцать. */
  /* v105. Глубина ступени считалась как доля от 96 — то есть «доля клетки», пока клетка
     была 96u. На клетке 16u ступень уходит до 96u вперёд, это шесть клеток, и ложится
     от базы прямо поверх соседнего пола: два тела в одном объёме. Самые крупные
     из оставшихся пересечений — именно эти полосы.
     Пока фигура не переписана в юнитах, на мелкой клетке её не строим: перепад
     здесь и так берут пандусы, они снова включены. */
  if(V79.steps && S>=96){ let nst=0;
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]) continue;
      const z0=qz(zf[i]);
      for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1],j=ny*W+nx;
        if(!g[j]) continue; const dz=qz(zf[j])-z0;
        if(dz<=V79.stepMax || dz>320) continue;
        const n=Math.ceil(dz/56); if(n<2) continue;
        const zi=zAt(i); ECOL=ZE[zi];
        const X0=wx(x),X1=wx(x+1),Y0=wy(y+1),Y1=wy(y);
        for(let k=1;k<n;k++){ const dep=Math.round(96*(n-k)/n), zz=z0+Math.round(dz*k/n);
          if(dep<24) continue;
          if(d[0]>0)      solids.push(box(X1-dep,Y0,baseZ, X1,Y1,zz, ZF[zi]));
          else if(d[0]<0) solids.push(box(X0,Y0,baseZ, X0+dep,Y1,zz, ZF[zi]));
          else if(d[1]>0) solids.push(box(X0,Y0,baseZ, X1,Y0+dep,zz, ZF[zi]));
          else            solids.push(box(X0,Y1-dep,baseZ, X1,Y1,zz, ZF[zi]));
          nst++; } } }
    ECOL="0 180 220"; cur.__corner=nst; }
  if(V81.ladder){ const LAD="TOOLS/TOOLSINVISIBLELADDER"; const cand=[];
    /* v87 ЛОВУШКИ. Связность карты ненаправленная только на бумаге: вниз можно спрыгнуть
       откуда угодно, вверх — не выше 64u. Считаем два обхода от Т-спавна: куда МОЖНО дойти
       и откуда МОЖНО вернуться. Разница — места, куда спрыгнул и не выбрался.
       Лестницы ставим ровно туда, а не в случайные уступы. */
    const CL=64;
    const wave=(rev)=>{ const S=new Uint8Array(W*H); const st=cur.px&&cur.px.T; if(!st) return S;
      /* v136.2. Было `if(!g[s0]) return S` — если в самой клетке спавна пола нет
         (а он там бывает не в клетке, а рядом), волна возвращала пустую маску.
         Тогда И F, И Bk пусты, и мера «отрезано» показывала ВЕСЬ пол карты:
         34784 клетки вместо двухсот. Ищем ближайшую клетку с полом. */
      let s0=-1;
      for(let r=0;r<=6&&s0<0;r++)for(let oy=-r;oy<=r&&s0<0;oy++)for(let ox=-r;ox<=r;ox++){
        const x=st.x+ox, y=st.y+oy; if(x<0||y<0||x>=W||y>=H) continue;
        if(g[y*W+x]){ s0=y*W+x; break; } }
      if(s0<0) return S;
      const q=[s0]; S[s0]=1;
      for(let h=0;h<q.length;h++){ const i=q[h],x=i%W,y=(i/W)|0, zi=qz(zf[i]);
        for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1];
          if(nx<0||nx>=W||ny<0||ny>=H) continue; const j=ny*W+nx; if(!g[j]||S[j]) continue;
          const zj=qz(zf[j]);
          if(rev ? (zi-zj)<=CL : (zj-zi)<=CL){ S[j]=1; q.push(j); } } }
      return S; };
    const F=wave(false), Bk=wave(true);
    const trap=new Uint8Array(W*H); let nt=0;
    for(let i=0;i<W*H;i++) if(g[i]&&F[i]&&!Bk[i]){ trap[i]=1; nt++; }
    cur.__trap=nt;
    /* ============ v136. ОСТРОВ — ЗЕРКАЛО ЛОВУШКИ ============
       Ловушка — «зашёл и не вылез» (F и не Bk). Всё это время не мерилось
       обратное: «вылезти можно, зайти нельзя» (Bk и не F) — площадка выше на
       столько, что подняться нельзя, а спрыгнуть можно. Для замера крюка это
       ХУЖЕ ловушки: место на острове недостижимо ни от кого, и приёмка честно
       пишет «пути нет».
       Так на одной из карт гейта плент A вместе с A Short и Pillar оказался на
       плато 296u без единого подъёма: 1746 ходибельных клеток, три каллаута,
       войти только падением сверху. Растр генератора этого не видел вовсе —
       у него не было такой меры, а его собственный крюк идёт волной ОТ места,
       то есть с острова вниз дорога находится и пара считается связанной.
       Лестницы до сих пор ставились только в ловушки; теперь и на острова. */
    const остров=new Uint8Array(W*H); let no=0, nc=0;
    for(let i=0;i<W*H;i++) if(g[i]){
      if(Bk[i]&&!F[i]){ остров[i]=1; no++; }
      else if(!Bk[i]&&!F[i]) nc++; }
    cur.__island=no; cur.__cut=nc;
    /* ============ v136. ШИРИНА ИГРОКА В СВЯЗНОСТИ ============
       Волна выше ходит ПО КЛЕТКАМ. Игрок шириной 32u занимает блок 2x2, и
       коридор в одну клетку (16u) для него стены, а для волны — дорога.
       Замер ниже считает разницу двух волн из одной точки: по клеткам и по
       блокам 2x2. Всё, что достижимо первой и недостижимо второй, — проход,
       который есть в растре и которого нет в игре. */
    const D8у=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const узлО=new Uint8Array(W*H);
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){ const i=y*W+x;
      if(g[i]&&g[i+1]&&g[i+W]&&g[i+W+1]) узлО[i]=1; }
    const zУ=i=>Math.max(qz(zf[i]),qz(zf[i+1]),qz(zf[i+W]),qz(zf[i+W+1]));
    const волнаУ=(лимит)=>{ const S=new Uint8Array(W*H); const st=cur.px&&cur.px.T; if(!st) return S;
      let s0=-1;
      for(let r=0;r<=4&&s0<0;r++)for(let oy=-r;oy<=r&&s0<0;oy++)for(let ox=-r;ox<=r;ox++){
        const x=st.x+ox,y=st.y+oy; if(x<0||y<0||x>=W-1||y>=H-1) continue;
        if(узлО[y*W+x]){ s0=y*W+x; break; } }
      if(s0<0) return S;
      const q=[s0]; S[s0]=1;
      for(let h=0;h<q.length;h++){ const i=q[h],x=i%W,y=(i/W)|0, zi=zУ(i);
        for(const d of D8у){ const nx=x+d[0],ny=y+d[1];
          if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
          const j=ny*W+nx; if(!узлО[j]||S[j]) continue;
          if(zУ(j)-zi<=лимит){ S[j]=1; q.push(j); } } }
      return S; };
    { const U2=волнаУ(CL); let узк=0, всегоУ=0;
      for(let i=0;i<W*H;i++){ if(!узлО[i]) continue; всегоУ++;
        if(!U2[i] && F[i]) узк++; }
      /* ============ v136. ПРЕДЕЛ ПОДЪЁМА 64 ПРОТИВ 59 ============
         CL=64 живёт в этом файле с v81 и ни разу не проверялся. Игрок в CS
         поднимается шагом на 18u и прыжком примерно на 54..58u; 64 он не берёт.
         Ступени же квантованы по 16u, поэтому подступенок бывает ровно 64 —
         в растре он проходим, в игре нет, и целый кусок карты (плент A вместе
         с A Short) оказывается доступен только сверху вниз. Приёмка честно
         пишет «пути нет», генератор честно пишет «крюк x1.1», и оба правы
         каждый в своей мере — расходится сама модель.
         Считаем цену: сколько узлов держится ТОЛЬКО на подъёмах 60..64u. */
      const U59=волнаУ(59); let край=0;
      for(let i=0;i<W*H;i++) if(узлО[i] && U2[i] && !U59[i]) край++;
      cur.__uzk={потеряно:узк, узлов:всегоУ, наПределе:край,
                 доля:+(100*узк/Math.max(1,всегоУ)).toFixed(1),
                 доляПредел:+(100*край/Math.max(1,всегоУ)).toFixed(1)}; }
    const covH=new Int16Array(W*H);
    if(cur.cover) for(const c of cur.cover){ const hh=(c.hgt==='full')?999:(c.hgt||40);
      for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
        const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) covH[Y*W+X]=Math.max(covH[Y*W+X],hh); } }
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){ const i=y*W+x; if(!g[i]) continue;
      const z0=qz(zf[i]);
      for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+d[0],ny=y+d[1],j=ny*W+nx;
        if(!g[j]) continue; const dz=qz(zf[j])-z0;
        if(dz<=64) continue;                                 // до 64u игрок залезает сам
        /* v136: снизу ловушка (не вылезти) ИЛИ сверху остров (не зайти) — оба
           случая лечит один и тот же подъём в этом самом месте */
        if(!trap[i] && !остров[j]) continue;
        /* v84: раньше проверялись все тела в радиусе 2 — любой ящик 144u ронял условие.
           Смотрим только вплотную к обрыву (радиус 1) и только с НИЗКОЙ стороны: залезть
           можно лишь с того, что стоит рядом с самим уступом. */
        let ok=true;
        for(let oy=-1;oy<=1&&ok;oy++)for(let ox=-1;ox<=1;ox++){
          const X=x+ox,Y=y+oy; if(X<0||Y<0||X>=W||Y>=H||!g[Y*W+X]) continue;
          if(qz(zf[Y*W+X])>z0+8) continue;                 // это уже верх, не считаем
          if(covH[Y*W+X]+64>=dz){ ok=false; break; } }
        let wall=false;                       // уступ должен быть частью структуры, иначе торчит сам по себе
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
          const X=nx+ox,Y=ny+oy; if(X<0||Y<0||X>=W||Y>=H||!g[Y*W+X]) wall=true; }
        if(ok&&wall) cand.push([x,y,nx,ny,z0,z0+dz]); } }
    let nl=0; const used=[];
    for(const c of cand){ if(nl>=V81.ladderMax) break;
      const farApart=cells(768);   // v119: «врозь» было 8 клеток — 768u на крупной, 128u на мелкой
      if(used.some(p=>Math.abs(p[0]-c[0])<farApart&&Math.abs(p[1]-c[1])<farApart)) continue;
      const [x,y,nx,ny,zlo,zhi]=c;
      const X0=wx(x),X1=wx(x+1),Y0=wy(y+1),Y1=wy(y);
      const dx=nx-x, dy=ny-y;
      /* лесенка из мелких брашей для вида + сплошной невидимый браш-лестница на всю высоту */
      /* v85: перекладины — обычные твёрдые браши, игрок об них цепляется. Выносим на 12u
         вместо 24, толщина 8 вместо 16, без ступенчатого сдвига наружу.
         Браш-лестница НЕ доводится до верхней кромки (кончается на 8u ниже): иначе игрок
         долезает и продолжает висеть на лестнице вместо того, чтобы шагнуть на уступ. */
      const st=Math.max(2,Math.floor((zhi-zlo)/32));
      const sm={p:MZ.aztec('plywood_plain'),s:UVS}, SM2={t:sm,w:sm,b:sm};
      const RD=12, RT=8, LTOP=zhi-8;
      /* v136. Ширина лестницы задавалась отступами внутрь клетки: Y0+28..Y1-28 и
         X0+16..X1-16. При клетке 96u это давало перекладину 40u и косоур 64u, при
         клетке 16u — коробку ОТРИЦАТЕЛЬНОЙ ширины (-40 и -16), то есть три-четыре
         вырожденных браша на карту и лестницу, которой нет. Тот же класс ошибки,
         что и с арками в v113: константа в юнитах, привязанная к старой клетке.
         Ширина лестницы — величина сама по себе (48u, чуть шире игрока), и мерить
         её надо от середины клетки, а не отступами от краёв. */
      const ЛПОЛ=24, cxm=(X0+X1)>>1, cym=(Y0+Y1)>>1;
      for(let k=1;k<=st;k++){ const zz=zlo+(zhi-zlo)*k/(st+1);
        if(zz+RT>LTOP) break;
        if(dx){ const bx=(dx>0)?X1-RD:X0; solids.push(box(bx,cym-ЛПОЛ,zz, bx+RD,cym+ЛПОЛ,zz+RT, SM2)); }
        else  { const by=(dy>0)?Y0:Y1-RD; solids.push(box(cxm-ЛПОЛ,by,zz, cxm+ЛПОЛ,by+RD,zz+RT, SM2)); } }
      if(dx){ const bx=(dx>0)?X1-16:X0; solids.push(box(bx,cym-ЛПОЛ,zlo, bx+16,cym+ЛПОЛ,LTOP, LAD)); }
      else  { const by=(dy>0)?Y0:Y1-16; solids.push(box(cxm-ЛПОЛ,by,zlo, cxm+ЛПОЛ,by+16,LTOP, LAD)); }
      used.push([x,y]); nl++; }
    cur.__lad=nl; }
  if(V70.sky&&V72.clipLid){
    /* Потолок идёт не плоско, а СЛЕДУЕТ ЗА ПОЛОМ: карта перепадает на ~256u, плоская крышка
       либо резала бы палубу в верхней части, либо пропускала бы крышу в нижней.
       Плита толстая (256u), чтобы соседние уровни перекрывались и не оставляли щели. */
    const lv={};
    for(let i=0;i<W*H;i++){ const z=qz(zf[i]||0); (lv[z]=lv[z]||new Uint8Array(W*H))[i]=1; }
    let nlid=0;
    for(const k in lv){ const z=+k;
      for(const [x,y,w,h] of greedy(lv[k])){
        solids.push(box(wx(x),wy(y+h),z+V72.clipH, wx(x+w),wy(y),z+V72.clipH+V72.clipT, PCLIP)); nlid++; } }
    cur.__lid=nlid;
  }
  if(V70.sky){
    /* Карта больше не запечатана стенами -> нужна оболочка. Между картой и оболочкой —
       пояс домов: именно он виден поверх стен и убирает ощущение коробки. */
    const SKY="TOOLS/TOOLSSKYBOX", PAD=1536, SW=256;
    const SX0=wx(0)-PAD, SX1=wx(W)+PAD, SY0=wy(H)-PAD, SY1=wy(0)+PAD, gz=zu(zmin);
    if(V70.city){
      const pal=[M_.wBrick,M_.wRough,M_.wSand,M_.wWhite,M_.wPale];
      const h8=(p,q)=>{ let h=((p*2654435761)^(q*40503)^(cur.seed>>>0))>>>0;
        h=Math.imul(h^(h>>>13),1274126177)>>>0; return (h^(h>>>16))>>>0; };
      /* v104. Дом на две клетки решётки был шириной 696 при шаге 384 — то есть влезал
         в соседа на 312 юнитов. Соседей у каждого до трёх, отсюда сотни наложенных
         объёмов на фоне: две стены в одном месте, обе видимы, текстуры дерутся.
         Теперь решётка занятости: двухклеточный дом ставится только если все четыре
         клетки свободны, и они помечаются занятыми. Наложений по построению нет. */
      const st=384; let nc=0;
      const gnx=Math.max(1,Math.ceil((SX1-st-SX0)/st)+1), gny=Math.max(1,Math.ceil((SY1-st-SY0)/st)+1);
      const taken=new Uint8Array(gnx*gny+gny+2);
      for(let X=SX0,gx=0; X<SX1-st; X+=st,gx++) for(let Y=SY0,gy=0; Y<SY1-st; Y+=st,gy++){
        const cid=gx*gny+gy;
        if(taken[cid]) continue;
        if(X+st>wx(0)-64 && X<wx(W)+64 && Y+st>wy(H)-64 && Y<wy(0)+64) continue;   // не залезать на карту
        const hh=h8(X,Y); if(hh%100>=52) continue;
        /* пропорция: было 192x1568 — спички. Дом занимает 1-2 клетки решётки и ниже ростом. */
        let span=1+((hh>>>21)%2);
        if(span===2 && (gx+1>=gnx || gy+1>=gny ||
            taken[cid+1] || taken[cid+gny] || taken[cid+gny+1] ||
            (X+2*st>wx(0)-64 && X<wx(W)+64 && Y+2*st>wy(H)-64 && Y<wy(0)+64))) span=1;
        taken[cid]=1;
        if(span===2){ taken[cid+1]=1; taken[cid+gny]=1; taken[cid+gny+1]=1; }
        const hg=384+((hh>>>7)%5)*128, wd=span*st-72;
        const mm={p:pal[(hh>>>11)%pal.length],s:UVS};
        solids.push(box(X,Y,baseZ, X+wd,Y+wd, gz+hg, {t:mm,w:mm,b:mm}));
        if((hh>>>17)%4===0) solids.push(box(X-12,Y-12,gz+hg, X+wd+12,Y+wd+12, gz+hg+24, {t:mm,w:mm,b:mm}));
        nc++; }
      cur.__city=nc; }
    /* v104. Стены оболочки шли от baseZ-96 до CEIL+SW, а крышка и днище накрывали
       весь прямоугольник целиком — то есть перекрывали стены на 256u по всему
       периметру. Два тела в одном объёме, две текстуры дерутся за показ.
       На замере это давало 97% всего объёма пересечений в карте.
       Теперь стены стоят строго между днищем и крышкой: тела касаются гранями,
       но не входят друг в друга. */
    const SZ0=baseZ-64, SZ1=CEIL;
    solids.push(box(SX0-SW,SY0-SW,SZ0, SX1+SW,SY0,SZ1, SKY));
    solids.push(box(SX0-SW,SY1,SZ0, SX1+SW,SY1+SW,SZ1, SKY));
    solids.push(box(SX0-SW,SY0,SZ0, SX0,SY1,SZ1, SKY));
    solids.push(box(SX1,SY0,SZ0, SX1+SW,SY1,SZ1, SKY));
    solids.push(box(SX0-SW,SY0-SW,SZ1, SX1+SW,SY1+SW,SZ1+SW, SKY));
    solids.push(box(SX0-SW,SY0-SW,SZ0-32, SX1+SW,SY1+SW,SZ0, SKY));
  } else solids.push(box(0,wy(H),CEIL, wx(W),wy(0),CEIL+16, "TOOLS/TOOLSSKYBOX"));
  /* ====== КАРТА ВЫСОТ ПОЛА ======
     Крыши раньше считались от уровня узла или от g-клеток. И то и другое врало:
     нашлось здание, у которого НИ ОДНОЙ клетки с g, — расчёт падал на уровень узла,
     а пол под зданием при этом лежал на 160u выше. Просвет выходил 32u при росте 72u.
     Здесь собирается фактическая высота пола из ВСЕХ источников. Палубы добавляются
     позже (они строятся ниже по коду), поэтому карта достраивается в два приёма. */
  const ftopC=new Float64Array(W*H); ftopC.fill(-1e9);
  const noteF=(x0,y0,x1,y1,top)=>{ for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)
    for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++){ const i=y*W+x; if(top>ftopC[i]) ftopC[i]=top; } };
  for(let i=0;i<W*H;i++) if(g[i]) ftopC[i]=qz(zf[i]);
  // плоский пол теперь равен zfield, поэтому в карту высот его уже внесли выше.
  // добавляем только клинья-пандусы: их верх на конце может быть выше zf клетки.
  if(cur.floorPieces) for(const p of cur.floorPieces){ if(p.ax==='F') continue;
    noteF(p.x0,p.y0,p.x1,p.y1, qz(Math.max(p.zA, p.zB===undefined?p.zA:p.zB))); }
  if(cur.palaces) for(const p of cur.palaces) noteF(p.x0,p.y0,p.x1,p.y1, qz(p.topZ));
  const deckTops=[];   // заполняется при постройке палуб, учитывается при расчёте крыш

  // предварительные высоты крыш — нужны только чтобы подрезать укрытия под крышей
  const roofOf=(x0,y0,x1,y1,add,fallback)=>{ let mx=-1e9;
    for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)
      for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++){ const v=ftopC[y*W+x]; if(v>mx) mx=v; }
    return (mx<-1e8?fallback:mx)+add; };
  const rzCell=new Float64Array(W*H); rzCell.fill(Infinity);
  for(const cells of plan.tunComps){ let mx=-1e9;
    for(const c of cells){ const v=ftopC[c]; if(v>mx) mx=v; }
    const rz=(mx<-1e8?0:mx)+TUNH;
    for(const c of cells) if(rz<rzCell[c]) rzCell[c]=rz; }
  for(const bR of plan.builds){ const rz=roofOf(bR.x0,bR.y0,bR.x1-1,bR.y1-1,bR.roofH,qz(bR.z));
    for(let y=bR.y0;y<bR.y1;y++)for(let x=bR.x0;x<bR.x1;x++){ const i=y*W+x; if(rz<rzCell[i]) rzCell[i]=rz; } }

  // укрытия по типам: стены (112u / до потолка) и ящики (40/64u); -16 садит низ в пол при клиньях
  /* Контрфакт по телам: window.__БЕЗ='тела'. DET.cover — это НЕ они: тот пас только
     снимает тела, запершие проход, и на карте, где снимать нечего, выключение
     пасa не меняет ни одного числа. Я уже один раз принял такой ноль за ответ. */
  /* Сторожевая мерка к правилу 5.5: сколько пар тел укрытий пересекаются ещё
     В СПИСКЕ, до всякой печати. Было 28..46 на карту, стало 0; если снова
     полезет — виновата расстановка, а не вычитание и не рама. */
  { const c=cur.cover||[]; let н=0;
    for(let i=0;i<c.length;i++) for(let j=0;j<i;j++){
      const a=c[i], b=c[j];
      if(Math.min(a.x+(a.w||1),b.x+(b.w||1))>Math.max(a.x,b.x) &&
         Math.min(a.y+(a.h||1),b.y+(b.h||1))>Math.max(a.y,b.y)) н++; }
    cur.__нахлёст=н; }
  const ТЕЛА=[]; let ВЛОЖ=0;          // уже напечатанные тела укрытий, для проверки вложенности
  if(cur.cover && !без('тела')) for(const c of cur.cover){ const i=c.y*W+c.x;
    /* v128. Было qz(zf) по УГЛОВОЙ клетке тела. На клине это не та высота, а на
       уступе низ садился по одной клетке из четырёх — отсюда 59 тел без опоры
       в замере. Теперь опора берётся по всему следу и по НАСТОЯЩЕЙ поверхности. */
    const ft=surfMin(c.x,c.y,c.x+(c.w||1)-1,c.y+(c.h||1)-1);
    if(ft===null) continue;
    /* v70: 'full' раньше значило «до потолка», а потолок был низкий (+448). После подъёма
       неба это стало башней в 2000u с текстурой ящика. Теперь это перегородка ростом со стену. */
    let top = c.hgt==='full' ? (V70.sky ? ft+384 : CEIL) : ft+(c.hgt||40);
    const cap = rzCell[i]===Infinity ? Infinity : rzCell[i]-8;
    top=Math.min(top,cap); if(top<=ft+8) continue;
    /* v104. В v103 я врезал укрытие в стену на 8u, решив, что мерцают совпадающие
       плоскости. Неверно: две грани спина к спине смотрят в разные стороны и не
       спорят. Мерцают ровно наложенные ОБЪЁМЫ — две поверхности в одном месте,
       обе видимы. То есть врезка не лечила, а добавляла болезнь. Отменено:
       укрытие встаёт ровно по своей клетке, край в край со стеной. */
    const EMB=0, cw0=(c.w||1), ch0=(c.h||1);
    const blk=(xx,yy)=>!(xx>=0&&yy>=0&&xx<W&&yy<H&&g[yy*W+xx]);
    let eW=0,eE=0,eN=0,eS=0;
    for(let k=0;k<ch0;k++){ if(blk(c.x-1,c.y+k)) eW=EMB; if(blk(c.x+cw0,c.y+k)) eE=EMB; }
    for(let k=0;k<cw0;k++){ if(blk(c.x+k,c.y-1)) eN=EMB; if(blk(c.x+k,c.y+ch0)) eS=EMB; }
    const X0=wx(c.x)-eW, Y0=wy(c.y+ch0)-eS, X1=wx(c.x+cw0)+eE, Y1=wy(c.y)+eN;
    const zi=zAt(i); ECOL=ZE[zi];
    const cmat=(V70.sky&&c.hgt==='full')?(ZW[zi]||BULK):ZC[zi];
    /* v71: rboxZ крутил коробку вокруг центра, а границы брались по клетке -> повёрнутое тело
       вылезало наружу (при 45 град у 3-клеточного забора до 88u) и лезло в проход, которого
       проверка не видела. Ужимаем до вписанного размера: тело остаётся внутри своей клетки. */
    let rX0=X0,rY0=Y0,rX1=X1,rY1=Y1;
    if(c.rot&&V71.fitrot){ const a=Math.abs(c.rot)*Math.PI/180, co=Math.cos(a), si=Math.sin(a);
      const Wd=X1-X0, Hd=Y1-Y0, k=Math.min(Wd/(Wd*co+Hd*si), Hd/(Wd*si+Hd*co));
      const dx=(Wd-Wd*k)/2, dy=(Hd-Hd*k)/2;
      rX0=X0+dx; rX1=X1-dx; rY0=Y0+dy; rY1=Y1-dy; }
    /* v113. Низ коробки уходил на 16u НИЖЕ пола «чтобы села на клинья». На ровном полу
       это загоняло её внутрь плиты: у обрыва коробка и плита занимают один объём и
       дерутся за текстуру — то самое ребрение на скриншоте. Теперь низ ВРОВЕНЬ с полом,
       и утапливается только там, где под коробкой пандус или лестница. */
    /* На склоне низ утапливается на перепад по следу, иначе тело стоит на самой
       низкой точке и с высокой стороны под ним видна щель. */
    const onSlope=rampAny(c.x,c.y,c.x+cw0-1,c.y+ch0-1)
      ||(cur.rampMask&&cur.rampMask[i])||(cur.stairMask&&cur.stairMask[i]);
    const bot=onSlope?ft-48:ft;
    /* ============ v140.1. ДВА ЯЩИКА В ОДНОМ МЕСТЕ ============
       Расстановка кладёт тела внахлёст: на трёх картах 28..46 пересекающихся пар,
       и 5..8 из них — одно тело ЦЕЛИКОМ внутри другого, вплоть до буквально
       двух одинаковых коробок подряд. Раньше это было не видно: вычитание съедало
       младшее тело молча, и на карте просто стоял один ящик вместо двух. С рамой
       стало видно — у съеденного ядра оставался скелет, и он справедливо сказал
       «поломалось».
       Вложенное тело не добавляет к силуэту НИ ЮНИТА, поэтому его можно не
       печатать вовсе: объединение тел то же самое, растр остаётся прав, а рама
       больше не рисуется вокруг пустоты. Частичные нахлёсты не трогаем — там
       объединение изменилось бы, а это уже расхождение с растром (правило 5). */
    const пX0=c.rot?rX0:X0, пY0=c.rot?rY0:Y0, пX1=c.rot?rX1:X1, пY1=c.rot?rY1:Y1;
    { let вложено=false;
      for(const t of ТЕЛА)
        if(t.x0<=пX0 && t.y0<=пY0 && t.x1>=пX1 && t.y1>=пY1 && t.z0<=bot && t.z1>=top){
          вложено=true; break; }
      if(вложено){ ВЛОЖ++; continue; }
      ТЕЛА.push({x0:пX0,y0:пY0,x1:пX1,y1:пY1,z0:bot,z1:top}); }
    /* ============ v140. ЯЩИК С БОРТАМИ ============
       Схема снята с ящика, который он собрал руками, и сверена с ним кусок в
       кусок: 21 из 21. Сам эталон выписан в data/yashiki-borta.md, сверка и
       лаборатория пар материалов — в tools/uvlab4.py.

       ВСЯ РАМА — ОДНО ЧИСЛО. При теле 96 у него вылет рейки 4, вылет угла 8,
       свес верхнего пояса 8, отступ рейки внутрь 8, рейка 12, угловой блок 16.
       Это ровно a, 2a, 2a, 2a, 3a, 4a при a=4, а 4 = 96/24. Поэтому рама
       ПРОПОРЦИОНАЛЬНА телу: a = меньшая сторона / 24. Доля рейки держится
       11.7–15% на диапазоне 48..256 против 12.5% у эталона.

       ВЕРХ И НИЗ РАЗНЫЕ. Сверху воздух — верхний пояс свисает внутрь на 2a и
       торчит вверх. Снизу пол — торчать вниз нельзя, там появится геометрия,
       которой никто не увидит, а движок посчитает.

       ЯДРО УТАПЛИВАЕТСЯ НА ВЫЛЕТ РАМЫ, А НЕ РАМА ДОБАВЛЯЕТСЯ К ТЕЛУ. Первая
       редакция ставила раму поверх габарита, и контрфакт БЕЗ=борта показал цену:
       маршрутов через щель уже 96u стало 20 вместо 14, недоступного пола 56
       клеток вместо нуля. Правило 4.1. Теперь наружный силуэт рамы совпадает с
       коробкой, которую видел растр, до юнита.

       ЯДРО ВЫПУСКАЕТСЯ ПЕРВЫМ, И ЭТО НЕ КОСМЕТИКА. Вычитание пересечений режет
       ту коробку, что выпущена ПОЗЖЕ, и выбрасывает её целиком, если кусков
       вышло больше восьми. Во второй редакции рама шла раньше ядра — ядро
       резалось двадцатью рейками сразу, разлеталось на два десятка кусков и
       пропадало. На его карте так осталось без ядра 67 рам из 92: голые
       скелеты. Порядок «сначала тело, потом декор» — тот же принцип, что у пола
       со стенами, и нарушать его нельзя.

       Контрфакт: БЕЗ=борта. */
    let рама=null;
    if(V140.борта && !без('борта') && !c.rot && c.kind!=='wall' && c.hgt!=='full'){
      const a=Math.max(2, Math.min(V140.аМакс,
                                   Math.round(Math.min(X1-X0, Y1-Y0, top-bot)/24)));
      const Т=3*a, У=4*a, ВР=a, ВУ=2*a, И=2*a, НИЗ=2*a;
      const яX0=X0+ВУ, яY0=Y0+ВУ, яX1=X1-ВУ, яY1=Y1-ВУ, яTop=top-ВУ;
      if(Math.min(яX1-яX0, яY1-яY0) >= 2*И+Т && (яTop-bot) >= 2*Т+НИЗ)
        рама={a,Т,У,ВР,ВУ,И,НИЗ,яX0,яY0,яX1,яY1,яTop};
    }
    /* v127. Тело — ПРЕДМЕТ, а не кусок сплошной поверхности: текстура ящика
       обязана кончаться на его же ребре. 'a' = ровно одна картинка на грань. */
    if(c.rot) solids.push(rboxZ(rX0,rY0,bot,rX1,rY1,top,c.rot,cmat,'a'));
    else if(рама){ solids.push(box(рама.яX0,рама.яY0,bot, рама.яX1,рама.яY1,рама.яTop, cmat,'a'));
      /* Ядро под учёт: если вычитание его съест, на карте останется голый
         скелет — рама есть, ящика внутри нет. Считаем прямо здесь, а не
         детектором по .vmf: первый такой детектор соврал на лабораторной карте,
         где ядро есть у каждого ящика (21 «пропажа» из 28). */
      ЯДРА.push({ядро:REG.length-1, рама:[]}); }
    else solids.push(box(X0,Y0,bot,X1,Y1,top,cmat,'a'));
    if(рама){
      const {Т,У,ВР,ВУ,И,НИЗ,яX0,яY0,яX1,яY1,яTop}=рама;
      /* Рама — ТРИМ своей зоны: он тёмный и контрастирует с акцентом укрытия.
         Его слова: «края конечно делай другой текстуры». */
      const тр=(ZF[zi]&&ZF[zi].w)||{p:DARKTRIM,s:UVS};
      const рм={t:тр,w:тр,b:тр};
      /* Вылет мерится ОТ СВОЕЙ ГРАНИ, поэтому на дальней стороне начало другое.
         Сверка с его ящиком: первая попытка дала 14 кусков из 21, и все семь
         промахов были на дальних гранях. */
      const нач=(c0,дальний,толщ,выл)=>дальний?(c0+выл-толщ):(c0-выл);
      const низа=bot, низб=bot+Т, врa=яTop-НИЗ, врб=яTop-НИЗ+Т, вуб=яTop-НИЗ+У;
      const углы=[[яX0,яY0,false,false],[яX1,яY0,true,false],
                  [яX1,яY1,true,true],[яX0,яY1,false,true]];
      /* ============ v141.1. РАМА ВЫПУСКАЕТСЯ САМОЙ ПОСЛЕДНЕЙ ============
         Его слова: «ты прорезал в остальных ящиках пазы для рамки, но при этом
         самой рамки не появилось». Так и было. Вычитание режет того, кто выпущен
         ПОЗЖЕ, а рама выпускалась сразу за своим ядром — то есть раньше всех
         предметов мест, косяков, балок и ламп. Каждая рейка успевала прорезать
         в соседнем предмете паз под себя, а сама в этом месте оставалась
         невидимой или снималась зачисткой. Замер: рама резала 10..18 чужих
         коробок на карту.
         Рама — чистая декорация внутри СВОЕГО габарита, и старшинство у неё
         обязано быть самое низкое: пусть её режут все, а она — никого. Поэтому
         коробки рамы копятся здесь и выпускаются в самом конце buildVMF. */
      const своя=[];
      for(const [cx,cy,дх,ду] of углы){
        const ux=нач(cx,дх,У,ВУ), uy=нач(cy,ду,У,ВУ);
        своя.push([ux,uy,низа, ux+У,uy+У,низб]);
        своя.push([ux,uy,врa,  ux+У,uy+У,вуб]); }
      for(const [cy,ду] of [[яY0,false],[яY1,true]])
        for(const [za,zb] of [[низа,низб],[врa,врб]]){
          const uy=нач(cy,ду,Т,ВР);
          своя.push([яX0+И,uy,za, яX1-И,uy+Т,zb]); }
      for(const [cx,дх] of [[яX0,false],[яX1,true]])
        for(const [za,zb] of [[низа,низб],[врa,врб]]){
          const ux=нач(cx,дх,Т,ВР);
          своя.push([ux,яY0+И,za, ux+Т,яY1-И,zb]); }
      for(const [cx,cy,дх,ду] of углы){
        const ux=нач(cx,дх,Т,ВР), uy=нач(cy,ду,Т,ВР);
        своя.push([ux,uy,низб, ux+Т,uy+Т,врa]); }
      /* Рама и ядро — ОДИН предмет: если вычитание съест ядро, рама уходит следом.
         Связь держится через запись в ЯДРА, индексы проставятся при выпуске. */
      РАМЫ.push({коробки:своя, м:рм, я:ЯДРА.length?ЯДРА[ЯДРА.length-1]:null});
      БОРТОВ++;
    }
    if(V70.sky&&c.hgt==='full'){ const cm2={p:DARKTRIM,s:UVS};
      /* без вылета: перегородка стоит вплотную к стенам, вылет дал бы совпадающие грани */
      solids.push(box(X0,Y0,top, X1,Y1,top+24, {t:cm2,w:cm2,b:cm2},'a')); } }
  ECOL="0 180 220";

  /* ============ v120. ПРЕДМЕТЫ МЕСТ ============
     Семь силуэтов. Не «ящик повыше» и не «ящик пошире» — разный профиль и сверху,
     и сбоку, потому что место узнаётся по тому, чем оно НЕ похоже на соседнее.
     Ставятся поверх готового пола, высота берётся из zfield под центром предмета,
     чтобы на склоне предмет не висел и не тонул. */
  if(cur.lmarks && cur.lmarks.length){
    const ACC={p:DARKTRIM,s:UVS}, ACCM={t:ACC,w:ACC,b:ACC};
    for(const L of cur.lmarks){
      const ci=Math.min(W*H-1,Math.max(0,(L.cy|0)*W+(L.cx|0)));
      const zi=zAt(ci); ECOL=ZE[zi];
      const body=ZC[zi], trim=ACCM;                      // корпус — акцент зоны, обвязка тёмная
      /* v128. Было: САМАЯ ВЫСОКАЯ точка следа по zfield — «чтобы угол не зависал
         над обрывом». На деле это ровно обратное: предмет вставал на верхнюю
         ступень и висел над нижней, а на пандусе zfield вообще не та высота.
         Берём МИНИМУМ по НАСТОЯЩЕЙ поверхности: предмет может врезаться в уступ,
         но не повиснет — щель под предметом видно сразу, врезку почти нет. */
      let ft=surfMin(L.x,L.y,L.x+L.w-1,L.y+L.h-1);
      if(ft===null) continue;
      if(rampAny(L.x,L.y,L.x+L.w-1,L.y+L.h-1)) ft-=48;
      const X0=wx(L.x), X1=wx(L.x+L.w), Y0=wy(L.y+L.h), Y1=wy(L.y);
      const cxm=(X0+X1)/2, cym=(Y0+Y1)/2;
      switch(L.k){
        /* Ромб в плане, а не куб: восьмигранник получился бы ПЕРЕСЕЧЕНИЕМ двух
           квадратов, а сборка умеет только вычитание — из объединения вышла бы
           восьмиконечная звезда. Повёрнутый квадрат читается колонной и стоит
           одним брашем. Низкополигонально — и не похоже ни на один ящик карты. */
        case 'pillar': {
          /* v125. Квадрат, повёрнутый на 45 градусов, ЗАНИМАЕТ БОЛЬШЕ своего следа:
             описанный габарит равен стороне на корень из двух. Проверка проходимости
             резервирует след 112x112, а в файл уходила фигура 158x158 — углы вылезали
             на 23u с каждой стороны. Колонна ставится при запасе 80u от центра до
             стены, полуширина 56u, то есть зазор 24u; после поворота полудиагональ
             79u и зазор становится 1u. Проход оказывался запечатан, а генератор об
             этом не знал: в растре у него всё сходилось.
             Замер по экспорту (tools/blocked.js): отрезано 1900..3400 клеток пола,
             мид недостижим на двух картах из трёх, и главный виновник — ровно этот
             браш 158x158x384. Вписываем повёрнутый квадрат в след. */
          const r=Math.min(X1-X0,Y1-Y0)/2/Math.SQRT2, h=384;
          solids.push(rboxZ(cxm-r,cym-r,ft,cxm+r,cym+r,ft+h,45,body,'a'));
          solids.push(box(X0,Y0,ft,X1,Y1,ft+20,trim,'a'));                   // цоколь
          solids.push(box(X0,Y0,ft+h-20,X1,Y1,ft+h,trim,'a'));               // капитель
          break; }
        case 'crate1': {                                  // тумба со скошенной крышкой
          solids.push(box(X0,Y0,ft, X1,Y1, ft+72, body,'a'));
          solids.push(box(X0+8,Y0+8,ft+72, X1-8,Y1-8, ft+88, trim,'a'));
          break; }
        case 'barrels': {                                 // три бочки разной высоты
          /* та же поправка: бочка — повёрнутый квадрат, её полудиагональ r*sqrt(2),
             а центр отнесён от середины на r*1.25. Радиус считаем из условия, что
             самая дальняя точка не выходит за след. */
          const half=Math.min(X1-X0,Y1-Y0)/2;
          const r=half/(1.25+Math.SQRT2);
          const sp=[[-1,-0.6,96],[1,-0.2,112],[0.1,1,80]];
          for(const [ax,ay,hh] of sp){ const px2=cxm+ax*r*1.25, py2=cym+ay*r*1.25;
            solids.push(rboxZ(px2-r,py2-r,ft,px2+r,py2+r,ft+hh-10,45,body,'a'));
            solids.push(rboxZ(px2-r,py2-r,ft+hh-10,px2+r,py2+r,ft+hh,45,trim,'a')); }
          break; }
        case 'stack': {                                   // штабель уступом: 112 / 80 / 48
          const w2=(X1-X0), h2=(Y1-Y0);
          solids.push(box(X0,Y0,ft, X0+w2*0.62, Y0+h2*0.62, ft+112, body,'a'));
          solids.push(box(X0+w2*0.62,Y0,ft, X1, Y0+h2*0.55, ft+80, body,'a'));
          solids.push(box(X0,Y0+h2*0.62,ft, X0+w2*0.55, Y1, ft+48, body,'a'));
          solids.push(box(X0,Y0,ft+112, X0+w2*0.62, Y0+h2*0.62, ft+120, trim,'a'));
          break; }
        case 'wallg': {                                   // стенка с козырьком — граффити-стена
          solids.push(box(X0,Y0,ft, X1,Y1, ft+112, body,'a'));
          solids.push(box(X0-12,Y0-12,ft+112, X1+12,Y1+12, ft+128, trim,'a'));
          break; }
        case 'truck': {                                   // контейнер плюс кабина у торца
          const along=(X1-X0)>=(Y1-Y0);
          const cabin=along? (X1-X0)*0.28 : (Y1-Y0)*0.28;
          if(along){
            solids.push(box(X0+cabin,Y0,ft, X1,Y1, ft+136, body,'a'));
            solids.push(box(X0,Y0+ (Y1-Y0)*0.12, ft, X0+cabin, Y1-(Y1-Y0)*0.12, ft+96, trim,'a'));
            solids.push(box(X0+cabin-8,Y0-8,ft+136, X1+8,Y1+8, ft+148, trim,'a'));
          } else {
            solids.push(box(X0,Y0+cabin,ft, X1,Y1, ft+136, body,'a'));
            solids.push(box(X0+(X1-X0)*0.12,Y0,ft, X1-(X1-X0)*0.12, Y0+cabin, ft+96, trim,'a'));
            solids.push(box(X0-8,Y0+cabin-8,ft+136, X1+8,Y1+8, ft+148, trim,'a')); }
          break; }
        case 'canopy': {                                  // навес: четыре стойки и крыша
          const P=32, HH=176;
          for(const [ax,ay] of [[0,0],[1,0],[0,1],[1,1]]){
            const px2=ax?X1-P:X0, py2=ay?Y1-P:Y0;
            solids.push(box(px2,py2,ft, px2+P,py2+P, ft+HH, trim,'a')); }
          solids.push(box(X0-16,Y0-16,ft+HH, X1+16,Y1+16, ft+HH+16, body,'a'));
          break; }
        case 'deck': {                                    // помост +64 со ступенями с одной стороны
          const HH=64, ST=4, sw=(Y1-Y0)/ST;
          solids.push(box(X0,Y0+sw,ft, X1,Y1, ft+HH, body,'a'));
          for(let s=0;s<ST;s++)                            // 4 ступени по 16u — заходится ногами
            solids.push(box(X0, Y0+sw*s/ST, ft, X1, Y0+sw*(s+1)/ST, ft+16*(s+1), trim,'a'));
          solids.push(box(X0,Y0+sw,ft+HH, X1,Y1, ft+HH+8, trim,'a'));
          break; }
      }
    }
    ECOL="0 180 220";
  }
  // ======= СТРУКТУРЫ (2-й уровень): палубы-палас/апарты/мид со сквозным проходом-андером, здания, арки =======
  /* v60 L4: ядро плента для палуб — НЕ ПОЛ. Иначе двухуровневая дорожка ложится прямо
     над точкой закладки: просвет UNDER=176u, и плент превращается в тоннель.
     Замер это ловил однозначно — у всех плентов с потолком 176-256u видимость падала
     до 39-52% при норме 69-88%. Раньше палуба туда не помещалась (комната B была 6x5),
     а после увеличения плентов (L3) стала помещаться. Регресс завёл мой же L3. */
  const CORE2=coreMask(cur.px);
  const fl=(x,y)=>x>0&&x<W-1&&y>0&&y<H-1&&g[y*W+x]&&!pal[y*W+x]&&!CORE2[y*W+x];
  const ftOf=n=>qz(n.z||0);
  const rr=mulberry32((cur.seed^0x51ed)>>>0);
  const UNDER=176, THK=16, COLW=32, BLD=208, ARCHCLR=140, ARCHTHK=32, RAIL=40;
  /* v102. Длины ниже писались в КЛЕТКАХ и молчаливо значили «умножь на 96».
     На клетке 16u рампа в 3 клетки стала 48u при подъёме 192u — почти отвесный клин,
     он и торчал в проходах на скриншотах. Переводим в юниты: cells(u) — сколько
     клеток нужно, чтобы получить u юнитов. */

  const floorFrac=(x0,y0,x1,y1)=>{ let f=0,t=0; for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){t++; if(fl(x,y))f++;} return f/t; };
  const rampRun=(dir,dx0,dy0,dx1,dy1,want)=>{ const cells=[];
    if(dir==='W'||dir==='E'){ const wR=Math.min(2,dy1-dy0+1),ry0=dy0,ry1=ry0+wR-1;
      if(dir==='W'){ const rx1=dx0-1; for(let s=0;s<want;s++){const x=rx1-s; for(let y=ry0;y<=ry1;y++){ if(!fl(x,y))return null; cells.push([x,y]); }} }
      else { const rx0=dx1+1; for(let s=0;s<want;s++){const x=rx0+s; for(let y=ry0;y<=ry1;y++){ if(!fl(x,y))return null; cells.push([x,y]); }} }
      return {cells,axis:'X',ry0,ry1}; }
    const wR=Math.min(2,dx1-dx0+1),rx0=dx0,rx1=rx0+wR-1;
    if(dir==='N'){ const ry1=dy0-1; for(let s=0;s<want;s++){const y=ry1-s; for(let x=rx0;x<=rx1;x++){ if(!fl(x,y))return null; cells.push([x,y]); }} }
    else { const ry0=dy1+1; for(let s=0;s<want;s++){const y=ry0+s; for(let x=rx0;x<=rx1;x++){ if(!fl(x,y))return null; cells.push([x,y]); }} }
    return {cells,axis:'Y',rx0,rx1}; };
  const buildDeck=(node,c,dir,rmp)=>{ const {dx0,dy0,dx1,dy1}=c; const ft=ftOf(node), under=ft+UNDER, top=under+THK;
    solids.push(box(wx(dx0),wy(dy1+1),under, wx(dx1+1),wy(dy0),top, FLOORMAT));            // ходибельная плита
    deckTops.push([dx0,dy0,dx1,dy1,top]);   // приподнятый пол: крыша обязана его учесть
    const posts=[[dx0,dy0],[dx1,dy0],[dx0,dy1],[dx1,dy1]];
    /* v119: «палуба длиннее четырёх клеток получает средние стойки» — на 16u это 64u,
       и стойки лезли под каждую палубу пачками. Порог в юнитах: 384u. */
    if(dx1-dx0>=cells(384)){const mx=(dx0+dx1)>>1; posts.push([mx,dy0],[mx,dy1]);}
    if(dy1-dy0>=cells(384)){const my=(dy0+dy1)>>1; posts.push([dx0,my],[dx1,my]);}
    for(const [cx,cy] of posts){ if(!fl(cx,cy))continue; const X=wx(cx),Y=wy(cy+1); solids.push(box(X,Y,ft-16,X+COLW,Y+COLW,under, WALLMAT)); }
    if(rmp.axis==='X'){ const y0=rmp.ry0,y1=rmp.ry1,xs=rmp.cells.map(p=>p[0]),xlo=Math.min(...xs),xhi=Math.max(...xs);
      if(dir==='W') solids.push(wedgeX(wx(xlo),wy(y1+1),baseZ, wx(xhi+1),wy(y0), ft, top, FLOORMAT));
      else          solids.push(wedgeX(wx(xlo),wy(y1+1),baseZ, wx(xhi+1),wy(y0), top, ft, FLOORMAT)); }
    else { const x0=rmp.rx0,x1=rmp.rx1,ys=rmp.cells.map(p=>p[1]),ylo=Math.min(...ys),yhi=Math.max(...ys);
      if(dir==='N') solids.push(wedgeY(wx(x0),wy(yhi+1),baseZ, wx(x1+1),wy(ylo), top, ft, FLOORMAT));
      else          solids.push(wedgeY(wx(x0),wy(yhi+1),baseZ, wx(x1+1),wy(ylo), ft, top, FLOORMAT)); }
    const DX0=wx(dx0),DX1=wx(dx1+1),DY0=wy(dy1+1),DY1=wy(dy0), rail=(X0,Y0,X1,Y1)=>solids.push(box(X0,Y0,top,X1,Y1,top+RAIL, WALLMAT));
    if(dir!=='N') rail(DX0,DY1-8,DX1,DY1); if(dir!=='S') rail(DX0,DY0,DX1,DY0+8);
    if(dir!=='W') rail(DX0,DY0,DX0+8,DY1); if(dir!=='E') rail(DX1-8,DY0,DX1,DY1); };
  // ЭКСП: сквозной 2-уровневый путь — рампа вверх с одного края, дорожка, рампа вниз в соседнюю область
  const throughDeck=node=>{ if(!node) return false; const rw=node.room[0], rh=node.room[1];
    const cx0=node.x-(rw>>1)+1, cx1=node.x+(rw>>1)-1, cy0=node.y-(rh>>1)+1, cy1=node.y+(rh>>1)-1;
    const ft=ftOf(node), under=ft+UNDER, top=under+THK;
    const allFloor=(x0,y0,x1,y1)=>{ for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) if(!fl(x,y)) return false; return true; };
    const tryX=()=>{ const len=cx1-cx0+1; let run=cells(288); if(len<2*run+2) run=cells(192); if(len<2*run+2) return false;
      let ry0=node.y-cells(96); if(ry0<cy0)ry0=cy0; const ry1=Math.min(ry0+cells(192),cy1); if(ry1<=ry0) return false;
      const a=cx0,b=cx1, wX0=a+run,wX1=b-run;
      if(!allFloor(a,ry0,a+run-1,ry1)||!allFloor(b-run+1,ry0,b,ry1)) return false;   // рампы строго на полу
      if(floorFrac(wX0,ry0,wX1,ry1)<0.5) return false;
      solids.push(box(wx(wX0),wy(ry1+1),under, wx(wX1+1),wy(ry0),top, FLOORMAT));                     // дорожка
      deckTops.push([wX0,ry0,wX1,ry1,top]);
      solids.push(wedgeX(wx(a),wy(ry1+1),baseZ, wx(a+run),wy(ry0), ft, top, FLOORMAT));                // вверх (запад)
      solids.push(wedgeX(wx(b-run+1),wy(ry1+1),baseZ, wx(b+1),wy(ry0), top, ft, FLOORMAT));            // вниз (восток)
      for(let x=wX0;x<=wX1;x+=cells(192))for(const y of [ry0,ry1]) if(fl(x,y)){ const X=wx(x),Y=wy(y+1); solids.push(box(X,Y,ft-16,X+COLW,Y+COLW,under, WALLMAT)); }
      solids.push(box(wx(wX0),wy(ry0)-8,top, wx(wX1+1),wy(ry0),top+RAIL, WALLMAT));                    // перила N
      solids.push(box(wx(wX0),wy(ry1+1),top, wx(wX1+1),wy(ry1+1)+8,top+RAIL, WALLMAT));                // перила S
      return true; };
    const tryY=()=>{ const len=cy1-cy0+1; let run=cells(288); if(len<2*run+2) run=cells(192); if(len<2*run+2) return false;
      let rx0=node.x-cells(96); if(rx0<cx0)rx0=cx0; const rx1=Math.min(rx0+cells(192),cx1); if(rx1<=rx0) return false;
      const a=cy0,b=cy1, wY0=a+run,wY1=b-run;
      if(!allFloor(rx0,a,rx1,a+run-1)||!allFloor(rx0,b-run+1,rx1,b)) return false;
      if(floorFrac(rx0,wY0,rx1,wY1)<0.5) return false;
      solids.push(box(wx(rx0),wy(wY1+1),under, wx(rx1+1),wy(wY0),top, FLOORMAT));                      // дорожка
      deckTops.push([rx0,wY0,rx1,wY1,top]);
      solids.push(wedgeY(wx(rx0),wy(a+run),baseZ, wx(rx1+1),wy(a), top, ft, FLOORMAT));                // север: верх у y=a(дорожка)
      solids.push(wedgeY(wx(rx0),wy(b+1),baseZ, wx(rx1+1),wy(b-run+1), ft, top, FLOORMAT));            // юг
      for(let y=wY0;y<=wY1;y+=2)for(const x of [rx0,rx1]) if(fl(x,y)){ const X=wx(x),Y=wy(y+1); solids.push(box(X,Y,ft-16,X+COLW,Y+COLW,under, WALLMAT)); }
      solids.push(box(wx(rx0)-8,wy(wY1+1),top, wx(rx0),wy(wY0),top+RAIL, WALLMAT));                    // перила W
      solids.push(box(wx(rx1+1),wy(wY1+1),top, wx(rx1+1)+8,wy(wY0),top+RAIL, WALLMAT));                // перила E
      return true; };
    return (rw>=rh) ? (tryX()||tryY()) : (tryY()||tryX()); };
  const deck=node=>{ if(!node) return false; const rw=node.room[0], rh=node.room[1]; if(rw<5||rh<5) return false;
    const cx0=node.x-(rw>>1)+1, cx1=node.x+(rw>>1)-1, cy0=node.y-(rh>>1)+1, cy1=node.y+(rh>>1)-1;
    const dw=Math.max(3,Math.min(cx1-cx0+1,Math.floor(rw*0.5))), dh=Math.max(3,Math.min(cy1-cy0+1,Math.floor(rh*0.5)));
    for(const sx of [1,-1]) for(const sy of [1,-1]){
      const dx0=sx>0?(cx1-dw+1):cx0, dy0=sy>0?(cy1-dh+1):cy0, dx1=dx0+dw-1, dy1=dy0+dh-1;
      if(floorFrac(dx0,dy0,dx1,dy1)<0.55) continue;
      const dirs=[['W',dx0-cx0],['E',cx1-dx1],['N',dy0-cy0],['S',cy1-dy1]].filter(d=>d[1]>=3).sort((a,b)=>b[1]-a[1]);
      for(const [dir,op] of dirs){ const rmp=rampRun(dir,dx0,dy0,dx1,dy1,Math.min(4,Math.max(3,op)));
        if(rmp){ buildDeck(node,{dx0,dy0,dx1,dy1},dir,rmp); return true; } } }
    return false; };
  // мид всегда двухуровневый + минимум один сайт; при THRU — сквозной проход, иначе тупиковая палуба v28
  const twoLevel=node=> (THRU && throughDeck(node)) || deck(node);
  if(rr()<0.5) twoLevel(cur.px.M);   // v35: не каждый мид
  const s1=(cur.seed&1)?cur.px.A:cur.px.B, s2=(cur.seed&1)?cur.px.B:cur.px.A;
  if(rr()<0.3){ if(!twoLevel(s1)) twoLevel(s2); }   // v35: палуба у плента — редкость, а не штамп; вертикаль дают балконы/ямы/террасы
  // ЗДАНИЯ (по плану): крыша над коннектором (192u) / закрытым B-сайтом (256u); двери на входах ставит блок дверей, свет — в энтити
  /* Крыши эмитятся СПЛОШНЯКОМ от своей высоты ДО ПОТОЛКА КАРТЫ, а не плитой 16u.
     Плита 16u оставляла сверху ходибельную поверхность — на неё залезали.
     Теперь верх крыши совпадает с потолком у скайбокса, стоять негде по построению. */
  // снимок высот ДО палуб: спавны и триггеры должны садиться на землю, а не на палубу
  const gndC=Float64Array.from(ftopC); cur.__ftopC=gndC;
  // палубы построены — досыпаем их в карту высот и считаем ОКОНЧАТЕЛЬНЫЕ высоты крыш
  for(const [x0,y0,x1,y1,t] of deckTops) noteF(x0,y0,x1,y1,t);
  const bldRZ=new Map(), tunRZ=[];
  for(let ci=0; ci<plan.tunComps.length; ci++){ let mx=-1e9;
    for(const c of plan.tunComps[ci]){ const v=ftopC[c]; if(v>mx) mx=v; }
    tunRZ.push((mx<-1e8?0:mx)+TUNH); }
  for(const bR of plan.builds) bldRZ.set(bR, roofOf(bR.x0,bR.y0,bR.x1-1,bR.y1-1,bR.roofH,qz(bR.z)));
  for(const bR of plan.builds){ const rz=bldRZ.get(bR);
    /* v70: крыша — плита 128u, а не колонна до потолка. Стоять на ней всё равно нельзя
       (низ 176u+ над полом), зато над картой появляется небо и гранаты ложатся на крыши. */
    if(rz<CEIL-16){ solids.push(box(wx(bR.x0),wy(bR.y1),rz, wx(bR.x1),wy(bR.y0), V70.roofslab?rz+128:CEIL, FLOORMAT));
      /* БАРЬЕР: клип повторяет старую колонну до потолка. Для игрока коллизия та же, что в v67
         (на крышу не встать даже с буста), граната сквозь клип проходит и ложится на плиту. */
      if(V70.roofslab&&!V72.clipLid) solids.push(box(wx(bR.x0),wy(bR.y1),rz+128, wx(bR.x1),wy(bR.y0), Math.min(CEIL,rz+128+320), PCLIP)); } }
  { const tm=new Uint8Array(W*H);
    for(let ci=0; ci<plan.tunComps.length; ci++){ const rz=tunRZ[ci];
      if(!(rz<CEIL-16)) continue;
      tm.fill(0); let any=0;
      for(const c of plan.tunComps[ci]) if(g[c]){ tm[c]=1; any=1; }
      if(!any) continue;
      for(const [x,y,w,h] of greedy(tm)){ solids.push(box(wx(x),wy(y+h),rz, wx(x+w),wy(y), V70.roofslab?rz+96:CEIL, FLOORMAT));
        if(V70.roofslab&&!V72.clipLid) solids.push(box(wx(x),wy(y+h),rz+96, wx(x+w),wy(y), Math.min(CEIL,rz+96+320), PCLIP)); } } }
  /* ====== ЛЕНДМАРКИ v58 ======
     Игрок ориентируется не по карте, а по «я это уже видел». Два дешёвых маркера:
     1) ПЛИТА НА РАЗВИЛКЕ — ВРОВЕНЬ с полом, отдельный материал-ключ зоны. Ходьбу не трогает,
        лишнего уровня высоты не создаёт.
        Ставится там, где сходятся >=3 направления и >=2 зоны: то есть ровно в точке,
        где игрок обязан принять решение и потом вспомнить, что решал именно здесь.
     2) КОСЯКИ ДВЕРЕЙ — вертикальные пилястры по бокам проёма, 24u прода, до 192u.
        Проём перестаёт быть дырой в стене и становится ЧИТАЕМЫМ входом. */
  const ents2=[];
  if(LMARK){
    // плита развилки уже уложена вровень выше по коду (lmCell). Тут — только косяки дверей.
    for(const d of plan.doors){ const di=d.y*W+d.x, zi=zAt(di), dft=qz(zf[di]||0);
      /* v58.1: косяк берёт материал УКРЫТИЯ, а не ключа. Ключ (роль k) лежит в списке
         материалов пола — косяки попадали в замер как куски пола и рождали лишний
         уровень высоты на отметке притолоки (26 кусков на z=192 в контрольном прогоне). */
      const km={p:matOf(zi,'c'),s:UVS}, KM={t:km,w:km,b:km}, JH=192, JT=24; ECOL=ZE[zi];
      if(V63.arch){
        const AT=32, DHa=(d.w===1?128:d.w===2?152:168);
        if(без('косяки')) continue;                 // контрфакт, см. tools/oba.py
        /* ============ v136.2. КОСЯК МЕРЯЕТ НАСТОЯЩИЙ ПРОЁМ ============
           Косяк брал ширину из ПЛАНА (d.w клеток) и отступал внутрь по 32u с
           каждого конца. Но слой деталей к этому времени уже сузил проём до 112u,
           и сузил СО СЛУЧАЙНЫМ СМЕЩЕНИЕМ внутри исходного пролёта. Концы плана
           после этого — где угодно, в том числе посреди уцелевшего прохода, и
           косяк вставал поперёк него.
           Контрфакт (сид 1650179089, БЕЗ=косяки): крюк по .vmf 5.74 -> 1.90,
           пар хуже x2 пять -> ноль, растр и печать сошлись (1.85 против 1.90).
           Тот же класс, что пилястра: декорация не спрашивала растр.
           Теперь пролёт ищется ПО ПОЛУ: непрерывный ряд клеток с g вокруг
           середины двери. Косяк ставится, только если после него остаётся не
           меньше семи клеток (112u) — ровно то, во что метится слой деталей. */
        const ПРОСВЕТ=112;
        if(d.axis==='Y'){ const yy=d.y;
          let a=d.x, b=d.x;
          if(!g[yy*W+d.x]){ let f=-1;
            for(let k=0;k<d.w;k++) if(g[yy*W+d.x+k]){ f=d.x+k; break; }
            if(f<0) continue; a=b=f; }
          while(a>0 && g[yy*W+a-1]) a--;
          while(b<W-1 && g[yy*W+b+1]) b++;
          const lo=wx(a), hi=wx(b+1);
          const it=Math.max(0,Math.min(AT,((hi-lo)-ПРОСВЕТ)/2)), Yc=wy(d.y+1)+hc;
          if(it>0){ solids.push(box(lo,Yc-AT/2,dft, lo+it,Yc+AT/2, dft+DHa, KM));
                    solids.push(box(hi-it,Yc-AT/2,dft, hi,Yc+AT/2, dft+DHa, KM)); } }
        else { const xx=d.x;
          let a=d.y, b=d.y;
          if(!g[d.y*W+xx]){ let f=-1;
            for(let k=0;k<d.w;k++) if(g[(d.y+k)*W+xx]){ f=d.y+k; break; }
            if(f<0) continue; a=b=f; }
          while(a>0 && g[(a-1)*W+xx]) a--;
          while(b<H-1 && g[(b+1)*W+xx]) b++;
          const lo=wy(b+1), hi=wy(a);
          const it=Math.max(0,Math.min(AT,((hi-lo)-ПРОСВЕТ)/2)), Xc=wx(d.x)+hc;
          if(it>0){ solids.push(box(Xc-AT/2,lo,dft, Xc+AT/2,lo+it, dft+DHa, KM));
                    solids.push(box(Xc-AT/2,hi-it,dft, Xc+AT/2,hi, dft+DHa, KM)); } }
        continue; }
      if(d.axis==='Y'){ const X0=wx(d.x), X1=wx(d.x+d.w), Yc=wy(d.y+1)+hc;
        solids.push(box(X0-JT,Yc-12,dft, X0,Yc+12,dft+JH, KM));
        solids.push(box(X1,Yc-12,dft, X1+JT,Yc+12,dft+JH, KM)); }
      else { const Y0=wy(d.y+d.w), Y1=wy(d.y), Xc=wx(d.x)+hc;
        solids.push(box(Xc-12,Y0-JT,dft, Xc+12,Y0,dft+JH, KM));
        solids.push(box(Xc-12,Y1,dft, Xc+12,Y1+JT,dft+JH, KM)); } }
    ECOL="0 180 220"; }
  /* ====== v64 ДЕКОР ======
     1) ПИЛЯСТРЫ. На длинных глухих стенах через 3 клетки — выступ 12u от пола до 176u.
        12u меньше радиуса игрока (16u), движение не меняет, но стена перестаёт быть
        бесконечной плоскостью и даёт точку отсчёта при беге.
     2) ВТОРОЙ ЯРУС. На части высоких укрытий — меньший блок сверху со сдвигом.
        Силуэт перестаёт быть кубом, укрытие читается как объект. */
  /* v65 БРА: на каждой шестой пилястре — светильник на высоте 152u.
     Тёплый, слабый (2600 лм), тени включены — даёт локальный акцент и ориентир. */
  if(V65.sconce){
    const sm={p:M_.wMetal,s:UVS}, SM={t:sm,w:sm,b:sm}; let ns=0;
    for(let y=2;y<H-2&&ns<26;y++)for(let x=2;x<W-2&&ns<26;x++){
      if(g[y*W+x]||((x*11+y*7)%17)!==0) continue;
      let dx=0,dy=0;
      if(g[y*W+x+1])dx=1; else if(g[y*W+x-1])dx=-1; else if(g[(y+1)*W+x])dy=1; else if(g[(y-1)*W+x])dy=-1; else continue;
      const ft=qz(zf[y*W+x]||0), lz=ft+152;
      const cx=wx(x)+hc+dx*40, cy=wy(y+1)+hc-dy*40;
      solids.push(box(cx-10,cy-10,lz-6, cx+10,cy+10,lz+6, SM));
      ents2.push([cx+dx*26, cy-dy*26, lz, V71L.scn, "255 238 214", V71L.rScn]); ns++; }
  }
  /* v65 БАЛКИ: поперечины под крышей тоннеля.
     v130. БАЛКА БЫЛА ЩЕПКОЙ. Сечение и отступ задавались ДОЛЯМИ КЛЕТКИ:
       bIns = S/12 -> 1u,  bA = S*34/96 -> 6u,  bB = S*62/96 -> 10u,
     а сама балка накрывала ОДНУ клетку. На выходе обломок 14 x 4 x 20, висящий
     посреди потолка, — 21 штука на карту по замеру экспорта. На клетке 96u то же
     выражение давало 80u поперёк, то есть почти всю ширину тоннеля, и выглядело
     балкой; при переходе на 16u смысл потерялся, а формула осталась. Это уже
     седьмой случай той же болезни: константа в юнитах, привязанная к размеру клетки.
     Теперь балка идёт ПОПЕРЁК тоннеля во всю его ширину, а сечение — в юнитах. */
  if(V65.beams){
    const bm={p:DARKTRIM,s:UVS}, BM2={t:bm,w:bm,b:bm};
    const BSEC=24;                                          // сечение балки вдоль хода, юнитов
    const beamStep=Math.max(2, Math.round(384*192/(S*S)));  // одна балка на ~384u пути тоннеля
    const inTun=new Uint8Array(W*H);
    let nb=0;
    for(let ci=0; ci<plan.tunComps.length; ci++){ const cells=plan.tunComps[ci], rz=tunRZ[ci];
      for(const c of cells) inTun[c]=1;
      /* Список клеток компоненты — порядок ОБХОДА, а не путь вдоль тоннеля. Шаг по
         индексу поэтому кладёт балки кучей: четыре штуки в одном месте налезали
         друг на друга, вычитание срезало их до полосок в 4u. Разводим по
         РАССТОЯНИЮ: ближе 320 юнитов друг к другу балки не ставим. */
      const ставили=[];
      for(let k=Math.min(beamStep>>1,cells.length>>1);k<cells.length;k+=beamStep){
        const c=cells[k], lx=c%W, ly=(c/W)|0;
        { const bx=wx(lx), by=wy(ly);
          let рядом=false;
          for(const q of ставили) if(Math.abs(q[0]-bx)<320 && Math.abs(q[1]-by)<320){ рядом=true; break; }
          if(рядом) continue;
          ставили.push([bx,by]); }
        /* Направление тоннеля — вдоль той оси, где сплошной ряд длиннее.
           Балка кладётся ПОПЕРЁК него, на всю ширину этого ряда: именно так
           поперечина и читается — брус от стены до стены, а не кубик в воздухе. */
        let x0=lx,x1=lx; while(x0>0   && inTun[ly*W+x0-1]) x0--;
                         while(x1<W-1 && inTun[ly*W+x1+1]) x1++;
        let y0=ly,y1=ly; while(y0>0   && inTun[(y0-1)*W+lx]) y0--;
                         while(y1<H-1 && inTun[(y1+1)*W+lx]) y1++;
        const half=BSEC>>1;
        if(x1-x0 >= y1-y0){                                 // тоннель по X -> балка вдоль Y
          const cx=wx(lx)+(S>>1);
          solids.push(box(cx-half, wy(y1+1), rz-26, cx+half, wy(y0), rz-6, BM2));
        } else {                                            // тоннель по Y -> балка вдоль X
          const cy=wy(ly)-(S>>1);
          solids.push(box(wx(x0), cy-half, rz-26, wx(x1+1), cy+half, rz-6, BM2)); }
        nb++; }
      for(const c of cells) inTun[c]=0; }
    cur.__beams=nb;
  }
  /* v136. Контрфакт по одному эмиттеру: window.__БЕЗ='пилястры' выключает его,
     не трогая остальное. Правило «причина не называется без контрфакта» требует
     убрать подозреваемого и померить заново, а без такого крючка это правка
     файла руками — то есть замер, который не повторишь. */
  if(V64.decor && !без('пилястры')){
    /* v122. ПИЛЯСТРЫ. Задумано: выступ 12u примерно раз в 288u стены, чтобы длинная
       глухая плоскость перестала быть бесконечной и давала точку отсчёта при беге.
       Написано было `%3` — «через три КЛЕТКИ». На клетке 96u это и есть 288u,
       а на 16u — раз в 48 юнитов: вшестеро гуще, и вместо редкого выступа выходит
       частокол вторичных стенок вдоль каждой основной. Ровно те «торчащие тонкие
       стены»: браш 48 x 12 x 176 в статус-баре Хаммера — это она.
       Плюс длина 80u (Y+8..Y+88) была подобрана под клетку 96u; на 16u пилястра
       перекрывает пять клеток и налезает на соседнюю, а вычитание оставляет от
       них осколки по 8-12u. Шаг переведён в ЮНИТЫ, длина — в долю клетки. */
    const dm={p:M_.wRough,s:UVS}, DM={t:dm,w:dm,b:dm}, PT=12, PH=176;
    const PSTEP=Math.max(1,Math.round(288/S));     // одна пилястра на 288 юнитов стены
    /* v124. Вчера я перевёл длину пилястры «в долю клетки»: было Y+8..Y+88, стало
       round(S*8/96)..round(S*88/96), то есть 14 ЮНИТОВ вместо 80. Пилястра
       превратилась в столбик 12x14 — на карте это и увидели: «боковых стен нет,
       остались столбы у стены». Рассуждение было неверным: 80u это архитектурный
       размер, он не обязан масштабироваться от клетки растра. Отступы в 8u нужны
       были, чтобы пилястра не столкнулась с соседней в той же клетке, а после
       исправления шага соседних просто нет. Возвращаем 80u, теперь по центру
       клетки, а не от её края — иначе на мелкой клетке пилястра съезжает вбок. */
    const PL=40;                                   // полудлина: пилястра 80u вдоль стены
    /* ============ v136. ПИЛЯСТРА НЕ СТАВИТСЯ В УЗКОЕ МЕСТО ============
       Выступ 12u декоративный, но в растре он накрывает ЦЕНТР соседней клетки, и
       для любого замера проходимости эта клетка становится стеной высотой 176u.
       Дальше работает модель игрока 32x32: пропадает не одна клетка, а полоса
       блоков вдоль неё. В коридоре из трёх клеток (48u) после пилястры остаётся
       одна — и прохода нет.
       Замер (tools/oba.py, сид 3551506459, растр и печать одной меркой):
         как было           3254 клетки проходимы в растре и непроходимы в печати,
                            крупнейшее пятно 1421 клетка — плент A ЦЕЛИКОМ отрезан;
         без пилястр        1801 клетка, пятно с плентом исчезло совсем.
       То есть один декоративный выступ отрезал сайт. Это и есть та самая
       «забаррикадированная дорога», на которую человек показывал пальцем.
       Условие: перед пилястрой должно остаться не меньше ЗАПАС клеток пола
       подряд, считая от стены. Четыре клетки — это 64u, минус выступ 12u
       остаётся 52u при ширине игрока 32u. Где уже — стена остаётся гладкой. */
    const ЗАПАС=4;
    const простор=(x,y,dx,dy)=>{ let k=0;
      for(;k<ЗАПАС;k++){ const nx=x+dx*(k+1), ny=y+dy*(k+1);
        if(nx<0||ny<0||nx>=W||ny>=H||!g[ny*W+nx]) break; }
      return k>=ЗАПАС; };
    /* Вторая половина той же беды: пилястра ДЛИНОЙ 80u стоит по центру клетки и
       тянется на ±40u ВДОЛЬ стены, не спрашивая, есть ли там стена. У короткого
       простенка — например у косяка проёма — она вылезает концом прямо в проём и
       кладёт поперёк него плиту 12x80x176. Меряем настоящий пробег стены в обе
       стороны и по нему укорачиваем. */
    const пробег=(x,y,dx,dy)=>{ const ax=dx?0:1, ay=dx?1:0;   // ось вдоль стены
      let м=99;
      for(const s of [-1,1]){ let k=0;
        while(k<3){ const nx=x+ax*s*(k+1), ny=y+ay*s*(k+1);
          if(nx<0||ny<0||nx>=W||ny>=H||g[ny*W+nx]) break;      // кончилась стена
          const fx=nx+dx, fy=ny+dy;                            // и перед ней пол
          if(fx<0||fy<0||fx>=W||fy>=H||!g[fy*W+fx]) break;
          k++; }
        if(k<м) м=k; }
      return Math.min(PL, м*S+(S>>1)); };
    let np=0, тесно=0;
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      if(g[y*W+x]) continue;                       // сама клетка — стена
      if(((x*7+y*13)%PSTEP)!==0) continue;         // раз в 288u, детерминированно
      const ft=qz(zf[y*W+x]||0);
      let dx=0, dy=0;
      if(g[(y)*W+x+1]) dx=1; else if(g[(y)*W+x-1]) dx=-1;
      else if(g[(y+1)*W+x]) dy=1; else if(g[(y-1)*W+x]) dy=-1;
      else continue;
      if(!простор(x,y,dx,dy)){ тесно++; continue; }
      const pl=пробег(x,y,dx,dy);
      if(dx>0){ const X=wx(x+1), Yc=wy(y+1)+hc;
        solids.push(box(X,Yc-pl,ft, X+PT,Yc+pl,ft+PH, DM)); np++; }
      else if(dx<0){ const X=wx(x), Yc=wy(y+1)+hc;
        solids.push(box(X-PT,Yc-pl,ft, X,Yc+pl,ft+PH, DM)); np++; }
      /* wy() убывает с ростом y: сосед y+1 лежит НИЖЕ по мировому Y, значит выступать надо
         в минус. Было наоборот — пилястра пряталась в браше стены и давала ребристость. */
      else if(dy>0){ const Xc=wx(x)+hc, Y=wy(y+1);
        solids.push(box(Xc-pl,Y-PT,ft, Xc+pl,Y,ft+PH, DM)); np++; }
      else { const Xc=wx(x)+hc, Y=wy(y);
        solids.push(box(Xc-pl,Y,ft, Xc+pl,Y+PT,ft+PH, DM)); np++; }
      if(np>60) break; }
    cur.__pil=np; cur.__pilТесно=тесно;
  }
  // (буфер бра объявлен выше)
  // ДВЕРНЫЕ ПРОЁМЫ (по плану): каждый вход между зонами — перемычка от 128u (дверь) / 152u (арка x2) до потолка.
  // щель полной высоты превращается в стену с дверным проёмом — вход читается как вход.
  if(DOORS) for(const d of plan.doors){ const di=d.y*W+d.x, dft=qz(zf[di]||0), DH=d.w===1?128:d.w===2?152:168;
    const DTOP=V70.sky?dft+384:CEIL;
    /* притолока: было 36..60 от края клетки 96u. Теперь — полоса 24u по ЦЕНТРУ клетки,
       где бы этот центр ни оказался при другом размере клетки. */
    if(d.axis==='Y') solids.push(box(wx(d.x),wy(d.y+1)+hc-12,dft+DH, wx(d.x+d.w),wy(d.y+1)+hc+12,DTOP, WALLMAT));
    else             solids.push(box(wx(d.x)+hc-12,wy(d.y+d.w),dft+DH, wx(d.x)+hc+12,wy(d.y),DTOP, WALLMAT)); }
  // энтити
  const ents=[];
  const ent=(cls,kv,brush)=>{ const id=nid(); let b=`entity\n{\n\t"id" "${id}"\n\t"classname" "${cls}"`;
    for(const k in kv) b+=`\n\t"${k}" "${kv[k]}"`; if(brush) b+="\n"+brush; b+='\n\teditor { "color" "220 30 220" }\n}'; return b; };
  /* --- CS2 (Source 2): точечный свет. Sourse 1 `light` в FGD CS2 нет -> obsolete.
     Яркость НЕ в 4-м компоненте цвета, а отдельным ключом в люменах.
     Крутить тут: 1000 лм = лампочка 60 Вт. Для коридора 96u мало, стартовые числа ниже. */
  const LUM_TUN=V71L.tun, LUM_BLD=V71L.bld, LIGHTCOL="255 246 228";
  /* v64: КОРПУС ЛАМПЫ из брашей. Источник света сам по себе невидим — под каждым
     ставится плафон 40x40x10 и подвес 6x6 до потолка структуры. Примитивно, но
     светящаяся точка перестаёт висеть в пустоте. */
  const LAMPM={p:M_.wMetal,s:UVS}, LMP={t:LAMPM,w:LAMPM,b:LAMPM};
  const CORDM={p:DARKTRIM,s:UVS}, CRD={t:CORDM,w:CORDM,b:CORDM};
  /* v65: порядок снизу вверх — ЛАМПОЧКА, над ней ПЛАФОН, от плафона ПОДВЕС к потолку.
     В v64 источник стоял на верхней грани плафона и светил себе в дно. */
  const fixture=(x,y,z,up)=>{ if(!V64.fixtures) return;
    if(V65.bulb){
      /* v66: блока лампочки НЕТ — источник внутри браша не светит.
         Остаётся только плафон над ним и подвес. */
      solids.push(box(x-24,y-24, z+10, x+24,y+24, z+20, CRD));      // плафон
      if(up && up>z+28) solids.push(box(x-3,y-3, z+20, x+3,y+3, up, CRD));
    } else {
      solids.push(box(x-20,y-20,z-10, x+20,y+20,z, LMP));
      if(up && up>z+16) solids.push(box(x-3,y-3,z, x+3,y+3,up, CRD)); } };
  const omni=(x,y,z,lum,col,rng)=>ents.push(ent("light_omni2",{
    origin:`${x} ${y} ${z}`, angles:"0 0 0",
    enabled:"1", colormode:"0", color:col||LIGHTCOL,
    brightness_units:"0", brightness_lumens:String(lum),
    range:String(rng||V71L.rBld), falloff:V102L.falloff,
    shape:"0",
    directlight:"1", bouncelight:"1", castshadows:"1",
    baked_light_indexing:"1",          // тень от лампы в тоннеле нужна, лимит — 4 на поверхность
    rendertocubemaps:"1", brightnessscale:"1.0" }));
  for(const q of ents2) omni(q[0],q[1],q[2],q[3],q[4],q[5]);   // v65: бра
  const czu=pt=>{ const lv=Math.round(zu(zf[pt[1]*W+pt[0]])/STEP)*STEP; return lv; };
  /* Высота спавнов и триггеров берётся из ФАКТИЧЕСКОЙ карты пола, а не из zf.
     Было: cz=czu(pt)+16, то есть из zf. Но пол кладётся из floorPieces со своей zA,
     и они расходились: спавн оказывался на 8..48u НИЖЕ поверхности пола, то есть замурован.
     Замер до правки: 24 замурованных T-спавна на 3 картах из 8.
     gndC — максимум высоты пола по клетке, поэтому все 8 точек разлёта (+-40u) выше пола. */
  const groundZ=(x0,y0,x1,y1)=>{ let mx=-1e9;
    for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)
      for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++){ const v=gndC[y*W+x]; if(v>mx) mx=v; }
    return mx<-1e8 ? qz(zf[Math.max(0,Math.min(H-1,y0))*W+Math.max(0,Math.min(W-1,x0))]||0) : mx; };
  /* ============ v123. СПАВН ИЩЕТ РОВНУЮ ПЛОЩАДКУ, А НЕ СТАВИТСЯ ПО СЕТКЕ ============
     Было: восемь точек по жёсткой сетке 3x3 с шагом 40u вокруг узла, и ОДНА высота
     на все восемь — взятая из клетки узла. Никто не проверял, что под точкой вообще
     пол, что рядом нет стены и что высота там та же. Отсюда всё, что видно на
     скриншотах: половина отряда стоит внутри стены, кто-то висит на ступеньке.
     Шаг 40u к тому же меньше габарита игрока (32u плюс зазор), поэтому модели
     ещё и налезали друг на друга.

     Теперь точка спавна обязана удовлетворять трём условиям сразу:
       1. вокруг неё кольцо 3x3 — сплошной пол (48u во все стороны, игрок 32u);
       2. вся эта девятка на ОДНОЙ отметке — иначе модель стоит на ступеньке;
       3. до ближайшей стены не меньше 48u — иначе плечо уходит в кладку.
     Кандидаты сортируются по удалённости от узла и разбираются жадно с зазором
     в 64u между точками. Высота у каждой своя, из её собственной клетки. */
  const spawns=(pt,cls,n)=>{
    const R=cells(576), cand=[];
    for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){
      const x=pt[0]+ox, y=pt[1]+oy;
      if(x<2||y<2||x>=W-2||y>=H-2) continue;
      const i=y*W+x; if(!g[i]) continue;
      /* v128. Три новых условия, каждое по факту с экспорта:
         1) не на пандусе. Клин печатается по концам полосы, а не по клетке, и на
            Т-спавне расходился с zfield на 140 юнитов — отряд стоял внутри камня;
         2) не под телом. У КТ точка на -128 попала внутрь ящика -144..-112;
         3) отметка берётся из SURF — того, что реально напечатано, а не из zfield. */
      if(RAMPC[i] || OCC[i]) continue;
      const z0=Math.round(SURF[i]);
      let ровно=true;
      for(let dy=-1;dy<=1&&ровно;dy++)for(let dx=-1;dx<=1;dx++){
        const j=(y+dy)*W+(x+dx);
        if(!g[j] || RAMPC[j] || OCC[j] || Math.round(SURF[j])!==z0){ ровно=false; break; } }
      if(!ровно) continue;
      /* до стены не меньше 48u: считаем по кольцу радиуса 3 клетки при S=16 */
      const RR=Math.max(1,Math.round(48/S)); let чисто=true;
      for(let dy=-RR;dy<=RR&&чисто;dy++)for(let dx=-RR;dx<=RR;dx++){
        const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(!g[ny*W+nx]){ чисто=false; break; } }
      if(!чисто) continue;
      cand.push({x,y,z:z0,d:ox*ox+oy*oy});
    }
    cand.sort((a,b)=>a.d-b.d);
    const взято=[], SEP=Math.max(2,Math.round(64/S));
    for(const c of cand){ if(взято.length>=n) break;
      let ок=true;
      for(const v of взято) if(Math.abs(v.x-c.x)<SEP && Math.abs(v.y-c.y)<SEP){ ок=false; break; }
      if(ок) взято.push(c); }
    for(const c of взято)
      ents.push(ent(cls,{origin:`${wx(c.x)+hc} ${wy(c.y+1)+hc} ${c.z+16}`, angles:"0 90 0"}));
    /* Ровной площадки на восьмерых может не найтись — тогда ставим сколько нашлось,
       но не меньше одной: без спавна карта не запускается вовсе. */
    if(!взято.length){ const cz=groundZ(pt[0],pt[1],pt[0],pt[1])+16;
      ents.push(ent(cls,{origin:`${wx(pt[0])+hc} ${wy(pt[1]+1)+hc} ${cz}`, angles:"0 90 0"})); }
    if(cls==='info_player_terrorist') cur.__spT=взято.length; else cur.__spC=взято.length;
  };
  /* v114. Триггер плента брался как «три клетки в каждую сторону»: на клетке 96u это
     288u — нормальная зона закладки, на 16u это 48u, и он висел кубиком в воздухе
     (высота бралась как МАКСИМУМ пола в этих трёх клетках, то есть по ближайшему
     уступу). Теперь размер задан в юнитах, а низ утоплен в пол, чтобы триггер
     гарантированно накрывал поверхность, а не парил над ней. */
  const flat=(pt,name,cls)=>{ const R=cells(128);                       // 256u сторона
    const top=groundZ(pt[0]-R,pt[1]-R,pt[0]+R,pt[1]+R);
    const cx=wx(pt[0])+hc, cy=wy(pt[1]+1)+hc;
    const b=box(cx-128,cy-128,top-24, cx+128,cy+128,top+72,"TOOLS/TOOLSTRIGGER");
    return ent(cls,{targetname:name},b); };
  // свет внутри тоннелей и зданий — иначе при компиле света под крышей будет чёрная дыра
  // лампы вешаются под НОВУЮ крышу структуры. От пола клетки вешать нельзя:
  // крыша теперь одна на компоненту, и лампа оказалась бы замурована внутри неё.
  /* шаг по площади: одна лампа на квадрат stepTun x stepTun юнитов, а не «каждая
     девятая клетка» — иначе мелкая клетка даёт в 36 раз больше ламп */
  /* v121. ЛАМПА ТОЛЬКО ТАМ, ГДЕ НАД НЕЙ ЕСТЬ КРЫША.
     Плита тоннеля кладётся ТОЛЬКО над клетками пола (см. выше: `if(g[c])`), а лампа
     ставилась на любую клетку компоненты подряд — в том числе туда, где слой деталей
     потом прорезал стену. Подвес уходил вверх и кончался в воздухе: ровно то, что
     видно на скриншоте. Второй случай — компонента, у которой крыша выше потолка:
     плита не кладётся вовсе (`if(!(rz<CEIL-16)) continue`), а лампа всё равно вешалась.
     Теперь оба условия проверяются там же, где вешается лампа. */
  { const perLamp=Math.max(4, Math.round((V102L.stepTun*V102L.stepTun)/(S*S)));
    let повисло=0;
    for(let ci=0; ci<plan.tunComps.length; ci++){ const cl=plan.tunComps[ci], rz=tunRZ[ci];
      if(!(rz<CEIL-16)) continue;                       // крыши у этой компоненты нет
      for(let k=Math.min(perLamp>>1, cl.length>>1);k<cl.length;k+=perLamp){ const c=cl[k];
        if(!g[c]){ повисло++; continue; }                // над стеной плиты не клали
        const lx=c%W, ly=(c/W)|0;
        const LX=wx(lx)+(S>>1), LY=wy(ly)-(S>>1);
        omni(LX, LY, rz-56, LUM_TUN, null, V71L.rTun); fixture(LX, LY, rz-56, rz); } }
    cur.__lampSkip=повисло; }
  for(const bR of plan.builds){ const brz=bldRZ.get(bR);
    if(!(brz<CEIL-16)) continue;                        // у здания крыши нет — лампе не на чем висеть
    const bcx=(wx(bR.x0)+wx(bR.x1))>>1, bcy=(wy(bR.y1)+wy(bR.y0))>>1;
    omni(bcx, bcy, brz-64, LUM_BLD, null, V71L.rBld); fixture(bcx, bcy, brz-64, brz); }
  /* ====== СВЕТ ПО ЗОНАМ v58 ======
     Цвет света читается быстрее текстуры: половина T тёплая, половина CT холодная,
     мид нейтральный, пленты — свои оттенки. Заливка без теней (castshadows 0), чтобы
     не спорить с солнцем и не удорожать компиляцию. Ставится по одной лампе на ~36 клеток зоны. */
  /* v133. ЧЁРНАЯ ЛАМПА. Зон стало 14 (V92.zones14), а цветов в таблице оставалось
     девять. Зонам 9..13 доставался undefined, он уходил в файл как
     "color" "undefined", и импортёр читал его нулём: лампа есть, света нет.
     В экспорте такая строка находилась поиском в одну команду.
     Теперь цветов четырнадцать, и на всякий случай стоит подстраховка: индекс за
     пределами таблицы даёт нейтральный тёплый, а не пустоту. Правило на будущее:
     любая таблица «по номеру зоны» обязана иметь запасной вариант — зон уже
     дважды становилось больше, чем таблиц. */
  const ZLIGHT=[ "255 226 178","255 232 196","244 214 178","226 236 244",
                 "228 240 232","228 240 232","255 236 210","210 226 246","206 224 250",
                 "255 230 190","248 238 214","216 232 246","232 240 228","250 226 200" ];
  const zlight=zi=>ZLIGHT[zi]||LIGHTCOL;
  /* v74: заливка ставила источник голым в воздухе на 168u — 20 ламп из 50 висели ни на чём.
     Теперь лампа прижимается к ближайшей стене в радиусе 3 клеток и получает кронштейн.
     Если стены рядом нет — под открытым небом заливка не нужна, солнце уже светит. */
  if(ZONELIGHT){ const per=new Array(ZN.length).fill(0);
    const zm={p:M_.wMetal,s:UVS}, ZM={t:zm,w:zm,b:zm}; let nz=0, nzs=0, nzo=0;
    const stepC=Math.max(1,Math.round(V102L.stepZone/S));      // шаг сетки в клетках
    const findC=Math.max(1,Math.round(V102L.wallFind/S));      // докуда искать стену
    /* КРЫША. Лампа имеет смысл только под перекрытием: тоннель, здание или палуба.
       Раньше проверялась стена рядом, поэтому лампы висели вдоль заборов под небом. */
    const roofed=new Uint8Array(W*H);
    if(plan.tun) for(let i=0;i<W*H;i++) if(plan.tun[i]) roofed[i]=1;
    for(const bR of (plan.builds||[]))
      for(let y=Math.max(0,bR.y0);y<Math.min(H,bR.y1);y++)
        for(let x=Math.max(0,bR.x0);x<Math.min(W,bR.x1);x++) roofed[y*W+x]=1;
    for(const d of deckTops)
      for(let y=Math.max(0,d[1]);y<=Math.min(H-1,d[3]);y++)
        for(let x=Math.max(0,d[0]);x<=Math.min(W-1,d[2]);x++) roofed[y*W+x]=1;
    for(let y=1;y<H-1;y+=stepC)for(let x=1;x<W-1;x+=stepC){ const i=y*W+x; if(!g[i]) continue;
      if(!roofed[i]){ nzo++; continue; }                        // под открытым небом светит солнце
      const zi=zAt(i); if((per[zi]++ %V102L.perZone)!==0) continue;
      let bd=null;
      for(const d of [[1,0],[-1,0],[0,1],[0,-1]])
        for(let k=1;k<=findC;k++){ const nx=x+d[0]*k, ny=y+d[1]*k;
          if(nx<1||ny<1||nx>=W-1||ny>=H-1) break;
          if(!g[ny*W+nx]){ if(!bd||k<bd[2]) bd=[d[0],d[1],k,nx,ny]; break; } }
      if(!bd){ nzs++; continue; }
      const dx=-bd[0], dy=-bd[1];                       // от стены В СТОРОНУ комнаты
      /* v114. Лампа стояла в 40u от стены: на таком расстоянии пятно выжигает кладку
         добела — это и видно на скриншоте. Отодвигаем на 112u и вешаем выше:
         светит то же количество света, но пятна у поверхности нет. */
      const cx=wx(bd[3])+hc+dx*112, cy=wy(bd[4]+1)+hc-dy*112, lz=qz(zf[i])+176;
      /* v115. В v114 я отодвинул лампу от стены на 112u, чтобы не выжигала кладку,
         и плафон повис в воздухе сам по себе. Теперь от клетки стены до лампы идёт
         кронштейн: та его часть, что внутри стены, срежется вычитанием сама. */
      { const ax=wx(bd[3])+hc, ay=wy(bd[4]+1)+hc;
        solids.push(box(Math.min(ax,cx)-5, Math.min(ay,cy)-5, lz-4,
                        Math.max(ax,cx)+5, Math.max(ay,cy)+5, lz+4, ZM)); }
      solids.push(box(cx-10,cy-10,lz-10, cx+10,cy+10,lz+6, ZM));   // плафон на конце кронштейна
      ents.push(ent("light_omni2",{ origin:`${cx+dx*26} ${cy-dy*26} ${lz}`, angles:"0 0 0",
        enabled:"1", colormode:"0", color:zlight(zi), brightness_units:"0",
        brightness_lumens:String(V71L.zone), range:String(V71L.rZone), falloff:V102L.falloff,
        shape:"0", directlight:"1", bouncelight:"1",
        /* v103, из присланного разбора: заливке индексация не нужна — без неё лампа
           «effectively free to render» и не съедает лимит в четыре индексированных
           источника на одну поверхность. Тени она и так не бросает. */
        baked_light_indexing:"0",
        castshadows:"0", rendertocubemaps:"1", brightnessscale:"1.0" })); nz++; }
    cur.__zl=nz; cur.__zlSkip=nzs; cur.__zlOpen=nzo; }
  spawns(P.T,"info_player_terrorist",8); spawns(P.C,"info_player_counterterrorist",8);
  /* ============ v120. КАЛЛАУТЫ ============
     env_cs_place — то, что игра показывает в HUD и в чате как название места.
     До сих пор карта была безымянной: игрок не мог сказать «я на A через колонну»,
     потому что ни колонны, ни имени не существовало. Теперь у каждого МЕСТА
     (см. computePlaces) есть имя, а у большинства — предмет, от которого оно взято.
     Браш кисти — габаритная рамка места, приподнятая на рост игрока. */
  if(cur.places && cur.places.list){
    const seenNm=new Set(); let nPl=0;
    for(const p of cur.places.list){
      let nm=p.им; if(!nm||seenNm.has(nm)) continue;   // имена разведены в detRefine
      seenNm.add(nm);
      const X0=wx(p.minx), X1=wx(p.maxx+1), Y0=wy(p.maxy+1), Y1=wy(p.miny);
      if(X1-X0<32||Y1-Y0<32) continue;
      /* ============ v136.2. ТОЧКА КАЛЛАУТА СТОИТ НА ПОЛУ ============
         Была середина габаритной рамки. Место — фигура неправильная, и середина
         рамки попадает то в стену, то, что хуже, внутрь собственного предмета:
         у места и есть предмет, и ставится он по центру. На двух картах гейта
         каллаут оказался ВНУТРИ штабеля ящиков высотой 200u; приёмка привязывала
         место к крышке штабеля и честно писала «пути нет» — на неё залезть
         нельзя, спрыгнуть можно.
         Ищем клетку СВОЕГО места, свободную от тела и пандуса, ближайшую к
         середине рамки. Рамка-кисть остаётся прежней: она и должна накрывать всё
         место целиком. */
      /* Якорь посчитан в слое деталей (p.ax,p.ay) — там же, где по нему считается
         крюк. Здесь его только берут: две меры обязаны стоять в одной точке. */
      const лx=(p.ax!==undefined?p.ax:p.x), лy=(p.ay!==undefined?p.ay:p.y);
      const li=Math.min(W*H-1,Math.max(0,лy*W+лx));
      const zc=Math.round(SURF[li]===SURF[li] ? SURF[li] : qz(zf[li]||0));
      const оx=wx(лx)+(S>>1), оy=wy(лy)-(S>>1);
      /* Кисть строится тем же box(), что и всё остальное в файле. Свои шесть
         плоскостей я развернул руками и чуть не оставил так: обмотка граней
         в VMF задаётся порядком трёх точек, ошибиться в ней легко, а Хаммер
         на невалидном солиде ругается уже после импорта. box() эту обмотку
         знает, а материал TOOLS/ он пропускает мимо вычитания (isTool). */
      const brush=box(X0,Y0,zc, X1,Y1,zc+128, "TOOLS/TOOLSTRIGGER");
      if(!brush) continue;
      ents.push(ent("env_cs_place",
        { place_name:nm, origin:`${оx} ${оy} ${zc+32}` }, brush));
      nPl++; }
    cur.__places=nPl;
  }
  ents.push(flat(P.A,"bombsite_a","func_bomb_target")); ents.push(flat(P.B,"bombsite_b","func_bomb_target"));
  ents.push(flat(P.T,"buy_t","func_buyzone")); ents.push(flat(P.C,"buy_ct","func_buyzone"));
  /* v103. Солнце. Ключи _light/_ambient/pitch — Source 1, их читает импортёр VMF.
     Ключи ниже с присланной страницы light_environment (Source 2), добавлены рядом:
     неизвестные ключи движок игнорирует, а если импортёр понимает — тени станут мягче
     и появится подсветка от неба. angulardiameter=1 — рекомендованная отправная точка. */
  ents.push(ent("light_environment",{origin:`${wx(W)>>1} ${wy(H)>>1} ${CEIL-16}`,
    _light:"255 255 240 300", _ambient:"180 190 210 60", angles:"0 220 0", pitch:"-50",
    color:"255 255 240", brightness:"3.0", angulardiameter:"1",
    skycolor:"180 200 226", skyintensity:"1.0", skybouncescale:"1.0",
    bouncescale:"1.0", castshadows:"1", enabled:"1" }));
  // ЦЕНТРАЛЬНАЯ ЛАМПА ПОД ПОТОЛКОМ УБРАНА. Была страховкой на случай, если небо не светит.
  // В CS2 небо светит, а эта лампа как light_omni2 стала бы фальшивым солнцем в 300u над картой:
  // размывает тени от light_environment и ломает читаемость рельефа. Вернуть — раскомментировать:
  // omni(wx(W)>>1, wy(H)>>1, CEIL-32, 40000, "255 250 235");
  const wid=nid();
  /* v74: два разных прохода могут выдать один и тот же браш (на первой карте так вышло с
     23 полами на CT-спавне). Сравниваем по геометрии и материалам, id игнорируем. */
  /* v75: браш, целиком лежащий внутри другого НЕПРОЗРАЧНОГО браша, не виден никогда.
     Удаляем. Контейнером не может быть tools-браш: клип и скайбокс прозрачны, и то, что
     внутри них, как раз видно. При взаимном вложении убиваем только более поздний. */
  if(V75.swallow){
    const inf=solids.map(sd=>{ const pts=[]; const rx=/\(([-\d\.e]+) ([-\d\.e]+) ([-\d\.e]+)\)/g; let m;
      while((m=rx.exec(sd))) pts.push([+m[1],+m[2],+m[3]]);
      if(!pts.length) return null;
      const bb=[1e18,1e18,1e18,-1e18,-1e18,-1e18];
      for(const p of pts) for(let k=0;k<3;k++){ if(p[k]<bb[k])bb[k]=p[k]; if(p[k]>bb[k+3])bb[k+3]=p[k]; }
      let bx=(sd.match(/"plane"/g)||[]).length===6;
      if(bx) outer: for(const p of pts) for(let k=0;k<3;k++)
        if(Math.abs(p[k]-bb[k])>0.01 && Math.abs(p[k]-bb[k+3])>0.01){ bx=false; break outer; }
      const vol=(bb[3]-bb[0])*(bb[4]-bb[1])*(bb[5]-bb[2]);
      return {bb:bb, bx:bx, tool:/TOOLS\//i.test(sd), vol:vol}; });
    const kill=new Uint8Array(solids.length); let nk=0;
    for(let i=0;i<solids.length;i++){ const A=inf[i]; if(!A||!A.bx) continue;
      for(let j=0;j<solids.length;j++){ if(i===j) continue; const B=inf[j];
        if(!B||!B.bx||B.tool) continue;
        if(B.vol<A.vol) continue; if(B.vol===A.vol && j>i) continue;
        if(B.bb[0]-0.01<=A.bb[0]&&A.bb[3]<=B.bb[3]+0.01&&
           B.bb[1]-0.01<=A.bb[1]&&A.bb[4]<=B.bb[4]+0.01&&
           B.bb[2]-0.01<=A.bb[2]&&A.bb[5]<=B.bb[5]+0.01){ kill[i]=1; nk++; break; } } }
    const keep=[]; for(let i=0;i<solids.length;i++) if(!kill[i]) keep.push(solids[i]);
    cur.__swallow=nk; solids.length=0; for(const sd of keep) solids.push(sd); }
  { const seen=new Set(), out=[]; 
    for(const sd of solids){ const k=sd.replace(/"id" "\d+"/g,'').replace(/\s+/g,' ');
      if(seen.has(k)) continue; seen.add(k); out.push(sd); }
    cur.__dedup=solids.length-out.length; solids.length=0; for(const sd of out) solids.push(sd); }
  /* v115. Здесь коробки превращаются в геометрию: сначала каждая вычитает из себя
     всё, что выпущено раньше, потом жетоны в тексте заменяются на получившиеся
     куски. Пустой список означает, что коробка была целиком внутри чужого объёма. */
  /* ============ v141.1. РАМЫ ЯЩИКОВ — В САМОМ КОНЦЕ ============
     Ниже уже нет ни одного эмиттера, поэтому рама не режет НИЧЕГО, а её режет
     всё: своё ядро (чтобы не лезла внутрь), пол, стены, предметы мест. Ровно
     то старшинство, какое положено декорации. */
  for(const р of РАМЫ){ const реперРамы=REG.length;
    for(const [x0,y0,z0,x1,y1,z1] of р.коробки) solids.push(box(x0,y0,z0,x1,y1,z1, р.м,'a'));
    for(let q=реперРамы; q<REG.length; q++){ REG[q].__рама=true; if(р.я) р.я.рама.push(q); } }
  const __parts=resolveREG();
  /* ЯЩИК — ОДИН ПРЕДМЕТ. Ядро могло не пережить вычитания (например, тело почти
     целиком в полу на крутом склоне). Тогда рама вокруг него тоже не нужна:
     без этой зачистки на карте остаётся голый скелет, и человек справедливо
     говорит «поломалось». */
  /* «Кусков ноль» — НЕ ТОТ ВОПРОС, и показал это его скриншот, а не мой счётчик.
     Ядро может пережить вычитание одной щепкой: защита по объёму держит коробку,
     пока от неё осталась хотя бы двадцатая часть. Внутри рамы при этом всё та же
     пустота. Считаем ДОЛЮ ОБЪЁМА, а не факт наличия кусков.
     Но и выбрасывать такое тело нельзя: растр его видит и считал по нему маршруты
     (правило 5). Тело чаще всего не разбито, а УТОПЛЕНО — стоит на пандусе, где
     низ уходит на 48u в склон, и наружу торчит блин в 10..20 юнитов. Блин — это
     нормальная низкая приступка, ненормальна вокруг него рама: она рисует ящик
     там, где ящика по высоте уже нет.
     Поэтому: ядра нет совсем — уходит и рама, и запись; ядро есть, но тоньше
     порога — остаётся голое тело без рамы. */
  const ЖИВЁТ=(typeof window!=='undefined' && window.__ЖИВЁТ!==undefined)?+window.__ЖИВЁТ:0.35;
  const долиЯдер=[];
  { let пропало=0, безРамы=0; const почему={}, где=[];
    for(const я of ЯДРА){
      const я1=REG[я.ядро]||{};
      const цел=(я1.x1-я1.x0)*(я1.y1-я1.y0)*(я1.z1-я1.z0)||1;
      const ост=((я1.__parts)||[]).reduce((s,q)=>s+(q.x1-q.x0)*(q.y1-q.y0)*(q.z1-q.z0),0);
      const доля=ост/цел; долиЯдер.push(+доля.toFixed(3));
      if(доля>=ЖИВЁТ) continue;
      const п=ост?('обрезано до '+Math.round(доля*100)+'%'):(я1.__ел||'?');
      почему[п]=(почему[п]||0)+1;
      if(где.length<6) где.push([Math.round((я1.x0+я1.x1)/2), Math.round((я1.y0+я1.y1)/2),
                                 Math.round(я1.z0), Math.round(я1.x1-я1.x0)+'x'+Math.round(я1.y1-я1.y0)
                                 +'x'+Math.round(я1.z1-я1.z0), п]);
      if(ост) безРамы++; else пропало++;
      for(const j of я.рама) if(REG[j]) REG[j].__parts=__parts[j]=[]; }
    долиЯдер.sort((a,b)=>a-b);
    cur.__скелетов=пропало+безРамы; cur.__ядерПропало=пропало; cur.__безРамы=безРамы;
    cur.__ядерПочему=почему; cur.__ядерГде=где;
    cur.__ядерДоли=долиЯдер.slice(0,8); }
  let __txt = `versioninfo\n{\n\t"editorversion" "400"\n\t"editorbuild" "8000"\n\t"mapversion" "1"\n\t"formatversion" "100"\n\t"prefab" "0"\n}\nvisgroups\n{\n}\nviewsettings\n{\n\t"bSnapToGrid" "1"\n\t"bShowGrid" "1"\n\t"nGridSpacing" "64"\n}\nworld\n{\n\t"id" "${wid}"\n\t"mapversion" "1"\n\t"classname" "worldspawn"\n\t"skyname" "sky_dust"\n\t"comment" "${ВЕРСИЯ} · ${cur.seed}:${cur.__aim}:${cur.coverSeed}"\n${solids.filter(Boolean).join("\n")}\n}\n${ents.join("\n")}\ncameras\n{\n\t"activecamera" "-1"\n}\ncordons\n{\n\t"active" "0"\n}\n`;
  let __kept=0, __dropped=0, __split=0;
  __txt = __txt.replace(/\u0000B(\d+)\u0000/g, function(_,n){
    const ps=__parts[+n]||[];
    if(!ps.length){ __dropped++; return ''; }
    if(ps.length>1) __split++;
    __kept+=ps.length;
    return ps.map(emitAABB).join('\n'); });
  cur.__csg={emitted:REG.length, pieces:__kept, dropped:__dropped, split:__split,
             кто:Object.entries(ВЫБР).sort((a,b)=>b[1]-a[1]).slice(0,4),
             поглощено:Object.entries(ПОГЛ).sort((a,b)=>b[1]-a[1]).slice(0,5)};
  cur.__ядер={всего:ЯДРА.length, скелетов:cur.__скелетов||0,
              пропало:cur.__ядерПропало||0,  // тела нет вовсе — рама ушла следом
              безРамы:cur.__безРамы||0,      // тело срезано в блин — осталось без рамы
              почему:cur.__ядерПочему, где:cur.__ядерГде, доли:cur.__ядерДоли};
  cur.__борта=БОРТОВ;                 // ящиков с рамой; счётчик для гейта и povtor
  cur.__вложено=ВЛОЖ;                 // тел укрытий, целиком сидевших внутри соседа
  { const шт=new Set(РЕЗРАМОЙ);
    cur.__резРамой={коробок:шт.size, всего:РЕЗРАМОЙ.length,
      примеры:[...шт].slice(0,5).map(i=>{const q=REG[i]||{};
        return [Math.round((q.x0+q.x1)/2),Math.round((q.y0+q.y1)/2),Math.round(q.z0),q.at||'?'];})}; }
  /* ============ v134-замер: ЭКСПОРТ ЗАКРЫЛ КЛЕТКУ, КОТОРУЮ РАСТР СЧИТАЕТ ПОЛОМ ==
     v132 закрыл расхождение по ВЫСОТЕ пола. Осталось расхождение по ПЛАНУ:
     растр говорит «здесь пол», а в файл над этим полом уходит сплошной объём.
     Замер по .vmf нашёл стену 400 юнитов длиной между двумя каллаутами в 606
     юнитах друг от друга — при том, что сам генератор эту пару считал нормальной.
     Считаем прямо: для каждой клетки пола смотрим, не занят ли объём от
     поверхности до поверхности+72 (рост игрока) чем-нибудь высоким.
     Укрытия и предметы мест НЕ в счёт: они ставятся поверх пола сознательно,
     и дейкстра генератора их и не должна видеть. В счёт идут стены и структуры,
     то есть всё, что выше 200 юнитов. */
  { const блок=new Uint8Array(W*H); let высоких=0; const виновники={};
    /* v136: кто именно закрыл клетку — нужно, чтобы назвать виновника отрезанного
       куска карты, а не просто сосчитать закрытые клетки */
    const вин2=new Array(W*H);
    for(const b of REG){
      if(isTool(b.m)) continue;
      /* v134.1. Фильтр «только выше 200» отсекал перекрытия: крыша тоннеля 96u,
         плита палубы 16u. А закрывают клетку они точно так же, как стена.
         Считаем всех и раскладываем по виновникам. */
      if((b.z1-b.z0)<24) continue;                       // обвязка и трим не в счёт
      высоких++;
      const cx0=Math.max(0,Math.floor(b.x0/S)), cx1=Math.min(W-1,Math.ceil(b.x1/S)-1);
      const cy0=Math.max(0,Math.floor((H*S-b.y1)/S)), cy1=Math.min(H-1,Math.ceil((H*S-b.y0)/S)-1);
      for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){
        const i=cy*W+cx; if(!g[i]||блок[i]) continue;
        const пол=SURF[i];
        if(b.z1>пол+4 && b.z0<пол+68){ блок[i]=1;
          if(b.at){ виновники[b.at]=(виновники[b.at]||0)+1; вин2[i]=b.at; } } } }
    let закрыто=0, пола=0;
    for(let i=0;i<W*H;i++) if(g[i]){ пола++; if(блок[i]) закрыто++; }
    cur.__block={закрыто, пола, доля:+(100*закрыто/Math.max(1,пола)).toFixed(1),
                 высокихБрашей:высоких,
                 виновники:Object.entries(виновники).sort((a,b)=>b[1]-a[1]).slice(0,6)};
    /* ============ v136. ПРИЁМКА ВНУТРИ ПРОДУКТА ============
       До сих пор ответ на «а пройдёт ли там игрок» жил только снаружи, в
       tools/oba.py: собери карту, выгрузи растр, разбери .vmf, наложи одно на
       другое. Пять минут на карту и ни одной цифры в гейте по существу.
       Здесь то же самое, но по данным, которые уже посчитаны: SURF — настоящая
       напечатанная поверхность, блок[] — где напечатанное занимает объём игрока
       над этой поверхностью. Узел — блок 2x2 без перекрытий, отметка — максимум
       SURF по блоку, подъём не выше 59u, спуск свободный.
       Считаем разницу двух волн от спавна T: по растру (тела не видны) и по
       печати. Всё, что достижимо в первой и недостижимо во второй, — проход,
       который генератор считает открытым, а игрок в него не пройдёт.
       На замерянной карте это было 1421 клетка: одна пилястра поперёк проёма
       отрезала плент A целиком. */
    { const D8п=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      const ПР=59;
      const узР=new Uint8Array(W*H), узП=new Uint8Array(W*H), zУ=new Float32Array(W*H);
      for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){ const i=y*W+x;
        if(!(g[i]&&g[i+1]&&g[i+W]&&g[i+W+1])) continue;
        узР[i]=1; zУ[i]=Math.max(SURF[i],SURF[i+1],SURF[i+W],SURF[i+W+1]);
        if(!(блок[i]||блок[i+1]||блок[i+W]||блок[i+W+1])) узП[i]=1; }
      /* Старт ищется в радиусе до 24 клеток, а не 6. При меньшем радиусе на
         карте, где спавн T стоит у самой стены и ближайший свободный узел
         печати дальше, разлив по печати не начинался вовсе — и мера показывала
         86% недоступного пола вместо одиннадцати клеток.
         v139. Радиуса мало: берётся не «первый узел, какой попался», а САМЫЙ
         БОЛЬШОЙ кусок среди тех, что лежат рядом со спавном. Тот же симптом
         вернулся — 87.8% недоступного пола на карте, где два независимых прибора
         (tools/oba.py и tools/vidno.py по .vmf) не видели ничего: ближайшим к
         спавну узлом печати оказался карман из пары клеток, и волна вся ушла в
         него. Радиус такое не лечит, лечит выбор куска.
         Размер кармана у САМОГО близкого узла остаётся наружу отдельным числом:
         если спавн действительно замурован, это видно, а не спрятано. */
      let стартКарман=0, стартКусков=0;
      const разлив=(маска)=>{
        const st=cur.px&&cur.px.T; if(!st) return new Int32Array(W*H).fill(-1);
        const канд=[];
        for(let r=0;r<=24;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
          if(Math.max(Math.abs(ox),Math.abs(oy))!==r) continue;
          const x=st.x+ox, y=st.y+oy;
          if(x<0||y<0||x>=W-1||y>=H-1) continue;
          const j=y*W+x; if(маска[j]) канд.push(j); }
        if(!канд.length) return new Int32Array(W*H).fill(-1);
        let всего=0; for(let i=0;i<W*H;i++) if(маска[i]) всего++;
        const видано=new Uint8Array(W*H);
        let лучш=null, лучшN=0, первый=0, кусков=0;
        for(let n=0;n<канд.length&&кусков<8;n++){
          const s0=канд[n]; if(видано[s0]) continue;
          кусков++;
          const d=new Int32Array(W*H).fill(-1);
          const q=[s0]; d[s0]=0;
          for(let h=0;h<q.length;h++){ const i=q[h], x=i%W, y=(i/W)|0, zi=zУ[i], nd=d[i]+1;
            for(const dd of D8п){ const nx=x+dd[0], ny=y+dd[1];
              if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
              const j=ny*W+nx; if(!маска[j]||d[j]>=0) continue;
              if(zУ[j]-zi>ПР) continue;
              d[j]=nd; q.push(j); } }
          for(let h=0;h<q.length;h++) видано[q[h]]=1;
          if(!первый) первый=q.length;
          if(q.length>лучшN){ лучшN=q.length; лучш=d; }
          if(лучшN*2>=всего) break; }
        if(маска===узП){ стартКарман=первый; стартКусков=кусков; }
        return лучш||new Int32Array(W*H).fill(-1); };
      const дистР=разлив(узР), дистП=разлив(узП);
      const вР=дистР, вП=дистП;
      /* Клетка ПОД ящиком недоступна по определению — она занята, и это не
         дефект. Дефект — клетка, которая осталась годным местом для игрока
         (узел в печати есть) и при этом до неё больше не дойти. Ровно то же
         различение, что в чистке укрытий (v120): иначе меряется площадь пола,
         а не проходимость. */
      let дР=0, потеряно=0; const потМ=new Uint8Array(W*H);
      for(let i=0;i<W*H;i++){ if(вР[i]<0) continue; дР++;
        if(вП[i]>=0||!узП[i]) continue; потеряно++; потМ[i]=1; }
      /* ============ КРЮК ПО ВСЕМУ ПОЛУ ============
         «Недоступно» ловит только полный обрыв связи. Ящик, который не отрезал
         кусок, а удлинил дорогу вчетверо, тут не виден — а именно он даёт крюк
         между каллаутами. Меряем то же самое по КАЖДОЙ клетке: во сколько раз
         путь по печати длиннее пути по растру от одной и той же точки. Пар
         каллаутов два десятка, клеток тридцать тысяч — число куда устойчивее. */
      let кривых=0, крМакс=0;
      for(let i=0;i<W*H;i++){ if(вР[i]<8||вП[i]<0) continue;
        const k=вП[i]/вР[i]; if(k>крМакс) крМакс=k;
        if(вП[i] > вР[i]*2+12) кривых++; }
      /* виновник ищется НА ГРАНИЦЕ потерянного: кто стоит между ним и остальной
         картой. Сама потерянная клетка чиста — потому она и потеряна, а не занята. */
      const винП={};
      for(let i=0;i<W*H;i++){ if(!потМ[i]) continue;
        const x=i%W, y=(i/W)|0;
        for(const d of D8п){ const nx=x+d[0], ny=y+d[1];
          if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
          const j=ny*W+nx; if(потМ[j]||вП[j]>=0) continue;
          for(const o of [0,1,W,W+1]) if(блок[j+o]&&вин2[j+o]){
            винП[вин2[j+o]]=(винП[вин2[j+o]]||0)+1; break; } } }
      /* ============ v136.2. СВЕРКА ПАР ВНУТРИ ПРОДУКТА ============
         Крюк по растру и крюк по .vmf на одной карте расходились впятеро, и
         каждый разбор требовал выгрузки, разбора файла и получаса. Здесь та же
         сверка пара-в-пару, но по данным, которые уже посчитаны: две сетки узлов
         (растр и печать), один список мест, один якорь. Печатается худшая пара и
         кто её закрыл — дальше идти уже некуда, виновник назван. */
      { const P=(cur.places&&cur.places.list)||[];
        const бл=(м,cx,cy)=>{ let b=-1,bd=1e9;
          for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
            const x=cx+dx,y=cy+dy; if(x<0||y<0||x>=W-1||y>=H-1) continue;
            const j=y*W+x; if(!м[j]) continue; const q=dx*dx+dy*dy;
            if(q<bd){bd=q;b=j;} } return b; };
        const вл=(м,s0)=>{ const d=new Int32Array(W*H).fill(-1);
          const q=[s0]; d[s0]=0;
          for(let h=0;h<q.length;h++){ const i=q[h], x=i%W, y=(i/W)|0, zi=zУ[i], nd=d[i]+1;
            for(const dd of D8п){ const nx=x+dd[0], ny=y+dd[1];
              if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
              const j=ny*W+nx; if(!м[j]||d[j]>=0||zУ[j]-zi>ПР) continue;
              d[j]=nd; q.push(j); } }
          return d; };
        const тР=P.map(p=>бл(узР,(p.ax!==undefined?p.ax:p.x),(p.ay!==undefined?p.ay:p.y)));
        const тП=P.map(p=>бл(узП,(p.ax!==undefined?p.ax:p.x),(p.ay!==undefined?p.ay:p.y)));
        let худ=null, хужеП=0, парП=0, нетП=0, мкП=0;
        for(let i=0;i<P.length;i++){ if(тР[i]<0||тП[i]<0) continue;
          let dр=null, dп=null;
          for(let j=i+1;j<P.length;j++){ if(тР[j]<0||тП[j]<0) continue;
            const ax=(P[i].ax!==undefined?P[i].ax:P[i].x), ay=(P[i].ay!==undefined?P[i].ay:P[i].y);
            const bx=(P[j].ax!==undefined?P[j].ax:P[j].x), by=(P[j].ay!==undefined?P[j].ay:P[j].y);
            const пр=Math.hypot(ax-bx, ay-by);
            if(пр*S>1800||пр*S<200) continue;
            if(!dр){ dр=вл(узР,тР[i]); dп=вл(узП,тП[i]); }
            парП++;
            const kр=(dр[тР[j]]<0)?1e9:dр[тР[j]]/пр;
            const kп=(dп[тП[j]]<0)?1e9:dп[тП[j]]/пр;
            if(kп>1e8){ нетП++; хужеП++; continue; }
            if(kп>мкП) мкП=kп;
            if(kп>2) хужеП++;
            const раз=kп-(kр>1e8?0:kр);
            if(!худ||раз>худ.раз) худ={раз:+раз.toFixed(2), пара:(P[i].им||'?')+'->'+(P[j].им||'?'),
                                       растр:+Math.min(kр,99).toFixed(2), печать:+kп.toFixed(2),
                                       i, j}; } }
        /* Кто закрыл короткую дорогу. Идём КРАТЧАЙШИМ ПУТЁМ ПО РАСТРУ от одного
           места к другому и смотрим, какие его клетки печать закрыла. Это и есть
           ответ на «где ты забаррикадировал проход» — строкой кода, а не пальцем
           по скриншоту. */
        if(худ && худ.раз>0.5){
          const d0=вл(узР,тР[худ.i]); let c=тР[худ.j]; const вин={}; let закр=0;
          for(let шаг=0; шаг<20000 && c>=0 && d0[c]>0; шаг++){
            const x=c%W, y=(c/W)|0; let сл=-1;
            for(const dd of D8п){ const nx=x+dd[0], ny=y+dd[1];
              if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
              const j2=ny*W+nx; if(d0[j2]===d0[c]-1){ сл=j2; break; } }
            if(!узП[c]){ закр++;
              for(const o of [0,1,W,W+1]) if(блок[c+o]&&вин2[c+o]){
                вин[вин2[c+o]]=(вин[вин2[c+o]]||0)+1; break; } }
            c=сл; }
          худ.закрытоНаПути=закр;
          худ.виновники=Object.entries(вин).sort((a,b)=>b[1]-a[1]).slice(0,3); }
        cur.__крюкПеч={максимум:+мкП.toFixed(2), хуже2:хужеП, пар:парП, путиНет:нетП,
                       расхождение:худ};
        /* ============ v139. ГОРЛО НА МАРШРУТЕ ============
           «Доля узких клеток» ничего не говорит: их бывает 0.1%, и все они ровно
           на тех перекрёстках, где ходят. Игрок видит МИНИМУМ вдоль своего пути.
           Считаем ширину свободного места в каждой клетке (круг, вписанный между
           стенами), потом для каждой пары соседних мест ищем МАКСИМИННЫЙ путь:
           тот, чьё самое узкое место шире всех. Это и есть ответ на вопрос
           «насколько узко в самом узком месте по дороге отсюда туда».
           Порог 96u не выдуман: он записан ещё в v120.3 — «проём уже 96u это
           щель, а не проход». Тогда я поменял только порог ИЗМЕРЕНИЯ мест, а
           код, который щели производит, не тронул. Теперь их видно. */
        const ДТ=new Int32Array(W*H).fill(1e9);
        for(let i=0;i<W*H;i++) if(!узП[i]) ДТ[i]=0;
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!ДТ[i]) continue;
          let b=1e9;
          if(x>0) b=Math.min(b,ДТ[i-1]+2); if(y>0) b=Math.min(b,ДТ[i-W]+2);
          if(x>0&&y>0) b=Math.min(b,ДТ[i-W-1]+3);
          if(x<W-1&&y>0) b=Math.min(b,ДТ[i-W+1]+3);
          if(b<ДТ[i]) ДТ[i]=b; }
        for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){ const i=y*W+x; if(!ДТ[i]) continue;
          let b=ДТ[i];
          if(x<W-1) b=Math.min(b,ДТ[i+1]+2); if(y<H-1) b=Math.min(b,ДТ[i+W]+2);
          if(x<W-1&&y<H-1) b=Math.min(b,ДТ[i+W+1]+3);
          if(x>0&&y<H-1) b=Math.min(b,ДТ[i+W-1]+3);
          ДТ[i]=b; }
        /* ширина = диаметр самого крупного свободного круга, накрывающего клетку */
        const ШИР=new Int32Array(W*H);
        for(let i=0;i<W*H;i++){ if(!узП[i]) continue;
          const r=ДТ[i]/2; if(r<0.5) continue;
          const R=r|0, cx=i%W, cy=(i/W)|0, d=Math.round(2*r*S);
          for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
            if(dx*dx+dy*dy>r*r) continue;
            const x=cx+dx, y=cy+dy; if(x<0||y<0||x>=W||y>=H) continue;
            const j=y*W+x; if(узП[j] && d>ШИР[j]) ШИР[j]=d; } }
        /* максиминный путь: пороги по убыванию, флуд только по широким клеткам */
        const ПОРОГИ=[256,224,192,160,128,112,96,80,64,48,32,16];
        const тП2=P.map(p=>бл(узП,(p.ax!==undefined?p.ax:p.x),(p.ay!==undefined?p.ay:p.y)));
        const близко=[];
        for(let i=0;i<P.length;i++){ if(тП2[i]<0) continue;
          for(let j=i+1;j<P.length;j++){ if(тП2[j]<0) continue;
            const ax=(P[i].ax!==undefined?P[i].ax:P[i].x), ay=(P[i].ay!==undefined?P[i].ay:P[i].y);
            const bx=(P[j].ax!==undefined?P[j].ax:P[j].x), by=(P[j].ay!==undefined?P[j].ay:P[j].y);
            const пр=Math.hypot(ax-bx,ay-by)*S;
            if(пр>1800||пр<200) continue;
            близко.push([i,j]); } }
        const горло=new Map();
        for(const пор of ПОРОГИ){
          const надо=близко.filter(([i,j])=>!горло.has(i+'|'+j));
          if(!надо.length) break;
          const исх=new Set(надо.map(([i])=>i));
          for(const i of исх){
            const s0=тП2[i]; if(ШИР[s0]<пор) continue;
            const v=new Uint8Array(W*H); const q=[s0]; v[s0]=1;
            for(let h=0;h<q.length;h++){ const c=q[h], x=c%W, y=(c/W)|0;
              for(const d of D8п){ const nx=x+d[0], ny=y+d[1];
                if(nx<0||ny<0||nx>=W-1||ny>=H-1) continue;
                const k=ny*W+nx; if(v[k]||!узП[k]||ШИР[k]<пор) continue;
                if(zУ[k]-zУ[c]>ПР) continue;
                v[k]=1; q.push(k); } }
            for(const [a,b2] of надо) if(a===i && v[тП2[b2]]) горло.set(a+'|'+b2, пор); } }
        const зн=[]; const плохие=[];
        for(const [i,j] of близко){ const w=горло.get(i+'|'+j)||0; зн.push(w);
          if(w<96) плохие.push([w,(P[i].им||'?')+'->'+(P[j].им||'?')]); }
        зн.sort((a,b)=>a-b); плохие.sort((a,b)=>a[0]-b[0]);
        cur.__горло={пар:зн.length, медиана:зн.length?зн[зн.length>>1]:0,
                     худшее:зн.length?зн[0]:0,
                     уже96:зн.filter(w=>w<96).length, уже128:зн.filter(w=>w<128).length,
                     список:плохие.slice(0,6)}; }
      cur.__недост={потеряно, достижимо:дР, кривых, стартКарман, стартКусков,
                    крюкПола:+крМакс.toFixed(2),
                    доляКривых:+(100*кривых/Math.max(1,дР)).toFixed(1),
                    доля:+(100*потеряно/Math.max(1,дР)).toFixed(1),
                    виновники:Object.entries(винП).sort((a,b)=>b[1]-a[1]).slice(0,5)}; } }
  /* v132-замер: насколько напечатанная поверхность расходится с растром.
     Растр — это карта, по которой генератор считает связность, тайминги и баланс.
     Если игрок ходит по другой, все расчёты не про эту карту. */
  { let n=0, mx=0, над59=0, над24=0;
    /* Плато паласа задаёт SURF своей отметкой поверх zfield. Если zfield там
       другой, растр и экспорт снова расходятся — но уже не по всей карте, а
       пятном, и пятно это ровно плато. Считаем отдельно и БЕЗ фильтра по g:
       плато может быть не отмечено полом. */
    { let пн=0, пмх=0, пвсего=0; const пр=[];
      if(cur.palaces) for(const q of cur.palaces)
        for(let y=Math.max(0,q.y0);y<=Math.min(H-1,q.y1);y++)
          for(let x=Math.max(0,q.x0);x<=Math.min(W-1,q.x1);x++){
            const i=y*W+x; пвсего++;
            const d=Math.abs(qz(q.topZ)-qz(zf[i]||0));
            if(d>1){ пн++; if(d>пмх)пмх=d;
              if(пр.length<12) пр.push({x,y,плато:qz(q.topZ),растр:qz(zf[i]||0),
                                        пол:g[i]?1:0,печать:Math.round(SURF[i])}); } }
      cur.__palas={клеток:пвсего, расходятся:пн, максимум:Math.round(пмх),
                   плато:(cur.palaces||[]).length, примеры:пр}; }
    const прс=[];
    for(let i=0;i<W*H;i++){ if(!g[i]) continue;
      const d=Math.abs(SURF[i]-qz(zf[i]||0)); if(d>1){ n++; if(d>mx)mx=d;
        if(прс.length<12) прс.push({x:i%W,y:(i/W)|0,печать:Math.round(SURF[i]),растр:qz(zf[i]||0)}); }
      if(d>59) над59++; if(d>24) над24++; }
    cur.__surf={расходятся:n, максимум:Math.round(mx), больше24:над24, больше59:над59, примеры:прс,
                всегоПола:(()=>{let k=0;for(let i=0;i<W*H;i++) if(g[i])k++; return k;})()}; }
  cur.__uv={подогнано:UVFIT.fit, сетка:UVFIT.grid, перекос:UVFIT.stretch,
            рисунок:V127.want, натура:V127.unit, всё:!!V127.all};
  /* выгрузка для tools/uvchk.js: включается только извне, чтобы обычный экспорт
     не тащил за собой копию всего списка коробок */
  if(typeof window!=='undefined' && (window.__UVDUMP||window.__TAGBOX))
    window.__REGDUMP=REG.map(b=>({x0:b.x0,y0:b.y0,z0:b.z0,x1:b.x1,y1:b.y1,z1:b.z1,
      uv:b.uv, at:b.at, split:(b.__parts||[]).length>1}));
  return __txt.replace(/\n{3,}/g,'\n');
}
function downloadVMF(){ if(!cur){return;} useCur(); const txt=buildVMF(cur);
  const blob=new Blob([txt],{type:'text/plain'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='izohrona_'+cur.seed+'.vmf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

// по 7 реальным картам при клетке 96u: mirage 36x42, anubis 40x52, ancient 43x44, inferno 48x42, dust2 46x62
const SIZES=[[36,42],[40,46],[43,48],[46,54],[52,60]], SIZENAME=['мираж','анубис','медиана','инферно','даст2'];
const sSize=document.getElementById('sSize');
sSize.oninput=()=>{ vSize.textContent=SIZENAME[+sSize.value]; };
sSize.onchange=()=>{ const s=SIZES[+sSize.value]; setSize(s[0],s[1]); run(); };
const sWidth=document.getElementById('sWidth'), vWidth=document.getElementById('vWidth');
const WNAME={'-1':'уже','0':'обычно','1':'шире','2':'широко'};
sWidth.oninput=()=>{ vWidth.textContent=WNAME[sWidth.value]; };
sWidth.onchange=()=>{ PWIDTH=parseInt(sWidth.value); run(); };
const sVert=document.getElementById('sVert'), sRing=document.getElementById('sRing');
sVert.oninput=()=>vVert.textContent=parseFloat(sVert.value)<0.8?'мягкая':parseFloat(sVert.value)>1.3?'резкая':'норма';
sRing.oninput=()=>vRing.textContent=parseFloat(sRing.value)<0.4?'мало':parseFloat(sRing.value)>0.65?'много':'средне';
const sCov=document.getElementById('sCov');
/* v120. ОДНА РУЧКА, ОДНА ВЕЛИЧИНА. Ползунков с id="sCov" было ДВА: 3..9 и 0..1.
   getElementById возвращает первый, поэтому второй молча ничего не делал, а в
   COVDENS (плотность, 0..1) уезжало сырое 3..9 и зажималось до единицы — то есть
   плотность всегда стояла на максимуме, что бы ни стояло на ручке.
   Ручка означает РАДИУС ДОСЫПКИ (V71F.fillR, в клетках): чем больше, тем дальше
   от уже стоящего тела должно быть пустое место, чтобы туда что-то поставили,
   то есть тем реже. Профили настраивались именно под неё.
   COVDENS остаётся отдельной величиной и держится на 1.0 — на этом значении
   сняты все замеры v120 и на нём укрытий выходит 105..139 вместо 61..82.
   Выводить её из той же ручки — значит крутить одним движком две вещи разом
   и вдвое, а «слишком много пустого пространства» было прямым замечанием. */
sCov.oninput=()=>{ const v=parseFloat(sCov.value);
  document.getElementById('vCov').textContent=v<=4?'гуще':v>=8?'реже':'средне';
  recoverLater(false); };
