"""ВХОДЫ НА ПЛЕНТ: сколько независимых заходов и какой ширины каждый.

Приёмка спрашивала «есть ли путь» и «какой крюк». Обе отвечают «нормально» на
карте, где на плент ведёт ОДИН коридор: путь есть, крюк единица. Играть в такое
нельзя — сайт держится одним углом. На настоящих картах заходов три-четыре.

Прибор берёт объём func_bomb_target, находит ходибельные клетки внутри него,
и режет их границу на связные куски: каждый кусок — отдельный заход. Печатает
ширину каждого и проверяет, входит ли он ВВЕРХ (можно зайти) или только вниз
(спрыгнуть можно, вернуться нельзя).

    python3 tools/vhody.py <файл.vmf> [ещё.vmf ...]
"""
import collections, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))

for путь in sys.argv[1:]:
    txt = open(путь, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
    узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)

    # обратные рёбра — чтобы отличить «зашёл» от «спрыгнул и не вернулся»
    обр = collections.defaultdict(list)
    for a, лст in adj.items():
        for b in лст:
            обр[b].append(a)

    сп = None
    зоны = {}
    for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
        b = m.group(1)
        if '"info_player_terrorist"' in b and сп is None:
            og = re.search(r'"origin" "([-\d.e ]+)"', b)
            if og:
                сп = tuple(float(v) for v in og.group(1).split())
        if '"func_bomb_target"' in b:
            xs, ys = [], []
            for pm in re.finditer(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"', b):
                for k in range(1, 4):
                    a = pm.group(k).split()
                    xs.append(float(a[0])); ys.append(float(a[1]))
            nm = re.search(r'"targetname" "([^"]*)"', b)
            if xs:
                зоны[(nm.group(1) if nm else f'site{len(зоны)}')] = (min(xs), min(ys), max(xs), max(ys))

    s0 = hodba.ближайший(узлы, X0, Y0, сп) if сп else None
    дост = hodba.волна(adj, s0) if s0 else {}
    print(f'\n{путь}   ходибельных клеток от T: {len(дост)}')
    if not зоны:
        print('  func_bomb_target не найден')
        continue

    for имя, (x0, y0, x1, y1) in sorted(зоны.items()):
        внутри = set()
        for (cx, cy, z) in дост:
            wx, wy = X0 + cx * U + U / 2, Y0 + cy * U + U / 2
            if x0 <= wx <= x1 and y0 <= wy <= y1:
                внутри.add((cx, cy))
        if not внутри:
            print(f'  {имя}: НИ ОДНОЙ ходибельной клетки внутри — плент недостижим')
            continue
        # кайма: клетки снаружи зоны, соседние с внутренними и достижимые
        достКл = {(c[0], c[1]) for c in дост}
        кайма = set()
        for (cx, cy) in внутри:
            for dx, dy in D8:
                n = (cx + dx, cy + dy)
                if n in внутри or n not in достКл:
                    continue
                кайма.add(n)
        # режем кайму на связные куски — это и есть отдельные заходы
        гр, мн = [], set(кайма)
        while мн:
            a = mн0 = мн.pop()
            ст, ком = [a], [a]
            while ст:
                c = ст.pop()
                for dx, dy in D8:
                    n = (c[0] + dx, c[1] + dy)
                    if n in мн:
                        мн.discard(n); ст.append(n); ком.append(n)
            гр.append(ком)
        гр.sort(key=len, reverse=True)
        # односторонний ли заход: можно ли из зоны выйти обратно тем же местом
        назад = collections.defaultdict(bool)
        print(f'  {имя}: клеток внутри {len(внутри)}, ЗАХОДОВ {len(гр)}')
        for ком in гр:
            xs = [c[0] for c in ком]; ys = [c[1] for c in ком]
            print(f'      ширина ~{len(ком)*U//max(1,max(max(xs)-min(xs),max(ys)-min(ys))+1)}u'
                  f'  клеток каймы {len(ком)}'
                  f'  у ({X0+sum(xs)/len(xs)*U:.0f} {Y0+sum(ys)/len(ys)*U:.0f})')
