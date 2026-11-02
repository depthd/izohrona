
/* ============ v141–v142. ПРОГУЛКА ПО КАРТЕ ============
   Та же карта, что уходит в .vmap, — от первого лица, до Hammer. Геометрия
   берётся из того же .vmf, что у кнопок «Скачать» (переводом core/vmf2vmap),
   поэтому твёрдо ровно то, что будет твёрдым в игре: стены, ящики, невидимые
   стены для игрока. Размеры игрока и прыжок — как в CS (docs/SPRAVKA_CS2.md):
   ширина 32, рост 72, присев 54, ступенька 18, прыжок 54.5, с приседом 63.5.
   Столкновение — как в движках Quake/Source: каждый браш раздувается на
   габарит игрока, и игрок становится точкой.

   v142 — его слова: «на слабом ноуте не лагает, только если я смотрю в стену,
   где карта кончается». Карта рисовалась целиком одним куском, с обеих сторон
   каждой грани, в полном разрешении экрана. Замер (tools/zamer_progulki.js,
   рисование процессором): через карту 2595 мс на кадр, в стену 775. Стало:
   * карта порезана на куски, кусок за спиной не рисуется, ближние — первыми;
   * грань, прижатая к соседней (пол к полу, стена к полу), выкинута;
   * задние стороны граней не рисуются;
   * разрешение само снижается, если кадр не успевает;
   * кадр не перерисовывается, пока ничего не сдвинулось.
   Радар в углу, большая карта по M с переносом по щелчку, пауза с настройками.
   three.js грузится с cdnjs при первом нажатии: самому генератору сеть не нужна. */
