#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Доля клеток с 3+ дугами оказалась чувствительна к отступу растеризации.
Нужна БЕЗРАЗМЕРНАЯ метрика: равномерный отступ должен сокращать и числитель,
и знаменатель, и уходить из отношения.

Анизотропия = длиннейший луч / медианный луч по всем направлениям.
Именно её меряет раздел 2 HANDOFF (4.19-4.56 на шести картах).

Плюс чинится тест сетки: VMF теперь тоже растеризуется на 8/16/32u.
"""
import sys, os, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
import cover_b
from cover_b import raster, disk
from cover_robust import rays, sample, load_real, load_gen
from sight_vmf import raster_vmf

REAL = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def aniso(R):
    """на точку: длиннейший луч / медианный луч. Возвращаем медиану по точкам."""
    lo = np.median(R, axis=1)
    hi = R.max(axis=1)
    a = hi / np.maximum(lo, 1e-6)
    return np.median(a), np.median(hi), np.median(lo)


if __name__ == '__main__':
    NS = 900
    genfiles = sorted(glob.glob('batch/*.vmf'))[:6]

    print('===== АНИЗОТРОПИЯ (безразмерная) под тем же конфаундом =====')
    print(f'{"вариант":>34} | {"анизотр":>8}{"длинный":>9}{"медиана":>9}')

    rm = [load_real(nm) for nm in REAL]
    RR = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in rm])
    a = aniso(RR)
    print(f'{"реальные, как есть":>34} | {a[0]:8.2f}{a[1]:9.0f}{a[2]:9.0f}')
    for d in (1, 2):
        rm = [load_real(nm, dilate=d) for nm in REAL]
        rr = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in rm])
        h = aniso(rr)
        print(f'{f"реальные, нав расширен на {d*16}u":>34} | {h[0]:8.2f}{h[1]:9.0f}{h[2]:9.0f}')

    gm = [load_gen(f) for f in genfiles]
    RG = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in gm])
    b = aniso(RG)
    print(f'{"генератор, как есть":>34} | {b[0]:8.2f}{b[1]:9.0f}{b[2]:9.0f}')
    for e in (1, 2):
        gm2 = [load_gen(f, erode=e) for f in genfiles]
        gg = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in gm2])
        h = aniso(gg)
        print(f'{f"генератор, пол сужен на {e*16}u":>34} | {h[0]:8.2f}{h[1]:9.0f}{h[2]:9.0f}')

    print('\n===== ТЕСТ СЕТКИ, ИСПРАВЛЕННЫЙ (обе стороны меняют сетку) =====')
    print(f'{"сетка":>7} | {"реальные анизотр":>17} | {"генератор анизотр":>18} | разрыв')
    for cell in (8.0, 16.0, 32.0):
        cover_b.CELL = cell
        rm = [load_real(nm, cell=cell) for nm in REAL]
        rr = np.concatenate([rays(M, sample(M, NS), 32, cell) for M in rm])
        ar = aniso(rr)
        gg = []
        for f in genfiles:
            Mv = raster_vmf(f, cell=cell)
            M = dict(g=Mv['g'], z=Mv['z'])
            gg.append(rays(M, sample(M, NS), 32, cell))
        ag = aniso(np.concatenate(gg))
        print(f'{cell:7.0f} | {ar[0]:17.2f} | {ag[0]:18.2f} | {ag[0]-ar[0]:+6.2f}')
        cover_b.CELL = 16.0
