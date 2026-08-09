"""ШИРИНА ПРОХОДОВ по .vmf: не «есть ли путь», а «какой он ширины».

Приёмка до сих пор отвечала на вопрос «дойду ли». Человек смотрит на другое:
на щель, в которую надо протискиваться. Путь через неё есть, крюк единица, а
играть нельзя. Прибор считает для каждой ходибельной клетки расстояние до
ближайшей неходибельной (расстояние до стены) и печатает распределение ширин
и самые узкие МЕСТА (а не отдельные клетки).

    python3 tools/shir.py <файл.vmf> [ещё.vmf ...]
"""
import collections, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

for путь in sys.argv[1:]:
    txt = open(путь, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
    import os
    if os.environ.get('БЕЗТЕЛ') == '1':
        база = min(s['z0'] for s in solid)
        solid = [s for s in solid if s['z0'] < база + 8]
        print('  (контрфакт: тела убраны)')
    места = {}
    for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
        b = m.group(1)
        nm = re.search(r'"place_name" "([^"]*)"', b)
        og = re.search(r'"origin" "([-\d.e ]+)"', b)
        if '"env_cs_place"' in b and nm and og:
            места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())
    узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)

    # Считать по ВСЕМ узлам нельзя: крышка player clip над картой — это своя
    # огромная ровная «страна» наверху, и медиана ширины уходит в тысячи юнитов.
    # Берём только то, куда игрок реально доходит от спавна T.
    сп = None
    for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
        b = m.group(1)
        if '"info_player_terrorist"' in b:
            og = re.search(r'"origin" "([-\d.e ]+)"', b)
            if og:
                сп = tuple(float(v) for v in og.group(1).split())
                break
    s0 = hodba.ближайший(узлы, X0, Y0, сп) if сп else None
    дост = hodba.волна(adj, s0) if s0 else {}
    ход = bytearray(W * H)
    for (cx, cy, _z) in дост:
        ход[cy * W + cx] = 1
    # расстояние до ближайшей нехoдибельной клетки, две прогонки (чебышёв+диаг)
    INF = 1 << 20
    d = [0 if not ход[i] else INF for i in range(W * H)]
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if not d[i]:
                continue
            b = INF
            for dx, dy in ((-1, 0), (0, -1), (-1, -1), (1, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    b = min(b, d[ny * W + nx] + (3 if dx and dy else 2))
            d[i] = min(d[i], b)
    for y in range(H - 1, -1, -1):
        for x in range(W - 1, -1, -1):
            i = y * W + x
            if not d[i]:
                continue
            b = d[i]
            for dx, dy in ((1, 0), (0, 1), (1, 1), (-1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    b = min(b, d[ny * W + nx] + (3 if dx and dy else 2))
            d[i] = b
    # ============ ЧТО ТАКОЕ «ШИРИНА» В КЛЕТКЕ ============
    # Первая редакция брала расстояние до стены прямо в клетке. Так у КАЖДОЙ
    # клетки вплотную к стене выходило 32u — и в коридоре, и посреди зала, потому
    # что мерилось «далеко ли до стены отсюда», а не «в каком проходе я стою».
    # Прибор объявил, что 13% пола — щели, и это было враньё.
    # Правильно: клетка принадлежит проходу шириной D, если её накрывает
    # свободный круг диаметра D. Считаем расстояние до стены r (радиус круга,
    # вписанного в этой клетке), а потом РАЗЛИВАЕМ его: каждая клетка берёт
    # максимум 2r по всем кругам, которые её накрывают.
    рад = [d[i] / 2.0 for i in range(W * H)]        # радиус в клетках
    шир = {}
    for i in range(W * H):
        if ход[i]:
            шир[i] = 0.0
    for i in range(W * H):
        r = рад[i]
        if r < 0.5 or not ход[i]:
            continue
        R = int(r)
        cx, cy = i % W, i // W
        for dy in range(-R, R + 1):
            for dx in range(-R, R + 1):
                if dx * dx + dy * dy > r * r:
                    continue
                x, y = cx + dx, cy + dy
                if 0 <= x < W and 0 <= y < H:
                    j = y * W + x
                    if j in шир and 2 * r * U > шир[j]:
                        шир[j] = 2 * r * U

    зн = sorted(шир.values())
    n = len(зн)
    if not n:
        print(путь, 'нет ходибельных клеток')
        continue
    кв = lambda p: зн[int(p * (n - 1))]
    print(f'\n{путь}')
    print(f'  ходибельных клеток {n}')
    print(f'  ширина прохода: 5% {кв(.05):.0f}u · медиана {кв(.5):.0f}u · 95% {кв(.95):.0f}u')
    for порог in (32, 48, 64, 96):
        k = sum(1 for v in зн if v < порог)
        print(f'    уже {порог}u: {k:6d} клеток ({100*k/n:.1f}%)')

    # самые узкие ГОРЛЫШКИ: клетка узкая и через неё реально ходят
    # (у неё есть соседи-узлы с обеих сторон по одной из осей)
    узк = [i for i in шир if шир[i] < 48]
    гр, мн = [], set(узк)
    while мн:
        s0 = мн.pop()
        ст, ком = [s0], [s0]
        while ст:
            c = ст.pop()
            cx, cy = c % W, c // W
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    k = (cy + dy) * W + cx + dx
                    if k in мн:
                        мн.discard(k)
                        ст.append(k)
                        ком.append(k)
        гр.append(ком)
    гр.sort(key=len, reverse=True)
    print(f'  узких мест (сплошных пятен уже 48u): {len(гр)}')
    for ком in гр[:8]:
        xs = [c % W for c in ком]
        ys = [c // W for c in ком]
        wx = X0 + sum(xs) / len(xs) * U
        wy = Y0 + sum(ys) / len(ys) * U
        бл = sorted(места, key=lambda nm: (места[nm][0] - wx) ** 2 + (места[nm][1] - wy) ** 2)[:2]
        print(f'    {len(ком):5d} клеток  центр ({wx:.0f} {wy:.0f})'
              f'  минимум {min(шир[c] for c in ком):.0f}u  рядом: {", ".join(бл)}')

# ============ САМОЕ УЗКОЕ МЕСТО НА МАРШРУТЕ ============
# Доля узких клеток на карте ничего не говорит: их может быть 0.1%, и все они
# ровно на тех перекрёстках, через которые ходят. Игрок видит МИНИМУМ вдоль
# своего пути, а не среднее по полу. Считаем для каждой пары соседних мест
# кратчайший путь и самую узкую точку на нём.
    import heapq
    пары = []
    имена = [n for n in места]
    кэшП = {}
    for i, a in enumerate(имена):
        ta = hodba.ближайший(узлы, X0, Y0, места[a])
        if not ta or (ta[0], ta[1]) not in [(c[0], c[1]) for c in [ta]]:
            pass
        if not ta:
            continue
        for b in имена[i + 1:]:
            tb = hodba.ближайший(узлы, X0, Y0, места[b])
            if not tb:
                continue
            пр = math.dist(места[a][:2], места[b][:2])
            if пр > 1800 or пр < 200:
                continue
            if a not in кэшП:
                кэшП[a] = hodba.волна(adj, ta)
            if tb not in кэшП[a]:
                continue
            # восстановление пути по расстояниям
            d = кэшП[a]
            c, путь = tb, [tb]
            while d.get(c, 0) > 0:
                сл = None
                for n2 in adj.get(c, ()):
                    if d.get(n2, 1 << 30) == d[c] - 1:
                        сл = n2
                        break
                if сл is None:
                    for n2 in [k for k in d if d[k] == d[c] - 1
                               and abs(k[0] - c[0]) <= 1 and abs(k[1] - c[1]) <= 1]:
                        сл = n2
                        break
                if сл is None:
                    break
                c = сл
                путь.append(c)
            ш = [шир.get(p[1] * W + p[0], 1e9) for p in путь]
            ш = [v for v in ш if v < 1e8]
            if ш:
                пары.append((min(ш), a, b, len(путь) * U))
    if пары:
        пары.sort()
        зн2 = [p[0] for p in пары]
        n2 = len(зн2)
        q2 = lambda p: зн2[int(p * (n2 - 1))]
        print(f'  ГОРЛО НА МАРШРУТЕ между соседними местами, пар {n2}:')
        print(f'    медиана {q2(.5):.0f}u · четверть пар уже {q2(.25):.0f}u · худшая {зн2[0]:.0f}u')
        for порог in (48, 64, 96, 128):
            k = sum(1 for v in зн2 if v < порог)
            print(f'    маршрутов с горлом уже {порог}u: {k} из {n2} ({100*k/n2:.0f}%)')
        for м, a, b, L in пары[:6]:
            print(f'      {м:5.0f}u  {a} -> {b}   (путь {L}u)')
