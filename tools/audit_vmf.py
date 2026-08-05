"""Полная опись брашей экспорта: что это, сколько, где и подозрительно ли.

Смысл: перестать чинить по одному скриншоту. Каждый браш классифицируется по
форме и материалу, подозрительные группируются по сигнатуре размеров — тогда
видно не «вот тут криво», а «таких 54 штуки, все одного габарита, значит это
один эмиттер, и его надо искать в коде».

    python3 tools/audit_vmf.py <файл.vmf> [сколько примеров]
"""
import re, sys, collections

path = sys.argv[1]
NEX = int(sys.argv[2]) if len(sys.argv) > 2 else 3
t = open(path, encoding='utf-8', errors='replace').read()

RE = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RM = re.compile(r'"material" "([^"]+)"')


def solids(txt):
    for chunk in txt.split('\tsolid\n')[1:]:
        pts, planes = [], []
        for m in RE.finditer(chunk):
            tri = []
            for k in range(1, 4):
                a = m.group(k).split()
                if len(a) == 3:
                    p = (float(a[0]), float(a[1]), float(a[2]))
                    tri.append(p); pts.append(p)
            if len(tri) == 3:
                planes.append(tri)
        if not pts:
            continue
        mats = RM.findall(chunk)
        yield pts, planes, mats


def isbox(planes):
    """коробка: шесть граней, все нормали по осям"""
    if len(planes) != 6:
        return False
    for a, b, c in planes:
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - b[0], c[1] - b[1], c[2] - b[2]
        n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        nz = [abs(v) > 1e-6 for v in n]
        if sum(nz) != 1:
            return False
    return True


kinds = collections.Counter()
sig = collections.defaultdict(lambda: [0, collections.Counter(), []])
zmin_all = 1e18
rows = []

for pts, planes, mats in solids(t):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; zs = [p[2] for p in pts]
    x0, y0, z0 = min(xs), min(ys), min(zs)
    dx, dy, dz = max(xs) - x0, max(ys) - y0, max(zs) - z0
    mat = mats[0] if mats else '?'
    tool = mat.upper().startswith('TOOLS')
    zmin_all = min(zmin_all, z0)
    rows.append((x0, y0, z0, dx, dy, dz, mat, tool, isbox(planes), len(planes),
                 len(set(mats))))

BASE = zmin_all   # низ карты = базовая плита

for x0, y0, z0, dx, dy, dz, mat, tool, box, npl, nmat in rows:
    if tool:
        kinds['TOOLS (клип, скайбокс, триггер)'] += 1
        continue
    nar, lng = min(dx, dy), max(dx, dy)
    short = mat.split('/')[-1]
    if not box:
        k = 'КЛИН (наклонная грань)'
    elif dz <= 24 and nar <= 40:
        k = 'плоская полоска'
    elif nar <= 16 and dz >= 96:
        k = 'ТОНКАЯ ВЫСОКАЯ ПЛАСТИНА'
    elif nar <= 32 and dz >= 192:
        k = 'узкая высокая'
    elif z0 > BASE + 64 and dz <= 64:
        k = 'ПАРЯЩАЯ ПЛИТА (низ выше базы)'
    elif abs(dx - 16) < 1 and abs(dy - 16) < 1:
        k = 'ОДИНОЧНАЯ КЛЕТКА 16x16'
    else:
        k = 'обычный'
    kinds[k] += 1
    if k != 'обычный' and k != 'плоская полоска':
        s = sig[(k, round(nar), round(lng), round(dz), short)]
        s[0] += 1
        s[1][short] += 1
        if len(s[2]) < NEX:
            s[2].append((round(x0), round(y0), round(z0)))

print(f'\n{path}')
print(f'база (низ карты) z = {BASE:.0f}\n')
print('=== ЧТО В ФАЙЛЕ ===')
for k, v in kinds.most_common():
    print(f'  {v:6}  {k}')

print('\n=== ПОДОЗРИТЕЛЬНЫЕ, СГРУППИРОВАНО ПО ГАБАРИТУ ===')
print('   (одинаковый габарит в количестве = один эмиттер в коде)\n')
for (k, nar, lng, dz, short), (n, mats2, ex) in sorted(sig.items(), key=lambda kv: -kv[1][0])[:16]:
    print(f'  {n:5}  {k:30} {nar:4} x {lng:4} x {dz:4}   {short[:34]}')
    print(f'         примеры @ ' + '  '.join(f'({a} {b} {c})' for a, b, c in ex))
