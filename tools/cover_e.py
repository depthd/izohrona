#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""КАНАЛ E — ПОЛЕ УГЛОВ по всему полу. Без опоры на хайдспоты, чистая геометрия.
Для каждой клетки пола: сколько связных дуг с прострелом >512u её достают.
1 дуга = позиция, где держишь одно направление. 3+ = тебя достают отовсюду.

Плюс: на каком расстоянии закрывается пространство в НЕпростреливаемых направлениях
      (это и есть рабочая дистанция до укрытия).
Плюс: как далеко от пола до ближайшей укрытой точки.
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, CELL
from cover_c import ray_field, NDIR
from cover_d import arcs, LANE
from navlib2 import HS_IN_COVER

GOOD = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']

SITE = ('bombsite',)
SPAWN = ('tspawn', 'ctspawn')


def zone_kind(n):
    l = n.lower().replace(' ', '')
    if any(s in l for s in SITE):
        return 'САЙТ'
    if l in SPAWN:
        return 'СПАВН'
    if 'middle' in l or l == 'mid':
        return 'МИД'
    return 'прочее'


def analyse(path, nsample=2500):
    nm = os.path.basename(path)[:-4]
    M = raster(path)
    g = M['g'].astype(bool)
    place, names = M['place'], M['names']
    x0, y0 = M['org']
    H, W = g.shape

    yy, xx = np.nonzero(g)
    rs = np.random.RandomState(17)
    idx = rs.choice(len(yy), size=min(nsample, len(yy)), replace=False)
    pts = list(zip(yy[idx], xx[idx]))
    R = ray_field(M, pts)

    openm = R > LANE
    narc = np.array([len(arcs(openm[i])) for i in range(len(pts))])
    # дистанция закрытия в НЕпростреливаемых направлениях
    closed_len = [R[i][~openm[i]] for i in range(len(pts))]
    close_med = np.array([np.median(c) if len(c) else np.nan for c in closed_len])
    longest = R.max(axis=1)

    kinds = np.array([zone_kind(names[place[c]]) if place[c] >= 0 else 'прочее'
                      for c in pts], dtype=object)

    # расстояние от пола до ближайшей укрытой точки
    cov = np.zeros_like(g)
    for a in M['nav']['areas']:
        for h in a['hides']:
            if not (h['flags'] & HS_IN_COVER):
                continue
            hx, hy, _ = h['pos']
            cx = int((hx - x0) / CELL); cy = int((hy - y0) / CELL)
            if 0 <= cx < W and 0 <= cy < H:
                cov[cy, cx] = True
    dcov = ndimage.distance_transform_edt(~cov) * CELL
    dfloor = dcov[g]

    tot = len(narc)
    d1 = 100 * (narc <= 1).mean(); d2 = 100 * (narc == 2).mean(); d3 = 100 * (narc >= 3).mean()
    print(f'\n=== {nm} ===')
    print(f'  дуг на клетку пола:  1 или 0: {d1:4.1f}%   2: {d2:4.1f}%   3+: {d3:4.1f}%   '
          f'(медиана {np.median(narc):.0f})')
    print(f'  закрытие в непростреливаемых направлениях: медиана {np.nanmedian(close_med):.0f}u  '
          f'кв [{np.nanpercentile(close_med,25):.0f}..{np.nanpercentile(close_med,75):.0f}]')
    print(f'  длиннейший луч: медиана {np.median(longest):.0f}u  '
          f'=> анизотропия {np.median(longest)/max(np.nanmedian(close_med),1):.2f}')
    print(f'  до ближайшей укрытой точки: медиана {np.median(dfloor):.0f}u  '
          f'p90 {np.percentile(dfloor,90):.0f}u  макс {dfloor.max():.0f}u')
    for k in ['САЙТ', 'МИД', 'СПАВН', 'прочее']:
        m = (kinds == k)
        if m.sum() < 30:
            continue
        print(f'     {k:7s} n={m.sum():4d}  дуг медиана {np.median(narc[m]):.0f}  '
              f'1дуга {100*(narc[m]<=1).mean():4.1f}%  3+ {100*(narc[m]>=3).mean():4.1f}%  '
              f'закрытие {np.nanmedian(close_med[m]):4.0f}u  '
              f'длинный луч {np.median(longest[m]):5.0f}u')
    return dict(nm=nm, narc=narc, kinds=kinds, close=close_med, longest=longest, dfloor=dfloor)


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    res = []
    for f in sorted(glob.glob(os.path.join(base, '*.nav'))):
        if os.path.basename(f)[:-4] not in GOOD:
            continue
        res.append(analyse(f))

    print('\n\n########## СВОДКА ##########')
    na = np.concatenate([r['narc'] for r in res])
    cl = np.concatenate([r['close'] for r in res])
    lo = np.concatenate([r['longest'] for r in res])
    df = np.concatenate([r['dfloor'] for r in res])
    print(f'  поле углов: 0-1 дуга {100*(na<=1).mean():.1f}%  2 дуги {100*(na==2).mean():.1f}%  '
          f'3+ {100*(na>=3).mean():.1f}%')
    print(f'  закрытие непростреливаемых направлений: медиана {np.nanmedian(cl):.0f}u')
    print(f'  длиннейший луч: медиана {np.median(lo):.0f}u')
    print(f'  до укрытой точки: медиана {np.median(df):.0f}u  p90 {np.percentile(df,90):.0f}u  '
          f'p99 {np.percentile(df,99):.0f}u')
    ks = np.concatenate([r['kinds'] for r in res])
    print('\n  по типам зон (все карты):')
    for k in ['САЙТ', 'МИД', 'СПАВН', 'прочее']:
        m = (ks == k)
        if m.sum() < 50: continue
        print(f'    {k:7s} 1дуга {100*(na[m]<=1).mean():4.1f}%  2 {100*(na[m]==2).mean():4.1f}%  '
              f'3+ {100*(na[m]>=3).mean():4.1f}%  закрытие {np.nanmedian(cl[m]):4.0f}u  '
              f'длинный {np.median(lo[m]):5.0f}u')
