"""Реальные карты на клетке 16u — тем же прибором, что и генератор.

До сих пор числа реальных карт брались по наву (сетка 2u) или по геометрии (8u),
а числа генератора — по его растру. Разные приборы, сравнивать нельзя: это ошибка
§5.4, на которой сгорело главное сравнение проекта. Здесь нав растеризуется
на 16u и считаются РОВНО те же величины, что и в браузере.

    python3 tools/ref16.py [клетка]
"""
import sys, os, glob
sys.path.insert(0, os.path.dirname(__file__))
from navlib2 import read_nav2

CELL = int(sys.argv[1]) if len(sys.argv) > 1 else 16

FILES = [('dust2','data/nav/de_dust2_v16_CORRECT.nav'), ('mirage','data/nav/de_mirage.nav'),
         ('inferno','data/nav/de_inferno.nav'), ('ancient','data/nav/de_ancient.nav'),
         ('anubis','data/nav/cs2_anubis.nav'), ('cache','data/nav/de_cache.nav'),
         ('overpass','data/nav/de_overpass_SUSPECT.nav'), ('tuscan','data/nav/de_tuscan.nav'),
         ('nuke','data/nav/de_nuke_rmc.nav')]

def raster(path, cell, mode='touch'):
    """mode='touch' — клетка считается полом, если её задела ЛЮБАЯ область нава.
       Такая растеризация ЗАКЛЕИВАЕТ дыры мельче клетки: ящик, колонну, машину.
       mode='center' — пол, только если центр клетки внутри области. Дыры остаются.
       Разница между этими двумя режимами и есть ответ на вопрос, почему числа
       на 2u и на 16u расходятся вчетверо (SVODKA_2 §5.5: нав дырявый, каждое
       стоящее тело — дыра, и метрика ширины почти целиком определяется тем,
       дырявит ли мебель маску)."""
    nav = read_nav2(path)
    ar = nav['areas'] if isinstance(nav, dict) and 'areas' in nav else nav
    xs = [min(a['nw'][0], a['se'][0]) for a in ar] + [max(a['nw'][0], a['se'][0]) for a in ar]
    ys = [min(a['nw'][1], a['se'][1]) for a in ar] + [max(a['nw'][1], a['se'][1]) for a in ar]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    W = int((x1 - x0) // cell) + 2
    H = int((y1 - y0) // cell) + 2
    g = bytearray(W * H)
    for a in ar:
        ax0, ax1 = sorted((a['nw'][0], a['se'][0]))
        ay0, ay1 = sorted((a['nw'][1], a['se'][1]))
        for cy in range(int((ay0 - y0) // cell), int((ay1 - y0) // cell) + 1):
            row = cy * W
            for cx in range(int((ax0 - x0) // cell), int((ax1 - x0) // cell) + 1):
                if not (0 <= cx < W and 0 <= cy < H):
                    continue
                if mode == 'center':
                    px = x0 + (cx + 0.5) * cell
                    py = y0 + (cy + 0.5) * cell
                    if not (ax0 <= px <= ax1 and ay0 <= py <= ay1):
                        continue
                g[row + cx] = 1
    return g, W, H

def metrics(g, W, H, cell):
    widths, rays = [], []
    for y in range(H):
        row = y * W
        s = -1
        for x in range(W + 1):
            on = x < W and g[row + x]
            if on and s < 0: s = x
            elif not on and s >= 0:
                rays.append((x - s) * cell); s = -1
    for x in range(W):
        s = -1
        for y in range(H + 1):
            on = y < H and g[y * W + x]
            if on and s < 0: s = y
            elif not on and s >= 0:
                rays.append((y - s) * cell); s = -1
    # ширина в точке = min(свободный прогон по X, по Y)
    runx = bytearray(W * H); runy = bytearray(W * H)
    RX = [0] * (W * H); RY = [0] * (W * H)
    for y in range(H):
        row = y * W; x = 0
        while x < W:
            if not g[row + x]: x += 1; continue
            s = x
            while x < W and g[row + x]: x += 1
            for k in range(s, x): RX[row + k] = x - s
    for x in range(W):
        y = 0
        while y < H:
            if not g[y * W + x]: y += 1; continue
            s = y
            while y < H and g[y * W + x]: y += 1
            for k in range(s, y): RY[k * W + x] = y - s
    # ЛОКАЛЬНАЯ ШИРИНА = 2 x расстояние до ближайшей не-половой клетки.
    # Это то, что меряет measure.py словами «ширина на срединной оси», и это
    # СОВСЕМ не то же самое, что свободный прогон по осям: в зале 400x400
    # прогон даёт 400 в каждой точке, а локальная ширина у стены почти ноль.
    # Медиана по всем клеткам поэтому расходится в разы. Считаем обе.
    INF = 1 << 29
    dist = [0 if not g[i] else INF for i in range(W * H)]
    for y in range(H):
        row = y * W
        for x in range(W):
            i = row + x
            if not g[i]: continue
            best = dist[i]
            if x: best = min(best, dist[i - 1] + 1)
            if y: best = min(best, dist[i - W] + 1)
            dist[i] = best
    for y in range(H - 1, -1, -1):
        row = y * W
        for x in range(W - 1, -1, -1):
            i = row + x
            if not g[i]: continue
            best = dist[i]
            if x < W - 1: best = min(best, dist[i + 1] + 1)
            if y < H - 1: best = min(best, dist[i + W] + 1)
            dist[i] = best
    lw = []
    floor = 0
    for i in range(W * H):
        if g[i]:
            floor += 1
            widths.append(min(RX[i], RY[i]) * cell)
            lw.append(2 * dist[i] * cell)
    lw.sort()
    widths.sort(); rays.sort()
    q = lambda t, a: a[int(len(a) * t)] if a else 0
    # оболочка: замыкание маски пола радиусом R — расширить и сжать
    R = max(1, 256 // cell)
    dil = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            if not g[y * W + x]: continue
            for oy in range(-R, R + 1):
                yy = y + oy
                if yy < 0 or yy >= H: continue
                for ox in range(-R, R + 1):
                    xx = x + ox
                    if 0 <= xx < W: dil[yy * W + xx] = 1
    shell = sum(dil)
    return dict(
        пол_k=round(floor * cell * cell / 1000), мед=q(.5, widths), p90=q(.9, widths),
        м192=round(100 * sum(1 for v in widths if v < 192) / max(1, len(widths))),
        б448=round(100 * sum(1 for v in widths if v > 448) / max(1, len(widths))),
        локМед=q(.5, lw), локP90=q(.9, lw),
        лучМед=q(.5, rays), лучP90=q(.9, rays), лучМакс=rays[-1] if rays else 0,
        полОболочка=round(100 * floor / max(1, shell)))

if __name__ == '__main__':
    for mode in ('touch', 'center'):
        print(f'\nКЛЕТКА {CELL}u, режим {mode!r} — '
              + ('дыры от мебели ЗАКЛЕЕНЫ' if mode == 'touch' else 'дыры от мебели СОХРАНЕНЫ') + '\n')
        hdr = ['карта', 'пол_k', 'прогонМед', 'локШирМед', 'локP90', '<192u', 'лучМакс', 'пол/обол']
        print('  '.join(h.ljust(9) for h in hdr))
        for name, path in FILES:
            if not os.path.exists(path): continue
            g, W, H = raster(path, CELL, mode)
            m = metrics(g, W, H, CELL)
            print('  '.join(str(v).ljust(9) for v in
                  [name, m['пол_k'], m['мед'], m['локМед'], m['локP90'], f"{m['м192']}%",
                   m['лучМакс'], f"{m['полОболочка']}%"]))
