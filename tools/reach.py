"""ДОХОДИМОСТЬ ПО ГОТОВОМУ .vmf, а не по растру генератора.

Смысл. Жалоба «проход перегорожен» два раза не сходилась с проверками, потому
что проверки шли по внутреннему растру — по той карте, которую генератор ДУМАЕТ,
что построил. Здесь всё наоборот: пол, стены и тела восстанавливаются из самого
файла по полуплоскостям, строится ходибельная сетка, и путь ищется по ней.

Ходибельная клетка: есть поверхность, над ней 72 юнита пустоты, и то же верно
для соседей 2x2 (игрок 32u широкий).

Связь НАПРАВЛЕННАЯ, и это принципиально: вниз можно спрыгнуть откуда угодно,
вверх — только на UP юнитов. Симметричный граф врёт вдвое: он объявляет
недостижимой всю карту за первым же уступом в 48u, хотя игрок туда спрыгивает.

    python3 tools/reach.py <файл.vmf> [ОткудаМесто] [КудаМесто]

Без имён печатает, какие каллауты недостижимы от Т-спавна. С именами — ищет
путь между двумя местами и, если пути нет, показывает узкое место: клетки на
прямой между ними, которые оказались непроходимы, и что именно их занимает.

ЧЕМУ ЗДЕСЬ ВЕРИТЬ, А ЧЕМУ НЕТ. Надёжны две вещи: КРЮК между двумя местами
(обе точки в одном куске, длина пути честная) и СОДЕРЖИМОЕ клеток на прямой.
Общий список «недостижимых» пока НЕ надёжен, и вот почему: эрозия 2x2 под
ширину игрока выбрасывает клетки на самом краю обрыва, а без них пропадает и
связь «спрыгнуть вниз» — два яруса, соединённые только обрывом, выглядят
разорванными. Нав в игре так не считает. Чинится отдельно; до тех пор список
читать как «сюда стоит посмотреть», а не как приговор.
"""
import re, sys, collections, math

U = 16          # шаг сетки
HEAD = 72       # рост игрока
UP   = 59       # выше не подняться: шаг 18u, прыжок даёт около 58u
DOWN = 400      # вниз спрыгиваем откуда угодно (в пределах разумного)
STEP = 24       # разброс отметок внутри блока 2x2 под игроком

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

path = sys.argv[1]
txt = open(path, encoding='utf-8', errors='replace').read()
world = txt.split('\nentity\n')[0]
solid = [s for s in parse_solids(world) if not s['tool']]

# --- контрфакт: выкинуть браши, целиком лежащие в заданной коробке ---
# Без этого «виновник» остаётся догадкой по совпадению. Убираем подозреваемого
# и меряем крюк заново: если он схлопнулся — виновник он, если нет — не он.
УБРАТЬ = None
if '--убрать' in sys.argv:
    k = sys.argv.index('--убрать')
    УБРАТЬ = [float(v) for v in sys.argv[k+1:k+5]]
    del sys.argv[k:k+5]
    было = len(solid)
    solid = [s for s in solid if not (УБРАТЬ[0]-1 <= s['x0'] and s['x1'] <= УБРАТЬ[2]+1
                                      and УБРАТЬ[1]-1 <= s['y0'] and s['y1'] <= УБРАТЬ[3]+1)]
    print(f'КОНТРФАКТ: выкинуто брашей {было-len(solid)} из коробки {УБРАТЬ}')

места = {}
for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
    b = m.group(1)
    if '"env_cs_place"' not in b:
        continue
    nm = re.search(r'"place_name" "([^"]*)"', b)
    og = re.search(r'"origin" "([-\d.e ]+)"', b)
    if nm and og:
        места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())

