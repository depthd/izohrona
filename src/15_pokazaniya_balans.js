/* ===== v92. ПАНЕЛЬ ПОКАЗАНИЙ =====
   ВНИМАНИЕ: числа считаются на сетке генератора 96u по маске проходимости.
   Они сравнимы МЕЖДУ прогонами генератора (тумблер вкл/выкл, режим A/B),
   и НЕ сравнимы с числами по реальным картам: там сетка 8u и меш,
   восстановленный из геометрии. Смешивать два растра — ошибка №5 свода. */
function auditStats(g,W,H){
  const U=CELL, INF=1e9, D=new Float32Array(W*H);
  for(let i=0;i<W*H;i++) D[i]=g[i]?INF:0;
  for(let y=1;y<H;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i])continue;
    D[i]=Math.min(D[i],D[i-W]+1,D[i-1]+1,D[i-W-1]+1.4142,D[i-W+1]+1.4142); }
  for(let y=H-2;y>=0;y--)for(let x=W-2;x>=1;x--){ const i=y*W+x; if(!g[i])continue;
    D[i]=Math.min(D[i],D[i+W]+1,D[i+1]+1,D[i+W+1]+1.4142,D[i+W-1]+1.4142); }
  const wid=[];                                   // ширина на срединной оси
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i])continue;
    let mx=0; for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ const j=i+oy*W+ox; if(g[j]&&D[j]>mx)mx=D[j]; }
    if(D[i]>=mx-1e-6) wid.push(D[i]*2*U); }
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const S=new Float32Array(W*H);
  for(const [dx,dy] of DIRS){ const len=(dx&&dy)?1.4142:1, R=new Float32Array(W*H);
    const xa=dx>0?1:W-2, xb=dx>0?W-1:0, xs=dx>0?1:-1;
    const ya=dy>0?1:H-2, yb=dy>0?H-1:0, ys=dy>0?1:-1;
    for(let y=ya;y!==yb;y+=ys)for(let x=xa;x!==xb;x+=xs){ const i=y*W+x;
      if(!g[i]){R[i]=0;continue;} const j=(y-dy)*W+(x-dx); R[i]=(g[j]?R[j]:0)+1; }
    for(let i=0;i<W*H;i++) if(g[i]&&(R[i]-1)*len>S[i]) S[i]=(R[i]-1)*len; }
  const sight=[]; for(let i=0;i<W*H;i++) if(g[i]) sight.push(S[i]*U);
  // расстояние до ближайшей горловины (проход уже 160u)
  const dist=new Int32Array(W*H).fill(-1), q=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(g[i]&&D[i]*2*U<=192.5){dist[i]=0;q.push(i);} }
  for(let h=0;h<q.length;h++){ const i=q[h];
    for(const d of [1,-1,W,-W]){ const j=i+d; if(j<0||j>=W*H||!g[j]||dist[j]>=0)continue; dist[j]=dist[i]+1; q.push(j); } }
  const dth=[]; let unreach=0;
  for(let i=0;i<W*H;i++) if(g[i]){ if(dist[i]<0) unreach++; else dth.push(dist[i]*U); }
  // плотность: пол к габаритной рамке пола
  let x0=W,x1=0,y0=H,y1=0,cells=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(g[y*W+x]){cells++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;}
  // ДЛИНА узкого места — критерий приёмки v93. У реальных карт медиана 16-24u.
  const narrowW=Math.max(2*U, 200);
  const nar=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i])continue;
    let mxn=0; for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ const j=i+oy*W+ox; if(g[j]&&D[j]>mxn)mxn=D[j]; }
    if(D[i]>=mxn-1e-6 && D[i]*2*U<narrowW) nar[i]=1; }
  const seenN=new Uint8Array(W*H), lens=[];
  for(let i=0;i<W*H;i++){ if(!nar[i]||seenN[i])continue;
    const st=[i]; seenN[i]=1; let c=0;
    while(st.length){ const j=st.pop(); c++;
      for(const d of [1,-1,W,-W,W+1,W-1,-W+1,-W-1]){ const k=j+d;
        if(k<0||k>=W*H||!nar[k]||seenN[k])continue; seenN[k]=1; st.push(k); } }
    lens.push(c*U); }
  const q50=a=>{ if(!a.length)return 0; const b=a.slice().sort((u,v)=>u-v); return b[b.length>>1]; };
  const q90=a=>{ if(!a.length)return 0; const b=a.slice().sort((u,v)=>u-v); return b[Math.floor(b.length*0.9)]; };
  return { cells, dens:100*cells/Math.max(1,(x1-x0+1)*(y1-y0+1)),
           wMed:q50(wid), w90:q90(wid),
           thin:100*wid.filter(v=>v<192).length/Math.max(1,wid.length),
           wide:100*wid.filter(v=>v>448).length/Math.max(1,wid.length),
           sMed:q50(sight), s90:q90(sight), sMax:Math.max(0,...sight),
           tMed:q50(dth), t90:q90(dth), noThroat:unreach,
           narN:lens.length, narLen:q50(lens), narLen90:q90(lens) };
}
function reach(g,W,H,px){                       // добираются ли пленты от T-спавна
  const seen=new Uint8Array(W*H), q=[]; const st=px.T; if(!st) return {A:false,B:false};
  let s=-1; for(let r=0;r<8&&s<0;r++)for(let oy=-r;oy<=r&&s<0;oy++)for(let ox=-r;ox<=r;ox++){
    const x=st.x+ox,y=st.y+oy; if(x>0&&y>0&&x<W-1&&y<H-1&&g[y*W+x]){s=y*W+x;break;} }
  if(s<0) return {A:false,B:false};
  seen[s]=1; q.push(s);
  for(let h=0;h<q.length;h++){ const i=q[h];
    for(const d of [1,-1,W,-W]){ const j=i+d; if(j<0||j>=W*H||!g[j]||seen[j])continue; seen[j]=1; q.push(j); } }
  const hit=k=>{ const n=px[k]; if(!n)return false;
    for(let oy=-3;oy<=3;oy++)for(let ox=-3;ox<=3;ox++){ const x=n.x+ox,y=n.y+oy;
      if(x>0&&y>0&&x<W-1&&y<H-1&&seen[y*W+x]) return true; } return false; };
  return {A:hit('A'),B:hit('B')};
}
/* v96. ДВЕРИ И УКРЫТИЯ. Двери решаются в planStructures, ПОСЛЕ makeCover, и в маску
   проходимости не пишутся вовсе («двери: VMF + отметки на карте, g не трогает»).
   Поэтому укрытие спокойно встаёт в проём, а сверху садится арка 128–168u — и пройти
   нельзя. Замер до правки: 80 дверей из 245 заставлены, на всех 12 картах есть.
   Правило узкое, чтобы не надевать на генератор наручники:
     • в самой клетке проёма укрытий нет вообще (там ещё и арка сверху);
     • на клетке подхода с каждой стороны нет только высоких — низкий ящик не мешает.
   Только удаляет, ничего не двигает и не добавляет: связность сломать не может. */
