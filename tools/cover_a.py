#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""КАНАЛ A — укрытия по разметке Valve (hiding spots).
Хайдспот ставится nav_analyze в углах ходибельного меша: у стены, у ящика, у косяка.
Флаг IN_COVER = за спиной есть твёрдое укрытие. EXPOSED = точка простреливается.
Меряем: плотность, шаг между укрытиями, прижатость к стене, распределение по зонам.
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'parsers'))
from navlib2 import read_nav2, HS_IN_COVER, HS_GOOD_SNIPER, HS_IDEAL_SNIPER, HS_EXPOSED

CELL = 16.0
PH = 72.0
GOOD = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def raster(path):
    """пол на сетке 16u + карта зон"""
    r = read_nav2(path)
    A = r['areas']
    xs = [a['lo'][0] for a in A] + [a['hi'][0] for a in A]
    ys = [a['lo'][1] for a in A] + [a['hi'][1] for a in A]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    W = int((x1 - x0) / CELL) + 2
    H = int((y1 - y0) / CELL) + 2
    g = np.zeros((H, W), np.uint8)
    z = np.full((H, W), np.nan, np.float32)
    place = np.full((H, W), -1, np.int16)
    names = r['places']
    nidx = {n: i for i, n in enumerate(names)}
    for a in A:
        ax0 = int((a['lo'][0] - x0) / CELL); ax1 = int(math.ceil((a['hi'][0] - x0) / CELL))
        ay0 = int((a['lo'][1] - y0) / CELL); ay1 = int(math.ceil((a['hi'][1] - y0) / CELL))
        zz = (a['lo'][2] + a['hi'][2]) * 0.5
        g[ay0:ay1, ax0:ax1] = 1
        cur = z[ay0:ay1, ax0:ax1]
        z[ay0:ay1, ax0:ax1] = np.where(np.isnan(cur), zz, np.maximum(cur, zz))
        pi = nidx.get(a['pname'], -1)
        if pi >= 0:
            place[ay0:ay1, ax0:ax1] = pi
    return dict(g=g, z=z, place=place, names=names, W=W, H=H,
                org=(x0, y0), areas=A, nav=r)


