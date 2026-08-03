const fs=require('fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('izohrona_v95.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true}); const w=dom.window;
const noop=new Proxy(function(){},{get:(t,k)=>{if(k==='canvas')return{width:1200,height:1200};if(k==='measureText')return()=>({width:10});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:()=>{}});return noop;},apply:()=>noop,set:()=>true});
w.HTMLCanvasElement.prototype.getContext=()=>noop; w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
const src=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
w.eval(src+`
window.__p=function(){
  V95.fine=false; applyMode();
  const cfg={CTtarget:parseFloat(sTempo.value),M:parseFloat(sMargin.value),jit:parseFloat(sJit.value),tol:1.0,tolMid:1.8,vert:parseFloat(sVert.value),ringP:parseFloat(sRing.value)};
  const t0=Date.now(); let ok=0; const out=[];
  for(let k=0;k<6;k++){ const seed=(Math.random()*4294967296)>>>0; const r=generateOne(seed,cfg);
    if(!r||!r.m){ out.push('null'); continue; }
    const good=Math.abs(r.m.mA-cfg.M)<=cfg.tol&&Math.abs(r.m.mB-cfg.M)<=cfg.tol&&Math.abs(r.m.midDiff)<=cfg.tolMid;
    if(good) ok++;
    out.push('mA='+r.m.mA.toFixed(1)+' mB='+r.m.mB.toFixed(1)+' mid='+r.m.midDiff.toFixed(1)+(good?' OK':'')); }
  return 'клетка '+CELL+'u цель M='+cfg.M+' доп '+cfg.tol+' | годных '+ok+'/6 | '+(Date.now()-t0)+'мс | '+out.join(' ; ');
};`);
setTimeout(()=>{ console.log(w.__p()); },400);
