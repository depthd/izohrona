/* ===== подсказки-превью параметров (наведи и подержи) ===== */
const PINFO={
  sSize:{name:'Размер карты', lo:0, hi:4, size:true, topo:false, loCap:'крошка', hiCap:'большая', desc:'Габарит карты. Меньше — теснее и плотнее (короче тайминги), больше — просторнее. Сходимость/баланс проверены на всех.'},
  sTempo:{name:'Темп: CT до плента', lo:5, hi:8, key:'CTtarget', topo:false, loCap:'быстро (5с)', hiCap:'медленно (8с)', desc:'Целевое время CT до плента. Задаёт общую скорость карты — все тайминги масштабируются от него.'},
  sMargin:{name:'Перевес защитника', lo:3, hi:5, key:'M', topo:false, loCap:'+3с', hiCap:'+5с', desc:'Насколько CT приходит на плент раньше T. Больше — сильнее в пользу защиты, длиннее подходы T.'},
  sJit:{name:'Разброс геометрии', lo:0.01, hi:0.035, key:'jit', topo:false, loCap:'ровно', hiCap:'криво', desc:'Случайность положения зон. Больше — кривее, асимметричнее, разнообразнее от карты к карте.'},
  sVert:{name:'Вертикаль (высоты)', lo:0.4, hi:1.8, key:'vert', topo:true, loCap:'плоско', hiCap:'резко', desc:'Сила перепадов высот (топо-раскраска). Слева почти плоско, справа резкий рельеф — мид глубже, сайты выше.'},
  sRing:{name:'Кольца (петли)', lo:0.2, hi:0.85, key:'ringP', topo:false, loCap:'мало', hiCap:'много', desc:'Сколько лишних связок-петель. Больше — больше обходов, флангов, лишних стен и поворотов (хаос).'},
  sWidth:{name:'Ширина проходов', lo:-1, hi:2, pw:true, topo:false, loCap:'уже', hiCap:'широко', desc:'Ширина коридоров (входы-горлышки остаются узкими). Уже — больше чоков и ближний бой; шире — просторнее. Баланс солвер добирает сам.'}
};
const _tip=document.createElement('div'); _tip.className='pretip';
_tip.innerHTML='<h4 id="ptName"></h4><div class="imgs"><div class="col"><canvas id="ptLo" width="150" height="108"></canvas><div class="cap" id="ptLoCap"></div></div><div class="col"><canvas id="ptHi" width="150" height="108"></canvas><div class="cap" id="ptHiCap"></div></div></div><div class="desc" id="ptDesc"></div>';
document.body.appendChild(_tip);
function _genPrev(pid,val){ const info=PINFO[pid];
  const cfg={CTtarget:parseFloat(sTempo.value),M:parseFloat(sMargin.value),jit:parseFloat(sJit.value),tol:1.0,tolMid:1.8,vert:parseFloat(sVert.value),ringP:parseFloat(sRing.value)};
  let sz=SIZES[+sSize.value];
  if(info.size) sz=SIZES[val]; else if(info.key) cfg[info.key]=val;
  const savedPW=PWIDTH, savedW=W, savedH=H;
  let r=null;
  try{ if(info.pw) PWIDTH=val; setSize(sz[0],sz[1]);
       for(let s=1;s<10&&!(r&&r.m);s++) r=generateOne((99991*s>>>0)||1,cfg); }
  catch(e){ r=null; }
  finally{ PWIDTH=savedPW; setSize(savedW,savedH); }   // v58.1: восстановление ВСЕГДА
  return {r,w:sz[0],h:sz[1]}; }
