'use strict';
/* KeyValues2 — текстовый DMX, в котором Hammer CS2 сохраняет .vmap.
   Разбор и запись. Порядок атрибутов сохраняется: Hammer пишет их в своём
   порядке, и мы повторяем его, чтобы файл не отличался от «родного». */

class El {
  constructor(cls) { this.cls = cls; this.a = []; }
  set(k, t, v) { this.a.push([k, t, v]); return this; }
  get(k) { const r = this.a.find(x => x[0] === k); return r ? r[2] : undefined; }
  put(k, t, v) {                       // заменить значение, не трогая порядок
    const r = this.a.find(x => x[0] === k);
    if (r) { r[1] = t; r[2] = v; } else this.a.push([k, t, v]);
    return this;
  }
  clone() {
    const e = new El(this.cls);
    for (const [k, t, v] of this.a)
      e.a.push([k, t, v instanceof El ? v.clone()
        : Array.isArray(v) ? v.map(x => (x instanceof El ? x.clone() : x)) : v]);
    return e;
  }
}

function parse(text) {
  const nl = text.indexOf('\n');
  const header = text.slice(0, nl);
  const re = /"((?:[^"\\]|\\.)*)"|([{}\[\],])/g;
  const tk = [];
  let m;
  re.lastIndex = nl + 1;
  while ((m = re.exec(text))) tk.push(m[2] !== undefined ? { p: m[2] } : { s: m[1] });
  let i = 0;
  const str = () => { const t = tk[i++]; if (t.s === undefined) throw new Error('kv2: ждал строку'); return t.s; };
  const punct = c => { const t = tk[i++]; if (t.p !== c) throw new Error('kv2: ждал ' + c); };
  function elem(cls) {
    const e = new El(cls);
    punct('{');
    while (tk[i].p !== '}') {
      const k = str(), t = str();
      if (t.endsWith('_array')) {
        punct('[');
        const arr = [];
        while (tk[i].p !== ']') {
          if (tk[i].p === ',') { i++; continue; }
          arr.push(t === 'element_array' ? elem(str()) : str());
        }
        i++;
        e.a.push([k, t, arr]);
      } else if (tk[i].p === '{') e.a.push([k, t, elem(t)]);
      else e.a.push([k, t, str()]);
    }
    i++;
    return e;
  }
  const roots = [];
  while (i < tk.length) roots.push(elem(str()));
  return { header, roots };
}

const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/* ids(): каждому элементу свой "id". Генератор детерминированный — один и тот же
   вход даёт один и тот же файл, иначе сравнивать сборки нельзя. */
function write(doc, ids) {
  const out = [doc.header];
  const attrs = (el, d) => {
    const T = '\t'.repeat(d);
    for (const [k, t, v] of el.a) {
      if (k === 'id' && t === 'elementid') { out.push(T + q(k) + ' ' + q(t) + ' ' + q(ids())); continue; }
      if (t.endsWith('_array')) {
        out.push(T + q(k) + ' ' + q(t) + ' ');
        out.push(T + '[');
        v.forEach((x, j) => {
          const c = j < v.length - 1 ? ',' : '';
          if (t === 'element_array') { elem(x, d + 1); out[out.length - 1] += c; }
          else out.push(T + '\t' + q(x) + c);
        });
        out.push(T + ']');
      } else if (v instanceof El) {
        out.push(T + q(k) + ' ' + q(t));
        out.push(T + '{');
        attrs(v, d + 1);
        out.push(T + '}');
        out.push('');
      } else out.push(T + q(k) + ' ' + q(t) + ' ' + q(v));
    }
  };
  const elem = (el, d) => {
    const T = '\t'.repeat(d);
    out.push(T + q(el.cls));
    out.push(T + '{');
    attrs(el, d + 1);
    out.push(T + '}');
  };
  for (const r of doc.roots) elem(r, 0);
  return out.join('\n') + '\n';
}

/* Детерминированные id в виде uuid. */
function idGen(seed) {
  let s = (seed >>> 0) || 1;
  const nx = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const h = n => nx().toString(16).padStart(8, '0').slice(0, n);
  return {
    uuid: () => `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(8)}${h(4)}`,
    ref: () => '0x' + h(8) + h(8),
    int: () => nx() & 0x7fffffff,
  };
}

module.exports = { El, parse, write, idGen };
