
const fs=require('fs'),{JSDOM}=require('jsdom');
const [,,FILE,MODEOPT]=process.argv;
const html=fs.readFileSync(FILE,'utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true}); const w=dom.window;
const noop=new Proxy(function(){},{get:(t,k)=>{if(k==='canvas')return{width:1200,height:1200};if(k==='measureText')return()=>({width:10});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:()=>{}});return noop;},apply:()=>noop,set:()=>true});
w.HTMLCanvasElement.prototype.getContext=()=>noop; w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
const src=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
w.eval(src+"\n"+(MODEOPT||"")+"\nwindow.__go=function(){ run(); };\nwindow.__st=function(){ return cur? ('cur есть, пол '+cur.g.reduce((a,b)=>a+b,0)+' кл') : 'cur пуст'; };\nwindow.__vmf=function(){ try{ const s=buildVMF(); return 'VMF символов '+(s?s.length:0);}catch(e){ return 'ОШИБКА '+e.message; } };");
setTimeout(()=>{ try{ w.__go(); }catch(e){ console.log('run упал:',e.message); }
  setTimeout(()=>{ console.log(FILE,(MODEOPT||'corridor'),'|',w.__st(),'|',w.__vmf()); },800); },400);
