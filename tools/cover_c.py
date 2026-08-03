#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""КАНАЛ C — что ГЕОМЕТРИЧЕСКИ отличает укрытую точку от простреливаемой.
dust2 — единственная карта, где nav_analyze проставил ОБА флага (IN_COVER и EXPOSED)
на одном и том же наборе точек. Это контролируемое сравнение: один генератор,
одни правила, разница только в геометрии вокруг точки.

Меряем для каждой точки «угловое закрытие»: из 32 направлений считаем, сколько
упирается в препятствие ближе, чем R. Плюс длину самого длинного луча.
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, CELL
from navlib2 import HS_IN_COVER, HS_EXPOSED, HS_GOOD_SNIPER, HS_IDEAL_SNIPER

PH = 72.0
NDIR = 32


def ray_field(M, pts, maxlen_u=2048):
    """для списка точек (cy,cx): длины лучей по NDIR направлениям.
       Луч рвётся о не-пол ИЛИ о подъём выше роста."""
    g = M['g'].astype(bool)
    z = np.where(np.isnan(M['z']), -1e6, M['z'])
    H, W = g.shape
    maxc = int(maxlen_u / CELL)
    out = np.zeros((len(pts), NDIR), np.float32)
    P = np.array(pts, np.float32)
    for k in range(NDIR):
        ang = 2 * math.pi * k / NDIR
        dy, dx = math.sin(ang), math.cos(ang)
        alive = np.ones(len(pts), bool)
        cur = np.zeros(len(pts), np.float32)
        zy = z[P[:, 0].astype(int), P[:, 1].astype(int)]
        for s in range(1, maxc):
            yy = (P[:, 0] + dy * s).astype(int)
            xx = (P[:, 1] + dx * s).astype(int)
            ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
            yy = np.clip(yy, 0, H - 1); xx = np.clip(xx, 0, W - 1)
            walk = g[yy, xx] & ok
            zz = z[yy, xx]
            blocked = (~walk) | (zz - zy > PH)
            newly = alive & blocked
            cur[newly] = s * CELL
            alive &= ~blocked
            if not alive.any():
                break
        cur[alive] = maxc * CELL
        out[:, k] = cur
    return out


def collect(path):
    M = raster(path)
    g = M['g'].astype(bool)
    x0, y0 = M['org']
    H, W = g.shape
    groups = {'IN_COVER': [], 'EXPOSED': [], 'SNIPER': [], 'NONE': []}
    for a in M['nav']['areas']:
        for h in a['hides']:
            hx, hy, _ = h['pos']
            cx = int((hx - x0) / CELL); cy = int((hy - y0) / CELL)
            if not (0 <= cx < W and 0 <= cy < H) or not g[cy, cx]:
                continue
            f = h['flags']
            if f & HS_IN_COVER: groups['IN_COVER'].append((cy, cx))
            elif f & HS_EXPOSED: groups['EXPOSED'].append((cy, cx))
            elif f & (HS_GOOD_SNIPER | HS_IDEAL_SNIPER): groups['SNIPER'].append((cy, cx))
            else: groups['NONE'].append((cy, cx))
    # контроль: случайные точки пола
    yy, xx = np.nonzero(g)
    rs = np.random.RandomState(3)
    idx = rs.choice(len(yy), size=min(1500, len(yy)), replace=False)
    groups['СЛУЧАЙНО'] = list(zip(yy[idx], xx[idx]))
    return M, groups


def describe(name, M, pts, R_close=256.0):
    if not pts:
        return None
    R = ray_field(M, pts)
    closed = (R < R_close).sum(axis=1) / NDIR      # доля направлений, закрытых ближе R
    longest = R.max(axis=1)
    median_ray = np.median(R, axis=1)
    print(f'   {name:11s} n={len(pts):4d}  '
          f'закрыто<{R_close:.0f}u: {100*np.median(closed):4.0f}% направлений  '
          f'[кв {100*np.percentile(closed,25):3.0f}..{100*np.percentile(closed,75):3.0f}]  '
          f'длиннейший луч {np.median(longest):5.0f}u  '
          f'типичный луч {np.median(median_ray):4.0f}u')
    return dict(name=name, closed=closed, longest=longest, med=median_ray)


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    for nm in (sys.argv[1:] or ['de_dust2_v16_CORRECT']):
        print(f'\n=== {nm} ===')
        M, groups = collect(os.path.join(base, nm + '.nav'))
        res = {}
        for k in ['IN_COVER', 'EXPOSED', 'SNIPER', 'NONE', 'СЛУЧАЙНО']:
            r = describe(k, M, groups[k])
            if r: res[k] = r
        if 'IN_COVER' in res and 'EXPOSED' in res:
            a, b = res['IN_COVER'], res['EXPOSED']
            print(f'\n   РАЗНИЦА IN_COVER vs EXPOSED:')
            print(f'     закрытых направлений: {100*np.median(a["closed"]):.0f}% против '
                  f'{100*np.median(b["closed"]):.0f}%')
            print(f'     длиннейший луч:       {np.median(a["longest"]):.0f}u против '
                  f'{np.median(b["longest"]):.0f}u')
            # порог разделения
            allc = np.concatenate([a['closed'], b['closed']])
            lab = np.concatenate([np.ones(len(a['closed'])), np.zeros(len(b['closed']))])
            best, bt = 0, 0
            for t in np.unique(allc):
                acc = ((allc >= t) == (lab == 1)).mean()
                if acc > best: best, bt = acc, t
            print(f'     порог по закрытости {100*bt:.0f}% делит их с точностью {100*best:.0f}%')
