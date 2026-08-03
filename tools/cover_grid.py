#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""СХОДИМОСТЬ ПО СЕТКЕ. Замечание: на 96u и на 16u мираж — две разные карты.
Проверяем, сошлось ли на 16u, или стены всё ещё стираются.

Плюс проверяем ОКРУГЛЕНИЕ. Унаследованный из sight.py растр раздувает каждую
область нава наружу (floor для низа, ceil для верха). Тонкие стены между
соседними областями съедаются с обеих сторон.
  'wide'   — как было: int(lo), ceil(hi). Область раздувается.
  'strict' — ceil(lo), int(hi). Только клетки, целиком лежащие в области.
Истина между ними. Расхождение = цена представления.
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'parsers'))
from navlib2 import read_nav2

REAL = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def raster_mode(path, cell, mode='wide'):
    r = read_nav2(path)
    A = r['areas']
    xs = [a['lo'][0] for a in A] + [a['hi'][0] for a in A]
    ys = [a['lo'][1] for a in A] + [a['hi'][1] for a in A]
    x0, y0 = min(xs), min(ys)
    W = int((max(xs) - x0) / cell) + 2
    H = int((max(ys) - y0) / cell) + 2
    g = np.zeros((H, W), np.uint8)
    z = np.full((H, W), np.nan, np.float32)
    for a in A:
        lx = (a['lo'][0] - x0) / cell; hx = (a['hi'][0] - x0) / cell
        ly = (a['lo'][1] - y0) / cell; hy = (a['hi'][1] - y0) / cell
        if mode == 'wide':
            ax0, ax1 = int(lx), int(math.ceil(hx))
            ay0, ay1 = int(ly), int(math.ceil(hy))
        else:
            ax0, ax1 = int(math.ceil(lx)), int(hx)
            ay0, ay1 = int(math.ceil(ly)), int(hy)
        if ax1 <= ax0 or ay1 <= ay0:
            continue
        zz = (a['lo'][2] + a['hi'][2]) * 0.5
        g[ay0:ay1, ax0:ax1] = 1
        cur = z[ay0:ay1, ax0:ax1]
        z[ay0:ay1, ax0:ax1] = np.where(np.isnan(cur), zz, np.maximum(cur, zz))
    return dict(g=g, z=z, org=(x0, y0), cell=cell)


def wall_stats(M):
    """доля 'стен' внутри игровой оболочки — то, что стирается на грубой сетке"""
    g = M['g'].astype(bool)
    cell = M['cell']
    r = max(1, int(round(128.0 / cell)))
    y, x = np.ogrid[-r:r+1, -r:r+1]
    d = (x*x + y*y <= r*r)
    env = ndimage.binary_dilation(g, d)
    env = ndimage.binary_fill_holes(env)
    wall = env & ~g
    return 100.0 * wall.sum() / max(1, env.sum()), g.sum() * cell * cell


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    print('Доля СТЕН внутри игровой оболочки, % — если растёт, сетка ещё не сошлась\n')
    header = f'{"карта":>24} |' + ''.join(f'{c:>7}u' for c in (96, 48, 24, 16, 8, 4))
    print(header); print('-' * len(header))
    for mode in ('wide', 'strict'):
        print(f'--- округление {mode} ---')
        rows = []
        for nm in REAL:
            p = os.path.join(base, nm + '.nav')
            vals = []
            for c in (96., 48., 24., 16., 8., 4.):
                w, fl = wall_stats(raster_mode(p, c, mode))
                vals.append(w)
            rows.append(vals)
            print(f'{nm:>24} |' + ''.join(f'{v:7.1f} ' for v in vals))
        arr = np.array(rows)
        print(f'{"СРЕДНЕЕ":>24} |' + ''.join(f'{v:7.1f} ' for v in arr.mean(axis=0)))
        print()

    print('\nПлощадь ПОЛА (M юнитов²) — раздувание округления видно напрямую\n')
    print(f'{"карта":>24} |' + ''.join(f'{c:>8}u' for c in (96, 16, 8, 4)))
    for nm in REAL:
        p = os.path.join(base, nm + '.nav')
        line = f'{nm:>24} |'
        for c in (96., 16., 8., 4.):
            _, flw = wall_stats(raster_mode(p, c, 'wide'))
            _, fls = wall_stats(raster_mode(p, c, 'strict'))
            line += f'{flw/1e6:5.1f}/{fls/1e6:<3.1f}'
        print(line)
    print('   (слева wide, справа strict)')
