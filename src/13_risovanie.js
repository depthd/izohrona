/* ============ рендер ============ */
const cv=document.getElementById('map'), ctx=cv.getContext('2d');
let cur=null; const opts={heat:true,height:false,routes:true,cover:true,labels:true,struct:true,zones:false,places:true};
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function hx(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function mix(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function rgb(c){return`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;}
/* ====== v58.1: ПРИЧИНА «КОСОЙ» КАРТЫ ======
   W и H — глобальные. Всплывающее превью параметра (_showTip -> _genPrev) временно
   подменяет их размером превью и возвращает обратно ТОЛЬКО если генерация не бросила
   исключение. Если бросила — глобальные W/H остаются от превью, а cur.g построен
   на прежних. Дальше draw() индексирует старый массив НОВЫМ шагом строки (i=y*W+x),
   и каждая следующая строка съезжает — ровно та диагональная каша на скриншоте.
   Проявлялось на любом перерисовывании после наведения на ползунок: ресайз окна
   (в т.ч. фулскрин) и «перекатить укрытия».
   Лечение структурное: карта помнит свой габарит, и он восстанавливается перед
   каждым обращением. Плюс try/finally в _genPrev, чтобы утечки не было в принципе. */
function useCur(){ if(cur && cur.CELL){ CELL=cur.CELL; SC=Math.round(96/CELL); }
  if(cur && cur.W && (cur.W!==W || cur.H!==H)) setSize(cur.W, cur.H);
  /* сглаживание высот один раз на карту: повторный вызов уже ничего не меняет */
  if(cur && V79.smooth && !cur.__sm){ cur.__sm=smoothZ(cur)||-1; } }
/* v100. ПОДГОНКА ХОЛСТА.
   Карта должна влезать целиком: масштаб берётся как минимум из двух запасов —
   ширины колонки и высоты окна. Буфер, CSS-размер и трансформа под dpr
   выставляются в одном месте, поэтому пропорция не может разъехаться. */
function fitCanvas(w,h){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const box=cv.parentElement, r=box.getBoundingClientRect();
  const availW=Math.max(260, r.width-30), availH=Math.max(260, r.height-30);
  const s=Math.min(availW/w, availH/h);
  const cw=Math.max(140,Math.round(w*s)), ch=Math.max(140,Math.round(h*s));
  cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr);
  cv.style.width=cw+'px'; cv.style.height=ch+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {cw,ch,s};
}
function draw(){
  if(!cur) return; useCur();
  if(VIEW3D){ draw3D(); return; }
  const {g,px,m,cover,bodies}=cur; const {dT,dC,SEC}=m;
  const fit=fitCanvas(W,H), cs=fit.s, cw2=fit.cw, ch2=fit.ch;
  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,cw2,ch2);
  const cCT=hx(css('--CT')), cT=hx(css('--T')), cFair=hx(css('--fair')); const neutral=[53,71,89]; const spread=6;
  const zf=cur.zfield; let zmin=1e9,zmax=-1e9; if(zf){for(let i=0;i<W*H;i++)if(g[i]){if(zf[i]<zmin)zmin=zf[i];if(zf[i]>zmax)zmax=zf[i];}}
  const zlo=[40,58,86], zmidc=[70,110,92], zhi=[196,180,132]; // топо: низко→сине, средне→зелёно, высоко→песок
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!g[i])continue;
    let col=neutral;
    if(opts.zones && cur.zones){ const zi=cur.zones.zid[i]; col = zi===255?[40,48,58]:ZCOL[zi]; }
    else if(opts.height && zf && zmax>zmin){ const t=(zf[i]-zmin)/(zmax-zmin);
      col = t<0.5 ? mix(zlo,zmidc,t*2) : mix(zmidc,zhi,(t-0.5)*2); }
    else if(opts.heat){ const a=dT.dist[i], b=dC.dist[i];
      if(isFinite(a)&&isFinite(b)){ const c=(b-a)*SEC; const t=Math.max(-1,Math.min(1,c/spread));
        col = t<0 ? mix(neutral,cCT,-t) : mix(neutral,cT,t);
        if(Math.abs((a-b)*SEC)<0.4) col=mix(col,cFair,0.6); } }
    ctx.fillStyle=rgb(col); ctx.fillRect(x*cs,y*cs,cs+0.7,cs+0.7);   // v100: клетка дробная, нахлёст против швов
  }
  // тела зон (пончики/острова) — сплошные структуры
  if(bodies){ ctx.fillStyle='#0f1620'; ctx.strokeStyle='rgba(120,200,235,.55)'; ctx.lineWidth=Math.max(1.4,dpr*1.1);
    for(const bd of bodies){ const X=(bd.cx-(bd.w>>1))*cs, Y=(bd.cy-(bd.h>>1))*cs, Wd=bd.w*cs, Hd=bd.h*cs;
      ctx.fillRect(X,Y,Wd,Hd); ctx.strokeRect(X+0.75,Y+0.75,Wd-1.5,Hd-1.5); } }
  if(opts.routes){
    const route=(prev,pt,color)=>{ ctx.strokeStyle=color; ctx.lineWidth=Math.max(1.6,cs*0.32); ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath(); let i=pt[1]*W+pt[0], first=true, guard=0;
      while(i>=0 && guard++<14000){ const X=(i%W+0.5)*cs, Y=((i/W|0)+0.5)*cs; if(first){ctx.moveTo(X,Y);first=false;}else ctx.lineTo(X,Y); i=prev[i]; }
      ctx.stroke(); };
    route(dC.prev,m.pts.A,'rgba(79,159,224,.9)'); route(dC.prev,m.pts.B,'rgba(79,159,224,.9)');
    route(dT.prev,m.pts.A,'rgba(232,162,74,.88)'); route(dT.prev,m.pts.B,'rgba(232,162,74,.88)');
  }
  /* v78 РАДАР ПО ФАКТУ. Раньше все тела рисовались одинаковыми квадратами, и ящик в 40u,
     через который перепрыгивают не глядя, выглядел так же, как глухая стена во всю высоту.
     Теперь: размер и цвет квадрата зависят от высоты тела, а под ними лежит слой проходимости,
     посчитанный ровно так же, как в замере по геометрии — свободный пробег по осям. */
  if(opts.cover&&cover){
    const blk=new Uint8Array(W*H);
    for(const c of cover){ const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=18) continue;
      for(let oy=0;oy<(c.h||1);oy++)for(let ox=0;ox<(c.w||1);ox++){
        const X=c.x+ox,Y=c.y+oy; if(X>=0&&X<W&&Y>=0&&Y<H) blk[Y*W+X]=1; } }
    const fr4=(x,y)=> x>0&&y>0&&x<W-1&&y<H-1&&g[y*W+x]&&!blk[y*W+x];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(!fr4(x,y)) continue;
      let rx=1,ry=1,k;
      for(k=x-1;fr4(k,y);k--)rx++; for(k=x+1;fr4(k,y);k++)rx++;
      for(k=y-1;fr4(x,k);k--)ry++; for(k=y+1;fr4(x,k);k++)ry++;
      const w=Math.min(rx,ry)*96;
      if(w>=192) continue;
      ctx.fillStyle = w<96 ? 'rgba(240,50,40,0.55)' : 'rgba(232,150,40,0.34)';
      ctx.fillRect(x*cs,y*cs,cs+0.7,cs+0.7); }
    for(const c of cover){ const hh=(c.hgt==='full')?999:(c.hgt||40);
      const X=c.x*cs, Y=c.y*cs, Wd=(c.w||1)*cs, Hd=(c.h||1)*cs;
      let f, k;                                    // k — доля клетки: чем ниже тело, тем мельче
      if(hh<=18){ f='rgba(190,180,150,0.30)'; k=0.30; }
      else if(hh<=40){ f='#cbb894'; k=0.48; }
      else if(hh<=64){ f='#b99a63'; k=0.66; }
      else if(hh<=112){ f='#8f7449'; k=0.86; }
      else { f='#49525e'; k=1.0; }
      const ix=(Wd-Wd*k)/2, iy=(Hd-Hd*k)/2;
      if(c.rot){ ctx.save(); ctx.translate(X+Wd/2,Y+Hd/2); ctx.rotate(c.rot*Math.PI/180);
        ctx.fillStyle=f; ctx.fillRect(-Wd*k/2,-Hd*k/2,Wd*k,Hd*k); ctx.restore(); }
      else { ctx.fillStyle=f; ctx.fillRect(X+ix,Y+iy,Wd*k,Hd*k); }
      if(hh>112){ ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(X+2,Y+2); ctx.lineTo(X+Wd-2,Y+Hd-2);
        ctx.moveTo(X+Wd-2,Y+2); ctx.lineTo(X+2,Y+Hd-2); ctx.stroke(); } } }
  /* v120. МЕСТА И ИХ ПРЕДМЕТЫ. Без этого слоя вся работа над каллаутами не видна:
     на карте по-прежнему рассыпанные ящики. Границы мест — тонкая линия, предмет —
     свой значок, имя — подпись. Ровно то, что игрок увидит в игре в HUD. */
  if(opts.places&&cur.places&&cur.places.list){
    const P=cur.places, pid=P.pid;
    const dpr=Math.min(window.devicePixelRatio||1,2);   // dpr живёт в fitCanvas, здесь свой
    ctx.strokeStyle='rgba(150,200,255,0.30)'; ctx.lineWidth=Math.max(1,dpr*0.9);
    ctx.beginPath();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; const a=pid[i]; if(a<0) continue;
      if(x+1<W && pid[i+1]>=0 && pid[i+1]!==a){ ctx.moveTo((x+1)*cs,y*cs); ctx.lineTo((x+1)*cs,(y+1)*cs); }
      if(y+1<H && pid[i+W]>=0 && pid[i+W]!==a){ ctx.moveTo(x*cs,(y+1)*cs); ctx.lineTo((x+1)*cs,(y+1)*cs); } }
    ctx.stroke();
    if(cur.lmarks) for(const L of cur.lmarks){
      const X=L.x*cs, Y=L.y*cs, Wd=L.w*cs, Hd=L.h*cs, cx=X+Wd/2, cy=Y+Hd/2;
      ctx.strokeStyle='rgba(255,232,150,0.95)'; ctx.fillStyle='rgba(255,232,150,0.22)';
      ctx.lineWidth=Math.max(1.6,dpr*1.3);
      ctx.beginPath();
      switch(L.k){
        case 'pillar': case 'crate1':                       // ромб
          ctx.moveTo(cx,Y); ctx.lineTo(X+Wd,cy); ctx.lineTo(cx,Y+Hd); ctx.lineTo(X,cy); ctx.closePath(); break;
        case 'barrels': {                                   // три кружка
          const r=Math.min(Wd,Hd)/5;
          for(const [ax,ay] of [[-1,-0.6],[1,-0.2],[0.1,1]]){
            ctx.moveTo(cx+ax*r*1.3+r, cy+ay*r*1.3);
            ctx.arc(cx+ax*r*1.3, cy+ay*r*1.3, r, 0, 6.2832); }
          break; }
        case 'stack':                                       // уступ
          ctx.moveTo(X,Y+Hd); ctx.lineTo(X,Y); ctx.lineTo(X+Wd*0.62,Y);
          ctx.lineTo(X+Wd*0.62,Y+Hd*0.55); ctx.lineTo(X+Wd,Y+Hd*0.55); ctx.lineTo(X+Wd,Y+Hd);
          ctx.closePath(); break;
        case 'canopy':                                      // рамка на четырёх точках
          ctx.rect(X,Y,Wd,Hd);
          for(const [ax,ay] of [[0,0],[1,0],[0,1],[1,1]]){
            ctx.moveTo(X+ax*Wd+cs*0.5, Y+ay*Hd); ctx.arc(X+ax*Wd, Y+ay*Hd, cs*0.5, 0, 6.2832); }
          break;
        case 'deck':                                        // площадка со ступенями
          ctx.rect(X,Y+Hd*0.25,Wd,Hd*0.75);
          for(let s=1;s<4;s++){ ctx.moveTo(X,Y+Hd*0.25*s/4); ctx.lineTo(X+Wd,Y+Hd*0.25*s/4); }
          break;
        default: ctx.rect(X,Y,Wd,Hd);                       // контейнер, стенка
      }
      ctx.fill(); ctx.stroke();
    }
    if(opts.labels){
      ctx.font=`${Math.max(9,Math.round(cs*2.6))}px ui-monospace,Menlo,monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      for(const p of P.list){ if(!p.им) continue;
        const X=(p.x+0.5)*cs, Y=(p.y+0.5)*cs;
        ctx.lineWidth=Math.max(2.5,dpr*2.2); ctx.strokeStyle='rgba(6,10,15,0.9)';
        ctx.strokeText(p.им,X,Y); ctx.fillStyle='rgba(240,245,252,0.92)'; ctx.fillText(p.им,X,Y); }
    }
  }
  // СТРУКТУРЫ: тоннели (штрих-заливка), здания (контур), двери (перемычки), палас (плато с дроп-краем)
  if(opts.struct&&cur.plan){ const plan=cur.plan;
    ctx.fillStyle='rgba(146,110,58,0.30)';
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(plan.tun[y*W+x]) ctx.fillRect(x*cs,y*cs,cs+0.7,cs+0.7);
    ctx.strokeStyle='rgba(212,168,98,0.8)'; ctx.lineWidth=Math.max(1.4,cs*0.22); ctx.setLineDash([cs*0.9,cs*0.6]);
    for(const bR of plan.builds){ ctx.strokeRect(bR.x0*cs+1,bR.y0*cs+1,(bR.x1-bR.x0)*cs-2,(bR.y1-bR.y0)*cs-2); }
    ctx.setLineDash([]);
    if(DOORS){ ctx.strokeStyle='rgba(240,235,220,0.95)'; ctx.lineWidth=Math.max(2,cs*0.4);
      for(const d of plan.doors){ ctx.beginPath();
        if(d.axis==='Y'){ const Y=(d.y+0.5)*cs; ctx.moveTo(d.x*cs,Y); ctx.lineTo((d.x+d.w)*cs,Y); }
        else { const X=(d.x+0.5)*cs; ctx.moveTo(X,d.y*cs); ctx.lineTo(X,(d.y+d.w)*cs); }
        ctx.stroke(); } }
  }
  if(cur.vmask){ ctx.fillStyle='rgba(255,200,80,0.5)';
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(cur.vmask[y*W+x]&&cur.g[y*W+x]) ctx.fillRect(x*cs,y*cs,cs,cs); }
  if(cur.palaces){ for(const p of cur.palaces){
    const X=p.x0*cs,Y=p.y0*cs,Wd=(p.x1-p.x0+1)*cs,Hd=(p.y1-p.y0+1)*cs;
    ctx.fillStyle='rgba(222,196,120,0.45)'; ctx.fillRect(X,Y,Wd,Hd);
    ctx.strokeStyle='#e8d9a0'; ctx.lineWidth=1.5; ctx.strokeRect(X+0.75,Y+0.75,Wd-1.5,Hd-1.5);
    // дроп-край — жирная белая линия (спрыгнуть можно, залезть нельзя)
    ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=Math.max(2.5,cs*0.5); ctx.beginPath();
    if(p.dropSide==='S'){ctx.moveTo(X,Y+Hd);ctx.lineTo(X+Wd,Y+Hd);} else if(p.dropSide==='N'){ctx.moveTo(X,Y);ctx.lineTo(X+Wd,Y);}
    else if(p.dropSide==='E'){ctx.moveTo(X+Wd,Y);ctx.lineTo(X+Wd,Y+Hd);} else {ctx.moveTo(X,Y);ctx.lineTo(X,Y+Hd);}
    ctx.stroke();
    if(opts.labels){ ctx.fillStyle='#111827'; ctx.font=`700 ${Math.max(8,cs*1.1)}px 'Chakra Petch'`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('ПЛАТО',X+Wd/2,Y+Hd/2); } } }
  if(cur.halls&&opts.labels){ ctx.font=`700 ${Math.max(9,cs*1.2)}px 'Chakra Petch'`; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const hl of cur.halls){ if(!hl.cells.length) continue;
      let sx=0,sy=0; for(const [x,y] of hl.cells){sx+=x;sy+=y;}
      const cxp=(sx/hl.cells.length+0.5)*cs, cyp=(sy/hl.cells.length+0.5)*cs;
      ctx.fillStyle='#3b2f14'; ctx.fillText('ПАЛАС',cxp,cyp); } }
  const dot=(pt,fill,ring,label,big)=>{ const X=(pt[0]+0.5)*cs, Y=(pt[1]+0.5)*cs, r=Math.max(7,cs*(big?2:1.5));
    ctx.beginPath(); ctx.arc(X,Y,r,0,7); ctx.fillStyle=fill; ctx.fill(); ctx.lineWidth=2.2; ctx.strokeStyle=ring; ctx.stroke();
    if(opts.labels){ ctx.fillStyle='#0a0e13'; ctx.font=`700 ${Math.max(10,cs*(big?2:1.5))}px 'Chakra Petch'`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,X,Y+0.5); } };
  dot(m.pts.T,css('--T'),'#f2c78a','T',false); dot(m.pts.C,css('--CT'),'#a6cef0','CT',false);
  if(opts.labels){ ctx.fillStyle=css('--fair'); ctx.font=`600 ${Math.max(9,cs*1.2)}px 'Chakra Petch'`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('МИД',(m.pts.M[0]+0.5)*cs,(m.pts.M[1]+0.5)*cs); }
  dot(m.pts.A,'rgba(243,248,252,.16)',css('--site'),'A',true); dot(m.pts.B,'rgba(243,248,252,.16)',css('--site'),'B',true);
}
/* ============ v97. ВИД ПОД УГЛОМ ============
   Перепад высот цветом не читается: на плоском виде яма и балкон одинаковы.
   Здесь каждая клетка пола поднята на свою высоту из zfield, борт достраивается там,
   где сосед ниже или пола нет вовсе, а укрытия стоят коробками своей настоящей высоты
   (hgt в юнитах) под своим углом (rot) и с тем же ужатием повёрнутой коробки, которое
   делает экспорт (V71.fitrot). То есть видно то, что уходит в .vmf, а не радар.
   Проекция: поворот вокруг вертикали на yaw, затем наклон на tilt.
   Порядок — художником: дальнее раньше ближнего, ключ глубины это повёрнутая Y.
   Грани, смотрящие от зрителя, отсекаются по знаку нормали. */
