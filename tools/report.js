/* Сводный прогон сборки: N карт, все показания разом, плюс разбор экспорта.
   Одна таблица — чтобы решать, что чинить, по числам, а не по впечатлению.

   node tools/report.js <билд.html> [сколько] [профиль] [куда]

   Что считается:
     пол/ширина/лучи   — auditStats страницы (локальная ширина, 2 x расстояние до стены,
                         та же величина, что tools/ref16.py снимает с реальных навов);
     вертикаль         — размах z, ярусов >=5% пола, доля на крупнейшем ярусе (корзина 64u),
                         сравнимо с таблицей OVERPASS.md §1;
     маршруты          — сколько независимо перерезаемых путей T->сайт;
     отрезано          — пол, до которого не допрыгнуть: экспортируется, но недостижим;
     экспорт           — брашей, лезвий, вырожденных, вес файла.
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BUILD = process.argv[2] || 'builds/izohrona_v120.html';
const N     = +(process.argv[3] || 3);
const PROF  = process.argv[4] || 'dust2';
const OUT   = process.argv[5] || '';

/* Реальные карты, снятые ТЕМ ЖЕ прибором, что auditStats в браузере:
   tools/refmed.py 16 touch. Числа из PROFILES.md §1б сюда не годятся — там
   свободный прогон, а auditStats меряет локальную ширину на срединной оси.
   Смешать их — это ровно ошибка §5.4, на которой уже дважды сгорело сравнение. */
const REF = {
  dust2:  {пол:7978, шир:187, p90:365, узк:51, шир448:2, лучМед:905, лучP90:2048, лучМакс:3856, зон:26, размах:377, ярус:49},
  mirage: {пол:6518, шир:160, p90:320, узк:59, шир448:0, лучМед:752, лучP90:1376, лучМакс:2768, зон:20, размах:368, ярус:50},
  inferno:{пол:7047, шир:160, p90:288, узк:56, шир448:0, лучМед:736, лучP90:1232, лучМакс:2128, зон:15, размах:352, ярус:36},
  ancient:{пол:6848, шир:192, p90:301, узк:33, шир448:1, лучМед:784, лучP90:1248, лучМакс:2208, зон:14, размах:280, ярус:41},
  cache:  {пол:8228, шир:192, p90:448, узк:35, шир448:8, лучМед:816, лучP90:1376, лучМакс:2353, зон:18, размах:237, ярус:76},
  tuscan: {пол:6842, шир:160, p90:288, узк:55, шир448:0, лучМед:736, лучP90:1344, лучМакс:2176, зон:17, размах:512, ярус:30},
};