function _renderMini(cv2,r,mw,mh,topo){ const c=cv2.getContext('2d'),CW=cv2.width,CH=cv2.height;
  c.fillStyle='#0b0f14'; c.fillRect(0,0,CW,CH); if(!r||!r.g)return;
  const cs=Math.min(CW/mw,CH/mh),ox=(CW-cs*mw)/2,oy=(CH-cs*mh)/2,zf=r.zfield;
  let zmin=9,zmax=-9; if(topo)for(let i=0;i<mw*mh;i++)if(r.g[i]){if(zf[i]<zmin)zmin=zf[i];if(zf[i]>zmax)zmax=zf[i];}
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const i=y*mw+x; if(!r.g[i])continue; let col;
    if(topo&&zmax>zmin){const t=(zf[i]-zmin)/(zmax-zmin); col=t<0.5?mix([40,58,86],[70,110,92],t*2):mix([70,110,92],[196,180,132],(t-0.5)*2);}
    else col=[68,92,116];
    c.fillStyle=rgb(col); c.fillRect(ox+x*cs,oy+y*cs,Math.ceil(cs),Math.ceil(cs)); }
  const P=r.m&&r.m.pts; if(P){ const dot=(p,col)=>{c.fillStyle=col;c.beginPath();c.arc(ox+(p[0]+.5)*cs,oy+(p[1]+.5)*cs,2.4,0,7);c.fill();};
    dot(P.T,'#e8a24a');dot(P.C,'#4f9fe0');dot(P.A,'#f3f8fc');dot(P.B,'#f3f8fc'); } }
function _showTip(pid,el){ const info=PINFO[pid]; if(!info)return; const saved=[W,H];   // v58.1: сохраняем ФАКТИЧЕСКИЙ габарит, а не значение ползунка
  document.getElementById('ptName').textContent=info.name; document.getElementById('ptDesc').textContent=info.desc;
  document.getElementById('ptLoCap').textContent=info.loCap; document.getElementById('ptHiCap').textContent=info.hiCap;
  const lo=_genPrev(pid,info.lo); _renderMini(document.getElementById('ptLo'),lo.r,lo.w,lo.h,info.topo);
  const hi=_genPrev(pid,info.hi); _renderMini(document.getElementById('ptHi'),hi.r,hi.w,hi.h,info.topo);
  setSize(saved[0],saved[1]); useCur();
  const rc=el.getBoundingClientRect(); let x=rc.right+14, y=rc.top-10;
  if(x+334>window.innerWidth) x=rc.left-334;
  _tip.style.left=Math.max(8,x)+'px'; _tip.style.top=Math.max(8,Math.min(y,window.innerHeight-230))+'px';
  _tip.classList.add('on'); }
function _hideTip(){ _tip.classList.remove('on'); }
document.querySelectorAll('.ctl').forEach(ctl=>{ const inp=ctl.querySelector('input[type=range]'); if(!inp||!PINFO[inp.id])return;
  let tm; ctl.addEventListener('mouseenter',()=>{ tm=setTimeout(()=>_showTip(inp.id,ctl),450); });
  ctl.addEventListener('mouseleave',()=>{ clearTimeout(tm); _hideTip(); }); });

document.getElementById('gen').onclick=run;
/* ====== v81 РАДАР ДЛЯ ИГРЫ ======
   Два файла рядом с картой: картинка вида сверху и привязка. Всю сложность обычного
   маппинга (попасть картинкой в мировые координаты) генератор снимает: границы карты
   в юнитах он знает точно, поэтому pos_x/pos_y/scale считаются, а не подбираются. */
