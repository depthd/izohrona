"""ЗАВАЛЫ: где именно рвётся связность в .vmf и что её рвёт.

Разрез по прямой (`krjuk.py --разрез`) показывает профиль ВДОЛЬ ЛИНИИ и потому
врёт про причину: между двумя местами почти всегда стоит стена, а ходят вокруг
неё. Нужен другой вопрос — не «что на прямой», а «где кончается достижимое и
почему следующий шаг невозможен».

Прибор берёт две компоненты — достижимую от старта и ту, в которой лежит
недостижимое место, — и печатает ШОВ между ними: клетки, соседние по плану, но
не связанные. Для каждой стыковки говорит причину:

    обрыв     — узлы есть с обеих сторон, но перепад больше 59u;
    потолок   — узел не родился: над опорой меньше 72u;
    стена     — узла нет вовсе: в блоке 2x2 сплошной объём;
    провал    — под блоком нет опоры.

Если шва нет вовсе, компоненты разнесены — печатается самый узкий перешеек и
что в нём стоит.

    python3 tools/zavaly.py <файл.vmf> [место]      # без места — все недостижимые
"""
import collections, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U, UP, HEAD, STEP

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

путь = sys.argv[1]
хочу = sys.argv[2] if len(sys.argv) > 2 else None

txt = open(путь, encoding='utf-8', errors='replace').read()
solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
места = {}
for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
    b = m.group(1)
    if '"env_cs_place"' not in b:
        continue
    nm = re.search(r'"place_name" "([^"]*)"', b)
    og = re.search(r'"origin" "([-\d.e ]+)"', b)
    if nm and og:
        места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())

узлы, adj, X0, Y0, W, H, IV = hodba.сетка(solid, column, вернутьIV=True)
точки = {n: hodba.ближайший(узлы, X0, Y0, p) for n, p in места.items()}
имена = [n for n in места if точки[n]]

# главная компонента — та, где больше всего мест
компы, видано = [], set()
for n in имена:
    if точки[n] in видано:
        continue
    d = hodba.волна(adj, точки[n])
    видано |= set(d)
    компы.append((d, [m for m in имена if точки[m] in d]))
компы.sort(key=lambda c: -len(c[1]))
глав, главМеста = компы[0]
print(f'{путь}\n  узлов {len(adj)}, компонент с местами {len(компы)}')
for d, ms in компы:
    print(f'   компонента: клеток {len(d):6d}   мест {len(ms):2d}  {", ".join(sorted(ms))[:90]}')
if len(компы) == 1:
    print('  связность целая — рвать нечего')
    sys.exit(0)

ЯЧ = lambda t: (t[0], t[1])
главКл = {ЯЧ(t) for t in глав}


def мат(cx, cy, z0, z1):
    """Материалы объёмов блока 2x2, пересекающих полосу высот."""
    н = collections.Counter()
    for j in (cy * W + cx, cy * W + cx + 1, (cy + 1) * W + cx, (cy + 1) * W + cx + 1):
        if j >= len(IV) or IV[j] is None:
            continue
        for b, t, ии in IV[j]:
            if t > z0 and b < z1:
                for i in ии:
                    н[solid[i].get('mat', '?').split('/')[-1][:26]] += 1
    return ', '.join(k for k, _ in н.most_common(3)) or '—'


def столб(cx, cy):
    """Что стоит в центральной клетке блока, интервалами."""
    j = cy * W + cx
    if j >= len(IV) or not IV[j]:
        return 'пусто'
    return ' | '.join(f'{b:.0f}..{t:.0f}' for b, t, _ in IV[j][:4])


D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
for d, ms in компы[1:]:
    if хочу and хочу not in ms:
        continue
    свои = {ЯЧ(t) for t in d}
    print(f'\n  ОТРЕЗАНЫ: {", ".join(sorted(ms))}   (клеток {len(d)})')

    # 1. обрыв: клетки соседние, узлы есть с обеих сторон, но связь не рождается
    обрывы = []
    for (cx, cy, z) in d:
        for dx, dy in D8:
            n = (cx + dx, cy + dy)
            if n in главКл:
                for zг in узлы[n]:
                    обрывы.append((abs(zг - z), cx, cy, z, n[0], n[1], zг))
    # 2. пробка: клетка БЕЗ узла, зажатая между двумя компонентами
    пробки = []
    for (cx, cy, z) in d:
        for dx, dy in D8:
            n = (cx + dx, cy + dy)
            if n in узлы or n in свои:
                continue
            рядомГлав = any((n[0] + ex, n[1] + ey) in главКл for ex, ey in D8)
            if рядомГлав:
                пробки.append((n[0], n[1], cx, cy, z))

    if обрывы:
        обрывы.sort()
        print(f'    ОБРЫВ: {len(обрывы)} стыковок клетка-в-клетку, ни одна не связывается')
        print(f'    (подъём разрешён до {UP}u, спуск до {hodba.DOWN}u)')
        for пер, cx, cy, z, nx, ny, zг in обрывы[:6]:
            print(f'      ({X0 + cx * U:.0f} {Y0 + cy * U:.0f})  отрезанная {z:.0f} ↔ главная {zг:.0f}'
                  f'   перепад {zг - z:+.0f}u   {мат(cx, cy, min(z, zг) - 8, max(z, zг) + HEAD)}')
    if пробки:
        # группируем по материалу пробки
        сч = collections.Counter()
        for nx, ny, cx, cy, z in пробки:
            сч[мат(nx, ny, z - 8, z + HEAD)] += 1
        print(f'    ПРОБКА: {len(пробки)} клеток без узла зажаты между компонентами')
        for м, k in сч.most_common(4):
            print(f'      x{k:<4d} {м}')
        for nx, ny, cx, cy, z in пробки[:4]:
            print(f'      ({X0 + nx * U:.0f} {Y0 + ny * U:.0f}) столб: {столб(nx, ny)}'
                  f'   рядом отрезанная на {z:.0f}')
    if not обрывы and not пробки:
        лучш = None
        for (cx, cy, z) in d:
            for (gx, gy) in главКл:
                q = (gx - cx) ** 2 + (gy - cy) ** 2
                if лучш is None or q < лучш[0]:
                    лучш = (q, cx, cy, z, gx, gy)
        q, cx, cy, z, gx, gy = лучш
        print(f'    ни шва, ни пробки: компоненты разнесены на {math.sqrt(q):.0f} клеток'
              f' ({math.sqrt(q) * U:.0f}u)')
