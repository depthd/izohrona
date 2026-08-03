// Прогон генератора без браузера. Выгружает сетку проходимости и узлы.
// node dump.js <файл.html> <сколько карт> <выход.json> [ключ=знач ...]
const fs = require('fs'), { JSDOM } = require('jsdom');
const [, , FILE, NRAW, OUT, ...OPTS] = process.argv;
const N = parseInt(NRAW || '8', 10);
const html = fs.readFileSync(FILE, 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const noop = new Proxy(function () {}, {
  get: (t, k) => {
    if (k === 'canvas') return { width: 1200, height: 1200 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
    return noop;
  }, apply: () => noop, set: () => true
});
w.HTMLCanvasElement.prototype.getContext = () => noop;
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
const src = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
// ВСЁ одним eval: let-привязки генератора живут в лексической области этого eval,
// из отдельного второго eval они не видны (на этом прогон и падал).
const sets = OPTS.map(o => { const [k, v] = o.split('='); return `${k}=${v};`; }).join('\n');
w.eval(src + '\n' + sets + `
window.__mk=function(){
  const cfg={CTtarget:parseFloat(sTempo.value),M:parseFloat(sMargin.value),jit:parseFloat(sJit.value),
             tol:1.0,tolMid:1.8,vert:parseFloat(sVert.value),ringP:parseFloat(sRing.value)};
  const r=generate(cfg); if(!r) return null;
  r.coverSeed=(Math.random()*4294967296)>>>0; r.cover=makeCover(r.g,r.px,r.coverSeed);
  r.zones=computeZones(r); try{ r.plan=planStructures(r,TUNP); }catch(e){ r.plan={doors:[]}; } if(typeof clearDoorways==='function') clearDoorways(r);
  const px={}; for(const k in r.px) px[k]={x:r.px[k].x,y:r.px[k].y,z:r.px[k].z};
  return {W:W,H:H,g:Array.from(r.g),zf:Array.from(r.zfield),px:px,
          zid:Array.from(r.zones.zid),area:r.zones.area,junc:r.zones.junc.length,
          m:{tTA:r.m.tTA,tTB:r.m.tTB,tCA:r.m.tCA,tCB:r.m.tCB,rot:r.m.rot,mA:r.m.mA,mB:r.m.mB},
          seed:r.seed, cover:r.cover.length, coverList:r.cover.map(c=>({x:c.x,y:c.y,w:c.w||1,h:c.h||1,hgt:c.hgt})), doors:(r.plan&&r.plan.doors)?r.plan.doors.map(d=>({x:d.x,y:d.y,w:d.w,axis:d.axis})):[]};
};`);

setTimeout(() => {
  const out = [];
  let fail = 0;
  for (let k = 0; k < N; k++) {
    let r = null;
    try { r = w.__mk(); } catch (e) { console.error('  сбой:', e.message); }
    if (r) out.push(r); else fail++;
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.error(`${FILE}: собрано ${out.length}, не собралось ${fail}`);
}, 600);
