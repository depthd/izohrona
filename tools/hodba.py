"""ХОДИБЕЛЬНАЯ СЕТКА ПО .vmf — один прибор на все замеры проходимости.

Раньше эта логика была скопирована в reach.py и krjuk.py, и обе копии были
неверны одинаково: клетка считалась ходибельной, если ВЕСЬ блок 2x2 стоит на
одной отметке. У обрыва в 48 юнитов такого блока нет ни сверху, ни снизу, и
полоса клеток вдоль каждого уступа выпадала. Вместе с ней пропадала связь
«спрыгнуть вниз», и прибор объявлял, что от КТ-спавна нет пути на плент B.
Такого быть не может: балансировщик считает время КТ до обоих плентов и на
такой карте не сошёлся бы. То есть врал прибор, а не карта.

ПРАВИЛЬНАЯ МОДЕЛЬ. Игрок 32x32, то есть накрывает блок 2x2 клеток по 16u, и
стоит на САМОЙ ВЫСОКОЙ опоре под собой, а не на средней. Отсюда:

  1. кандидат отметки берётся из поверхностей ЦЕНТРАЛЬНОЙ клетки;
  2. в каждой из четырёх клеток блока ищется высшая поверхность не выше
     кандидата плюс шаг; если хоть в одной такой нет — под коробкой либо
     пустота, либо стена, и стоять нельзя;
  3. отметка ног = максимум этих четырёх: игрок встаёт на верхнюю;
  4. над этой отметкой во всех четырёх клетках нужно HEAD юнитов пустоты.

У обрыва это даёт узел НА КРАЮ верхнего яруса, а клетка нижнего яруса рядом
имеет свой узел — они соседние, перепад 48u, связь «шаг вниз» появляется сама.
"""
import collections, math, os

# Диагностический ключ: снять ограничение на подъём. Если крюки при этом
# исчезают, барикада ВЫСОТНАЯ (обрыв), а не стена. Один замер вместо спора.
БЕЗ_ВЫСОТ = os.environ.get('БЕЗВЫСОТ') == '1'

U = 16          # шаг сетки
HEAD = 72       # рост игрока
UP = 59         # выше не подняться: шаг 18u, прыжок около 58u
DOWN = 400      # вниз спрыгиваем откуда угодно
STEP = 24       # на сколько опора под краем коробки может быть выше своей клетки


def сетка(solid, column):
    """Возвращает (узлы, adj, X0, Y0, W, H). Узел: (cx, cy, z)."""
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
                r.append(c)
        r.sort()
        out = []
        for b, t in r:
            if out and b <= out[-1][1] + 0.5:
                if t > out[-1][1]:
                    out[-1] = (out[-1][0], t)
            else:
                out.append([b, t])
        return out

    IV = [None] * (W * H)
    for cy in range(H):
        y = Y0 + cy * U + U / 2
        for cx in range(W):
            IV[cy * W + cx] = интервалы(X0 + cx * U + U / 2, y)

    def опора(i, предел):
        """Высшая поверхность в клетке не выше предела, и просвет над ней."""
        лучш = None
        for k, (b, t) in enumerate(IV[i]):
            if t <= предел:
                пот = IV[i][k + 1][0] if k + 1 < len(IV[i]) else 1e9
                лучш = (t, пот)
        return лучш

    def потолок(i, z):
        """Нижняя граница первого объёма выше z в клетке."""
        for b, t in IV[i]:
            if b > z + 0.5:
                return b
        return 1e9

    узлы = {}
    for cy in range(H - 1):
        for cx in range(W - 1):
            блок = [cy * W + cx, cy * W + cx + 1, (cy + 1) * W + cx, (cy + 1) * W + cx + 1]
            for b0, t0 in IV[блок[0]]:
                оп = []
                for j in блок:
                    o = опора(j, t0 + STEP)
                    if o is None:
                        оп = None
                        break
                    оп.append(o[0])
                if оп is None:
                    continue
                z = max(оп)
                if any(потолок(j, z) - z < HEAD for j in блок):
                    continue
                узлы.setdefault((cx, cy), [])
                if all(abs(z - q) > 1 for q in узлы[(cx, cy)]):
                    узлы[(cx, cy)].append(z)

    adj = collections.defaultdict(list)
    D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    for (cx, cy), zs in узлы.items():
        for dx, dy in D8:
            n = (cx + dx, cy + dy)
            if n not in узлы:
                continue
            for z in zs:
                for z2 in узлы[n]:
                    if БЕЗ_ВЫСОТ or (-DOWN <= z2 - z <= UP):
                        adj[(cx, cy, z)].append((n[0], n[1], z2))
    return узлы, adj, X0, Y0, W, H


def ближайший(узлы, X0, Y0, p, r=8):
    cx, cy = int((p[0] - X0) // U), int((p[1] - Y0) // U)
    л = []
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            k = (cx + dx, cy + dy)
            if k in узлы:
                for z in узлы[k]:
                    л.append((dx * dx + dy * dy + (abs(z - p[2]) / 32) ** 2, (k[0], k[1], z)))
    л.sort()
    return л[0][1] if л else None


def волна(adj, старт):
    d = {старт: 0}
    q = collections.deque([старт])
    while q:
        c = q.popleft()
        for n in adj.get(c, ()):
            if n not in d:
                d[n] = d[c] + 1
                q.append(n)
    return d
