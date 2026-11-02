const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
const p=await b.newPage({viewport:{width:1400,height:1200}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/net::/.test(m.text()))errs.push('CONSOLE: '+m.text());});
await p.goto('file://' + require('path').resolve('builds/arhiv/izohrona_v98.html') + ''); await p.waitForSelector('#map');
const OUT='/tmp/claude-0/-home-user-pd/f8a0ff22-2209-50d9-97f1-af08380385c6/scratchpad/out2';
fs.mkdirSync(OUT,{recursive:true});
const shot=async(tag)=>{ await p.mouse.move(4,4); await p.waitForTimeout(120); await p.locator('#map').screenshot({path:`${OUT}/${tag}.png`}); };
const gen=async()=>{ const prev=await p.evaluate('typeof cur!=="undefined"&&cur?cur.seed:-1');
  await p.click('#gen');
  await p.waitForFunction(`typeof cur!=="undefined"&&cur&&cur.g&&cur.seed!==${prev}`,null,{timeout:240000,polling:400});
  await p.waitForTimeout(1000); };

// 1) без деталей
await gen();
const seed=await p.evaluate('cur.seed');
const base=await p.evaluate('({cell:CELL,w:W,h:H,cover:cur.cover.length,foot:[...new Set(cur.cover.map(c=>(c.w||1)+"x"+(c.h||1)))].slice(0,8)})');
console.log('БЕЗ ДЕТАЛЕЙ', seed, JSON.stringify(base), 'баланс', JSON.stringify(await p.evaluate('({mA:+cur.m.mA.toFixed(2),mB:+cur.m.mB.toFixed(2),rot:+cur.m.rot.toFixed(1)})')));
await shot('a_plain');
await p.evaluate('VIEW3D=true;document.getElementById("t3D").checked=true;document.getElementById("p3d").style.display="block";V3.yaw=35;V3.tilt=52;syncV3();draw();');
await p.waitForTimeout(200); await shot('a_plain_3d');
await p.evaluate('VIEW3D=false;document.getElementById("t3D").checked=false;draw();');

// 2) тот же сид, со слоем деталей
await p.evaluate('DET.on=true;document.getElementById("tDet").checked=true;');
await p.evaluate(`(()=>{const cfg={CTtarget:parseFloat(sTempo.value),M:parseFloat(sMargin.value),jit:parseFloat(sJit.value),tol:1.0,tolMid:1.8,vert:parseFloat(sVert.value),ringP:parseFloat(sRing.value)};
  applyMode(); const r=generateOne(${seed},cfg); if(!r){throw new Error('не собралось');}
  r.coverSeed=cur.coverSeed; r.cover=coverAtCell(r.g,r.px,r.coverSeed);
  try{r.plan=planStructures(r,TUNP);}catch(e){r.plan={tun:new Uint8Array(W*H),builds:[],doors:[]};}
  clearDoorways(r);
  const f=detRefine(r); setSize(f.W,f.H); CELL=16; SC=6;
  f.m=Object.assign({},r.m); refineFields(f);
  f.zones=computeZones(f); f.CELL=CELL; cur=f; draw(); paint();})()`);
await p.waitForTimeout(600);
const det=await p.evaluate('({cell:CELL,w:W,h:H,cover:cur.cover.length,det:cur.det,foot:[...new Set(cur.cover.map(c=>(c.w||1)+"x"+(c.h||1)))].slice(0,10)})');
console.log('СО СЛОЕМ  ', JSON.stringify(det), 'баланс', JSON.stringify(await p.evaluate('({mA:+cur.m.mA.toFixed(2),mB:+cur.m.mB.toFixed(2),rot:+cur.m.rot.toFixed(1)})')));
await shot('b_det');
await p.evaluate('VIEW3D=true;document.getElementById("t3D").checked=true;V3.yaw=35;V3.tilt=52;syncV3();draw();');
await p.waitForTimeout(300); await shot('b_det_3d');
console.log(errs.length?('ОШИБКИ\n'+errs.slice(0,6).join('\n')):'ошибок нет');
await b.close();})();
