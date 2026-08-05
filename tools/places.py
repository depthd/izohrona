"""МЕСТА: во что игрок тычет пальцем и называет одним словом.

Зона — решение планировщика (лейн, сайт, мид). Место — свойство геометрии:
область, отделённая от соседей сужением. Считается водоразделом по расстоянию
до стены: пики расстояния — середины комнат, сёдла — горловины между ними.
Две области сливаются, если разделяющее их седло почти так же широко, как сами
области: значит это не граница, а продолжение той же комнаты.

Тут это гоняется по настоящим навам, чтобы подобрать пороги на реальных картах,
а не на генераторе. В сборку уходит тот же алгоритм с теми же числами.

    python3 tools/places.py [клетка] [minR_u] [mergeK]
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from ref16 import raster, FILES
from navlib2 import read_nav2

CELL = int(sys.argv[1]) if len(sys.argv) > 1 else 16
MINR_U = int(sys.argv[2]) if len(sys.argv) > 2 else 96      # место шире этого хоть где-то
MERGEK = float(sys.argv[3]) if len(sys.argv) > 3 else 0.72
S2 = 1.4142
D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))


def dt(g, W, H):
    INF = 1e9
    D = [0.0 if not g[i] else INF for i in range(W * H)]
    for y in range(1, H):
        for x in range(1, W - 1):
            i = y * W + x
            if g[i]:
                D[i] = min(D[i], D[i - W] + 1, D[i - 1] + 1, D[i - W - 1] + S2, D[i - W + 1] + S2)
    for y in range(H - 2, -1, -1):
        for x in range(W - 2, 0, -1):
            i = y * W + x
            if g[i]:
                D[i] = min(D[i], D[i + W] + 1, D[i + 1] + 1, D[i + W + 1] + S2, D[i + W - 1] + S2)
    return D


def places(g, W, H, cell, minR_u=MINR_U, mergeK=MERGEK):
    N = W * H
    D = dt(g, W, H)
    minR = minR_u / cell
    lab = [-1] * N
    peaks = []
    order = sorted((i for i in range(N) if g[i]), key=lambda i: -D[i])

    def seed_round(thresh):
        """посадить пики: клетка-максимум, вокруг которой в радиусе D никого нет"""
        for i in order:
            if D[i] < thresh or lab[i] >= 0:
                continue
            r = max(1, int(round(D[i])))
            x, y = i % W, i // W
            ok = True
            for oy in range(-r, r + 1):
                ny = y + oy
                if ny < 0 or ny >= H:
                    continue
                for ox in range(-r, r + 1):
                    nx = x + ox
                    if 0 <= nx < W and lab[ny * W + nx] >= 0:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                continue
            pid = len(peaks)
            peaks.append(dict(x=x, y=y, R=D[i]))
            for oy in range(-r, r + 1):
                ny = y + oy
                if ny < 0 or ny >= H:
                    continue
                for ox in range(-r, r + 1):
                    nx = x + ox
                    if 0 <= nx < W and ox * ox + oy * oy <= r * r:
                        j = ny * W + nx
                        if g[j] and lab[j] < 0:
                            lab[j] = pid

    def flood():
        """приоритетная заливка: метка расползается ВНИЗ по расстоянию до стены"""
        B = {}
        for i in range(N):
            if lab[i] >= 0:
                B.setdefault(int(round(D[i] * 2)), []).append(i)
        while B:
            k = max(B)
            q = B.pop(k)
            h = 0
            while h < len(q):
                i = q[h]; h += 1
                x, y = i % W, i // W
                for dx, dy in D8:
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= W or ny >= H:
                        continue
                    j = ny * W + nx
                    if not g[j] or lab[j] >= 0:
                        continue
                    lab[j] = lab[i]
                    kk = min(k, int(round(D[j] * 2)))
                    if kk == k:
                        q.append(j)
                    else:
                        B.setdefault(kk, []).append(j)

    seed_round(minR)
    flood()
    # остатки: компоненты целиком уже minR своего пика не получили
    while True:
        rest = [i for i in order if lab[i] < 0]
        if not rest:
            break
        seed_round(D[rest[0]] - 1e-9)
        flood()

    # ---- слияние по седлу ----
    par = list(range(len(peaks)))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a

    saddle = {}
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if not g[i]:
                continue
            a = lab[i]
            for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= W or ny >= H:
                    continue
                j = ny * W + nx
                if not g[j]:
                    continue
                b = lab[j]
                if a == b:
                    continue
                k = (min(a, b), max(a, b))
                v = min(D[i], D[j])
                if v > saddle.get(k, -1):
                    saddle[k] = v
    changed = True
    while changed:
        changed = False
        for (a, b), s in sorted(saddle.items(), key=lambda kv: -kv[1]):
            ra, rb = find(a), find(b)
            if ra == rb:
                continue
            R = min(peaks[ra]['R'], peaks[rb]['R'])
            if s >= mergeK * R:
                par[max(ra, rb)] = min(ra, rb)
                peaks[min(ra, rb)]['R'] = max(peaks[ra]['R'], peaks[rb]['R'])
                changed = True

    area = {}
    for i in range(N):
        if g[i]:
            r = find(lab[i])
            area[r] = area.get(r, 0) + 1
    # крошки прилипают к соседу — место меньше 96k u² словом не называют
    small = {r for r, a in area.items() if a * cell * cell < 96000}
    for (a, b), s in sorted(saddle.items(), key=lambda kv: -kv[1]):
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        if ra in small or rb in small:
            par[max(ra, rb)] = min(ra, rb)
            small.discard(ra); small.discard(rb)
    area = {}
    for i in range(N):
        if g[i]:
            r = find(lab[i])
            area[r] = area.get(r, 0) + 1
    return lab, [find(x) for x in range(len(peaks))], area, D


print(f'\nМЕСТА, клетка {CELL}u, minR {MINR_U}u, слияние при седле >= {MERGEK} радиуса\n')
print('  '.join(h.ljust(10) for h in ['карта', 'пол_k', 'мест', 'k u²/место', 'имён в наве', 'крупнейшее']))
for name, pth in FILES:
    if not os.path.exists(pth):
        continue
    g, W, H = raster(pth, CELL, 'touch')
    lab, roots, area, D = places(g, W, H, CELL)
    n = len(area)
    tot = sum(area.values())
    nav = len([x for x in read_nav2(pth)['places'] if x])
    big = max(area.values()) * CELL * CELL // 1000
    print('  '.join(str(v).ljust(10) for v in
          [name, round(tot * CELL * CELL / 1000), n,
           round(tot * CELL * CELL / 1000 / max(1, n)), nav, big]))
