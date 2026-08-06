/* Как ЛЯЖЕТ текстура — картинкой, без CS2.
   Берёт один и тот же браш из двух экспортов (мировая сетка и подгонка по брашу),
   считает по настоящим uaxis/vaxis из файла, где проходят границы повторов, и
   рисует грань в мировом масштабе с этой решёткой. Видно ровно то, о чём спор:
   на сетке рисунок обрублен краем браша, при подгонке — кончается на ребре.

     node tools/uvpic.js <fit.vmf> <grid.vmf> <out.png>
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');

const RE=/"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"/g;
const RS=/\tside\n\t\t\{([\s\S]*?)\n\t\t\}/g;

function solids(txt){
  const out=[];
  for(const chunk of txt.split('\tsolid\n').slice(1)){
    const pts=[]; RE.lastIndex=0; let m;
    while((m=RE.exec(chunk))){ for(let k=1;k<=3;k++){ const a=m[k].trim().split(/\s+/).map(Number);
      if(a.length===3) pts.push(a); } }
    if(!pts.length) continue;
    const mat=(/"material" "([^"]+)"/.exec(chunk)||[])[1]||'';
    if(/^tools\//i.test(mat)) continue;
    const sides=[]; RS.lastIndex=0; let s;
    while((s=RS.exec(chunk))){ const b=s[1];
      const ua=/"uaxis" "\[([-\d.e ]+)\] ([-\d.e]+)"/.exec(b);
      const va=/"vaxis" "\[([-\d.e ]+)\] ([-\d.e]+)"/.exec(b);
      const pl=/"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"/.exec(b);
      if(!ua||!va||!pl) continue;
      const num=t=>{const a=t.trim().split(/\s+/).map(Number); return {v:a.slice(0,3), off:a[3]||0};};
      sides.push({u:{...num(ua[1]), sc:+ua[2]}, v:{...num(va[1]), sc:+va[2]},
                  p:[1,2,3].map(k=>pl[k].trim().split(/\s+/).map(Number))});
    }
    const X=pts.map(p=>p[0]), Y=pts.map(p=>p[1]), Z=pts.map(p=>p[2]);
    out.push({x0:Math.min(...X), x1:Math.max(...X), y0:Math.min(...Y), y1:Math.max(...Y),
              z0:Math.min(...Z), z1:Math.max(...Z), mat, sides});
  }
  return out;
}

const A=solids(fs.readFileSync(process.argv[2],'utf8'));
const B=solids(fs.readFileSync(process.argv[3],'utf8'));
if(A.length!==B.length){ console.log('файлы не совпадают по числу брашей', A.length, B.length); process.exit(1); }

/* Отбираем ТЕЛА: небольшие коробки, у которых подгонка реально сработала
   (хотя бы одна ось со скейлом не 8), и разные габариты — чтобы не показывать
   шесть раз один и тот же ящик. */
const seen=new Set(), pick=[];
for(let i=0;i<A.length;i++){
  const a=A[i]; const dx=a.x1-a.x0, dy=a.y1-a.y0, dz=a.z1-a.z0;
  if(dx<32||dy<32||dz<40||dx>400||dy>400||dz>420) continue;
  if(!a.sides.some(s=>s.u.sc!==8||s.v.sc!==8)) continue;
  const key=`${Math.round(dx)}x${Math.round(dy)}x${Math.round(dz)}`;
  if(seen.has(key)) continue; seen.add(key); pick.push(i);
  if(pick.length>=6) break;
}
if(!pick.length){ console.log('нечего показывать'); process.exit(1); }

/* Для каждого браша берём грань, смотрящую по -Y (её u идёт по X, v — по Z):
   это «вид спереди», самый понятный. */
function front(sd){
  for(const s of sd.sides){
    const [p1,p2,p3]=s.p;
    const ux=p2[0]-p1[0],uy=p2[1]-p1[1],uz=p2[2]-p1[2];
    const vx=p3[0]-p2[0],vy=p3[1]-p2[1],vz=p3[2]-p2[2];
    const n=[uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx];
    if(n[1]<0 && Math.abs(n[0])<1e-6 && Math.abs(n[2])<1e-6) return s;
  }
  return null;
}

const rows=[];
for(const i of pick){
  const fa=front(A[i]), fb=front(B[i]);
  if(!fa||!fb) continue;
  const a=A[i];
  rows.push({w:a.x1-a.x0, h:a.z1-a.z0, x0:a.x0, z1:a.z1, mat:a.mat,
             fit:{u:fa.u,v:fa.v}, grid:{u:fb.u,v:fb.v}});
}