/* Замеры, которых на странице нет. Считаются здесь, чтобы не раздувать сборку. */
const EXTRA = `(function(){
  const g=cur.g, zf=cur.zfield, Wf=cur.W||W, Hf=cur.H||H, N=Wf*Hf, U=16;
  /* ---- вертикаль: гистограмма высот по корзинам 64u, вес = площадь ---- */
  const PU=72, bins={}; let zmin=1e9, zmax=-1e9, tot=0;
  for(let i=0;i<N;i++){ if(!g[i]) continue; const z=(zf?zf[i]:0)*PU;
    if(z<zmin)zmin=z; if(z>zmax)zmax=z; const b=Math.floor(z/64); bins[b]=(bins[b]||0)+1; tot++; }
  const bv=Object.values(bins).sort((a,b)=>b-a);
  const ярусов=bv.filter(v=>v>=tot*0.05).length;
  const наОдном=tot? Math.round(100*bv[0]/tot) : 0;
  /* ---- маршруты: сколько РАЗНЫХ горловин надо перерезать, чтобы отсечь сайт от T ----
     считаем рёберную связность приближённо: жадно ищем кратчайший путь, вырезаем
     его самое узкое место, повторяем. Сколько раз получилось — столько маршрутов. */
  const D4=[[1,0],[-1,0],[0,1],[0,-1]], D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const idx=(x,y)=>y*Wf+x, inb=(x,y)=>x>=0&&y>=0&&x<Wf&&y<Hf;
  const nearFloor=(p)=>{ for(let r=0;r<12;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
      const x=p.x+ox,y=p.y+oy; if(inb(x,y)&&g[idx(x,y)]) return idx(x,y); } return -1; };
  /* расстояние до стены — нужно, чтобы найти самое узкое место пути */
  const DW=new Int32Array(N).fill(-1), qq=[];
  for(let y=0;y<Hf;y++)for(let x=0;x<Wf;x++){ const i=idx(x,y);
    if(!g[i]){ DW[i]=0; qq.push(i); } }
  for(let h=0;h<qq.length;h++){ const i=qq[h], x=i%Wf, y=(i/Wf)|0;
    for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
      const j=idx(nx,ny); if(DW[j]<0){ DW[j]=DW[i]+1; qq.push(j); } } }
  const routes=(from,to)=>{
    const blocked=new Uint8Array(N); let n=0;
    for(let iter=0; iter<8; iter++){
      const s=nearFloor(from), t=nearFloor(to); if(s<0||t<0) break;
      if(blocked[s]||blocked[t]) break;
      const prev=new Int32Array(N).fill(-1); prev[s]=s; const st=[s]; let hit=false;
      for(let h=0;h<st.length&&!hit;h++){ const i=st[h], x=i%Wf, y=(i/Wf)|0;
        for(const [dx,dy] of D8){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue;
          const j=idx(nx,ny); if(!g[j]||blocked[j]||prev[j]>=0) continue;
          prev[j]=i; if(j===t){ hit=true; break; } st.push(j); } }
      if(!hit) break;
      n++;
      /* самое узкое место найденного пути */
      let cur2=t, bi=t, bw=1e9;
      while(cur2!==s){ if(DW[cur2]<bw){ bw=DW[cur2]; bi=cur2; } cur2=prev[cur2]; if(cur2<0) break; }
      /* режем кружок радиуса bw+1 вокруг него — это и есть перерезанная горловина */
      const bx=bi%Wf, by=(bi/Wf)|0, R=bw+2;
      for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){ const x=bx+ox,y=by+oy;
        if(inb(x,y)) blocked[idx(x,y)]=1; }
    }
    return n; };
  const px=cur.px;
  const мрш={A:routes(px.T,px.A), B:routes(px.T,px.B), CTA:routes(px.CT,px.A), CTB:routes(px.CT,px.B)};
  /* ---- места: счёт, площадь, входы, безымянные, без предмета ---- */
  const полk=Math.round(tot*U*U/1000);
  let PL=cur.places; if(!PL) try{ PL=computePlaces(g,Wf,Hf,16); }catch(e){ PL=null; }
  let мест=0, наМесто=0, вхМед=0, вхМакс=0, тупиков=0, безИм=0, безПредм=0;
  if(PL&&PL.list&&PL.list.length){ мест=PL.list.length;
    наМесто=Math.round(полk/мест);
    const e=PL.list.map(p=>p.ent).sort((a,b)=>a-b);
    вхМед=e[e.length>>1]; вхМакс=e[e.length-1];
    тупиков=PL.list.filter(p=>p.ent<2).length;
    безИм=PL.list.filter(p=>!p.им).length;
    безПредм=PL.list.filter(p=>!p.lm).length; }
  const zn=cur.zones? cur.zones.area.filter(v=>v>0).length : 0;
  return { размах:Math.round(zmax-zmin), ярусов, наОдном, мрш, зон:zn, полk,
           мест, наМесто, вхМед, вхМакс, тупиков, безИм, безПредм,
           лендм:(cur.lmarks||[]).length };
})()`;

