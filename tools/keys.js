
const fs=require('fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('izohrona_v92.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true}); const w=dom.window;
const noop=new Proxy(function(){},{get:(t,k)=>{if(k==='canvas')return{width:1200,height:1200};if(k==='measureText')return()=>({width:10});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:()=>{}});return noop;},apply:()=>noop,set:()=>true});
w.HTMLCanvasElement.prototype.getContext=()=>noop; w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
const src=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
w.eval(src+"\nwindow.__k=function(mode){ MODE=mode; const cfg={CTtarget:parseFloat(sTempo.value),M:parseFloat(sMargin.value),jit:parseFloat(sJit.value),tol:1.0,tolMid:1.8,vert:parseFloat(sVert.value),ringP:parseFloat(sRing.value)}; const r=generate(cfg); return r?Object.keys(r).sort():null; };");
setTimeout(()=>{ const a=w.__k('corridor'), b=w.__k('partition');
  console.log('коридор :', a.join(' '));
  console.log('объёмы  :', b.join(' '));
  console.log('нет в объёмах:', a.filter(k=>!b.includes(k)).join(' ')||'—');
  console.log('лишнее в объёмах:', b.filter(k=>!a.includes(k)).join(' ')||'—');
},500);
