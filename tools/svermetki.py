"""СВЕРКА С МЕТКАМИ ЧЕЛОВЕКА: находит ли прибор то, на что он показал.

Человек размечает дефекты в tools/tykalka.html и присылает .json с мировыми
координатами. Здесь для каждой метки печатается, что там на самом деле: есть ли
пол по обе стороны, какой толщины стена между ними, и сколько идти в обход.
Это единственный способ откалибровать порог по живому человеку, а не по моим
выдумкам.

    python3 tools/svermetki.py <файл.vmf> <метки.json>
"""
import collections, json, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

путь, мпуть = sys.argv[1], sys.argv[2]
М = json.load(open(мпуть, encoding='utf-8'))['метки']
txt = open(путь, encoding='utf-8', errors='replace').read()
solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
места = {}
for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
    b = m.group(1)
    nm = re.search(r'"place_name" "([^"]*)"', b)
    og = re.search(r'"origin" "([-\d.e ]+)"', b)
    if '"env_cs_place"' in b and nm and og:
        места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())
узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)
сп = None
for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
    if '"info_player_terrorist"' in m.group(1):
        og = re.search(r'"origin" "([-\d.e ]+)"', m.group(1))
        if og:
            сп = tuple(float(v) for v in og.group(1).split())
            break
дост = hodba.волна(adj, hodba.ближайший(узлы, X0, Y0, сп))
ход = {}
for (cx, cy, z) in дост:
    ход.setdefault((cx, cy), z)

D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
UP = hodba.UP


def обход(a, b, потолок=80):
    d = {a: 0}
    оч = collections.deque([a])
    while оч:
        c = оч.popleft()
        if d[c] >= потолок:
            continue
        for dx, dy in D8:
            n = (c[0] + dx, c[1] + dy)
            if n not in ход or n in d:
                continue
            if ход[n] - ход[c] > UP:
                continue
            d[n] = d[c] + 1
            if n == b:
                return d[n]
            оч.append(n)
    return None


print(f'{путь}\nметок {len(М)}\n')
# Для каждой метки: в какую сторону от неё камень, какой толщины, и что за ним.
# Из этих чисел и берутся пороги прибора — из живого человека, а не из головы.
ЛУЧИ = ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1))
итог = []
for i, м in enumerate(М, 1):
    cx, cy = round((м['x'] - X0) / U), round((м['y'] - Y0) / U)
    # ближайшая клетка пола к метке — от неё и меряем
    старт = None
    for r in range(0, 9):
        for oy in range(-r, r + 1):
            for ox in range(-r, r + 1):
                k = (cx + ox, cy + oy)
                if k in ход:
                    старт = k
                    break
            if старт: break
        if старт: break
    бл = sorted(места, key=lambda n: (места[n][0]-м['x'])**2 + (места[n][1]-м['y'])**2)[:2]
    if старт is None:
        print(f'{i}. ({м["x"]} {м["y"]}) {", ".join(бл)}: пола рядом нет вовсе')
        continue
    # Столбик в две клетки с обходом в четыре — не то, на что показывает человек.
    # Он тычет в БОЛЬШОЙ массив: смотрим камень до 960u и берём то направление,
    # где обход самый дорогой.
    # Метка стоит на КРАЮ коридора, поэтому в большинстве сторон пол начинается
    # сразу. Идём лучом дальше и ловим каждый переход пол -> камень -> пол,
    # где камень не тоньше 48u. Из всех берём тот, где обход самый дорогой.
    вар = []
    for dx, dy in ЛУЧИ:
        камень = 0
        for t in range(1, 61):                       # смотрим до 960u
            k = (старт[0]+dx*t, старт[1]+dy*t)
            if k in ход:
                if камень >= 3:
                    o = обход(старт, k, потолок=260)
                    вар.append((0 if o is None else o, камень, dx, dy))
                камень = 0
            else:
                камень += 1
    if not вар:
        print(f'{i}. ({м["x"]} {м["y"]}) {", ".join(бл)}: за камнем пола нет в радиусе 960u')
        continue
    вар.sort(key=lambda v: -(v[0] if v[0] else 10**6))
    ц, t, dx, dy = вар[0]
    итог.append((t*U, ц*U if ц else None))
    print(f'{i}. ({м["x"]} {м["y"]}) {", ".join(бл)}:  камень {t*U}u, '
          f'за ним пол; в обход {"больше 3200u" if not ц else str(ц*U)+"u"}')
print()
if итог:
    тл = [a for a,_ in итог]
    об = [b for _,b in итог if b]
    print(f'ПОРОГИ ПО ЖИВОМУ ЧЕЛОВЕКУ: камень {min(тл)}..{max(тл)}u'
          f' · обход {min(об) if об else "?"}..{max(об) if об else "?"}u'
          f' (у {len(итог)-len(об)} из {len(итог)} обход больше 3200u)')
