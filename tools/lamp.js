const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch({executablePath:EXE});
  const p=await b.newPage({viewport:{width:1000,height:800}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve('builds/izohrona_v138.html'));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  const r=await p.evaluate(()=>{ useCur(); const v=buildVMF(cur);
    return { ламп:(v.match(/light_omni2/g)||[]).length, снято:cur.__lampSkip,
             заливка:cur.__zl, подОткрытым:cur.__zlOpen, мб:+(v.length/1048576).toFixed(1) }; });
  console.log(r); await b.close(); })();
