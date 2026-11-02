'use strict';
/* СБОРКА v140: продукт v139 + кнопка «Скачать .vmap».

   Генерация не меняется ни на байт: кнопка берёт ровно тот .vmf, что
   печатает «Скачать .vmf», и переводит его тем же переводом, что сверен с его
   Hammer (`tools/sverka_vmap.js`). В HTML встраиваются core/kv2, core/vmap,
   core/vmf2vmap, образец data/obrazec.vmap.txt и таблица размеров картинок.

     node tools/vstroit_vmap.js [builds/izohrona_v139.html] [builds/izohrona_v140.html] */
const fs = require('fs');
const path = require('path');
const к = path.join(__dirname, '..');
const ИЗ = process.argv[2] || path.join(к, 'builds/izohrona_v139.html');
const В = process.argv[3] || path.join(к, 'builds/izohrona_v140.html');
let html = fs.readFileSync(ИЗ, 'utf8');

const модуль = (имя) => {
  const код = fs.readFileSync(path.join(к, 'core', имя + '.js'), 'utf8').replace(/^'use strict';\n/, '');
  return `(function(module, require){\n${код}\n})(М.${имя} = { exports: {} }, require); М.${имя} = М.${имя}.exports;\n`;
};
const блок = `
/* ============ v140. ВЫГРУЗКА .vmap — сразу для Hammer, без импорта .vmf ============
   Тот же .vmf, что у кнопки рядом, переводится так, как переводит его Hammer
   (сверено на 1996 брашах его primer.vmap). Исходники — core/*.js, собрано
   tools/vstroit_vmap.js; здесь не править. */
const ВЫГРУЗКА_VMAP = (function(){
  const М = {};
  const require = n => М[n.split('/').pop().replace(/\\.js$/, '')];
${модуль('kv2')}${модуль('vmap')}${модуль('vmf2vmap')}
  return { vmfToVmap: М.vmf2vmap.vmfToVmap,
           ОБРАЗЕЦ: ${JSON.stringify(fs.readFileSync(path.join(к, 'data/obrazec.vmap.txt'), 'utf8'))},
           ТОЧКИ: ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(к, 'data/tekstury_tochek.json'), 'utf8')))} };
})();
function downloadVMAP(){ if(!cur) return; useCur();
  const r = ВЫГРУЗКА_VMAP.vmfToVmap(buildVMF(cur), ВЫГРУЗКА_VMAP.ОБРАЗЕЦ, ВЫГРУЗКА_VMAP.ТОЧКИ, cur.seed>>>0);
  window.__vmapLast = { мешей: r.scene.polys.length, сущностей: r.scene.ents.length, размер: r.vmap.length, неизвестные: r.scene.unknown };
  const blob = new Blob([r.vmap], {type:'text/plain'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'izohrona_' + cur.seed + '.vmap';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
document.getElementById('vmap').onclick = downloadVMAP;
`;
const кнопкаVMF = '<button class="gen alt" id="vmf">⬇ Скачать .vmf (для Hammer)</button>';
if (!html.includes(кнопкаVMF)) throw new Error('не нашёл кнопку .vmf');
html = html.replace(кнопкаVMF, '<button class="gen" id="vmap">⬇ Скачать .vmap (сразу для Hammer)</button>\n        ' + кнопкаVMF);
const конец = html.lastIndexOf('</script>');
html = html.slice(0, конец) + блок + html.slice(конец);
html = html.replace('<title>v139 ·', '<title>v140 ·')
           .replace('vertical-align:super">v139</span>', 'vertical-align:super">v140</span>')
           .replace('const ВЕРСИЯ = "izohrona v139";', 'const ВЕРСИЯ = "izohrona v140";');
for (const s of ['<title>v140', 'super">v140<', 'izohrona v140"']) if (!html.includes(s)) throw new Error('версия не заменилась: ' + s);
fs.writeFileSync(В, html);
console.log('записано', В, Math.round(html.length / 1024), 'КБ');