function clearDoorways(r){
  if(!r||!r.cover||!r.plan||!r.plan.doors) return 0;
  const door=new Set(), appr=new Set();
  for(const d of r.plan.doors){
    const n=d.w||1;
    for(let k=0;k<n;k++){
      const cx=(d.axis==='Y')?d.x+k:d.x, cy=(d.axis==='Y')?d.y:d.y+k;
      door.add(cy*W+cx);
      if(d.axis==='Y'){ appr.add((cy-1)*W+cx); appr.add((cy+1)*W+cx); }
      else            { appr.add(cy*W+cx-1);   appr.add(cy*W+cx+1); }
    }
  }
  const keep=[]; let cut=0;
  for(const c of r.cover){
    const w=c.w||1, h=c.h||1, tall=(c.hgt==='full')||((+c.hgt||40)>54);
    let bad=false;
    for(let oy=0;oy<h&&!bad;oy++)for(let ox=0;ox<w;ox++){
      const i=(c.y+oy)*W+(c.x+ox);
      if(door.has(i) || (tall&&appr.has(i))){ bad=true; break; }
    }
    if(bad) cut++; else keep.push(c);
  }
  r.cover=keep; r.coverCut=cut; return cut;
}
function renderAudit(){
  const el=document.getElementById('audit'); if(!el) return;
  if(!V92.audit||!cur){ el.innerHTML=''; return; }
  const a=auditStats(cur.g,W,H), r=reach(cur.g,W,H,cur.px);
  const z=cur.zones?cur.zones.area.filter(v=>v>0).length:0;
  const bad=(!r.A||!r.B)?`<span style="color:#e06c5a">пленты от T: A ${r.A?'да':'НЕТ'} · B ${r.B?'да':'НЕТ'}</span><br>`:'';
  el.innerHTML =
    `<b>ПОКАЗАНИЯ</b> <span style='color:#7d92a4'>(сетка ${CELL}u, сравнивать только с другими прогонами генератора)</span><br>`+
    bad+
    `пол <b>${a.cells}</b> кл · плотность <b>${a.dens.toFixed(0)}%</b> · зон непустых <b>${z}</b> · развилок <b>${cur.zones?cur.zones.junc.length:0}</b><br>`+
    `ширина: медиана <b>${a.wMed.toFixed(0)}u</b> · p90 ${a.w90.toFixed(0)}u · уже 192u <b>${a.thin.toFixed(0)}%</b> · шире 448u ${a.wide.toFixed(0)}%<br>`+
    `луч: медиана <b>${a.sMed.toFixed(0)}u</b> · p90 <b>${a.s90.toFixed(0)}u</b> · макс ${a.sMax.toFixed(0)}u<br>`+
    `узких мест <b>${a.narN}</b> · <b>ДЛИНА медиана ${a.narLen.toFixed(0)}u</b> · p90 ${a.narLen90.toFixed(0)}u `+
    `<span style='color:#7d92a4'>(реальные: dust2 16u, tuscan 24u)</span><br>`+
    (cur.drift?`<b>контроль по мелкому растру:</b> перевес A ${f1(cur.mFine.mA)} с, B ${f1(cur.mFine.mB)} с `+
        `<span style='color:${Math.max(Math.abs(cur.drift.A),Math.abs(cur.drift.B))>1.0?"#e8a24a":"#7d92a4"}'>`+
        `(расхождение с планом ${cur.drift.A>=0?"+":""}${f1(cur.drift.A)} / ${cur.drift.B>=0?"+":""}${f1(cur.drift.B)} с)</span><br>`:'')+
    `клетка растра <b>${CELL}u</b> · сетка ${W}x${H}`+(cur.coverCut?` · <span style='color:#7d92a4'>снято укрытий из проёмов: ${cur.coverCut}</span>`:'')+
    placesAudit();
}
/* ============ v120. ПРИЁМКА ПО МЕСТАМ ============
   У проекта не было критерия «хорошо/плохо» (SVODKA_2 §7.1): все метрики попадали
   внутрь полосы реальных карт, и ни одна не отличала удачную карту от неудачной.
   Критерий, который отличает, — не габаритный, а содержательный, и он ровно про то,
   что было обведено на скриншотах. У места должно быть четыре вещи:

     имя      — иначе про него нельзя сказать ни слова (розовое «пустое место»);
     предмет  — силуэт, по которому место узнаётся (то же розовое);
     два входа — иначе это тупик (красное);
     своя высота — иначе соседние места сливаются в одно (лаймовое «однобоко»).

   Числа-ориентиры сняты ТЕМ ЖЕ кодом с настоящих навов (tools/plcnode.js):
   мест 15..25, площадь места 282..538k, входов медиана 2..5, тупиков 0..3. */