let VIEW3D=false;
const V3={yaw:35, tilt:52, zex:1.6};

function draw3D(){
  const g=cur.g, zf=cur.zfield, cover=cur.cover, m=cur.m;
  const fit3=fitCanvas(W,Math.round(H*0.92)), cw=fit3.cw, chh=fit3.ch;
  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,cw,chh);

  const th=V3.yaw*Math.PI/180, ph=V3.tilt*Math.PI/180;
  const co=Math.cos(th), si=Math.sin(th), sp=Math.sin(ph), cp=Math.cos(ph);
  const ZU=(72/CELL)*V3.zex;          // одна единица zfield в клетках по вертикали (в экспорте ZS=72)
  const UU=(1/CELL)*V3.zex;           // один ЮНИТ высоты в клетках (у укрытий hgt в юнитах)
  const ox=W/2, oy=H/2;
  const prj=(x,y,z)=>{ const ax=x-ox, ay=y-oy;
    return [ax*co-ay*si, (ax*si+ay*co)*sp - z*cp]; };
  const dep=(x,y)=>(x-ox)*si+(y-oy)*co;

  let zmin=1e9, zmax=-1e9;
  for(let i=0;i<W*H;i++) if(g[i]){ const v=zf?zf[i]:0; if(v<zmin)zmin=v; if(v>zmax)zmax=v; }
  if(zmin>zmax){ zmin=0; zmax=0; }
  const zb=zmin*ZU-0.9;               // низ подставки: у самой нижней клетки тоже виден борт

  let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
  for(const X of [0,W]) for(const Y of [0,H]) for(const Z of [zb, zmax*ZU+2.5]){
    const p=prj(X,Y,Z); if(p[0]<mnx)mnx=p[0]; if(p[0]>mxx)mxx=p[0];
    if(p[1]<mny)mny=p[1]; if(p[1]>mxy)mxy=p[1]; }
  const s=Math.min(cw/(mxx-mnx), chh/(mxy-mny))*0.95;
  const ddx=(cw-(mnx+mxx)*s)/2, ddy=(chh-(mny+mxy)*s)/2;
  const P=(x,y,z)=>{ const p=prj(x,y,z); return [p[0]*s+ddx, p[1]*s+ddy]; };

  /* цвет клетки — те же три режима, что на плоском виде */
  const cCT=hx(css('--CT')), cT=hx(css('--T')), cFair=hx(css('--fair'));
  const neutral=[53,71,89], spread=6;
  const zlo=[40,58,86], zmidc=[70,110,92], zhi=[196,180,132];
  const dT=m.dT, dC=m.dC, SEC=m.SEC;
  const colOf=i=>{
    if(opts.zones && cur.zones){ const zi=cur.zones.zid[i];
      if(zi===255) return [40,48,58];
      const zc=ZCOL[zi]; return (typeof zc==='string')?hx(zc):zc; }
    if(opts.height && zf && zmax>zmin){ const t=(zf[i]-zmin)/(zmax-zmin);
      return t<0.5?mix(zlo,zmidc,t*2):mix(zmidc,zhi,(t-0.5)*2); }
    if(opts.heat){ const a=dT.dist[i], b=dC.dist[i];
      if(isFinite(a)&&isFinite(b)){ const c=(b-a)*SEC, t=Math.max(-1,Math.min(1,c/spread));
        let cl = t<0 ? mix(neutral,cCT,-t) : mix(neutral,cT,t);
        if(Math.abs((a-b)*SEC)<0.4) cl=mix(cl,cFair,0.6); return cl; } }
    return neutral; };
  const shade=(c,k)=>`rgb(${Math.min(255,c[0]*k)|0},${Math.min(255,c[1]*k)|0},${Math.min(255,c[2]*k)|0})`;
  const lit=(nx,ny)=>0.50+0.30*(nx*si+ny*co)+0.10*(nx*co-ny*si);   // грань к зрителю светлее
  const quad=(a,b,c,d,fill)=>{ ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]);
    ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); };

  const items=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const i=y*W+x; if(!g[i]) continue;
    items.push({d:dep(x+0.5,y+0.5), k:0, i, x, y}); }
  if(opts.cover&&cover) for(const c of cover){
    const hh=(c.hgt==='full')?999:(c.hgt||40); if(hh<=18) continue;
    items.push({d:dep(c.x+(c.w||1)/2, c.y+(c.h||1)/2)+0.002, k:1, b:c}); }
  /* v120. Предметы мест рисуются и здесь: в объёме их и надо смотреть — колонна
     во всю высоту и помост в 64u с плоского вида одинаковы, а в игре это разные
     вещи. Габарит берётся тот же, что уходит в .vmf. */
  if(opts.places&&cur.lmarks) for(const L of cur.lmarks)
    items.push({d:dep(L.x+L.w/2, L.y+L.h/2)+0.004, k:2, b:L});
  items.sort((a,b)=>a.d-b.d);

  const SIDE=[[0,0, 1,0,  0,-1],   // север: (x,y)->(x+1,y), нормаль вверх
              [1,0, 1,1,  1, 0],   // восток
              [1,1, 0,1,  0, 1],   // юг
              [0,1, 0,0, -1, 0]];  // запад
  const NB=[[0,-1],[1,0],[0,1],[-1,0]];

  for(const it of items){
    if(it.k===0){
      const x=it.x, y=it.y, z=(zf?zf[it.i]:0)*ZU, col=colOf(it.i);
      for(let e=0;e<4;e++){
        const nx=SIDE[e][4], ny=SIDE[e][5];
        if(nx*si+ny*co <= -0.02) continue;                     // грань смотрит от зрителя
        const jx=x+NB[e][0], jy=y+NB[e][1];
        const inside = jx>=0&&jx<W&&jy>=0&&jy<H&&g[jy*W+jx];
        const nz = inside ? (zf?zf[jy*W+jx]:0)*ZU : zb;
        if(nz >= z-0.004) continue;
        const ax=x+SIDE[e][0], ay=y+SIDE[e][1], bx=x+SIDE[e][2], by=y+SIDE[e][3];
        quad(P(ax,ay,z), P(bx,by,z), P(bx,by,nz), P(ax,ay,nz), shade(col,lit(nx,ny)));
      }
      quad(P(x,y,z), P(x+1,y,z), P(x+1,y+1,z), P(x,y+1,z), shade(col,1));
    } else if(it.k===1){
      const c=it.b, base=(zf?zf[c.y*W+c.x]:0)*ZU;
      const hgt=(c.hgt==='full')?999:(c.hgt||40);
      const top=base+((c.hgt==='full')?384:(c.hgt||40))*UU;    // 'full' в экспорте это ft+384
      let cwd=(c.w||1), chd=(c.h||1);
      if(c.rot&&V71.fitrot){ const a=Math.abs(c.rot)*Math.PI/180, ca0=Math.cos(a), sa0=Math.sin(a);
        const k=Math.min(cwd/(cwd*ca0+chd*sa0), chd/(cwd*sa0+chd*ca0)); cwd*=k; chd*=k; }
      const ccx=c.x+(c.w||1)/2, ccy=c.y+(c.h||1)/2, hw=cwd/2, hh2=chd/2;
      const ra=(c.rot||0)*Math.PI/180, ca=Math.cos(ra), sa=Math.sin(ra);
      const cr=[[-hw,-hh2],[hw,-hh2],[hw,hh2],[-hw,hh2]].map(p=>[ccx+p[0]*ca-p[1]*sa, ccy+p[0]*sa+p[1]*ca]);
      const col = hgt<=40?hx('cbb894') : hgt<=64?hx('b99a63') : hgt<=112?hx('8f7449') : hx('49525e');
      for(let e=0;e<4;e++){
        const p0=cr[e], p1=cr[(e+1)%4];
        const ex=p1[0]-p0[0], ey=p1[1]-p0[1], L=Math.hypot(ex,ey)||1;
        const nx=ey/L, ny=-ex/L;                               // внешняя нормаль при обходе по часовой
        if(nx*si+ny*co <= -0.02) continue;
        quad(P(p0[0],p0[1],top), P(p1[0],p1[1],top), P(p1[0],p1[1],base), P(p0[0],p0[1],base), shade(col,lit(nx,ny)));
      }
      quad(P(cr[0][0],cr[0][1],top), P(cr[1][0],cr[1][1],top),
           P(cr[2][0],cr[2][1],top), P(cr[3][0],cr[3][1],top), shade(col,1.06));
    } else {
      const L=it.b, base=(zf?zf[Math.min(W*H-1,L.cy*W+L.cx)]:0)*ZU;
      const HT={crate1:88, pillar:384, barrels:112, stack:112, wallg:128,
                truck:148, canopy:192, deck:72}[L.k]||96;
      const top=base+HT*UU;
      const dia=(L.k==='pillar'||L.k==='crate1');            // ромб в плане
      const ccx=L.x+L.w/2, ccy=L.y+L.h/2, hw=L.w/2, hh2=L.h/2;
      const ra=dia?Math.PI/4:0, ca=Math.cos(ra), sa=Math.sin(ra);
      const kf=dia?0.72:1;
      const cr=[[-hw*kf,-hh2*kf],[hw*kf,-hh2*kf],[hw*kf,hh2*kf],[-hw*kf,hh2*kf]]
        .map(q=>[ccx+q[0]*ca-q[1]*sa, ccy+q[0]*sa+q[1]*ca]);
      const col=hx('e8d08a');
      for(let e=0;e<4;e++){ const p0=cr[e], p1=cr[(e+1)%4];
        const ex=p1[0]-p0[0], ey=p1[1]-p0[1], Ln=Math.hypot(ex,ey)||1;
        const nx=ey/Ln, ny=-ex/Ln;
        if(nx*si+ny*co <= -0.02) continue;
        quad(P(p0[0],p0[1],top), P(p1[0],p1[1],top), P(p1[0],p1[1],base), P(p0[0],p0[1],base), shade(col,lit(nx,ny))); }
      quad(P(cr[0][0],cr[0][1],top), P(cr[1][0],cr[1][1],top),
           P(cr[2][0],cr[2][1],top), P(cr[3][0],cr[3][1],top), shade(col,1.10));
    }
  }
  /* подписи мест поверх объёма — иначе непонятно, что за предмет и как он зовётся */
  if(opts.places&&opts.labels&&cur.places&&cur.places.list){
    ctx.font="600 11px ui-monospace,Menlo,monospace"; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const pl of cur.places.list){ if(!pl.им) continue;
      const z=(zf?zf[Math.min(W*H-1,pl.y*W+pl.x)]:0)*ZU;
      const p=P(pl.x+0.5, pl.y+0.5, z+2.2);
      ctx.lineWidth=3; ctx.strokeStyle='rgba(6,10,15,0.85)'; ctx.strokeText(pl.им,p[0],p[1]);
      ctx.fillStyle='rgba(238,244,250,0.9)'; ctx.fillText(pl.им,p[0],p[1]); } }

  if(opts.labels){
    const tag=(pt,txt,fill,ring,big)=>{ if(!pt) return;
      const z=(zf?zf[pt[1]*W+pt[0]]:0)*ZU, r=big?15:12;
      const p0=P(pt[0]+0.5,pt[1]+0.5,z), p=P(pt[0]+0.5,pt[1]+0.5,z+(big?2.4:1.7));
      ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p[0],p[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0],p[1],r,0,7); ctx.fillStyle=fill; ctx.fill();
      ctx.lineWidth=2.2; ctx.strokeStyle=ring; ctx.stroke();
      ctx.fillStyle='#0a0e13'; ctx.font=`700 ${big?15:12}px 'Chakra Petch'`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,p[0],p[1]+0.5); };
    tag(m.pts.T,'T',css('--T'),'#f2c78a',false);
    tag(m.pts.C,'CT',css('--CT'),'#a6cef0',false);
    tag(m.pts.A,'A','rgba(243,248,252,.16)',css('--site'),true);
    tag(m.pts.B,'B','rgba(243,248,252,.16)',css('--site'),true);
  }
  ctx.fillStyle='rgba(125,146,164,0.75)'; ctx.font="11px 'Chakra Petch'";
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillText('тяни мышью — повернуть · '+Math.round(V3.yaw)+'° / '+Math.round(V3.tilt)+'° · высоты ×'+V3.zex.toFixed(1).replace('.',','), 10, chh-10);
}
function syncV3(){ const y=document.getElementById('sYaw'), t=document.getElementById('sTilt');
  if(y){ y.value=Math.round(V3.yaw); document.getElementById('vYaw').textContent=Math.round(V3.yaw)+'°'; }
  if(t){ t.value=Math.round(V3.tilt); document.getElementById('vTilt').textContent=Math.round(V3.tilt)+'°'; } }
