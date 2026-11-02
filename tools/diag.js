const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(require("fs").existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1400,height:1200}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForSelector('#map');
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:240000,polling:400});
  for(let i=0;i<4;i++){
    const prev=await p.evaluate('cur.seed');
    await p.click('#gen');
    await p.waitForFunction(`typeof cur!=="undefined" && cur && cur.g && cur.seed!==${prev}`,null,{timeout:240000,polling:400});
    await p.waitForTimeout(500);
    const info=await p.evaluate(`({seed:cur.seed,curCELL:cur.CELL,globCELL:CELL,W:W,H:H,curW:cur.W,bal:cur.__bal, det:cur.det})`);
    console.log(JSON.stringify(info));
  }
  if(errs.length) console.log('ERR',errs.slice(0,5));
  await b.close();
})();
