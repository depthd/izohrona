'use strict';
/* СБОРКА ПРОДУКТА из src/ в один HTML.

   src/ — продукт, разложенный по смыслу: начало страницы, стиль, панель, код
   по разделам, конец страницы. Части склеиваются по порядку имён. Перед концом
   страницы вставляется выгрузка .vmap из core/ (kv2, vmap, vmf2vmap, образец
   data/obrazec.vmap.txt и таблица размеров картинок) — в src её нет, чтобы не
   держать две копии одного кода.

   Версия берётся из src (`const ВЕРСИЯ = "izohrona vNNN"`) и обязана совпадать
   с заголовком страницы и подписью у названия.

     node tools/sobrat.js                         → builds/izohrona_<версия>.html
     node tools/sobrat.js --сверить <файл.html>   → совпадает ли сборка с файлом байт в байт

   Раскладка v140 по частям проверена так: сборка из src совпала с
   builds/izohrona_v140.html до байта. */
const fs = require('fs');
const path = require('path');
const к = path.join(__dirname, '..');
const SRC = path.join(к, 'src');

const модуль = (имя) => {
  const код = fs.readFileSync(path.join(к, 'core', имя + '.js'), 'utf8').replace(/^'use strict';\n/, '');
  return `(function(module, require){\n${код}\n})(М.${имя} = { exports: {} }, require); М.${имя} = М.${имя}.exports;\n`;
};

function выгрузкаVmap() {
  return `
/* ============ v140. ВЫГРУЗКА .vmap — сразу для Hammer, без импорта .vmf ============
   Тот же .vmf, что у кнопки рядом, переводится так, как переводит его Hammer
   (сверено на 1996 брашах его primer.vmap). Исходники — core/*.js, собрано
   tools/sobrat.js; здесь не править. */
const ВЫГРУЗКА_VMAP = (function(){
  const М = {};
  const require = n => М[n.split('/').pop().replace(/\\.js$/, '')];
${модуль('kv2')}${модуль('vmap')}${модуль('vmf2vmap')}
  return { vmfToVmap: М.vmf2vmap.vmfToVmap, vmfToScene: М.vmf2vmap.vmfToScene,
           ОБРАЗЕЦ: ${JSON.stringify(fs.readFileSync(path.join(к, 'data/obrazec.vmap.txt'), 'utf8'))},
           ТОЧКИ: ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(к, 'data/tekstury_tochek.json'), 'utf8')))} };
})();
function downloadVMAP(){ if(!cur) return; useCur();
  const r = ВЫГРУЗКА_VMAP.vmfToVmap(buildVMF(cur), ВЫГРУЗКА_VMAP.ОБРАЗЕЦ, ВЫГРУЗКА_VMAP.ТОЧКИ, cur.seed>>>0);
  window.__vmapLast = { мешей: r.scene.polys.length, сущностей: r.scene.ents.length, размер: r.vmap.length, неизвестные: r.scene.unknown };
  const blob = new Blob([r.vmap], {type:'text/plain'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'de_izohrona_' + cur.seed + '.vmap';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  if (V81.radar) downloadRadar(); }   // v141: радар и к .vmap, имя карты то же, что у радара
document.getElementById('vmap').onclick = downloadVMAP;
`;
}

function собрать() {
  const имена = fs.readdirSync(SRC).filter(f => /^\d\d_/.test(f)).sort();
  const конец = имена.filter(f => f.startsWith('90_'));
  const тело = имена.filter(f => !f.startsWith('90_'));
  const читать = f => fs.readFileSync(path.join(SRC, f), 'utf8');
  const html = тело.map(читать).join('') + выгрузкаVmap() + конец.map(читать).join('');
  const в = /const ВЕРСИЯ = "izohrona (v\d+)";/.exec(html);
  if (!в) throw new Error('нет строки ВЕРСИЯ в src');
  const версия = в[1];
  for (const s of [`<title>${версия} ·`, `vertical-align:super">${версия}</span>`])
    if (!html.includes(s)) throw new Error(`версия ${версия} не совпадает с «${s}» — поправь src/00_nachalo.html или src/02_panel.html`);
  return { html, версия, частей: имена.length };
}

if (require.main === module) {
  const { html, версия, частей } = собрать();
  const i = process.argv.indexOf('--сверить');
  if (i > 0) {
    const образец = fs.readFileSync(process.argv[i + 1], 'utf8');
    if (образец === html) { console.log(`совпадает байт в байт (${частей} частей, ${версия})`); process.exit(0); }
    let n = 0; while (n < html.length && html[n] === образец[n]) n++;
    const строка = html.slice(0, n).split('\n').length;
    console.log(`РАСХОДИТСЯ со строки ${строка}:\n  сборка: ${JSON.stringify(html.slice(n, n + 80))}\n  файл:   ${JSON.stringify(образец.slice(n, n + 80))}`);
    process.exit(1);
  }
  const выход = process.argv[2] || path.join(к, 'builds', `izohrona_${версия}.html`);
  fs.writeFileSync(выход, html);
  console.log(`записано ${path.relative(к, выход)}: ${частей} частей, ${Math.round(html.length / 1024)} КБ`);
}

module.exports = { собрать };
