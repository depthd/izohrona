/* Картинка доходимости: серое — ходибельный пол, светлое — куда доходишь от
   первой точки, жёлтая ломаная — фактический путь, красная прямая — как хотелось.
   Рисуется по /tmp/reach.json, который пишет reach.py с ключом --картинка. */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const D=JSON.parse(fs.readFileSync('/tmp/reach.json','utf8'));
const HTML=`<!doctype html><meta charset=utf-8><style>
 body{margin:0;background:#0b0f14;color:#dce6ee;font:12px ui-monospace,monospace}
 h1{font-size:14px;margin:12px 14px 2px} .s{margin:0 14px 8px;color:#7d92a4;font-size:11px}
 canvas{display:block;margin:0 14px 14px;background:#05080b;border:1px solid #22303c}
</style>
<h1>Доходимость по экспорту: «${D.A}» → «${D.B}»</h1>
<div class=s>тёмно-серое — ходибельный пол · светлое — куда доходишь от «${D.A}» ·
жёлтая ломаная — фактический путь · красная прямая — как хотелось бы напрямую</div>
<canvas id=c></canvas><script>
const D=${JSON.stringify(D)};
const CROP=${JSON.stringify(process.argv[3]?process.argv[3].split(',').map(Number):null)};
const K=CROP?7:2, c=document.getElementById('c'), g=c.getContext('2d');
// CROP задаётся в МИРОВЫХ координатах x0,y0,x1,y1 — так его удобно брать из замера
const c0 = CROP ? [Math.floor((CROP[0]-D.X0)/D.U), Math.floor((CROP[1]-D.Y0)/D.U),
                   Math.ceil((CROP[2]-D.X0)/D.U), Math.ceil((CROP[3]-D.Y0)/D.U)]
                : [0,0,D.W-1,D.H-1];
const CW=c0[2]-c0[0]+1, CH=c0[3]-c0[1]+1;
c.width=CW*K; c.height=CH*K;
const px=cx=>(cx-c0[0])*K, py=cy=>(c0[3]-cy)*K;   // мир по Y растёт вверх
g.fillStyle='#05080b'; g.fillRect(0,0,c.width,c.height);
for(let cy=0;cy<D.H;cy++){ const r=D.карта[cy];
  for(let cx=0;cx<D.W;cx++){ const v=r[cx]; if(v==='0') continue;
    g.fillStyle = v==='2' ? '#cfe0ec' : '#39505f';
    g.fillRect(px(cx), py(cy), K, K); } }
const cellOf=p=>[ (p[0]-D.X0)/D.U, (p[1]-D.Y0)/D.U ];
// прямая
g.strokeStyle='#e05a4a'; g.lineWidth=2; g.setLineDash([6,4]); g.beginPath();
g.moveTo(px(D.a[0])+K/2, py(D.a[1])+K/2); g.lineTo(px(D.b[0])+K/2, py(D.b[1])+K/2); g.stroke();
g.setLineDash([]);
// путь
if(D.путь.length){ g.strokeStyle='#ffd479'; g.lineWidth=2.5; g.beginPath();
  D.путь.forEach(([x,y],i)=>{ const X=px(x)+K/2, Y=py(y)+K/2; i?g.lineTo(X,Y):g.moveTo(X,Y); });
  g.stroke(); }
// места
g.font='10px ui-monospace,monospace';
for(const [n,p] of Object.entries(D.места)){ const [cx,cy]=cellOf(p);
  const X=px(cx), Y=py(cy);
  const свои = (n===D.A||n===D.B);
  g.fillStyle=свои?'#7fd7c4':'#8fa6b8';
  g.beginPath(); g.arc(X,Y,свои?4:2.5,0,6.2832); g.fill();
  g.fillStyle=свои?'#7fd7c4':'#67788a'; g.fillText(n, X+6, Y+3); }
</script>`;
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:1.5});
  await p.setContent(HTML); await p.waitForTimeout(400);
  await p.screenshot({path:process.argv[2]||'/tmp/reach.png', fullPage:true});
  console.log('готово', process.argv[2]||'/tmp/reach.png'); await b.close(); })();
