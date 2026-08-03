#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ТА ЖЕ метрика углов, но по VMF генератора. Сравнение с реальными картами
только тогда честное, когда обе стороны меряет один и тот же код.
"""
import sys, os, glob
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from sight_vmf import raster_vmf
from cover_c import ray_field, NDIR
from cover_d import arcs, LANE
from cover_b import CELL


def analyse(path, nsample=2000):
    Mv = raster_vmf(path)
    M = dict(g=Mv['g'], z=Mv['z'])
    g = M['g'].astype(bool)
    if g.sum() < 100:
        print(f'{os.path.basename(path)}: пол пустой, пропуск')
        return None
    yy, xx = np.nonzero(g)
    rs = np.random.RandomState(17)
    idx = rs.choice(len(yy), size=min(nsample, len(yy)), replace=False)
    pts = list(zip(yy[idx], xx[idx]))
    R = ray_field(M, pts)
    openm = R > LANE
    narc = np.array([len(arcs(openm[i])) for i in range(len(pts))])
    closed = [R[i][~openm[i]] for i in range(len(pts))]
    close_med = np.array([np.median(c) if len(c) else np.nan for c in closed])
    longest = R.max(axis=1)
    return dict(nm=os.path.basename(path), narc=narc, close=close_med,
                longest=longest, floor=int(g.sum()) * CELL * CELL)


if __name__ == '__main__':
    files = sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else 'batch/*.vmf'))
    res = []
    for f in files:
        r = analyse(f)
        if not r:
            continue
        res.append(r)
        print(f"{r['nm']:10s} пол {r['floor']/1e6:.2f}M  "
              f"1дуга {100*(r['narc']<=1).mean():4.1f}%  "
              f"2 {100*(r['narc']==2).mean():4.1f}%  "
              f"3+ {100*(r['narc']>=3).mean():4.1f}%  "
              f"закрытие {np.nanmedian(r['close']):4.0f}u  "
              f"длинный {np.median(r['longest']):5.0f}u")
    if res:
        na = np.concatenate([r['narc'] for r in res])
        cl = np.concatenate([r['close'] for r in res])
        lo = np.concatenate([r['longest'] for r in res])
        print('\n===== ГЕНЕРАТОР (сводка) =====')
        print(f'  1дуга {100*(na<=1).mean():.1f}%   2дуги {100*(na==2).mean():.1f}%   '
              f'3+ {100*(na>=3).mean():.1f}%')
        print(f'  закрытие {np.nanmedian(cl):.0f}u   длиннейший луч {np.median(lo):.0f}u')
        print('\n===== РЕАЛЬНЫЕ КАРТЫ (замер, 7 карт) =====')
        print('  1дуга 34.0%   2дуги 39.3%   3+ 26.7%')
        print('  закрытие 168u   длиннейший луч 976u')