function placesAudit(){
  const P=cur&&cur.places; if(!P||!P.list||!P.list.length) return '';
  const L=P.list, zf=cur.zfield;
  const zOf=p=>((zf?zf[Math.min(W*H-1,p.y*W+p.x)]:0)||0)*72;
  const ent=L.map(p=>p.ent).sort((a,b)=>a-b);
  const туп=L.filter(p=>p.ent<2), безИм=L.filter(p=>!p.им), безПр=L.filter(p=>!p.lm);
  /* «своя высота»: хотя бы один сосед отличается по отметке на ступень (>=48u) */
  const плоск=L.filter(p=>{ if(!p.nb||!p.nb.size) return false; const z0=zOf(p);
    for(const n of p.nb){ const q=L[n]; if(q&&Math.abs(zOf(q)-z0)>=48) return false; }
    return true; });
  const пол=L.reduce((s,p)=>s+p.area,0);
  const ок=(v,lo,hi)=>v>=lo&&v<=hi?'#7fbf7f':'#e8a24a';
  const bad=v=>v?'#e06c5a':'#7fbf7f';
  /* v122. Критерий тупика переписан. Было «тупик без предмета» — и он пропускал
     комнату в четверть мегаюнита на краю карты, потому что в ней стояли бочки.
     Предмет тупик не оправдывает. Оправдывает РАЗМЕР: ниша до 120k u² это закуток
     на маршруте (такие есть у всех реальных карт), а всё крупнее — мёртвый груз,
     куда игрок зайдёт один раз и больше не вернётся. */
  const тупИм=туп.filter(p=>p.area>120);     // крупный тупик — вот это и есть дефект
  return `<br><b>ПРИЁМКА ПО МЕСТАМ</b> <span style='color:#7d92a4'>(эталон — те же навы тем же кодом)</span><br>`+
    `мест <b style='color:${ок(L.length,14,28)}'>${L.length}</b> `+
    `<span style='color:#7d92a4'>(реальные 15–25)</span> · `+
    `площадь места <b style='color:${ок(Math.round(пол/L.length),250,560)}'>${Math.round(пол/L.length)}k</b> `+
    `<span style='color:#7d92a4'>(282–538k)</span><br>`+
    `входов: медиана <b style='color:${ок(ent[ent.length>>1],2,6)}'>${ent[ent.length>>1]}</b> `+
    `· макс <b style='color:${ок(ent[ent.length-1],3,10)}'>${ent[ent.length-1]}</b> `+
    `<span style='color:#7d92a4'>(медиана 2–5, макс 5–10)</span><br>`+
    `<span style='color:${bad(безИм.length)}'>без имени ${безИм.length}</span> · `+
    `<span style='color:${bad(безПр.length>L.length*0.35?1:0)}'>без предмета ${безПр.length}</span> · `+
    `<span style='color:${bad(тупИм.length)}'>тупиков КРУПНЫХ ${тупИм.length}</span> `+
    `<span style='color:#7d92a4'>(тупиков всего ${туп.length}, у реальных 0–3)</span> · `+
    `<span style='color:${bad(плоск.length>L.length*0.6?1:0)}'>без своей высоты ${плоск.length}</span><br>`+
    `<span style='color:#7d92a4'>${L.slice().sort((a,b)=>b.area-a.area).slice(0,10).map(p=>p.им||'?').join(' · ')}</span>`;
}
let BAKING=false;
/* ============ v119. БАЛАНС С ОБРАТНОЙ СВЯЗЬЮ ============
   Решатель считает тайминги по плану 96u, а слой деталей потом меняет длины путей
   всерьёз: проёмы 112u вместо дыр во всю клетку, стены по границам зон, изломы,
   перегородки. Перевес защитника уезжал на 3.4..6.7 при цели 4.0 — то есть главное
   обещание «баланс по построению» не выполнялось.

   Считать баланс сразу по мелкому растру нельзя: решатель гоняет дейкстру двенадцать
   раз за попытку и двадцать попыток за карту, на 89 тысячах клеток это минуты.
   Поэтому обратная связь: собрали как есть, померили по мелкому, увидели снос,
   пересобрали с целью, сдвинутой на этот снос в обратную сторону. Снос у слоя
   деталей систематический, поэтому двух-трёх попыток хватает.
   Коррекция демпфированная (0.7), иначе решатель начинает раскачиваться. */