function downloadRadar(){ if(!cur){return;} useCur();
  const N=1024, WU=W*CELL, HU=H*CELL, U=Math.max(WU,HU), sc=U/N;   // v102: было жёсткое 96 — на клетке 16u оверлей уезжал вшестеро
  const cn=document.createElement('canvas'); cn.width=N; cn.height=N;
  const c2=cn.getContext('2d'); c2.fillStyle='#000'; c2.fillRect(0,0,N,N);
  const px2=CELL/sc;
  const zf=cur.zfield; let zmin=1e9,zmax=-1e9;
  for(let i=0;i<W*H;i++) if(cur.g[i]){ if(zf[i]<zmin)zmin=zf[i]; if(zf[i]>zmax)zmax=zf[i]; }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!cur.g[i]) continue;
    const t=(zmax>zmin)?(zf[i]-zmin)/(zmax-zmin):0.5;       // высота -> светлота, как на радарах Valve
    const v=Math.round(90+t*110); c2.fillStyle='rgb('+v+','+(v+6)+','+(v+12)+')';
    c2.fillRect(x*px2, y*px2, Math.ceil(px2), Math.ceil(px2)); }
  if(cur.cover) for(const c of cur.cover){ const hh=(c.hgt==='full')?999:(c.hgt||40);
    if(hh<=40) continue;                                     // низкое на радаре не рисуем — оно не мешает
    c2.fillStyle=hh>112?'rgba(20,24,30,0.95)':'rgba(40,46,54,0.7)';
    c2.fillRect(c.x*px2, c.y*px2, (c.w||1)*px2, (c.h||1)*px2); }
  const nm='de_izohrona_'+cur.seed;
  cn.toBlob(b=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b);
    a.download=nm+'_radar.png'; document.body.appendChild(a); a.click(); a.remove(); });
  /* pos_x / pos_y — мировые координаты ЛЕВОГО ВЕРХНЕГО угла картинки, scale — юнитов на пиксель.
     wy(0) = верх карты по мировому Y, wx(0) = 0 по X. */
  const txt='"'+nm+'"\n{\n\t"material" "overviews/'+nm+'"\n\t"pos_x" "0"\n\t"pos_y" "'+(H*CELL)+
            '"\n\t"scale" "'+sc.toFixed(4)+'"\n\t"rotate" "0"\n\t"zoom" "1"\n}\n';
  const bl=new Blob([txt],{type:'text/plain'}); const a2=document.createElement('a');
  a2.href=URL.createObjectURL(bl); a2.download=nm+'.txt';
  document.body.appendChild(a2); a2.click(); a2.remove(); }
document.getElementById('vmf').onclick=()=>{ downloadVMF(); if(V81.radar) downloadRadar();
  /* v127. Отчёт о подгонке текстур виден только ПОСЛЕ сборки файла — он про
     экспорт, а не про карту, поэтому и печатается здесь, а не в приёмке. */
  const u=cur&&cur.__uv; if(!u) return;
  const el=document.getElementById('uvrep'); if(!el) return;
  const пер=u.перекос, дол=u.подогнано?Math.round(100*пер/u.подогнано):0;
  el.innerHTML=`текстура по брашу: подогнано <b>${u.подогнано}</b> граней `+
    `<span style="color:#7d92a4">(рисунок ${u.рисунок}u, натура ${u.натура}u`+
    `${u.всё?', вместе с полом и стенами':''})</span>`+
    (пер?` · <span style="color:${дол>45?'#e8a24a':'#7fbf7f'}">сильно тянутых ${пер}</span>`:'')+
    `<br><span style="color:#7d92a4">на мировой сетке ${u.сетка} — это пол, стены и грани короче ${Math.round(u.натура/2)}u</span>`; };
/* ===== v92: тумблеры ===== */
(function(){ const b=(id,fn)=>{ const el=document.getElementById(id); if(el) el.onchange=()=>{ fn(el.checked); run(); }; };
  b('tFine16', v=>{ V95.fine=v; });
  b('tInner',  v=>{ V94.inner=v; });
  b('tUneven', v=>{ V94.uneven=v; });
  b('tShapes', v=>{ MODE = v?'shapes':(document.getElementById('tPart').checked?'partition':'corridor'); });
  b('tPart',   v=>{ if(document.getElementById('tShapes').checked) return; MODE = v?'partition':'corridor'; });
  b('tDoor92', v=>{ V92.door=v; });
  b('tTurn92', v=>{ V92.turn=v; });
  b('tZ14',    v=>{ V92.zones14=v; applyZoneMode(); });
})();
document.getElementById('reroll').onclick=()=>{ recoverBodies(true); };
window.addEventListener('resize',()=>{if(cur)draw();});
/* ============ v99. РЕШЕНИЯ ПРИБИТЫ ============
   В панели остались только те ручки, которые человек реально крутит.
   Всё, что было тумблером «попробуй сам», получило постоянное значение:
   принятое замером — включено, отвергнутое замером — выключено.
   Код и флаги не удалены: вернуть любой можно одной строчкой здесь. */