(async () => {
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION/.test(m.text())) errs.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(BUILD));
  await page.waitForSelector('#map');
  await page.waitForFunction('typeof cur!=="undefined" && cur && cur.g', null, { timeout: 300000, polling: 400 });

  // селектор лежит в свёрнутом <details>, кликом до него не добраться
  await page.evaluate(`(function(){ const s=document.getElementById('sProf');
    if(s){ s.value=${JSON.stringify(PROF)}; s.dispatchEvent(new Event('change')); } })()`);
  await page.waitForTimeout(200);
  if (OUT) fs.mkdirSync(OUT, { recursive: true });

  const rows = [];
  for (let i = 0; i < N; i++) {
    const prev = await page.evaluate('cur ? cur.seed : -1');
    await page.click('#gen');
    await page.waitForFunction(`typeof cur!=="undefined" && cur && cur.g && cur.seed!==${prev}`,
      null, { timeout: 300000, polling: 400 });
    await page.waitForTimeout(400);

    const a = await page.evaluate(`(function(){ useCur(); const a=auditStats(cur.g,W,H);
      return { cell:CELL, W:W, H:H, seed:cur.seed,
        полk: Math.round(a.cells*CELL*CELL/1000),
        шир:Math.round(a.wMed), p90:Math.round(a.w90), узк:+a.thin.toFixed(0), шир448:+a.wide.toFixed(0),
        лучМед:Math.round(a.sMed), лучP90:Math.round(a.s90), лучМакс:Math.round(a.sMax),
        плотн:+a.dens.toFixed(0), укрытий:(cur.cover||[]).length,
        det:cur.det||{}, bal:(cur.__bal||{}).промах,
        перевесA:+((cur.mFine||cur.m).mA).toFixed(2), перевесB:+((cur.mFine||cur.m).mB).toFixed(2) }; })()`);
    const e = await page.evaluate(EXTRA);
    let vmf = null, vmfErr = null;
    try { vmf = await page.evaluate('buildVMF(cur)'); } catch (x) { vmfErr = x.message.split('\n')[0]; }

    let ex = { брашей: 0, лезвий: 0, длинных: 0, мб: 0 };
    if (vmf) {
      const solids = vmf.split('\tsolid\n').length - 1;
      // лезвие: тонкое (<=16u), короткое в плане (<=112u), высокое (>=256u)
      let blades = 0, longw = 0;
      const re = /"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"/g;
      for (const chunk of vmf.split('\tsolid\n').slice(1)) {
        let m, xs = [], ys = [], zs = [];
        re.lastIndex = 0;
        while ((m = re.exec(chunk))) for (let k = 1; k <= 3; k++) {
          const p = m[k].trim().split(/\s+/).map(Number);
          xs.push(p[0]); ys.push(p[1]); zs.push(p[2]);
        }
        if (!xs.length) continue;
        const dx = Math.max(...xs) - Math.min(...xs), dy = Math.max(...ys) - Math.min(...ys),
              dz = Math.max(...zs) - Math.min(...zs);
        const nar = Math.min(dx, dy), lng = Math.max(dx, dy);
        if (nar <= 16 && lng <= 112 && dz >= 256) blades++;
        if (nar <= 96 && lng >= 512 && dz >= 128) longw++;
      }
      ex = { брашей: solids, лезвий: blades, длинных: longw, мб: +(vmf.length / 1048576).toFixed(1) };
      if (OUT) fs.writeFileSync(`${OUT}/de_izohrona_${a.seed}.vmf`, vmf);
    }
    if (OUT) {
      await page.locator('#map').screenshot({ path: `${OUT}/map_${a.seed}.png` });
      if (await page.$('#t3D')) {
        await page.evaluate('VIEW3D=true; document.getElementById("t3D").checked=true; document.getElementById("p3d").style.display="block"; V3.yaw=35; V3.tilt=52; syncV3(); draw();');
        await page.waitForTimeout(250);
        await page.locator('#map').screenshot({ path: `${OUT}/map_${a.seed}_3d.png` });
        await page.evaluate('VIEW3D=false; document.getElementById("t3D").checked=false; draw();');
      }
    }
    rows.push(Object.assign({}, a, e, ex, { vmfErr }));
    process.stdout.write('.');
  }
  console.log('');

  const num = k => rows.map(r => r[k]).filter(v => typeof v === 'number');
  const avg = k => { const v = num(k); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : '—'; };
  const mx = k => { const v = num(k); return v.length ? Math.max(...v) : '—'; };
  const R = REF[PROF] || {};
  const line = (name, got, ref, unit) =>
    `  ${name.padEnd(16)} ${String(got).padStart(8)}${unit || ''}` +
    (ref !== undefined ? `   эталон ${String(ref).padStart(6)}${unit || ''}` : '');

  console.log(`\n=== ${path.basename(BUILD)} · профиль ${PROF} · карт ${N} ===`);
  console.log(`  клетка ${rows[0].cell}u, сетка ${rows[0].W}x${rows[0].H}`);
  console.log('\n[ГАБАРИТ И ШИРИНА]');
  console.log(line('пол, k u²', avg('полk'), R.пол));
  console.log(line('локШирина', avg('шир'), R.шир, 'u'));
  console.log(line('локШир p90', avg('p90'), R.p90, 'u'));
  console.log(line('уже 192u', avg('узк'), R.узк, '%'));
  console.log(line('шире 448u', avg('шир448'), R.шир448, '%'));
  console.log('\n[ПРОСТРЕЛЫ]');
  console.log(line('луч медиана', avg('лучМед'), R.лучМед, 'u'));
  console.log(line('луч p90', avg('лучP90'), R.лучP90, 'u'));
  console.log(line('луч макс', mx('лучМакс'), R.лучМакс, 'u'));
  console.log('\n[ВЕРТИКАЛЬ]');
  console.log(line('размах z', avg('размах'), R.размах, 'u'));
  console.log(line('ярусов ≥5%', avg('ярусов'), '4-6'));
  console.log(line('на одном ярусе', avg('наОдном'), R.ярус, '%'));
  console.log('\n[СТРУКТУРА]');
  console.log(line('мест', avg('мест'), 23));
  console.log(line('k u² на место', avg('наМесто'), 358));
  console.log(line('входов медиана', avg('вхМед'), 4));
  console.log(line('входов макс', mx('вхМакс'), 8));
  console.log(line('тупиков', avg('тупиков'), '0-3'));
  console.log(line('БЕЗ ИМЕНИ', avg('безИм'), 0));
  console.log(line('БЕЗ ПРЕДМЕТА', avg('безПредм'), 0));
  console.log(line('лендмарков', avg('лендм')));
  console.log(line('зон планировщика', avg('зон')));
  console.log('\n[БАЛАНС]');
  console.log(line('перевес A', avg('перевесA'), '', ' с'));
  console.log(line('перевес B', avg('перевесB'), '', ' с'));
  console.log(line('промах решателя', avg('bal'), '', ' с'));
  console.log('\n[СЛОЙ ДЕТАЛЕЙ]');
  const dk = ['narrow', 'zwall', 'door', 'part', 'fill', 'chic', 'deadend', 'places', 'lmark', 'lmClr', 'lmCut', 'cutDead', 'cutCov', 'probka', 'steps', 'otrezano', 'ms'];
  for (const k of dk) {
    const v = rows.map(r => r.det[k]).filter(x => typeof x === 'number');
    if (v.length) console.log(`  ${k.padEnd(16)} ${String(+(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)).padStart(8)}`);
  }
  console.log('\n[ЭКСПОРТ]');
  console.log(line('укрытий', avg('укрытий')));
  console.log(line('брашей', avg('брашей')));
  console.log(line('лезвий', avg('лезвий')));
  console.log(line('длинных стен', avg('длинных')));
  console.log(line('файл, МБ', avg('мб')));
  const fails = rows.filter(r => r.vmfErr);
  if (fails.length) console.log(`  ЭКСПОРТ УПАЛ на ${fails.length}/${N}: ${fails[0].vmfErr}`);
  if (errs.length) console.log('\nошибки страницы:\n' + [...new Set(errs)].slice(0, 6).join('\n'));

  await browser.close();
})();