const BAL={ tries:4, tol:0.55, damp:0.7 };
/* v120. ПАМЯТЬ О СНОСЕ. Обратная связь начинала с нуля на КАЖДОЙ карте: первая
   попытка целилась мимо заведомо, вторая училась на первой. Но учится она на
   ОДНОЙ карте, а применяет к ДРУГОЙ — решатель на каждой попытке берёт новое
   зерно и строит новую геометрию. Поэтому за три попытки промах оставался
   0.5..1.6 с при допуске 0.55, и отметки мест (v120.2) его ещё увеличили:
   перепад высот стоит времени, дейкстра это честно считает.
   Снос у слоя деталей систематический — он свойство слоя, а не карты. Значит его
   надо помнить между картами, а не выводить заново каждый раз. Скользящее
   среднее: первая попытка следующей карты уже целится с поправкой. */
/* Память ПОСВОЙ ПРОФИЛЬ. Снос — свойство слоя деталей на конкретной геометрии,
   а профиль геометрию и меняет: ширину проходов, размер, вертикаль, кольца.
   С одной общей памятью cache получал поправку, выведенную на dust2 (-1.93),
   и промахивался на 1.84 с. */
const DRIFTBY={};

function buildDetail(r, cfg){
  const t0=performance.now();
  r.zones=computeZones(r);
  const f=detRefine(r);
  setSize(f.W,f.H); CELL=16; SC=6;
  f.m=Object.assign({},r.m); refineFields(f);
  try{ const mf=measure(f.g,f.px,cfg.CTtarget,f.zfield);
    if(mf){ f.mFine=mf; f.drift={A:mf.mA-r.m.mA, B:mf.mB-r.m.mB}; } }catch(e){ f.mFine=null; }
  f.det.ms=Math.round(performance.now()-t0);
  return f;
}