def analyse(path):
    nm = os.path.basename(path)[:-4]
    M = raster(path)
    g, place, names = M['g'], M['place'], M['names']
    x0, y0 = M['org']
    H, W = g.shape

    # расстояние до ближайшей не-ходибельной клетки, в юнитах
    dist = ndimage.distance_transform_edt(g) * CELL

    floor_cells = int(g.sum())
    floor_units2 = floor_cells * CELL * CELL

    # --- собрать хайдспоты ---
    pts = []
    for a in M['nav']['areas']:
        for h in a['hides']:
            hx, hy, hz = h['pos']
            cx = int((hx - x0) / CELL); cy = int((hy - y0) / CELL)
            if not (0 <= cx < W and 0 <= cy < H):
                continue
            pts.append(dict(x=hx, y=hy, z=hz, cx=cx, cy=cy, f=h['flags'],
                            wall=float(dist[cy, cx]),
                            zone=names[place[cy, cx]] if place[cy, cx] >= 0 else ''))
    n = len(pts)
    incov = [p for p in pts if p['f'] & HS_IN_COVER]
    expos = [p for p in pts if p['f'] & HS_EXPOSED]
    snipe = [p for p in pts if p['f'] & (HS_GOOD_SNIPER | HS_IDEAL_SNIPER)]

    # --- шаг между укрытиями: расстояние до ближайшего соседа ---
    P = np.array([[p['x'], p['y']] for p in pts])
    nn = []
    if len(P) > 1:
        for i in range(len(P)):
            d = np.hypot(P[:, 0] - P[i, 0], P[:, 1] - P[i, 1])
            d[i] = 1e9
            nn.append(d.min())
    nn = np.array(nn)

    # то же, но только между IN_COVER
    Q = np.array([[p['x'], p['y']] for p in incov])
    nnc = []
    if len(Q) > 1:
        for i in range(len(Q)):
            d = np.hypot(Q[:, 0] - Q[i, 0], Q[:, 1] - Q[i, 1])
            d[i] = 1e9
            nnc.append(d.min())
    nnc = np.array(nnc)

    wall_all = np.array([p['wall'] for p in pts])
    wall_cov = np.array([p['wall'] for p in incov]) if incov else np.array([0.])
    wall_exp = np.array([p['wall'] for p in expos]) if expos else np.array([0.])
    # прижатость пола вообще — для сравнения
    wall_floor = dist[g > 0]

    print(f'\n=== {nm} ===')
    print(f'  пол {floor_units2/1e6:.2f}M юнитов², хайдспотов {n} '
          f'=> 1 укрытие на {floor_units2/max(n,1):.0f} юнитов² '
          f'(квадрат {math.sqrt(floor_units2/max(n,1)):.0f}u)')
    print(f'  IN_COVER {len(incov)} ({100*len(incov)/max(n,1):.0f}%)  '
          f'EXPOSED {len(expos)} ({100*len(expos)/max(n,1):.0f}%)  '
          f'SNIPER {len(snipe)} ({100*len(snipe)/max(n,1):.0f}%)')
    if len(nn):
        print(f'  шаг до ближайшего укрытия: медиана {np.median(nn):.0f}u  '
              f'кв [{np.percentile(nn,25):.0f}..{np.percentile(nn,75):.0f}]  '
              f'макс {nn.max():.0f}u')
    if len(nnc):
        print(f'  шаг только между IN_COVER:  медиана {np.median(nnc):.0f}u  '
              f'кв [{np.percentile(nnc,25):.0f}..{np.percentile(nnc,75):.0f}]')
    print(f'  расстояние до стены: пол медиана {np.median(wall_floor):.0f}u | '
          f'IN_COVER {np.median(wall_cov):.0f}u | EXPOSED {np.median(wall_exp):.0f}u')

    # --- по зонам ---
    zc = {}
    for p in pts:
        zn = p['zone'] or '(без зоны)'
        d = zc.setdefault(zn, [0, 0, 0])
        d[0] += 1
        if p['f'] & HS_IN_COVER: d[1] += 1
        if p['f'] & HS_EXPOSED: d[2] += 1
    zarea = {}
    for i, znm in enumerate(names):
        zarea[znm] = int((place == i).sum()) * CELL * CELL
    rows = []
    for zn, (t, c, e) in zc.items():
        ar = zarea.get(zn, 0)
        rows.append((t, zn, c, e, ar))
    rows.sort(reverse=True)
    print('  топ зон по числу укрытий:')
    for t, zn, c, e, ar in rows[:8]:
        dens = ar / t if t else 0
        print(f'     {zn[:22]:22s} всего {t:3d}  IN_COVER {c:3d}  '
              f'площадь {ar/1000:6.0f}k  1 укр/{dens:5.0f}u²')

    return dict(nm=nm, n=n, floor=floor_units2, incov=len(incov), expos=len(expos),
                snipe=len(snipe), nn=nn, nnc=nnc, wall_cov=wall_cov,
                wall_exp=wall_exp, wall_floor=wall_floor, pts=pts, M=M)


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    res = []
    for f in sorted(glob.glob(os.path.join(base, '*.nav'))):
        if os.path.basename(f)[:-4] not in GOOD:
            continue
        res.append(analyse(f))

    print('\n\n########## СВОДКА ##########')
    dens = [r['floor'] / r['n'] for r in res]
    print(f'плотность укрытий: медиана 1 на {np.median(dens):.0f} юнитов² '
          f'= квадрат {math.sqrt(np.median(dens)):.0f}u')
    print(f'доля IN_COVER: медиана {np.median([100*r["incov"]/r["n"] for r in res]):.0f}%')
    allnn = np.concatenate([r['nn'] for r in res])
    allnnc = np.concatenate([r['nnc'] for r in res])
    print(f'шаг между укрытиями (все карты): медиана {np.median(allnn):.0f}u, '
          f'кв [{np.percentile(allnn,25):.0f}..{np.percentile(allnn,75):.0f}]')
    print(f'шаг между IN_COVER:              медиана {np.median(allnnc):.0f}u, '
          f'кв [{np.percentile(allnnc,25):.0f}..{np.percentile(allnnc,75):.0f}]')
    wc = np.concatenate([r['wall_cov'] for r in res])
    we = np.concatenate([r['wall_exp'] for r in res])
    wf = np.concatenate([r['wall_floor'] for r in res])
    print(f'до стены: пол {np.median(wf):.0f}u | IN_COVER {np.median(wc):.0f}u | '
          f'EXPOSED {np.median(we):.0f}u')