const HTML=`<!doctype html><meta charset=utf-8><style>
 body{margin:0;background:#0b0f14;color:#dce6ee;font:13px/1.5 ui-monospace,Menlo,monospace}
 h1{font-size:15px;margin:16px 18px 4px;font-weight:600}
 .sub{margin:0 18px 14px;color:#7d92a4;font-size:11.5px}
 table{border-collapse:collapse;margin:0 18px 18px}
 td,th{padding:8px 10px;vertical-align:top;text-align:left}
 th{color:#7d92a4;font-weight:600;font-size:11.5px;border-bottom:1px solid #22303c}
 .cap{color:#7d92a4;font-size:11px;margin-top:4px}
 canvas{display:block;background:#11181f;border:1px solid #22303c;border-radius:4px}
</style><h1>Текстура на грани браша: мировая сетка против подгонки по брашу</h1>
<div class=sub>Клетка рисунка = один повтор текстуры, посчитан по настоящим uaxis/vaxis из .vmf.
Рамка = грань браша. Слева повтор обрезан краем, справа кончается ровно на ребре.</div>
<table id=t></table><script>
const ROWS=${JSON.stringify(rows)}, TEXW=${(+(process.argv[5]||32))/8};
function draw(cv,w,h,x0,z1,ax,tile){
  const K=Math.min(3.2, 300/Math.max(w,h));
  cv.width=Math.round(w*K)+2; cv.height=Math.round(h*K)+2;
  const c=cv.getContext('2d'); c.translate(1,1); c.scale(K,K);
  c.fillStyle='#1a232c'; c.fillRect(0,0,w,h);
  // период в юнитах и мировое положение начала рисунка по каждой оси
  const pu=ax.u.sc*TEXW, pv=ax.v.sc*TEXW;
  const su=-ax.u.off*ax.u.sc, sv=-ax.v.off*ax.v.sc;   // где (точка·ось)=... даёт тексель 0
  // ось u = +X: мировое X. ось v = -Z: проекция = -z, значит z = -(проекция)
  c.save(); c.beginPath(); c.rect(0,0,w,h); c.clip();
  for(let k=Math.floor((x0-su)/pu)-1; k<Math.ceil((x0+w-su)/pu)+1; k++){
    for(let j=Math.floor((-z1-sv)/pv)-1; j<Math.ceil((-z1+h-sv)/pv)+1; j++){
      const X=(su+k*pu)-x0, Y=(sv+j*pv)-(-z1);
      c.fillStyle='#2f4356'; c.fillRect(X+pu*0.06,Y+pv*0.06,pu*0.88,pv*0.88);
      c.strokeStyle='#7fd7c4'; c.lineWidth=Math.max(0.6,pu*0.02);
      c.strokeRect(X+pu*0.06,Y+pv*0.06,pu*0.88,pv*0.88);
      c.beginPath(); c.moveTo(X+pu*0.06,Y+pv*0.5); c.lineTo(X+pu*0.94,Y+pv*0.5);
      c.moveTo(X+pu*0.5,Y+pv*0.06); c.lineTo(X+pu*0.5,Y+pv*0.94); c.stroke();
    }
  }
  c.restore();
  c.strokeStyle='#ffd479'; c.lineWidth=Math.max(1,1.6/K); c.strokeRect(0,0,w,h);
}
const t=document.getElementById('t');
t.innerHTML='<tr><th>грань</th><th>мировая сетка (как было)</th><th>по размеру браша (v127)</th></tr>';
for(const r of ROWS){
  const tr=document.createElement('tr');
  const td0=document.createElement('td');
  td0.innerHTML='<b>'+Math.round(r.w)+' &times; '+Math.round(r.h)+'u</b><div class=cap>'+
    r.mat.split('/').pop()+'</div>';
  const mk=ax=>{ const td=document.createElement('td'); const cv=document.createElement('canvas');
    td.appendChild(cv); draw(cv,r.w,r.h,r.x0,r.z1,ax);
    const pu=ax.u.sc*TEXW, pv=ax.v.sc*TEXW;
    const ru=r.w/pu, rv=r.h/pv;
    const цел=x=>Math.abs(x-Math.round(x))<0.01;
    const кусок=(!цел(ru)||!цел(rv)) && (ax.u.sc!==8||ax.v.sc!==8);
    td.insertAdjacentHTML('beforeend','<div class=cap>повтор '+pu.toFixed(0)+'&times;'+pv.toFixed(0)+
      'u &rarr; '+ru.toFixed(2)+' &times; '+rv.toFixed(2)+' повтора'+
      (кусок?'<br><span style="color:#e8a24a">кусок после вычитания: наследует рисунок целой коробки, поэтому число дробное</span>':'')+
      '</div>');
    return td; };
  tr.appendChild(td0); tr.appendChild(mk(r.grid)); tr.appendChild(mk(r.fit));
  t.appendChild(tr);
}
</script>`;

(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1180,height:900},deviceScaleFactor:2});
  await p.setContent(HTML);
  await p.waitForTimeout(400);
  await p.screenshot({path:process.argv[4]||'/tmp/uvpic.png', fullPage:true});
  console.log('готово:', process.argv[4]||'/tmp/uvpic.png', '· брашей', rows.length);
  await b.close(); })();
