/* Одна генерация выбранного профиля с трассировкой — чтобы поймать зависание. */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
(async()=>{ const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b=await chromium.launch(fs.existsSync(EXE)?{executablePath:EXE}:{});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  p.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,200)); });
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction('typeof cur!=="undefined" && cur && cur.g',null,{timeout:120000,polling:400});
  console.log('стартовая карта есть');
  const prof=process.argv[3]||'cache';
  await p.evaluate(`(function(){ const s=document.getElementById('sProf');
    s.value=${JSON.stringify(prof)}; s.dispatchEvent(new Event('change')); })()`);
  await p.waitForTimeout(1500);
  console.log('профиль', prof, 'выставлен; сетка:',
    await p.evaluate('W+"x"+H+" CELL="+CELL+" COVDENS="+COVDENS+" sCov="+document.getElementById("sCov").value'));
  const prev=await p.evaluate('cur.seed');
  const t0=Date.now();
  await p.click('#gen');
  try{
    await p.waitForFunction(`cur && cur.seed!==${prev}`,null,{timeout:60000,polling:400});
    console.log('карта собралась за', Date.now()-t0,'мс');
    console.log(await p.evaluate('({мест:(cur.places&&cur.places.count)||0, укрытий:(cur.cover||[]).length, предметов:(cur.lmarks||[]).length, bal:cur.__bal})'));
  }catch(e){
    console.log('НЕ СОБРАЛОСЬ за 60с. meta:', await p.evaluate('document.getElementById("meta").innerText.slice(0,200)'));
    console.log('сетка сейчас:', await p.evaluate('W+"x"+H+" CELL="+CELL'));
  }
  await b.close(); })();
