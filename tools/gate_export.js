/* Сборка N карт для гейта: пишет .vmf и JSON с числами, которые видит только
   генератор (расхождение пола с растром, спавны, вырожденные браши, каллауты).

     node tools/gate_export.js <сборка> <сколько> <куда>
*/
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');

(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const сборка=process.argv[2], N=+(process.argv[3]||3), куда=process.argv[4]||'/tmp/gate';
  fs.mkdirSync(куда,{recursive:true});
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage();
  const ошибки=[];
  p.on('pageerror',e=>ошибки.push(String(e.message).slice(0,120)));
  await p.goto('file://'+path.resolve(сборка),{timeout:180000});
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:180000,polling:400});
  const итог=[];
  for(let k=0;k<N;k++){
    if(k){ const пр=await p.evaluate('cur.seed'); await p.click('#gen');
      await p.waitForFunction(`cur && cur.seed!==${пр}`,null,{timeout:150000,polling:400}); }
    const t0=Date.now();
    const txt=await p.evaluate('(function(){ useCur(); return buildVMF(cur); })()');
    const файл=`${куда}/m${k}.vmf`;
    fs.writeFileSync(файл,txt);
    const st=await p.evaluate(`JSON.stringify({
      сид:cur.seed, surf:cur.__surf, degen:(cur.__degen||[]).length,
      спавновT:cur.__spT, спавновC:cur.__spC,
      мест:(cur.places&&cur.places.count)||0, укрытий:(cur.cover||[]).length,
      предметов:(cur.lmarks||[]).length, балок:cur.__beams, csg:cur.__csg })`);
    итог.push(Object.assign(JSON.parse(st), {файл, мс:Date.now()-t0,
      каллаутов:(txt.match(/env_cs_place/g)||[]).length,
      цветUndefined:(txt.match(/"color" "undefined"/g)||[]).length,
      брашей:(txt.match(/\tsolid/g)||[]).length }));
    console.error(`  карта ${k+1}/${N} собрана, сид ${итог[k].сид}`);
  }
  fs.writeFileSync(`${куда}/gen.json`, JSON.stringify({карты:итог, ошибкиСтраницы:ошибки},null,1));
  await b.close();
})();
