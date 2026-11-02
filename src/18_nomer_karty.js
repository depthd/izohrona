
/* ============ v141. НОМЕР КАРТЫ ============
   Карта задаётся тройкой сид:цель:ковёр (как в tools/povtor.js) и настройками
   панели. Номер = тройка, а за косой чертой — только те настройки, что
   отличаются от начальных. По номеру открывается та же карта байт в байт:
   он может написать «на карте № … вот тут», а я — открыть её у себя.
   Настройки запоминаются в момент, когда появилась карта, а не когда номер
   копируют: ползунок, сдвинутый после генерации, к этой карте отношения не имеет. */
const НОМЕР = (function(){
  const ВИД = new Set(['t3D','sYaw','sTilt','sZex','tHeat','tHeight','tRoutes','tCover','tLabels',
                       'tPlaces','tStruct','tZones']);                // только вид, на карту не влияют
  const ручки = [...document.querySelectorAll('.panel input, .panel select')]
    .filter(e => e.id && !ВИД.has(e.id) && !e.id.startsWith('nomer'));
  const знач = e => e.type === 'checkbox' ? (e.checked ? '1' : '0') : String(e.value);
  const снять = () => Object.fromEntries(ручки.map(e => [e.id, знач(e)]));
  const начало = снять();
  let была = null, снимок = начало, текущий = '';

  function код(){
    if(!cur) return '';
    const т = `${cur.seed>>>0}:${cur.__aim}:${cur.coverSeed>>>0}`;
    const н = ручки.filter(e => снимок[e.id] !== начало[e.id]).map(e => `${e.id}=${снимок[e.id]}`);
    return н.length ? т + '/' + н.join(',') : т;
  }
  function показать(){
    if(cur && cur !== была){ была = cur; снимок = снять(); }
    const к = код(); if(к === текущий) return; текущий = к;
    const el = document.getElementById('nomerKod'); if(el) el.textContent = к || '—';
  }
  setInterval(показать, 400);

  function копировать(){
    const к = текущий; if(!к) return;
    const ок = () => сказать('скопировано', true);
    const запасной = () => { const t = document.createElement('textarea'); t.value = к;
      document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); ок(); }catch(e){ сказать('не вышло — выдели номер мышью'); }
      t.remove(); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(к).then(ок, запасной);
    else запасной();
  }
  function сказать(т, хорошо){ const el = document.getElementById('nomerMsg'); if(!el) return;
    el.textContent = т; el.style.color = хорошо ? 'var(--fair)' : 'var(--T)';
    clearTimeout(сказать.т); сказать.т = setTimeout(() => { el.textContent = ''; }, 4000); }

  function открыть(текст){
    const m = /(\d+):(-?[\d.]+(?:e-?\d+)?):(\d+)(?:\/(\S*))?/.exec(текст || '');
    if(!m) return сказать('не похоже на номер: нужны три числа через двоеточие');
    const пары = (m[4] || '').split(',').filter(Boolean).map(s => s.split('='));
    const нужно = Object.assign({}, начало, Object.fromEntries(пары));
    BAKING = true;                       // пока ставим ручки, ничего не перегенерировать
    try{
      const проф = document.getElementById('sProf');
      if(проф && нужно.sProf && проф.value !== нужно.sProf){
        проф.value = нужно.sProf; applyProfile(нужно.sProf);
        document.getElementById('vProf').textContent = нужно.sProf; }
      for(const e of ручки){ if(e.id === 'sProf' || нужно[e.id] === undefined || знач(e) === нужно[e.id]) continue;
        if(e.type === 'checkbox') e.checked = нужно[e.id] === '1'; else e.value = нужно[e.id];
        e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }
    } finally { BAKING = false; }
    clearTimeout(__recT);                // ползунок укрытий мог заказать пересборку тел — она не нужна
    window.__SEED = +m[1]; window.__AIM = +m[2]; window.__COVSEED = +m[3];
    сказать('открываю…', true);
    run();
    const fl = document.getElementById('flash');
    const ждать = setInterval(() => { if(fl.classList.contains('on')) return; clearInterval(ждать);
      delete window.__SEED; delete window.__AIM; delete window.__COVSEED;
      сказать(cur && cur.seed>>>0 === +m[1] ? 'открыта карта ' + m[1] : 'не собралась — проверь номер', cur && cur.seed>>>0 === +m[1]); }, 200);
  }

  document.getElementById('nomerCopy').onclick = копировать;
  document.getElementById('nomerOpen').onclick = () => открыть(document.getElementById('nomerVvod').value);
  document.getElementById('nomerVvod').addEventListener('keydown', e => { if(e.key === 'Enter') открыть(e.target.value); });
  return { код: () => (показать(), текущий), открыть };
})();