/* ============ v120. ПЕРЕСБОРКА ТЕЛ ============
   Три ручки — «перекатить укрытия», ползунок плотности и тумблер богатого декора —
   звали makeCover ПРЯМО ПО МЕЛКОМУ РАСТРУ. Там клетка 16u, поэтому «ящик в клетку»
   выходил размером 16 юнитов; габаритного прохода (32..64 x 76..132) не было вовсе,
   предметы мест не ставились, проверка проходимости не запускалась, чистка пробок
   тоже. То есть любая из трёх ручек молча превращала готовую карту в труху,
   причём ползунок плотности стоит на видимой панели.
   Правильно — пересобрать весь слой деталей на сохранённом крупном плане: rng слоя
   привязан к seed карты, поэтому геометрия выходит та же, меняются только тела. */
let __recT=null;
function recoverBodies(newSeed){
  if(!cur||!cur.__coarse||BAKING) return;
  const src=cur.__coarse;
  if(newSeed) src.coverSeed=(Math.random()*4294967296)>>>0;
  const cfg={CTtarget:parseFloat(sTempo.value), M:parseFloat(sMargin.value), jit:parseFloat(sJit.value),
             tol:1.0, tolMid:1.8, vert:parseFloat(sVert.value), ringP:parseFloat(sRing.value)};
  const cw=cur.__cw, ch=cur.__ch;
  let out=null;
  try{ setSize(cw,ch); CELL=96; SC=1; out=buildDetail(src,cfg); } catch(e){ out=null; }
  /* v141. Цель баланса переходит к пересобранной карте: без неё номер карты
     (сид:цель:ковёр) не открывает её заново. Геометрию это не трогает. */
  if(out){ out.CELL=out.CELL||16; out.__aim=cur.__aim; cur=out; }
  useCur(); cur.zones=computeZones(cur); draw(); paint(); renderAudit();
}
const recoverLater=(newSeed)=>{ clearTimeout(__recT);
  __recT=setTimeout(()=>recoverBodies(newSeed), 220); };   // ползунок сыплет событиями

