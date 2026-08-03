#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ВЕРДИКТ, СВОБОДНЫЙ ОТ КОНФАУНДА.

Все прежние сравнения гибли на том, что реальные карты меряются по наву,
а генератор по VMF. Здесь сравниваются не абсолютные величины, а ОТНОШЕНИЯ
внутри одной карты. Представление сокращается.

Вопрос: помогает ли прижиматься к геометрии?
  берём клетки пола, СОСЕДНИЕ с непроходимым  -> доля односторонних позиций
  делим на ту же долю по всему полу            -> lift
lift ~ 1   — прижиматься бессмысленно, укрытия не работают
lift ~ 1.9 — как на реальных картах по разметке Valve

Каждая карта меряется своим растром и сравнивается сама с собой.
"""
import sys, os, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_robust import rays, sample, load_real, load_gen
from cover_d import arcs

REAL = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']
K = 512.0 / 208.0


def lift(M, cell, ns=900):
    g = M['g'].astype(bool)
    if g.sum() < 500:
        return None
    # клетки пола, соседние с непроходимым
    edge = g & ~ndimage.binary_erosion(g, np.ones((3, 3), bool))
    ye, xe = np.nonzero(edge)
    yy, xx = np.nonzero(g)
    rs = np.random.RandomState(23)
    if len(ye) < 50:
        return None
    ie = rs.choice(len(ye), size=min(ns, len(ye)), replace=False)
    ia = rs.choice(len(yy), size=min(ns, len(yy)), replace=False)
    pe = list(zip(ye[ie], xe[ie]))
    pa = list(zip(yy[ia], xx[ia]))

    Ra = rays(M, pa, 32, cell, maxlen_u=3000)
    lane = K * np.median(np.median(Ra, axis=1))     # масштаб карты — по всему полу
    Re = rays(M, pe, 32, cell, maxlen_u=3000)

    fa = np.mean([len(arcs(Ra[i] > lane)) <= 1 for i in range(len(Ra))])
    fe = np.mean([len(arcs(Re[i] > lane)) <= 1 for i in range(len(Re))])
    return fe, fa, (fe / fa if fa > 0 else np.nan), 100.0 * edge.sum() / g.sum()


if __name__ == '__main__':
    CELL = float(sys.argv[1]) if len(sys.argv) > 1 else 8.0
    print(f'сетка {CELL:.0f}u.  lift = (односторонних у края) / (односторонних по всему полу)\n')
    print(f'{"карта":>26} | {"у края":>7}{"весь пол":>9}{"lift":>7}{"доля края":>10}')
    print('-' * 62)
    rl = []
    for nm in REAL:
        M = load_real(nm)
        if CELL != 16.0:
            from cover_grid import raster_mode
            M = raster_mode(os.path.join(os.path.dirname(__file__), '..',
                                         'nav_files', nm + '.nav'), CELL, 'wide')
        r = lift(M, CELL)
        if not r: continue
        rl.append(r)
        print(f'{nm:>26} | {100*r[0]:6.1f}%{100*r[1]:8.1f}%{r[2]:7.2f}{r[3]:9.1f}%')
    print('-' * 62)
    gl = []
    for f in sorted(glob.glob('batch/*.vmf'))[:6]:
        from sight_vmf import raster_vmf
        Mv = raster_vmf(f, cell=CELL)
        M = dict(g=Mv['g'], z=Mv['z'])
        r = lift(M, CELL)
        if not r: continue
        gl.append(r)
        print(f'{os.path.basename(f):>26} | {100*r[0]:6.1f}%{100*r[1]:8.1f}%{r[2]:7.2f}{r[3]:9.1f}%')

    a = np.array(rl); b = np.array(gl)
    print('=' * 62)
    print(f'{"РЕАЛЬНЫЕ":>26} | {100*a[:,0].mean():6.1f}%{100*a[:,1].mean():8.1f}%'
          f'{a[:,2].mean():7.2f}{a[:,3].mean():9.1f}%   [{a[:,2].min():.2f}..{a[:,2].max():.2f}]')
    print(f'{"ГЕНЕРАТОР":>26} | {100*b[:,0].mean():6.1f}%{100*b[:,1].mean():8.1f}%'
          f'{b[:,2].mean():7.2f}{b[:,3].mean():9.1f}%   [{b[:,2].min():.2f}..{b[:,2].max():.2f}]')
    ov = not (b[:,2].min() > a[:,2].max() or b[:,2].max() < a[:,2].min())
    print(f'\nдиапазоны lift {"ПЕРЕКРЫВАЮТСЯ" if ov else "не перекрываются"}')