X0 = min(s['x0'] for s in solid); X1 = max(s['x1'] for s in solid)
Y0 = min(s['y0'] for s in solid); Y1 = max(s['y1'] for s in solid)
W = int((X1 - X0) // U) + 1
H = int((Y1 - Y0) // U) + 1

G = 256
grid = collections.defaultdict(list)
for i, s in enumerate(solid):
    for gx in range(int(s['x0'] // G), int(s['x1'] // G) + 1):
        for gy in range(int(s['y0'] // G), int(s['y1'] // G) + 1):
            grid[(gx, gy)].append(i)


def интервалы(x, y):
    r = []
    for i in grid.get((int(x // G), int(y // G)), ()):
        s = solid[i]
        if not (s['x0'] - 1 <= x <= s['x1'] + 1 and s['y0'] - 1 <= y <= s['y1'] + 1):
            continue
        c = column(s, x, y)
        if c:
            r.append((c[0], c[1], i))
    r.sort()
    # склейка перекрывающихся: игроку важен сплошной объём, а не число брашей
    out = []
    for b, t, i in r:
        if out and b <= out[-1][1] + 0.5:
            if t > out[-1][1]:
                out[-1] = (out[-1][0], t, out[-1][2])
        else:
            out.append((b, t, i))
    return out


def стоянки(x, y):
    """Отметки, на которых можно стоять, и кто мешает над каждой."""
    iv = интервалы(x, y)
    res = []
    for k, (b, t, i) in enumerate(iv):
        потолок = iv[k + 1][0] if k + 1 < len(iv) else 1e9
        помеха = iv[k + 1][2] if k + 1 < len(iv) else None
        if потолок - t >= HEAD:
            res.append((t, None))
        else:
            res.append((t, помеха))       # поверхность есть, но над ней тесно
    return res


print(f'\n{path}\nсетка {W}x{H} по {U}u, брашей {len(solid)}, каллаутов {len(места)}')
СТОЯТЬ = [None] * (W * H)
for cy in range(H):
    y = Y0 + cy * U + U / 2
    row = cy * W
    for cx in range(W):
        СТОЯТЬ[row + cx] = стоянки(X0 + cx * U + U / 2, y)

# --- ходибельность с учётом ширины игрока: нужен блок 2x2 на близких отметках ---
узлы = {}
for cy in range(H - 1):
    for cx in range(W - 1):
        for (z, п) in СТОЯТЬ[cy * W + cx]:
            if п is not None:
                continue
            ок = True
            for (dx, dy) in ((1, 0), (0, 1), (1, 1)):
                if not any(abs(zz - z) <= STEP and pp is None
                           for (zz, pp) in СТОЯТЬ[(cy + dy) * W + cx + dx]):
                    ок = False
                    break
            if ок:
                узлы.setdefault((cx, cy), []).append(z)

print(f'ходибельных клеток {len(узлы)}')

adj = collections.defaultdict(list)
for (cx, cy), zs in узлы.items():
    for d in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        n = (cx + d[0], cy + d[1])
        if n not in узлы:
            continue
        for z in zs:
            for z2 in узлы[n]:
                d = z2 - z
                if -DOWN <= d <= UP:
                    adj[(cx, cy, z)].append((n[0], n[1], z2))


# обратные рёбра нужны, чтобы восстановить сам путь, а не только его длину
adj_обр = collections.defaultdict(list)
for c, ns_ in adj.items():
    for n in ns_:
        adj_обр[n].append(c)


def клетка(p):
    return (int((p[0] - X0) // U), int((p[1] - Y0) // U))


def ближайший_узел(p, r=6):
    cx, cy = клетка(p)
    луч = []
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            k = (cx + dx, cy + dy)
            if k in узлы:
                for z in узлы[k]:
                    луч.append((dx * dx + dy * dy + (abs(z - p[2]) / 32) ** 2,
                                (k[0], k[1], z)))
    луч.sort()
    return луч[0][1] if луч else None


def поток(старт, цель=None):
    """Обход в ширину: заодно даёт длину пути в клетках."""
    seen = {старт: 0}
    q = collections.deque([старт])
    while q:
        c = q.popleft()
        if цель and c == цель:
            break
        for n in adj.get(c, ()):
            if n not in seen:
                seen[n] = seen[c] + 1
                q.append(n)
    return seen


old = 'TSpawn' if 'TSpawn' in места else next(iter(места))
s0 = ближайший_узел(места[old])
дошли = поток(s0) if s0 else set()
клетки_дошли = {(c[0], c[1]) for c in дошли}
print(f'от «{old}» доходимо клеток {len(клетки_дошли)} из {len(узлы)}')
плохо = [n for n, p in места.items() if (ближайший_узел(p) or (0, 0, 0))[:2] not in клетки_дошли]
print('НЕДОСТИЖИМЫ: ' + (', '.join(плохо) if плохо else 'нет'))

if len(sys.argv) > 3:
    A, B = sys.argv[2], sys.argv[3]
    if A not in места or B not in места:
        print(f'нет такого места; есть: {", ".join(места)}')
        sys.exit(1)
    a, b = ближайший_узел(места[A]), ближайший_узел(места[B])
    дA = поток(a, b) if a else {}
    есть = b in дA if b else False
    if есть:
        путь = дA[b] * U
        прямая = math.dist(места[A][:2], места[B][:2])
        print(f'\n«{A}» -> «{B}»: путь есть, {путь:.0f}u по земле против '
              f'{прямая:.0f}u напрямую — крюк x{путь/max(1,прямая):.2f}')
        if путь/max(1,прямая) > 1.6:
            print('  КРЮК БОЛЬШОЙ: прямой проход, скорее всего, перегорожен')
    else:
        print(f'\n«{A}» -> «{B}»: ПУТИ НЕТ ВООБЩЕ')
    # что стоит на прямой между ними
    ax, ay, _ = a; bx, by, _ = b
    n = max(abs(bx - ax), abs(by - ay))
    print(f'\nразрез по прямой, {n} шагов по {U}u:')
    прервано = []
    for k in range(n + 1):
        cx = round(ax + (bx - ax) * k / n); cy = round(ay + (by - ay) * k / n)
        st = СТОЯТЬ[cy * W + cx]
        свободно = [z for (z, п) in st if п is None]
        занято = [(z, п) for (z, п) in st if п is not None]
        wx, wy = X0 + cx * U + U / 2, Y0 + cy * U + U / 2
        если_дошли = (cx, cy) in {(c[0], c[1]) for c in дA}
        if not свободно or not если_дошли:
            прервано.append((k, cx, cy, wx, wy, st, занято, если_дошли))
    print(f'  клеток на прямой без прохода или недостижимых: {len(прервано)} из {n+1}')
    # --- выгрузка для картинки: сама сетка, путь и прямая ---
    if '--картинка' in sys.argv:
        import json
        путьцепь = []
        if есть:
            # восстановление пути обратным ходом по расстояниям
            cur_ = b
            while cur_ != a:
                d0 = дA[cur_]
                для_ = [n for n in adj_обр.get((cur_[0], cur_[1], cur_[2]), ())
                        if дA.get(n, 1 << 30) == d0 - 1]
                if not для_:
                    break
                путьцепь.append((cur_[0], cur_[1]))
                cur_ = для_[0]
            путьцепь.append((a[0], a[1]))
        карта = []
        дошли_кл = {(c[0], c[1]) for c in дA}
        for cy2 in range(H):
            row = []
            for cx2 in range(W):
                k2 = (cx2, cy2)
                row.append('2' if k2 in дошли_кл else ('1' if k2 in узлы else '0'))
            карта.append(''.join(row))
        json.dump({'W': W, 'H': H, 'X0': X0, 'Y0': Y0, 'U': U, 'карта': карта,
                   'места': {n: [p[0], p[1]] for n, p in места.items()},
                   'путь': путьцепь, 'A': A, 'B': B,
                   'a': [a[0], a[1]], 'b': [b[0], b[1]]},
                  open('/tmp/reach.json', 'w'))
        print('  выгружено в /tmp/reach.json')
    for (k, cx, cy, wx, wy, st, занято, дош) in прервано[:20]:
        что = занято if занято else [(z, i) for (z, i) in
              [(iv[1], iv[2]) for iv in интервалы(wx, wy)]]
        зан = ', '.join(f'{solid[i]["mat"].split("/")[-1][:20]} '
                        f'{solid[i]["z0"]:.0f}..{solid[i]["z1"]:.0f}'
                        for (_, i) in что[:3]) or 'ПУСТО'
        print(f'    шаг {k:3}  мир ({wx:.0f} {wy:.0f})  '
              f'{"недостижима" if not дош else "непроходима"}  {зан}')