function generateBalanced(cfg){
  const want=cfg.M;
  const pk=PROFILE||'—';
  let corr=(DRIFTBY[pk]!==undefined?DRIFTBY[pk]:0), best=null, bestErr=1e9, log=[];
  /* v136. ПОВТОР КАРТЫ ПО СИДУ. Одного сида мало: решатель баланса подсовывает
     генератору не cfg.M, а «цель» aim, а она зависит от сноса corr, накопленного
     за прошлые карты в этой же вкладке. Тот же сид при другой aim даёт другую
     карту — проверка правки на «плохом сиде» молча смотрела не на ту карту.
     Поэтому карта запоминает свою aim (cur.__aim), а приборы задают пару. */
  const ПОВТОР=(typeof window!=='undefined' && window.__SEED)
    ?{сид:window.__SEED>>>0, аим:window.__AIM, ков:window.__COVSEED}:null;
  for(let att=0; att<BAL.tries; att++){
    const aim=(ПОВТОР && ПОВТОР.аим!==undefined) ? ПОВТОР.аим
              : Math.max(2.0, Math.min(6.5, want-corr));
    const c2=Object.assign({}, cfg, {M:aim});
    applyMode();
    const r=generate(c2);
    if(!r) continue;
    r.__aim=aim;
    r.coverSeed=(ПОВТОР && ПОВТОР.ков!==undefined)?ПОВТОР.ков:(Math.random()*4294967296)>>>0;
    r.cover=coverAtCell(r.g,r.px,r.coverSeed);
    try{ r.plan=planStructures(r,TUNP); }catch(e){ r.plan={tun:new Uint8Array(W*H),tunComps:[],builds:[],doors:[]}; }
    clearDoorways(r);
    let out=r;
    if(DET.on) out=buildDetail(r,cfg);
    const mf=(out.mFine||out.m);
    const err=(Math.abs(mf.mA-want)+Math.abs(mf.mB-want))/2;
    /* ============ v136.2. КАРМАН — ТОЖЕ БРАК ============
       Решатель выбирал карту ТОЛЬКО по промаху баланса. Между тем примерно одна
       карта из пяти выходит с местом в кармане: сосед в трёхстах юнитах по
       прямой и в двух тысячах по земле. Приёмка ловит это как «крюк x6», человек
       — как «ты забаррикадировал проход», а решатель об этом не спрашивал.
       Число уже есть: слой деталей считает крюк по своему растру после прорубa
       (stat.крюкМакс). Штрафуем всё, что хуже x2.5, и сравниваем попытки по
       сумме. Баланс при этом не приносится в жертву: штраф соизмерим с допуском,
       а не подавляет его. */
    const крюк=((out.det||{}).крюкМакс)||0;
    const хуже2=((out.det||{}).крюкХуже2)||0;
    const нетПути=((out.det||{}).крюкНетПути)||0;
    /* Максимум ловит один карман, но не ловит карту, где плохи многие пары, и
       совсем не ловит «пути нет»: у такой пары отношения нет, максимум её не
       видит. Штрафуем и то, и другое. */
    const штраф=0.6*Math.max(0, Math.min(крюк,8)-2.5)
               +0.25*Math.max(0, хуже2-2) + 0.4*Math.min(нетПути,6);
    const оценка=err+штраф;
    log.push({попытка:att+1, цельРешателю:+aim.toFixed(2),
              вышло:[+mf.mA.toFixed(2), +mf.mB.toFixed(2)], промах:+err.toFixed(2),
              крюк:+крюк.toFixed(2), хуже2, нетПути, оценка:+оценка.toFixed(2)});
    if(оценка<bestErr){ bestErr=оценка; best=out; }
    if(out.__aim===undefined) out.__aim=aim;
    if((err<=BAL.tol && штраф===0) || ПОВТОР) break;
    /* Демпфирование 0.7 бережёт от раскачки, когда поправка уже примерно верна.
       Но на ПЕРВОМ знакомстве с профилем поправки нет вовсе, и 0.7 означает, что
       вторая попытка закрывает только семь десятых промаха, а третья доедает
       остаток — две попытки из четырёх уходят на разгон. Пока профиль незнаком,
       берём шаг целиком. */
    const dmp=(DRIFTBY[pk]===undefined && att===0) ? 1.0 : BAL.damp;
    corr += dmp*(((mf.mA+mf.mB)/2) - want);
    /* следующая попытка идёт с новой геометрией: восстанавливаем крупный размер */
    const s=SIZES[+sSize.value]; if(s) setSize(s[0],s[1]);
    CELL=96; SC=1;
  }
  /* v120. КЛЕТКА ВОЗВРАЩАЕТСЯ ВМЕСТЕ С КАРТОЙ.
     Хвост цикла восстанавливал крупный размер для СЛЕДУЮЩЕЙ попытки (CELL=96, SC=1),
     но после последней попытки следующей нет — и наружу уходила мелкая карта 276x324
     при глобальной клетке 96. run() дописывал ей out.CELL=CELL, useCur() верил,
     и дальше всё — отрисовка, замер, экспорт — считало карту вшестеро крупнее.
     buildVMF на этом падал: индекс зоны выходил за таблицу, ZF[zi] был undefined.
     Ловилось только когда решатель не уложился в допуск с первого раза, то есть
     примерно на каждой четвёртой карте. Теперь состояние сетки восстанавливается
     по самой карте, а не по тому, чем кончился цикл. */
  if(best){ best.__bal={попыток:log.length, оценка:+bestErr.toFixed(2), ход:log, снос:+corr.toFixed(2)};
    DRIFTBY[pk] = (DRIFTBY[pk]===undefined) ? corr : DRIFTBY[pk]*0.65 + corr*0.35;
    if(best.CELL){ CELL=best.CELL; SC=Math.round(96/CELL); }
    if(best.W && best.H) setSize(best.W, best.H); }
  return best;
}

