/* Выгрузка нескольких карт в .vmf для замеров: node tools/expn.js <сборка> [сколько] */
const {chromium}=require('playwright'); const fs=require('fs'),path=require('path');
(async()=>{const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
const p=await b.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+path.resolve(process.argv[2]),{timeout:120000});
await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:150000,polling:400});
for(let k=0;k<+(process.argv[3]||3);k++){
  if(k){const pr=await p.evaluate('cur.seed'); await p.click('#gen');
    await p.waitForFunction(`cur && cur.seed!==${pr}`,null,{timeout:90000,polling:400});}
  const t=await p.evaluate('(function(){ useCur(); return buildVMF(cur); })()');
  fs.writeFileSync(`/tmp/n${k}.vmf`,t);
  console.log('карта',k,'сид',await p.evaluate('cur.seed'),
    await p.evaluate('JSON.stringify({балок:cur.__beams, ламп:(cur.__lampSkip!==undefined?"есть":"?")})'));
}
await b.close();})();
