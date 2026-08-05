/* Что показывает панель приёмки — текстом, без скриншота. */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1400,height:1200}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:300000,polling:400});
  await p.waitForTimeout(500);
  const txt=await p.evaluate(()=>document.getElementById('audit').innerText);
  console.log(txt);
  await b.close(); })();
