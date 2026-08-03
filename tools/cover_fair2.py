#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ГЛАВНЫЙ ВЫВОД НА МЕЛКОЙ СЕТКЕ.
На 16u представление не сошлось: wide и strict расходятся на 15 пунктов по стенам.
Истина между ними. Значит вывод обязан держаться при ОБОИХ округлениях на мелкой сетке.

Если генератор хуже реальных и при wide, и при strict — вывод устойчив.
Если знак зависит от округления — вывода нет.
"""
import sys, os, glob, time
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from cover_grid import raster_mode, REAL
from cover_robust import rays, sample
from cover_d import arcs
from sight_vmf import raster_vmf

K = 512.0 / 208.0


def hist_norm(R, k=K):
    lane = k * np.median(np.median(R, axis=1))
    openm = R > lane
    na = np.array([len(arcs(openm[i])) for i in range(len(R))])
    return (100 * (na <= 1).mean(), 100 * (na == 2).mean(),
            100 * (na >= 3).mean(), lane)


def aniso(R):
    return float(np.median(R.max(axis=1) / np.maximum(np.median(R, axis=1), 1e-6)))


if __name__ == '__main__':
    CELL = float(sys.argv[1]) if len(sys.argv) > 1 else 8.0
    NS = 700
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    genfiles = sorted(glob.glob('batch/*.vmf'))[:6]

    print(f'сетка {CELL:.0f}u,  порог = {K:.2f} x медианный луч карты\n')
    res = {}
    for mode in ('wide', 'strict'):
        rows = []
        for nm in REAL:
            M = raster_mode(os.path.join(base, nm + '.nav'), CELL, mode)
            if M['g'].sum() < 500:
                continue
            R = rays(M, sample(M, NS), 32, CELL, maxlen_u=3000)
            h = hist_norm(R)
            rows.append((h[0], h[1], h[2], aniso(R), h[3]))
        a = np.array(rows)
        res[mode] = a
        print(f'РЕАЛЬНЫЕ, округление {mode:6s} | 1дуга {a[:,0].mean():5.1f}  '
              f'2дуги {a[:,1].mean():5.1f}  3+ {a[:,2].mean():5.1f}  '
              f'[{a[:,2].min():.1f}..{a[:,2].max():.1f}]  анизотр {a[:,3].mean():.2f}')

    t0 = time.time()
    grows = []
    for f in genfiles:
        Mv = raster_vmf(f, cell=CELL)
        M = dict(g=Mv['g'], z=Mv['z'])
        if M['g'].sum() < 500:
            continue
        R = rays(M, sample(M, NS), 32, CELL, maxlen_u=3000)
        h = hist_norm(R)
        grows.append((h[0], h[1], h[2], aniso(R), h[3]))
    ga = np.array(grows)
    print(f'ГЕНЕРАТОР (точечный отбор) | 1дуга {ga[:,0].mean():5.1f}  '
          f'2дуги {ga[:,1].mean():5.1f}  3+ {ga[:,2].mean():5.1f}  '
          f'[{ga[:,2].min():.1f}..{ga[:,2].max():.1f}]  анизотр {ga[:,3].mean():.2f}')
    print(f'   (растеризация VMF заняла {time.time()-t0:.0f} c)')

    print('\n===== ВЕРДИКТ =====')
    for mode in ('wide', 'strict'):
        a = res[mode]
        d = ga[:, 2].mean() - a[:, 2].mean()
        overlap = not (ga[:, 2].min() > a[:, 2].max() or ga[:, 2].max() < a[:, 2].min())
        print(f'  против {mode:6s}: разрыв по 3+ {d:+5.1f}  '
              f'диапазоны {"ПЕРЕКРЫВАЮТСЯ" if overlap else "не перекрываются"}')
    dw = ga[:, 2].mean() - res['wide'][:, 2].mean()
    ds = ga[:, 2].mean() - res['strict'][:, 2].mean()
    if dw > 0 and ds > 0:
        print(f'  знак одинаков при обоих округлениях -> вывод УСТОЙЧИВ, '
              f'разрыв в диапазоне {min(dw,ds):+.1f}..{max(dw,ds):+.1f}')
    else:
        print(f'  ЗНАК ЗАВИСИТ ОТ ОКРУГЛЕНИЯ -> вывода нет')
