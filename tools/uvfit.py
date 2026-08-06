"""Проверка подгонки текстуры по граням экспорта.

Считает ровно то, что обещано в v127, и ничем другим не пользуется:
  ЦЕЛЫХ ПОВТОРОВ — сколько раз период текстуры укладывается вдоль грани.
                   Должно быть целое число, иначе последний повтор обрублен.
  ШОВ НА РЕБРЕ    — тексель в дальнем углу грани должен быть кратен периоду,
                   иначе рисунок начинается посреди грани.

Формат VMF: "uaxis" "[ux uy uz uoff] uscale",  тексель = (точка·ось)/uscale + uoff.
Период в юнитах = uscale * (текселей в повторе), а текселей в повторе = tile/UVS.
UVS и tile берутся из сборки: 8 и 128 по умолчанию.

    python3 tools/uvfit.py <файл.vmf> [tile] [UVS]
"""
import re, sys, collections

path = sys.argv[1]
TILE = float(sys.argv[2]) if len(sys.argv) > 2 else 128.0
UVS  = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0
TEXW = TILE / UVS                      # текселей на один повтор — константа сборки

t = open(path, encoding='utf-8', errors='replace').read()
RE  = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RM  = re.compile(r'"material" "([^"]+)"')
RA  = re.compile(r'"([uv])axis" "\[([-\d.e ]+)\] ([-\d.e]+)"')


def num3(s):
    a = s.split()
    return tuple(float(v) for v in a[:3]), (float(a[3]) if len(a) > 3 else 0.0)


tot = collections.Counter()
badrep, badoff = [], []
reps_hist = collections.Counter()

for chunk in t.split('\tsolid\n')[1:]:
    pts = []
    for m in RE.finditer(chunk):
        for k in range(1, 4):
            a = m.group(k).split()
            if len(a) == 3:
                pts.append(tuple(float(v) for v in a))
    if not pts:
        continue
    mats = RM.findall(chunk)
    if not mats or mats[0].upper().startswith('TOOLS'):
        continue
    corners = [(x, y, z) for x in (min(p[0] for p in pts), max(p[0] for p in pts))
                         for y in (min(p[1] for p in pts), max(p[1] for p in pts))
                         for z in (min(p[2] for p in pts), max(p[2] for p in pts))]
    for ax, vec, sc in RA.findall(chunk):
        v, off = num3(vec)
        sc = float(sc)
        if sc <= 0:
            continue
        pr = [v[0] * c[0] + v[1] * c[1] + v[2] * c[2] for c in corners]
        c0, c1 = min(pr), max(pr)
        L = c1 - c0
        if L < 1:
            tot['грань короче юнита'] += 1
            continue
        if abs(sc - UVS) < 1e-9:
            tot['мировая сетка'] += 1
            continue
        tot['подогнано'] += 1
        reps = L / (sc * TEXW)
        r = round(reps)
        reps_hist[r if r <= 8 else '9+'] += 1
        if abs(reps - r) > 0.01 or r < 1:
            badrep.append((round(L), sc, round(reps, 3), mats[0]))
        u0 = c0 / sc + off                      # тексель в ближнем углу грани
        d = abs(u0 / TEXW - round(u0 / TEXW))
        if d > 0.005:
            badoff.append((round(c0), sc, round(off, 3), round(u0, 3), mats[0]))

print(f'\n{path}   тайл {TILE:.0f}u, UVS {UVS:.0f}, текселей в повторе {TEXW:.0f}')
for k, v in tot.most_common():
    print(f'  {v:7}  {k}')
n = tot['подогнано']
if n:
    print(f'\n  ЦЕЛЫХ ПОВТОРОВ: {n-len(badrep)} из {n} '
          f'({100*(n-len(badrep))//n}%) — дробных {len(badrep)}')
    print(f'  ШОВ НА РЕБРЕ:   {n-len(badoff)} из {n} '
          f'({100*(n-len(badoff))//n}%) — мимо {len(badoff)}')
    hh = '  '.join(f'{k}:{v}' for k, v in sorted(reps_hist.items(), key=lambda kv: str(kv[0])))
    print(f'  повторов на грань: {hh}')
for name, bad in (('ДРОБНОЕ ЧИСЛО ПОВТОРОВ', badrep), ('ШОВ МИМО РЕБРА', badoff)):
    if bad:
        print(f'\n  {name}, первые 5:')
        for b in bad[:5]:
            print('   ', b)
