const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch({executablePath:EXE});
  const p=await b.newPage({viewport:{width:1000,height:800}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve('builds/izohrona_v138.html'));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  const r=await p.evaluate(()=>{ useCur(); buildVMF(cur); const d=cur.__wallDiag;
    const s=d.поРазмеру, ks=Object.keys(s).map(Number).sort((a,b)=>a-b);
    let мелких=0, мелкихКлеток=0;
    for(const k of ks) if(k<=8){ мелких+=s[k]; мелкихКлеток+=k*s[k]; }
    return {групп:d.групп, клеток:d.клеток, мелких, мелкихКлеток,
            топ:ks.slice(0,8).map(k=>k+'кл:'+s[k]).join('  ')};
  });
  console.log(`групп стен ${r.групп}, клеток стены ${r.клеток}`);
  console.log(`  групп мельче 9 клеток: ${r.мелких} (в них ${r.мелкихКлеток} клеток)`);
  console.log(`  ${r.топ}`);
  await b.close(); })();