function run(){ if(BAKING) return; const flash=document.getElementById('flash'); flash.classList.add('on');
  setTimeout(()=>{ const cfg={CTtarget:parseFloat(sTempo.value), M:parseFloat(sMargin.value), jit:parseFloat(sJit.value), tol:1.0, tolMid:1.8, vert:parseFloat(sVert.value), ringP:parseFloat(sRing.value)};
    const out=generateBalanced(cfg);
    if(out){ out.CELL=out.CELL||CELL; cur=out; useCur();     // клетка карты главнее глобальной
             out.zones=computeZones(out); draw(); paint(); renderAudit(); }
    else document.getElementById('meta').innerHTML='Не собралось — нажми ещё раз.';
    flash.classList.remove('on');
  },30);
}
const sTempo=document.getElementById('sTempo'), sMargin=document.getElementById('sMargin'), sJit=document.getElementById('sJit');
sTempo.oninput=()=>vTempo.textContent=f1(parseFloat(sTempo.value))+' с';
sMargin.oninput=()=>vMargin.textContent=f1(parseFloat(sMargin.value))+' с';
sJit.oninput=()=>vJit.textContent=parseFloat(sJit.value)<0.017?'малый':parseFloat(sJit.value)>0.027?'большой':'средний';
document.getElementById('tHeat').onchange=e=>{opts.heat=e.target.checked;draw();};
document.getElementById('sProf').onchange=e=>{ applyProfile(e.target.value);
  document.getElementById('vProf').textContent=e.target.value; run(); };
document.getElementById('tDet').onchange=e=>{ DET.on=e.target.checked; };
document.getElementById('tHeight').onchange=e=>{opts.height=e.target.checked;draw();};
/* v97: вид под углом — тумблер, три ползунка и вращение мышью */
document.getElementById('t3D').onchange=e=>{ VIEW3D=e.target.checked;
  document.getElementById('p3d').style.display=VIEW3D?'block':'none'; draw(); };
document.getElementById('sYaw').oninput=e=>{ V3.yaw=+e.target.value;
  document.getElementById('vYaw').textContent=V3.yaw+'°'; draw(); };
document.getElementById('sTilt').oninput=e=>{ V3.tilt=+e.target.value;
  document.getElementById('vTilt').textContent=V3.tilt+'°'; draw(); };
document.getElementById('sZex').oninput=e=>{ V3.zex=+e.target.value;
  document.getElementById('vZex').textContent='×'+V3.zex.toFixed(1).replace('.',','); draw(); };