const ПРОГУЛКА = (function(){
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const И = { r:16, рост:72, присед:54, глаз:64, глазП:46, шаг:18, бег:250, шагом:130, присядью:85,
              прыжок:301.993, тяжесть:800,
              поджать:9 };   // присел в воздухе — ноги вверх на 9: прыжок с приседом ~64 (у Valve 55 → 65)
  const ИНСТР = /tools|postprocess/;                                  // невидимые материалы
  const КУСОК = 768;                                                  // сторона куска карты для отсечения, юнитов
  const КАЧЕСТВО = { 'авто': 0, 'высокое': 1.5, 'среднее': 0.75, 'низкое': 0.5 };
  const КЛЮЧ = 'izohrona.progulka';
  const настр = Object.assign({ чувств: 1, качество: 'авто' }, (() => { try{ return JSON.parse(localStorage.getItem(КЛЮЧ)) || {}; }catch(e){ return {}; } })());
  const сохранить = () => { try{ localStorage.setItem(КЛЮЧ, JSON.stringify(настр)); }catch(e){} };
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
      return { v, n, d: n[0]*v[0][0] + n[1]*v[0][1] + n[2]*v[0][2], мат: f.mat || '', ц: ф };
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
      const br = { пл: гр.map(g => [g.n[0], g.n[1], g.n[2], g.d]), b, инстр: гр.every(g => ИНСТР.test(g.мат)) };
      браши.push(br);
      for(let gx = Math.floor((b[0]-И.r)/КЛ); gx <= Math.floor((b[3]+И.r)/КЛ); gx++)
        for(let gy = Math.floor((b[1]-И.r)/КЛ); gy <= Math.floor((b[4]+И.r)/КЛ); gy++){
          const к = gx + ',' + gy; if(!сетка.has(к)) сетка.set(к, []); сетка.get(к).push(br); }
    }
    return { сетка, браши };
  }
  function кто(P, h){                                                // браш, в котором стоит игрок, или null
    const сп = st.мир.сетка.get(Math.floor(P[0]/КЛ) + ',' + Math.floor(P[1]/КЛ)); if(!сп) return null;
    const e = 0.01;
    for(const br of сп){ const b = br.b;
      if(P[0] <= b[0]-И.r+e || P[0] >= b[3]+И.r-e || P[1] <= b[1]-И.r+e || P[1] >= b[4]+И.r-e
         || P[2] <= b[2]-h+e || P[2] >= b[5]-e) continue;
      let внутри = true;
      for(const q of br.пл){ const s = И.r*Math.abs(q[0]) + И.r*Math.abs(q[1]) + (q[2] < 0 ? -h*q[2] : 0);
        if(q[0]*P[0] + q[1]*P[1] + q[2]*P[2] >= q[3] + s - e){ внутри = false; break; } }
      if(внутри) return br; }
    return null;
  }
  const твёрдо = (P, h) => кто(P, h) !== null;
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
    const S = st, K = S.клав;
    const вп = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), вб = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    const cy = Math.cos(S.рыск), sy = Math.sin(S.рыск);
    if(S.полёт){                                                     // полёт сквозь стены, как noclip
      const cp = Math.cos(S.тангаж), sp = Math.sin(S.тангаж), v = S.скорПолёта * (K.ShiftLeft || K.ShiftRight ? 0.35 : 1) * dt;
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
    if(Math.abs(S.v[0]) < 0.5 && !wl) S.v[0] = 0; if(Math.abs(S.v[1]) < 0.5 && !wl) S.v[1] = 0;
    if(S.наЗемле && K.Space && !S.прыгал){ S.v[2] = И.прыжок; S.наЗемле = false; S.прыгал = true; }
    if(!K.Space) S.прыгал = false;
    if(S.наЗемле && !S.v[0] && !S.v[1] && S.v[2] <= 0){ S.v[2] = 0; return; }   // стоит — нечего считать
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

  /* ---- точки: спавны, пленты, название места, пол под щелчком ---- */
  function центр(ent){ const P = ent.polys.flatMap(p => p.poly.verts); const b = габарит(P);
    return [(b[0]+b[3])/2, (b[1]+b[4])/2, b[2] + 1]; }
  function поставить(P, рыск, имя){
    const Q = P.slice(); for(let k = 0; k < 60 && твёрдо(Q, И.рост); k++) Q[2] += 8;
    st.P = Q; st.v = [0,0,0]; st.присел = false; st.наЗемле = false; if(рыск !== undefined) st.рыск = рыск;
    if(имя) сообщить(имя);
  }
  function прыгнутьК(i){ const т = st.точки[i]; if(т) поставить(т.p, т.рыск, т.имя); }
  function место(P){                                                 // по плану: боковые грани зоны места
    for(const м of st.места){ const b = м.b;
      if(P[0] < b[0] || P[0] > b[3] || P[1] < b[1] || P[1] > b[4] || P[2] < b[2] - 160 || P[2] > b[5] + 160) continue;
      if(м.пл.every(q => Math.abs(q[2]) > 0.5 || q[0]*P[0] + q[1]*P[1] <= q[3] + 1)) return м.имя; }
    return '';
  }
  /* Пол под точкой плана. Сверху вниз ищутся все места, где можно стоять;
     берётся то, что ближе к высоте пола в растре (крыша тоннеля и коробка
     неба тоже «пол», но не тот). */
  function полПод(x, y){
    const Р = st.радар, cx = Math.floor(x / Р.S), cy = Р.H - 1 - Math.floor(y / Р.S);
    const i = cy * Р.W + cx, пол = (cx >= 0 && cy >= 0 && cx < Р.W && cy < Р.H && cur.g[i]) ? cur.zfield[i] * 72 : null;
    const мест = [];
    for(let z = st.верх; z > st.дно - 64; z -= 8){
      const P = [x, y, z]; if(твёрдо(P, И.рост)) continue;
      const Q = P.slice(); поОси(Q, 2, -8, И.рост);
      const под = кто([Q[0], Q[1], Q[2] - 0.5], И.рост);
      if(под && !под.инстр && !мест.some(m => Math.abs(m[2] - Q[2]) < 4)) мест.push(Q);
    }
    if(!мест.length) return null;
    if(пол === null) return мест[мест.length - 1];
    return мест.reduce((a, b) => Math.abs(b[2] - пол) < Math.abs(a[2] - пол) ? b : a);
  }

  /* ---- геометрия: куски для отсечения, без прижатых граней ---- */
  function видимыеГрани(scene){
    const все = [];
    for(const {poly} of scene.polys) for(const g of грани(poly)) if(!ИНСТР.test(g.мат)) все.push(g);
    const плоск = new Map();
    for(const g of все){                                             // прямоугольники вдоль осей
      const a = g.n.findIndex(x => Math.abs(x) > 0.999); if(a < 0) continue;
      const [b, c] = [[1,2],[0,2],[0,1]][a];
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9, пл = 0;
      g.v.forEach((p, k) => { const q = g.v[(k+1) % g.v.length];
        u0 = Math.min(u0, p[b]); u1 = Math.max(u1, p[b]); v0 = Math.min(v0, p[c]); v1 = Math.max(v1, p[c]);
        пл += p[b]*q[c] - q[b]*p[c]; });
      const пр = (u1-u0)*(v1-v0); if(Math.abs(Math.abs(пл)/2 - пр) > 0.01*пр + 0.5) continue;
      g.пр = [u0, u1, v0, v1]; g.ось = a; g.знак = g.n[a] > 0; g.к = Math.round(g.v[0][a] * 4);
      const к = a + (g.знак ? '+' : '-') + g.к; if(!плоск.has(к)) плоск.set(к, []); плоск.get(к).push(g);
    }
    const e = 0.05;
    return все.filter(g => { if(!g.пр) return true;
      const сп = плоск.get(g.ось + (g.знак ? '-' : '+') + g.к); if(!сп) return true;
      const [u0, u1, v0, v1] = g.пр;
      return !сп.some(h => h.пр[0] <= u0+e && h.пр[1] >= u1-e && h.пр[2] <= v0+e && h.пр[3] >= v1-e); });
  }
  function сетка128(){
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, 63, 128, 2); g.fillRect(63, 0, 2, 128);   // 64 юнита
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128);     // 128 юнитов
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function геометрия(scene, мат){
    const гр = видимыеГрани(scene), куски = new Map();
    for(const g of гр){
      const к = Math.floor(g.ц[0] / КУСОК) + ',' + Math.floor(g.ц[1] / КУСОК);
      if(!куски.has(к)) куски.set(к, { поз: [], нор: [], цв: [], uv: [], b: [1e9,1e9,1e9,-1e9,-1e9,-1e9] });
      const К = куски.get(к), c = цвет(g.мат), n = g.n, ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      const UV = p => az >= ax && az >= ay ? [p[0]/128, p[1]/128] : ax >= ay ? [p[1]/128, p[2]/128] : [p[0]/128, p[2]/128];
      for(let i = 1; i + 1 < g.v.length; i++) for(const p of [g.v[0], g.v[i], g.v[i+1]]){
        К.поз.push(p[0], p[1], p[2]); К.нор.push(n[0], n[1], n[2]); К.цв.push(c[0], c[1], c[2]); К.uv.push(...UV(p));
        for(let t = 0; t < 3; t++){ К.b[t] = Math.min(К.b[t], p[t]); К.b[t+3] = Math.max(К.b[t+3], p[t]); } }
    }
    const меши = []; let треугольников = 0;
    for(const К of куски.values()){
      const ц = [0,1,2].map(t => (К.b[t] + К.b[t+3]) / 2);           // вершины от центра куска: точнее и сортируется
      for(let i = 0; i < К.поз.length; i++) К.поз[i] -= ц[i % 3];
      const G = new THREE.BufferGeometry();
      G.setAttribute('position', new THREE.Float32BufferAttribute(К.поз, 3));
      G.setAttribute('normal', new THREE.Float32BufferAttribute(К.нор, 3));
      G.setAttribute('color', new THREE.Float32BufferAttribute(К.цв, 3));
      G.setAttribute('uv', new THREE.Float32BufferAttribute(К.uv, 2));
      G.computeBoundingSphere();
      const M = new THREE.Mesh(G, мат); M.position.set(ц[0], ц[1], ц[2]); меши.push(M);
      треугольников += К.поз.length / 9;
    }
    return { меши, треугольников, граней: гр.length };
  }
  /* зоны плентов и закупки: контур коробки и пятно на полу, без стен —
     стены прозрачной коробки вокруг игрока перерисовывали весь экран */
  function зона(scene, cls, цв){
    const G = new THREE.Group();
    for(const e of scene.ents.filter(e => e.cls === cls)) for(const {poly} of e.polys){
      const b = габарит(poly.verts);
      const box = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
      G.add(new THREE.Box3Helper(box, цв));
      const пл = new THREE.Mesh(new THREE.PlaneGeometry(b[3]-b[0], b[4]-b[1]),
        new THREE.MeshBasicMaterial({ color: цв, transparent: true, opacity: 0.16, depthWrite: false }));
      пл.position.set((b[0]+b[3])/2, (b[1]+b[4])/2, b[2] + 1.5); G.add(пл);
    }
    return G;
  }

  /* ---- радар: тот же растр, что у радара для игры (кнопки «Скачать») ---- */
  function построитьРадар(scene){
    let x0 = W, y0 = H, x1 = -1, y1 = -1;                            // только там, где есть пол, — без пустых полей
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++) if(cur.g[y*W + x]){
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3); x1 = Math.min(W - 1, x1 + 3); y1 = Math.min(H - 1, y1 + 3);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, px = Math.max(1, Math.round(640 / Math.max(w, h)));
    const c = document.createElement('canvas'); c.width = w*px; c.height = h*px; const g = c.getContext('2d');
    const zf = cur.zfield; let zmin = 1e9, zmax = -1e9;
    for(let i = 0; i < W*H; i++) if(cur.g[i]){ zmin = Math.min(zmin, zf[i]); zmax = Math.max(zmax, zf[i]); }
    for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++){ const i = y*W + x; if(!cur.g[i]) continue;
      const t = zmax > zmin ? (zf[i] - zmin) / (zmax - zmin) : 0.5, v = Math.round(78 + t*120);   // выше — светлее
      g.fillStyle = `rgb(${v},${v+6},${v+12})`; g.fillRect((x-x0)*px, (y-y0)*px, px, px); }
    if(cur.cover) for(const k of cur.cover){ const hh = k.hgt === 'full' ? 999 : (k.hgt || 40); if(hh <= 40) continue;
      g.fillStyle = hh > 112 ? 'rgba(20,24,30,0.95)' : 'rgba(40,46,54,0.75)';
      g.fillRect((k.x-x0)*px, (k.y-y0)*px, (k.w||1)*px, (k.h||1)*px); }
    // клетка (x, y) растра — это мир x*S, а по y — (H - y)*S: как в buildVMF
    const S = CELL, Р = { img: c, px, S, W, H,
      наРадар: (x, y) => [(x / S - x0) * px, (H - y / S - y0) * px],
      вМир: (u, v) => [(u / px + x0) * S, (H - (v / px + y0)) * S] };
    const пленты = scene.ents.filter(e => e.cls === 'func_bomb_target').slice(0, 2).map((e, i) => ({ p: центр(e), имя: 'AB'[i] }));
    Р.метки = [...пленты.map(q => ({ ...q, вид: 'плент' })),
      ...scene.ents.filter(e => /^info_player_/.test(e.cls)).map(e => ({ p: e.at, вид: /counter/.test(e.cls) ? 'CT' : 'T' }))];
    Р.места = scene.ents.filter(e => e.cls === 'env_cs_place' && e.polys.length).map(e => ({ p: центр(e), имя: e.props.place_name || '' }));
    return Р;
  }
  /* нарисовать радар в canvas: целиком, север сверху, игрок стрелкой с конусом взгляда */
  function рисоватьРадар(cv, большой){
    const Р = st.радар, d = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if(cv.width !== Math.round(w*d)){ cv.width = Math.round(w*d); cv.height = Math.round(h*d); }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    const к = Math.min(w / Р.img.width, h / Р.img.height), ox = (w - Р.img.width*к) / 2, oy = (h - Р.img.height*к) / 2;
    cv.__вид = { к, ox, oy };
    g.imageSmoothingEnabled = false;                                   // клетки чёткие, не мыло
    g.globalAlpha = большой ? 1 : 0.92; g.drawImage(Р.img, ox, oy, Р.img.width*к, Р.img.height*к); g.globalAlpha = 1;
    const на = p => { const [u, v] = Р.наРадар(p[0], p[1]); return [ox + u*к, oy + v*к]; };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if(большой){ g.font = '500 11px "IBM Plex Mono", monospace';
      for(const м of Р.места){ const [x, y] = на(м.p); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(м.имя, x+1, y+1);
        g.fillStyle = 'rgba(235,242,248,.9)'; g.fillText(м.имя, x, y); } }
    for(const м of Р.метки){ const [x, y] = на(м.p);
      if(м.вид === 'плент'){ g.font = `700 ${большой ? 22 : 13}px "Chakra Petch", sans-serif`;
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(м.имя, x+1, y+1); g.fillStyle = '#ff6b5a'; g.fillText(м.имя, x, y); }
      else { g.fillStyle = м.вид === 'T' ? '#e8a24a' : '#4f9fe0'; g.beginPath(); g.arc(x, y, большой ? 3 : 1.6, 0, 7); g.fill(); } }
    const [x, y] = на(st.P), а = -st.рыск, r = большой ? 13 : 9;          // на радаре y вниз
    g.fillStyle = 'rgba(125,255,176,.18)'; g.beginPath(); g.moveTo(x, y);
    g.arc(x, y, большой ? 70 : 34, а - 0.65, а + 0.65); g.closePath(); g.fill();
    g.save(); g.translate(x, y); g.rotate(а);
    g.fillStyle = '#7dffb0'; g.strokeStyle = '#0b0f14'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(r, 0); g.lineTo(-r*0.6, r*0.55); g.lineTo(-r*0.3, 0); g.lineTo(-r*0.6, -r*0.55); g.closePath();
    g.stroke(); g.fill(); g.restore();
  }

  /* ---- разметка ---- */
  function разметка(){
    const o = document.createElement('div'); o.id = 'progulka';
    o.innerHTML = `<canvas class="pg-3d"></canvas><div class="pg-pricel"></div>
      <canvas class="pg-radar"></canvas><div class="pg-mesto"></div>
      <div class="pg-poz"></div><div class="pg-soob"></div>
      <div class="pg-karta"><canvas></canvas><div class="pg-karta-pod">щёлкни по карте — перенесёт туда · M — закрыть</div></div>
      <div class="pg-pauza">
        <b class="pg-zag">Прогулка по карте</b>
        <div class="pg-knopki"><button class="pg-dalee">▶ Продолжить</button><button class="pg-kartu">Карта (M)</button><button class="pg-vyhod">✕ Выйти</button></div>
        <label class="pg-pol">Чувствительность мыши <span class="pg-chv"></span>
          <input type="range" class="pg-chuvstv" min="0.3" max="3" step="0.1"></label>
        <label class="pg-pol">Качество картинки
          <select class="pg-kach">${Object.keys(КАЧЕСТВО).map(k => `<option value="${k}">${k}</option>`).join('')}</select></label>
        <div class="pg-skor"></div>
        <div class="pg-klav">
          <span>W A S D</span>идти<span>мышь</span>смотреть<span>пробел</span>прыжок
          <span>C</span>присесть<span>Shift</span>шагом<span>V</span>полёт сквозь стены, колесо — скорость
          <span>1 · 2</span>спавн T · CT<span>3 · 4</span>плент A · B<span>M</span>большая карта, перенос щелчком
          <span>P</span>скопировать, где стоишь<span>Esc</span>пауза, ещё раз — выйти
        </div></div>`;
    document.body.appendChild(o); return o;
  }

  function сообщить(т){ if(!st) return; const el = st.o.querySelector('.pg-soob'); el.textContent = т;
    el.classList.add('on'); clearTimeout(сообщить.т); сообщить.т = setTimeout(() => el.classList.remove('on'), 1800); }

  /* ---- разрешение: своё «качество» или само по скорости кадра ---- */
  function масштаб(m){
    const макс = Math.min(devicePixelRatio || 1, 1.5);
    st.масштаб = Math.max(0.5, Math.min(макс, m));
    st.R.setPixelRatio(st.масштаб); st.R.setSize(innerWidth, innerHeight, false); st.грязно = true;
  }
  function качество(){ const к = КАЧЕСТВО[настр.качество]; масштаб(к ? к : Math.min(1, devicePixelRatio || 1)); st.кадры = []; }

  async function открыть(){
    if(st || !cur) return;
    const кн = document.getElementById('walk'); const было = кн.textContent; кн.textContent = 'загружаю…'; кн.disabled = true;
    try{ await грузитьThree(); }
    catch(e){ кн.textContent = было; кн.disabled = false; alert('Прогулке нужен интернет: three.js берётся с cdnjs.cloudflare.com.'); return; }
    useCur();
    const scene = ВЫГРУЗКА_VMAP.vmfToScene(buildVMF(cur), ВЫГРУЗКА_VMAP.ТОЧКИ);
    кн.textContent = было; кн.disabled = false;
    const o = разметка(), canvas = o.querySelector('.pg-3d');
    const R = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    const С = new THREE.Scene(); const небо = 0xb9cde0; С.background = new THREE.Color(небо); С.fog = new THREE.Fog(небо, 2500, 9000);
    const мирГр = new THREE.Group(); мирГр.rotation.x = -Math.PI / 2; С.add(мирГр);   // Source: z вверх
    const мат = new THREE.MeshLambertMaterial({ vertexColors: true, map: сетка128() });
    const { меши, треугольников, граней } = геометрия(scene, мат);
    мирГр.add(...меши, зона(scene, 'func_bomb_target', 0xff4a3a), зона(scene, 'func_buyzone', 0x3aa0ff));
    const солнце = scene.ents.find(e => e.cls === 'light_environment');
    const на = солнце ? солнце.angles : [50, 220, 0], пт = (на[0] || 50) * Math.PI / 180, рк = (на[1] || 220) * Math.PI / 180;
    const Lс = new THREE.DirectionalLight(0xfff1dc, 0.75);
    Lс.position.set(-Math.cos(пт)*Math.cos(рк), Math.sin(пт), Math.cos(пт)*Math.sin(рк));   // откуда светит, в осях three
    С.add(Lс, new THREE.HemisphereLight(0xe4eefa, 0x6b5a45, 0.62));
    const кам = new THREE.PerspectiveCamera(74, 1, 2, 9500); кам.rotation.order = 'YXZ';

    const видимое = scene.polys.filter(p => !p.poly.faces.every(f => ИНСТР.test(f.mat || ''))).flatMap(p => p.poly.verts);
    const Б = габарит(видимое);
    const точки = [];
    for(const [cls, имя] of [['info_player_terrorist', 'спавн T'], ['info_player_counterterrorist', 'спавн CT']]){
      const e = scene.ents.find(e => e.cls === cls); точки.push(e ? { p: e.at.slice(), рыск: (e.angles[1] || 0) * Math.PI / 180, имя } : null); }
    scene.ents.filter(e => e.cls === 'func_bomb_target').slice(0, 2).forEach((e, i) => точки.push({ p: центр(e), имя: 'плент ' + 'AB'[i] }));
    const места = scene.ents.filter(e => e.cls === 'env_cs_place').flatMap(e => e.polys.map(({poly}) => ({
      имя: e.props.place_name || '', b: габарит(poly.verts), пл: грани(poly).map(g => [g.n[0], g.n[1], g.n[2], g.d]) })));

    st = { o, R, С, кам, мир: мир(scene), точки, места, дно: Б[2], верх: Б[5] + 64, P: [0,0,0], v: [0,0,0], рыск: 0, тангаж: 0,
           присел: false, наЗемле: false, полёт: false, прыгал: false, клав: {}, треугольников, граней, кусков: меши.length,
           живо: true, грязно: true, скорПолёта: 900, кадры: [], масштаб: 1 };
    st.радар = построитьРадар(scene);
    качество();
    прыгнутьК(0);

    const размер = () => { R.setSize(innerWidth, innerHeight, false); кам.aspect = innerWidth / innerHeight; кам.updateProjectionMatrix(); st.грязно = true; };
    размер(); addEventListener('resize', размер);
    const пауза = o.querySelector('.pg-pauza'), карта = o.querySelector('.pg-karta'), картаЦв = карта.querySelector('canvas');
    const захватить = () => { if(canvas.requestPointerLock) canvas.requestPointerLock(); };
    const захват = () => { const есть = document.pointerLockElement === canvas; if(!есть) st.отпущен = performance.now();
      пауза.style.display = есть || карта.classList.contains('on') ? 'none' : '';
      if(есть){ карта.classList.remove('on'); st.клав = {}; }
      o.querySelector('.pg-zag').textContent = st.начато ? 'Пауза' : 'Прогулка по карте';
      if(есть) st.начато = true; };
    document.addEventListener('pointerlockchange', захват);
    canvas.addEventListener('click', захватить);
    o.querySelector('.pg-dalee').onclick = захватить;
    o.querySelector('.pg-vyhod').onclick = закрыть;
    const большаяКарта = вкл => { карта.classList.toggle('on', вкл); пауза.style.display = вкл ? 'none' : '';
      if(вкл){ if(document.pointerLockElement) document.exitPointerLock(); рисоватьРадар(картаЦв, true); } };
    o.querySelector('.pg-kartu').onclick = () => большаяКарта(true);
    картаЦв.addEventListener('click', e => {
      const r = картаЦв.getBoundingClientRect(), В = картаЦв.__вид;
      const [x, y] = st.радар.вМир((e.clientX - r.left - В.ox) / В.к, (e.clientY - r.top - В.oy) / В.к);
      const P = полПод(x, y);
      if(!P){ сообщить('там нет пола'); return; }
      поставить(P, undefined, место(P) || 'перенос'); большаяКарта(false); захватить(); });
    const чв = o.querySelector('.pg-chuvstv'), кач = o.querySelector('.pg-kach');
    чв.value = настр.чувств; o.querySelector('.pg-chv').textContent = '×' + (+настр.чувств).toFixed(1);
    чв.oninput = () => { настр.чувств = +чв.value; o.querySelector('.pg-chv').textContent = '×' + настр.чувств.toFixed(1); сохранить(); };
    кач.value = настр.качество; кач.onchange = () => { настр.качество = кач.value; сохранить(); качество(); };
    const мышь = e => { if(document.pointerLockElement !== canvas) return; const k = 0.0022 * настр.чувств;
      st.рыск -= e.movementX * k; st.тангаж = Math.max(-1.55, Math.min(1.55, st.тангаж - e.movementY * k)); };
    document.addEventListener('mousemove', мышь);
    const колесо = e => { if(!st.полёт) return; st.скорПолёта = Math.max(150, Math.min(4000, st.скорПолёта * (e.deltaY < 0 ? 1.25 : 0.8)));
      сообщить('скорость полёта ' + Math.round(st.скорПолёта)); };
    o.addEventListener('wheel', колесо, { passive: true });
    const вниз = e => { if(!st) return;
      const играет = document.pointerLockElement === canvas;
      if(e.code === 'KeyM'){ большаяКарта(!карта.classList.contains('on')); if(!карта.classList.contains('on')) захватить(); return; }
      // Esc, отпустивший мышь, браузер может прислать и странице — выходим только по второму
      if(e.code === 'Escape'){ if(карта.classList.contains('on')) большаяКарта(false);
        else if(!играет && performance.now() - (st.отпущен || 0) > 400) закрыть(); return; }
      if(!играет) return;
      st.клав[e.code] = true;
      if(e.code === 'KeyV'){ st.полёт = !st.полёт; сообщить(st.полёт ? 'полёт: сквозь стены, колесо — скорость' : 'пешком'); }
      if(/^Digit[1-4]$/.test(e.code)) прыгнутьК(+e.code.slice(5) - 1);
      if(e.code === 'KeyP') копироватьТочку();
      if(e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); };
    const вверх = e => { if(st) st.клав[e.code] = false; };
    addEventListener('keydown', вниз); addEventListener('keyup', вверх);
    st.снять = () => { removeEventListener('resize', размер); removeEventListener('keydown', вниз); removeEventListener('keyup', вверх);
      document.removeEventListener('mousemove', мышь); document.removeEventListener('pointerlockchange', захват); };
    захват();

    const радарЦв = o.querySelector('.pg-radar'), мстЭл = o.querySelector('.pg-mesto'), позЭл = o.querySelector('.pg-poz'),
          скЭл = o.querySelector('.pg-skor');
    let t0 = performance.now(), счёт = 0, рисовал = false, последнийПодъём = 0;
    const кадр = now => { if(!st || !st.живо) return;
      const мс = now - t0, dt = Math.min(0.05, мс / 1000); t0 = now;
      if(рисовал){ st.кадры.push(мс); }                              // скорость меряется только по нарисованным
      шаг(dt); рисовал = рисовать();
      счёт++;
      if(рисовал || счёт % 15 === 0){ рисоватьРадар(радарЦв, false);
        if(карта.classList.contains('on')) рисоватьРадар(картаЦв, true); }
      if(счёт % 10 === 0){ мстЭл.textContent = место(st.P); позЭл.textContent = st.P.map(Math.round).join('  '); }
      if(st.кадры.length >= 40){                                      // авто: держать кадр не дольше ~24 мс
        const ср = st.кадры.reduce((a, b) => a + b, 0) / st.кадры.length; st.кадры = [];
        скЭл.textContent = `кадр ${Math.round(ср)} мс · разрешение ${Math.round(st.масштаб*100)}% · кусков карты ${st.кусков}`;
        if(настр.качество === 'авто'){
          if(ср > 24 && st.масштаб > 0.5){ масштаб(st.масштаб - 0.125); последнийПодъём = now; }
          else if(ср < 17.5 && now - последнийПодъём > 4000 && st.масштаб < Math.min(devicePixelRatio || 1, 1.5)){
            масштаб(st.масштаб + 0.125); последнийПодъём = now; } } }
      requestAnimationFrame(кадр); };
    requestAnimationFrame(кадр);
  }
  /* нарисовать, если что-то сдвинулось; true — рисовал */
  function рисовать(сила){
    const S = st, глаз = S.присел ? И.глазП : И.глаз;
    const поза = S.P.map(x => x.toFixed(2)).join() + S.рыск.toFixed(4) + S.тангаж.toFixed(4) + глаз;
    if(!сила && !S.грязно && поза === S.поза) return false;
    S.поза = поза; S.грязно = false;
    S.кам.position.set(S.P[0], S.P[2] + глаз, -S.P[1]);
    S.кам.rotation.y = S.рыск - Math.PI / 2; S.кам.rotation.x = S.тангаж;
    S.R.render(S.С, S.кам);
    return true;
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
  /* для приборов: держать клавиши сек секунд без мыши и экрана */
  return { открыть, закрыть, прыгнутьК: i => прыгнутьК(i), полПод: (x, y) => полПод(x, y),
    поставить: P => поставить(P),
    тест: (клав, сек, рыск) => { if(!st) return null; if(рыск !== undefined) st.рыск = рыск; st.клав = клав || {};
      for(let t = 0; t < сек; t += 1/60) шаг(1/60); st.клав = {}; рисовать(true);
      return { P: st.P.map(x => +x.toFixed(1)), наЗемле: st.наЗемле, место: место(st.P), треугольников: st.треугольников }; },
    состояние: () => st };
})();
