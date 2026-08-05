"""Три дефекта экспорта одним замером — то, что реально видно в игре.

  ТОРЧИТ    — узкая стена, у соседа по грани другая отметка верха: видимый уступ.
  заподлицо — узкая стена вплотную к соседу той же высоты: шва не видно,
              это просто лишний браш от жадной нарезки рваного контура.
  пилястра  — декоративный выступ на стене (высота 176u); печатается габарит,
              чтобы отличить нормальную пилястру 80u от вырожденного столбика.
  клин      — наклонная грань. Одноклеточные (16x16) складываются в зубчатую
              пиксельную лестницу, это дефект; длинные — нормальная фаска.

    python3 tools/protrude.py <файл.vmf>
"""
import re, sys, collections

t = open(sys.argv[1], encoding='utf-8', errors='replace').read()
RE = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RM = re.compile(r'"material" "([^"]+)"')


def axis_aligned(planes):
    """коробка: шесть граней, у каждой нормаль строго по оси"""
    if len(planes) != 6:
        return False
    for a, b, c in planes:
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - b[0], c[1] - b[1], c[2] - b[2]
        n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        if sum(1 for v in n if abs(v) > 1e-6) != 1:
            return False
    return True


recs = []
for chunk in t.split('\tsolid\n')[1:]:
    pts, planes = [], []
    for m in RE.finditer(chunk):
        tri = []
        for k in range(1, 4):
            a = m.group(k).split()
            if len(a) == 3:
                p = (float(a[0]), float(a[1]), float(a[2]))
                tri.append(p)
                pts.append(p)
        if len(tri) == 3:
            planes.append(tri)
    if not pts:
        continue
    mats = RM.findall(chunk)
    if not mats or mats[0].upper().startswith('TOOLS'):
        continue
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    zs = [p[2] for p in pts]
    recs.append((min(xs), min(ys), min(zs), max(xs), max(ys), max(zs),
                 mats, axis_aligned(planes)))

base = min(r[2] for r in recs)
Wl = []
pil = collections.Counter()
wedge_small = wedge_big = 0

for x0, y0, z0, x1, y1, z1, mats, box in recs:
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    if abs(z0 - base) < 1 and len(set(mats)) == 1 and dz >= 400:
        Wl.append([x0, y0, x1, y1, z1])
    if abs(dz - 176) < 1 and min(dx, dy) <= 16 and max(dx, dy) <= 160:
        pil[(round(min(dx, dy)), round(max(dx, dy)))] += 1
    if not box:
        if max(dx, dy) <= 16:
            wedge_small += 1
        else:
            wedge_big += 1

grid = collections.defaultdict(list)
for i, (x0, y0, x1, y1, z1) in enumerate(Wl):
    for gx in range(int(x0 // 256), int(x1 // 256) + 1):
        for gy in range(int(y0 // 256), int(y1 // 256) + 1):
            grid[(gx, gy)].append(i)

up = flush = alone = 0
for i, (x0, y0, x1, y1, z1) in enumerate(Wl):
    if min(x1 - x0, y1 - y0) > 16:
        continue
    cand = set()
    for gx in range(int(x0 // 256) - 1, int(x1 // 256) + 2):
        for gy in range(int(y0 // 256) - 1, int(y1 // 256) + 2):
            cand.update(grid.get((gx, gy), ()))
    nb = diff = False
    for j in cand:
        if j == i:
            continue
        a0, b0, a1, b1, az = Wl[j]
        tx = (abs(a0 - x1) < .5 or abs(a1 - x0) < .5) and not (b1 <= y0 or b0 >= y1)
        ty = (abs(b0 - y1) < .5 or abs(b1 - y0) < .5) and not (a1 <= x0 or a0 >= x1)
        if tx or ty:
            nb = True
            if abs(az - z1) > 1:
                diff = True
    if not nb:
        alone += 1
    elif diff:
        up += 1
    else:
        flush += 1

ps = '  '.join(f'{k[0]}x{k[1]}:{v}' for k, v in pil.most_common(3))
print(f'  стен {len(Wl)} · узких {up+flush+alone}: ТОРЧИТ {up}, заподлицо {flush}, одиноких {alone}')
print(f'  пилястр {sum(pil.values())} [{ps}] · клиньев 16x16 {wedge_small}, длинных {wedge_big}')
