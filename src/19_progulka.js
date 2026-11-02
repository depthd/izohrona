
/* ============ v141. ПРОГУЛКА ПО КАРТЕ ============
   Та же карта, что уходит в .vmap, — от первого лица, до Hammer. Геометрия
   берётся из того же .vmf, что у кнопок «Скачать» (переводом core/vmf2vmap),
   поэтому твёрдо ровно то, что будет твёрдым в игре: стены, ящики, невидимые
   стены для игрока. Размеры игрока и прыжок — как в CS (docs/SPRAVKA_CS2.md):
   ширина 32, рост 72, присев 54, ступенька 18, прыжок ~57.
   Столкновение — как в движках Quake/Source: каждый браш раздувается на
   габарит игрока, и игрок становится точкой. Углы косых брашей дополнительно
   срезаются габаритом браша.
   three.js грузится с cdnjs при первом нажатии: самому генератору сеть не нужна. */
const ПРОГУЛКА = (function(){
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const И = { r:16, рост:72, присед:54, глаз:64, глазП:46, шаг:18, бег:250, шагом:130, присядью:85,
              прыжок:301.993, тяжесть:800,
              поджать:9 };   // присел в воздухе — ноги вверх на 9: прыжок с приседом ~64 (у Valve 55 → 65)
  const ИНСТР = /tools|postprocess/;                                  // невидимые материалы
  let st = null;                                                      // состояние открытой прогулки

  function грузитьThree(){
    if(window.THREE) return Promise.resolve();
    return new Promise((ok, нет) => { const s = document.createElement('script'); s.src = THREE_URL;
      s.onload = ok; s.onerror = () => нет(new Error('нет сети: three.js не загрузился')); document.head.appendChild(s); });
  }

  /* ---- цвет по имени материала: сначала явный цвет, потом вещество ---- */
  const ЦВЕТ = [[/blue/,0x5b7fa8],[/green/,0x6c8f6a],[/orange/,0xc98a4a],[/red/,0xa85a50],
    [/grass/,0x6f8a4a],[/sand|dust/,0xc9b48a],[/plaster|stucco/,0xd8cdb6],[/brick/,0xa8644a],
    [/wood|plank|crate/,0x9a7148],[/metal|steel|iron/,0x8a9198],[/concrete|cement/,0x9a9a96],
    [/stone|rock|cliff|mud/,0xb4a487],[/tile/,0xc2b8a3]];
  function цвет(мат){
    let c = 0xb0a898; for(const [re, v] of ЦВЕТ) if(re.test(мат)){ c = v; break; }
    let h = 0; for(let i = 0; i < мат.length; i++) h = (h*31 + мат.charCodeAt(i)) >>> 0;
    const k = 0.9 + (h % 1000) / 1000 * 0.2;                         // разные материалы одного вещества — чуть разные
    return [((c>>16)&255)/255*k, ((c>>8)&255)/255*k, (c&255)/255*k].map(x => Math.min(1, x));
  }

  /* ---- грани меша: нормаль наружу, плоскость n·p = d ---- */
  function грани(poly){
    const P = poly.verts, ц = [0,1,2].map(t => P.reduce((s, p) => s + p[t], 0) / P.length);
    return poly.faces.map(f => {
      const v = f.v.map(i => P[i]); let n = [0,0,0];
      for(let i = 0; i < v.length; i++){ const a = v[i], b = v[(i+1) % v.length];   // Ньюэлл
        n[0] += (a[1]-b[1])*(a[2]+b[2]); n[1] += (a[2]-b[2])*(a[0]+b[0]); n[2] += (a[0]-b[0])*(a[1]+b[1]); }
      const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
      const ф = [0,1,2].map(t => v.reduce((s, p) => s + p[t], 0) / v.length);
      if(n[0]*(ф[0]-ц[0]) + n[1]*(ф[1]-ц[1]) + n[2]*(ф[2]-ц[2]) < 0){ n = n.map(x => -x); v.reverse(); }
      return { v, n, d: n[0]*v[0][0] + n[1]*v[0][1] + n[2]*v[0][2], мат: f.mat || '' };
    });
  }
  const габарит = P => { const b = [1e9,1e9,1e9,-1e9,-1e9,-1e9];
    for(const p of P) for(let t = 0; t < 3; t++){ b[t] = Math.min(b[t], p[t]); b[t+3] = Math.max(b[t+3], p[t]); } return b; };

  /* ---- столкновения ---- */
  const КЛ = 256;
  function мир(scene){
    const сетка = new Map(), браши = [];
    for(const {poly} of scene.polys){
      const гр = грани(poly), b = габарит(poly.verts);
      const br = { пл: гр.map(g => [g.n[0], g.n[1], g.n[2], g.d]), b };
      браши.push(br);
      for(let gx = Math.floor((b[0]-И.r)/КЛ); gx <= Math.floor((b[3]+И.r)/КЛ); gx++)
        for(let gy = Math.floor((b[1]-И.r)/КЛ); gy <= Math.floor((b[4]+И.r)/КЛ); gy++){
          const к = gx + ',' + gy; if(!сетка.has(к)) сетка.set(к, []); сетка.get(к).push(br); }
    }
    return { сетка, браши };
  }
  function твёрдо(P, h){
    const сп = st.мир.сетка.get(Math.floor(P[0]/КЛ) + ',' + Math.floor(P[1]/КЛ)); if(!сп) return false;
    const e = 0.01;
    for(const br of сп){ const b = br.b;
      if(P[0] <= b[0]-И.r+e || P[0] >= b[3]+И.r-e || P[1] <= b[1]-И.r+e || P[1] >= b[4]+И.r-e
         || P[2] <= b[2]-h+e || P[2] >= b[5]-e) continue;
      let внутри = true;
      for(const q of br.пл){ const s = И.r*Math.abs(q[0]) + И.r*Math.abs(q[1]) + (q[2] < 0 ? -h*q[2] : 0);
        if(q[0]*P[0] + q[1]*P[1] + q[2]*P[2] >= q[3] + s - e){ внутри = false; break; } }
      if(внутри) return true; }
    return false;
  }
  /* сдвиг по одной оси до упора; возвращает true, если упёрся */
  function поОси(P, ось, d, h){
    if(!d) return false;
    const Q = P.slice(); Q[ось] += d; if(!твёрдо(Q, h)){ P[ось] = Q[ось]; return false; }
    let lo = 0, hi = 1;
    for(let i = 0; i < 8; i++){ const m = (lo + hi) / 2; Q[ось] = P[ось] + d*m; if(твёрдо(Q, h)) hi = m; else lo = m; }
    P[ось] += d*lo; return true;
  }
  function идти(P, dx, dy, h, наЗемле){
    const A = P.slice(); const ух = поОси(A, 0, dx, h), уу = поОси(A, 1, dy, h);
    if(наЗемле && (ух || уу)){                                       // ступенька: поднять, пройти, опустить
      const B = P.slice(); поОси(B, 2, И.шаг, h); поОси(B, 0, dx, h); поОси(B, 1, dy, h); поОси(B, 2, -И.шаг - 1, h);
      const далА = Math.hypot(A[0]-P[0], A[1]-P[1]), далБ = Math.hypot(B[0]-P[0], B[1]-P[1]);
      if(далБ > далА + 0.5 && твёрдо([B[0], B[1], B[2] - 0.5], h)){ P.splice(0, 3, ...B); return [false, false]; }
    }
    P.splice(0, 3, ...A); return [ух, уу];
  }

  function шаг(dt){
    const S = st, K = S.клав, h = S.присел ? И.присед : И.рост;
    const вп = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), вб = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    const cy = Math.cos(S.рыск), sy = Math.sin(S.рыск);
    if(S.полёт){                                                     // полёт сквозь стены, как noclip
      const cp = Math.cos(S.тангаж), sp = Math.sin(S.тангаж), v = (K.ShiftLeft || K.ShiftRight ? 300 : 900) * dt;
      S.P[0] += (cy*cp*вп + sy*вб) * v; S.P[1] += (sy*cp*вп - cy*вб) * v;
      S.P[2] += (sp*вп + (K.Space ? 1 : 0) - (K.KeyC ? 1 : 0)) * v; S.v = [0,0,0]; return; }
    // присесть / встать (в воздухе ноги поджимаются вверх — отсюда прыжок с приседом)
    const хочет = !!K.KeyC;
    if(хочет && !S.присел){ if(!S.наЗемле){ const Q = [S.P[0], S.P[1], S.P[2] + И.поджать];
        if(!твёрдо(Q, И.присед)) S.P = Q; } S.присел = true; }
    else if(!хочет && S.присел){
      if(S.наЗемле){ if(!твёрдо(S.P, И.рост)) S.присел = false; }
      else { const Q = [S.P[0], S.P[1], S.P[2] - И.поджать]; if(!твёрдо(Q, И.рост)){ S.P = Q; S.присел = false; } } }
    const скор = S.присел ? И.присядью : (K.ShiftLeft || K.ShiftRight) ? И.шагом : И.бег;
    let wx = cy*вп + sy*вб, wy = sy*вп - cy*вб; const wl = Math.hypot(wx, wy); if(wl){ wx /= wl; wy /= wl; }
    const k = Math.min(1, (S.наЗемле ? 10 : 1.5) * dt);              // на земле разгон быстрый, в воздухе слабый
    S.v[0] += (wx*скор - S.v[0]) * k; S.v[1] += (wy*скор - S.v[1]) * k;
    if(S.наЗемле && K.Space && !S.прыгал){ S.v[2] = И.прыжок; S.наЗемле = false; S.прыгал = true; }
    if(!K.Space) S.прыгал = false;
    S.v[2] -= И.тяжесть * dt;
    const hh = S.присел ? И.присед : И.рост;
    const n = Math.max(1, Math.ceil(Math.hypot(S.v[0], S.v[1], S.v[2]) * dt / 4));
    for(let i = 0; i < n; i++){
      const [ух, уу] = идти(S.P, S.v[0]*dt/n, S.v[1]*dt/n, hh, S.наЗемле);
      if(ух) S.v[0] = 0; if(уу) S.v[1] = 0;
      if(поОси(S.P, 2, S.v[2]*dt/n, hh)){ if(S.v[2] < 0) S.наЗемле = true; S.v[2] = 0; }
    }
    if(S.наЗемле && S.v[2] <= 0){                                    // прилипнуть к полу на спуске
      const Q = S.P.slice(); поОси(Q, 2, -И.шаг, hh);
      if(твёрдо([Q[0], Q[1], Q[2] - 0.5], hh)) S.P = Q; else S.наЗемле = false; }
    else S.наЗемле = S.v[2] <= 0 && твёрдо([S.P[0], S.P[1], S.P[2] - 0.5], hh);
    if(S.P[2] < S.дно - 2000) прыгнутьК(0);                           // выпал за карту — обратно на спавн
  }

  /* ---- точки: спавны, пленты, название места ---- */
  function центр(ent){ const P = ent.polys.flatMap(p => p.poly.verts); const b = габарит(P);
    return [(b[0]+b[3])/2, (b[1]+b[4])/2, b[2] + 1]; }
  function прыгнутьК(i){
    const т = st.точки[i]; if(!т) return;
    const P = т.p.slice(); for(let k = 0; k < 60 && твёрдо(P, И.рост); k++) P[2] += 8;
    st.P = P; st.v = [0,0,0]; st.присел = false; if(т.рыск !== undefined) st.рыск = т.рыск;
    сообщить(т.имя);
  }
  function место(P){                                                 // по плану: боковые грани зоны места
    for(const м of st.места){ const b = м.b;
      if(P[0] < b[0] || P[0] > b[3] || P[1] < b[1] || P[1] > b[4] || P[2] < b[2] - 160 || P[2] > b[5] + 160) continue;
      if(м.пл.every(q => Math.abs(q[2]) > 0.5 || q[0]*P[0] + q[1]*P[1] <= q[3] + 1)) return м.имя; }
    return '';
  }

  /* ---- сцена three.js ---- */
  function сетка128(){
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, 63, 128, 2); g.fillRect(63, 0, 2, 128);   // 64 юнита
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128);     // 128 юнитов
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function геометрия(scene){
    const поз = [], нор = [], цв = [], uv = [];
    for(const {poly} of scene.polys) for(const g of грани(poly)){
      if(ИНСТР.test(g.мат)) continue;
      const c = цвет(g.мат), n = g.n, ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      const UV = p => az >= ax && az >= ay ? [p[0]/128, p[1]/128] : ax >= ay ? [p[1]/128, p[2]/128] : [p[0]/128, p[2]/128];
      for(let i = 1; i + 1 < g.v.length; i++) for(const p of [g.v[0], g.v[i], g.v[i+1]]){
        поз.push(p[0], p[1], p[2]); нор.push(n[0], n[1], n[2]); цв.push(c[0], c[1], c[2]); uv.push(...UV(p)); }
    }
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(поз, 3));
    G.setAttribute('normal', new THREE.Float32BufferAttribute(нор, 3));
    G.setAttribute('color', new THREE.Float32BufferAttribute(цв, 3));
    G.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return { G, треугольников: поз.length / 9 };
  }
  function зоны(scene, cls, цветЗоны){
    const поз = [];
    for(const e of scene.ents.filter(e => e.cls === cls)) for(const {poly} of e.polys) for(const g of грани(poly))
      for(let i = 1; i + 1 < g.v.length; i++) for(const p of [g.v[0], g.v[i], g.v[i+1]]) поз.push(p[0], p[1], p[2]);
    const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(поз, 3));
    return new THREE.Mesh(G, new THREE.MeshBasicMaterial({ color: цветЗоны, transparent: true, opacity: 0.13,
      depthWrite: false, side: THREE.DoubleSide }));
  }

  function разметка(){
    const o = document.createElement('div'); o.id = 'progulka';
    o.innerHTML = `<canvas></canvas><div class="pg-pricel"></div>
      <div class="pg-mesto"></div><div class="pg-poz"></div><div class="pg-soob"></div>
      <button class="pg-vyhod" title="Выйти (Esc, потом ещё раз Esc)">✕ выйти</button>
      <div class="pg-start"><b>Нажми, чтобы начать</b>
        <div class="pg-klav">
          <span>W A S D</span>идти<span>мышь</span>смотреть<span>пробел</span>прыжок
          <span>C</span>присесть<span>Shift</span>шагом<span>V</span>полёт сквозь стены
          <span>1 · 2</span>спавн T · CT<span>3 · 4</span>плент A · B
          <span>P</span>скопировать, где стоишь<span>Esc</span>пауза
        </div></div>`;
    document.body.appendChild(o); return o;
  }

  function сообщить(т){ if(!st) return; const el = st.o.querySelector('.pg-soob'); el.textContent = т;
    el.classList.add('on'); clearTimeout(сообщить.т); сообщить.т = setTimeout(() => el.classList.remove('on'), 1800); }

  async function открыть(){
    if(st || !cur) return;
    const кн = document.getElementById('walk'); const было = кн.textContent; кн.textContent = 'загружаю…'; кн.disabled = true;
    try{ await грузитьThree(); }
    catch(e){ кн.textContent = было; кн.disabled = false; alert('Прогулке нужен интернет: three.js берётся с cdnjs.cloudflare.com.'); return; }
    useCur();
    const scene = ВЫГРУЗКА_VMAP.vmfToScene(buildVMF(cur), ВЫГРУЗКА_VMAP.ТОЧКИ);
    кн.textContent = было; кн.disabled = false;
    const o = разметка(), canvas = o.querySelector('canvas');
    const R = new THREE.WebGLRenderer({ canvas, antialias: true }); R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const С = new THREE.Scene(); const небо = 0xb9cde0; С.background = new THREE.Color(небо); С.fog = new THREE.Fog(небо, 2500, 12000);
    const мирГр = new THREE.Group(); мирГр.rotation.x = -Math.PI / 2; С.add(мирГр);   // Source: z вверх
    const { G, треугольников } = геометрия(scene);
    мирГр.add(new THREE.Mesh(G, new THREE.MeshLambertMaterial({ vertexColors: true, map: сетка128(), side: THREE.DoubleSide })));
    мирГр.add(зоны(scene, 'func_bomb_target', 0xff4a3a), зоны(scene, 'func_buyzone', 0x3aa0ff));
    const солнце = scene.ents.find(e => e.cls === 'light_environment');
    const на = солнце ? солнце.angles : [50, 220, 0], пт = (на[0] || 50) * Math.PI / 180, рк = (на[1] || 220) * Math.PI / 180;
    const Lс = new THREE.DirectionalLight(0xfff1dc, 0.75);
    Lс.position.set(-Math.cos(пт)*Math.cos(рк), Math.sin(пт), Math.cos(пт)*Math.sin(рк));   // откуда светит, в осях three
    С.add(Lс, new THREE.HemisphereLight(0xe4eefa, 0x6b5a45, 0.62));
    const кам = new THREE.PerspectiveCamera(74, 1, 2, 30000); кам.rotation.order = 'YXZ';

    const все = scene.polys.flatMap(p => p.poly.verts), Б = габарит(все);
    const точки = [];
    const сп = cls => scene.ents.find(e => e.cls === cls);
    for(const [cls, имя] of [['info_player_terrorist', 'спавн T'], ['info_player_counterterrorist', 'спавн CT']]){
      const e = сп(cls); точки.push(e ? { p: e.at.slice(), рыск: (e.angles[1] || 0) * Math.PI / 180, имя } : null); }
    scene.ents.filter(e => e.cls === 'func_bomb_target').slice(0, 2).forEach((e, i) => точки.push({ p: центр(e), имя: 'плент ' + 'AB'[i] }));
    const места = scene.ents.filter(e => e.cls === 'env_cs_place').flatMap(e => e.polys.map(({poly}) => ({
      имя: e.props.place_name || '', b: габарит(poly.verts), пл: грани(poly).map(g => [g.n[0], g.n[1], g.n[2], g.d]) })));

    st = { o, R, С, кам, мир: мир(scene), точки, места, дно: Б[2], P: [0,0,0], v: [0,0,0], рыск: 0, тангаж: 0,
           присел: false, наЗемле: false, полёт: false, прыгал: false, клав: {}, глаз: И.глаз, треугольников, живо: true };
    прыгнутьК(0);

    const размер = () => { R.setSize(innerWidth, innerHeight); кам.aspect = innerWidth / innerHeight; кам.updateProjectionMatrix(); };
    размер(); addEventListener('resize', размер);
    const старт = o.querySelector('.pg-start');
    o.addEventListener('click', e => { if(e.target.closest('.pg-vyhod')) return; canvas.requestPointerLock && canvas.requestPointerLock(); });
    const захват = () => { старт.style.display = document.pointerLockElement === canvas ? 'none' : ''; };
    document.addEventListener('pointerlockchange', захват);
    const мышь = e => { if(document.pointerLockElement !== canvas) return;
      st.рыск -= e.movementX * 0.0022; st.тангаж = Math.max(-1.55, Math.min(1.55, st.тангаж - e.movementY * 0.0022)); };
    document.addEventListener('mousemove', мышь);
    const вниз = e => { if(!st) return; st.клав[e.code] = true;
      if(e.code === 'KeyV'){ st.полёт = !st.полёт; сообщить(st.полёт ? 'полёт: сквозь стены' : 'пешком'); }
      if(/^Digit[1-4]$/.test(e.code)) прыгнутьК(+e.code.slice(5) - 1);
      if(e.code === 'KeyP') копироватьТочку();
      if(e.code === 'Escape' && document.pointerLockElement !== canvas) закрыть();
      if(e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); };
    const вверх = e => { if(st) st.клав[e.code] = false; };
    addEventListener('keydown', вниз); addEventListener('keyup', вверх);
    o.querySelector('.pg-vyhod').onclick = закрыть;
    st.снять = () => { removeEventListener('resize', размер); removeEventListener('keydown', вниз); removeEventListener('keyup', вверх);
      document.removeEventListener('mousemove', мышь); document.removeEventListener('pointerlockchange', захват); };

    let t0 = performance.now(), кадрМеста = 0;
    const кадр = now => { if(!st || !st.живо) return;
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      шаг(dt); рисовать();
      if(++кадрМеста % 10 === 0){ o.querySelector('.pg-mesto').textContent = место(st.P);
        o.querySelector('.pg-poz').textContent = st.P.map(Math.round).join('  '); }
      requestAnimationFrame(кадр); };
    requestAnimationFrame(кадр);
  }
  function рисовать(){
    const S = st, глаз = S.присел ? И.глазП : И.глаз;
    S.кам.position.set(S.P[0], S.P[2] + глаз, -S.P[1]);
    S.кам.rotation.y = S.рыск - Math.PI / 2; S.кам.rotation.x = S.тангаж;
    S.R.render(S.С, S.кам);
  }
  function копироватьТочку(){
    const т = `карта ${typeof НОМЕР !== 'undefined' ? НОМЕР.код() : (cur.seed>>>0)} · точка ${st.P.map(Math.round).join(' ')}`
            + (место(st.P) ? ` · ${место(st.P)}` : '');
    (navigator.clipboard ? navigator.clipboard.writeText(т) : Promise.reject()).then(
      () => сообщить('скопировано: ' + т), () => сообщить(т));
  }
  function закрыть(){
    if(!st) return; st.живо = false; st.снять();
    if(document.pointerLockElement) document.exitPointerLock();
    st.R.dispose(); st.o.remove(); st = null;
  }

  document.getElementById('walk').onclick = открыть;
  /* для приборов: держать клавиши dt секунд без мыши и экрана */
  return { открыть, закрыть, прыгнутьК: i => прыгнутьК(i),
    тест: (клав, сек, рыск) => { if(!st) return null; if(рыск !== undefined) st.рыск = рыск; st.клав = клав || {};
      for(let t = 0; t < сек; t += 1/60) шаг(1/60); st.клав = {}; рисовать();
      return { P: st.P.map(x => +x.toFixed(1)), наЗемле: st.наЗемле, место: место(st.P), треугольников: st.треугольников }; },
    состояние: () => st };
})();
