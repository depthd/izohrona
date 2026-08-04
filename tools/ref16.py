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

def raster(path, cell):
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
                if 0 <= cx < W and 0 <= cy < H:
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
    floor = 0
    for i in range(W * H):
        if g[i]:
            floor += 1
            widths.append(min(RX[i], RY[i]) * cell)
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
        лучМед=q(.5, rays), лучP90=q(.9, rays), лучМакс=rays[-1] if rays else 0,
        полОболочка=round(100 * floor / max(1, shell)))

print(f'РЕАЛЬНЫЕ КАРТЫ, нав растеризован на клетке {CELL}u — тот же прибор, что у генератора\n')
hdr = ['карта', 'пол_k', 'мед', 'p90', '<192u', '>448u', 'лучМед', 'лучP90', 'лучМакс', 'пол/обол']
print('  '.join(h.ljust(8) for h in hdr))
for name, path in FILES:
    if not os.path.exists(path): continue
    g, W, H = raster(path, CELL)
    m = metrics(g, W, H, CELL)
    print('  '.join(str(v).ljust(8) for v in
          [name, m['пол_k'], m['мед'], m['p90'], f"{m['м192']}%", f"{m['б448']}%",
           m['лучМед'], m['лучP90'], m['лучМакс'], f"{m['полОболочка']}%"]))