(function(){ let drag=null, pend=false;
  const redraw=()=>{ if(pend) return; pend=true;
    requestAnimationFrame(()=>{ pend=false; syncV3(); draw(); }); };
  cv.addEventListener('pointerdown',e=>{ if(!VIEW3D) return;
    drag={x:e.clientX,y:e.clientY,yaw:V3.yaw,tilt:V3.tilt};
    cv.setPointerCapture(e.pointerId); cv.style.cursor='grabbing'; });
  cv.addEventListener('pointermove',e=>{ if(!drag) return;
    V3.yaw=((drag.yaw+(e.clientX-drag.x)*0.45)%360+360)%360;
    V3.tilt=Math.max(10,Math.min(89,drag.tilt-(e.clientY-drag.y)*0.30));
    redraw(); });
  const up=()=>{ drag=null; cv.style.cursor=''; };
  cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
})();
document.getElementById('tRoutes').onchange=e=>{opts.routes=e.target.checked;draw();};
document.getElementById('tCover').onchange=e=>{opts.cover=e.target.checked;draw();};
document.getElementById('tLabels').onchange=e=>{opts.labels=e.target.checked;draw();};
document.getElementById('tPlaces').onchange=e=>{opts.places=e.target.checked;draw();};
document.getElementById('tIsland').onchange=e=>{ISLAND=e.target.checked;run();};   // меняет геометрию -> перегенерация
document.getElementById('tRamps').onchange=e=>{RAMPS=e.target.checked;};            // влияет только на .vmf при скачивании
document.getElementById('tThru').onchange=e=>{THRU=e.target.checked;};              // ЭКСП: только .vmf (сквозные проходы)
document.getElementById('tDecor').onchange=e=>{DECOR=e.target.checked; recoverLater(false); };
document.getElementById('tPalace').onchange=e=>{PALACE=e.target.checked;run();};    // меняет геометрию/баланс -> перегенерация
document.getElementById('tDoors').onchange=e=>{DOORS=e.target.checked;draw();};     // двери: VMF + отметки на карте, g не трогает
document.getElementById('tFine').onchange=e=>{FINEW=e.target.checked;};
document.getElementById('tStruct').onchange=e=>{opts.struct=e.target.checked;draw();};
document.getElementById('tZones').onchange=e=>{opts.zones=e.target.checked;draw();};
document.getElementById('tLmark').onchange=e=>{LMARK=e.target.checked;};
document.getElementById('tZlight').onchange=e=>{ZONELIGHT=e.target.checked;};
{ const sPal=document.getElementById('sPal'), names=['greybox','flat','paint'];
  sPal.oninput=()=>{ PALMODE=names[+sPal.value]; document.getElementById('vPal').textContent=PALMODE; }; }
const sTun=document.getElementById('sTun'), vTun=document.getElementById('vTun');
sTun.oninput=()=>{ vTun.textContent=parseFloat(sTun.value)<0.05?'нет':parseFloat(sTun.value)<0.34?'мало':parseFloat(sTun.value)>0.75?'много':'средне'; };
sTun.onchange=()=>{ TUNP=parseFloat(sTun.value); if(cur){ useCur(); cur.plan=planStructures(cur,TUNP); draw(); } };   // без перегенерации: тоннели g не трогают
/* v127. Подгон текстуры. Ничего не пересчитывается: величины читаются в момент
   сборки .vmf, поэтому перегенерация карте не нужна — достаточно скачать заново. */
document.getElementById('tUVfit').onchange=e=>{ V127.fit=e.target.checked; };
document.getElementById('tUVall').onchange=e=>{ V127.all=e.target.checked; };
{ const sTile=document.getElementById('sTile'), vTile=document.getElementById('vTile');
  sTile.oninput=()=>{ vTile.textContent=sTile.value; };
  sTile.onchange=()=>{ V127.want=+sTile.value; };
  const sUnit=document.getElementById('sUnit'), vUnit=document.getElementById('vUnit');
  sUnit.oninput=()=>{ vUnit.textContent=sUnit.value; };
  sUnit.onchange=()=>{ V127.unit=+sUnit.value; }; }