/* v101: панель прячется — карта разворачивается на всё окно */
function togglePanel(force){
  const off = (force==null) ? !document.body.classList.contains('nopanel') : !!force;
  document.body.classList.toggle('nopanel', off);
  document.getElementById('tab').textContent = off ? '›' : '‹';
  setTimeout(()=>{ if(cur) draw(); }, 200);
}
document.getElementById('tab').onclick=()=>togglePanel();
addEventListener('keydown',e=>{ if((e.key==='h'||e.key==='H'||e.key==='р'||e.key==='Р')
  && !/^(INPUT|TEXTAREA)$/.test((e.target.tagName||''))) togglePanel(); });
let __rz=null;
addEventListener('resize',()=>{ clearTimeout(__rz); __rz=setTimeout(()=>{ if(cur) draw(); },120); });
(function bake(){ BAKING=true;
  const V={ tDet:1,      // слой деталей 16u — теперь это и есть продукт
            tDoors:1,    // дверные проёмы — принято в дефолт, SVODKA_2 §4.1
            tLmark:1,    // лендмарки и косяки — принято
            tZlight:1,   // свет по зонам — принято
            tZ14:1,      // 14 зон вместо 9 — принято, §4.1
            tThru:1,     // сквозные двухуровневые проходы — было вкл по умолчанию
            tDecor:1,    // богатые укрытия: стопки, барикады, косые блоки
            tIsland:1,   // площадка-остров: вертикаль, а её у нас дефицит
            tPalace:1,   // дроп-площадки: то же самое
            tFine16:0,   // клетка 16u для планировщика — заменена слоем деталей
            tFine:0,     // тонкие стены в экспорте — теперь они в растре, иначе вдвойне
            tInner:0,    // разбивка помещений — работала только в режиме фигур
            tUneven:0,   // разноразмерные комнаты — замер: >448u с 6.7% до 66.7%, §4.2
            tDoor92:0,   // проёмы у концов — замер: луч p90 2064->2142u, §4.2
            tTurn92:0,   // излом проходов — замер: >448u 14.5->17.0%, §4.2
            tShapes:0,   // экспериментальный планировщик фигурами
            tPart:0,     // экспериментальный планировщик объёмами
            tRamps:1 };  // v103: пандусы возвращены — их не запрещали, с ними перепад читается
  for(const id in V){ const e=document.getElementById(id); if(!e) continue;
    e.checked=!!V[id]; e.dispatchEvent(new Event('change')); }
  BAKING=false;
})();

applyProfile('dust2');
run();

/* ==== headless hook ==== */
window.__api={
  cfg:function(){const q=id=>parseFloat(document.getElementById(id).value);
    return {CTtarget:q('sTempo'),M:q('sMargin'),jit:q('sJit'),tol:1.0,tolMid:1.8,vert:q('sVert'),ringP:q('sRing')};},
  gen:function(seed,cfg){const r=generateOne(seed>>>0,cfg||window.__api.cfg()); if(!r)return null;
    r.coverSeed=(seed^0xabcdef)>>>0; r.cover=makeCover(r.g,r.px,r.coverSeed);
    r.plan=planStructures(r,TUNP); r.zones=computeZones(r); cur=r; return r;},
  vmf:function(){useCur(); return buildVMF(cur);},
  flags:function(){return {V61:V61,V63:V63,V64:V64,V65:V65,V66:V66,FINEW:FINEW,DOORS:DOORS,LMARK:LMARK,THRU:THRU,DECOR:DECOR,PALMODE:PALMODE};},
  cur:function(){return cur;}
};
