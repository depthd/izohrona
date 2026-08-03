#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ПРОВЕРКА ЗАМЕЧАНИЯ: синее в cover_draw — это пандусы или ящики?
Различитель: по периметру области смотрим перепад до соседнего пола.
  обрыв   (|dz| > 18u, шаг не берётся, нужен прыжок)  -> край ящика/платформы
  стыковка(|dz| <= 18u, заходишь пешком)              -> пандус/ступень/проход
Ящик: обрывом почти весь периметр. Пандус: почти весь периметр — стыковка.
"""
import sys, os, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, disk, CELL

STEP = 18.0
GOOD = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def candidates(M):
    """старый детектор ТИП 2 — тот самый, что рисовался синим"""
    g = M['g'].astype(bool)
    z = M['z']
    zf = np.where(np.isnan(z), np.inf, z)
    lo = ndimage.minimum_filter(zf, footprint=disk(6), mode='nearest')
    rel = np.where(g, z - lo, 0)
    high = g & (rel > 24) & (rel < 80)
    return ndimage.binary_opening(high, disk(1)), rel


def cliff_fraction(M, comp):
    """доля периметра, являющаяся обрывом вниз > STEP"""
    g = M['g'].astype(bool)
    z = M['z']
    ring = ndimage.binary_dilation(comp, disk(1)) & ~comp & g
    if ring.sum() == 0:
        return np.nan, 0
    zin = np.nanmean(z[comp])
    dz = zin - z[ring]                     # насколько сосед НИЖЕ области
    cliff = (dz > STEP).sum()
    return cliff / len(dz), int(ring.sum())


def run(path):
    nm = os.path.basename(path)[:-4]
    M = raster(path)
    high, rel = candidates(M)
    lab, n = ndimage.label(high)
    rows = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        comp = (lab == i)
        cells = int(comp.sum())
        if cells < 2:
            continue
        h = (sl[0].stop - sl[0].start) * CELL
        w = (sl[1].stop - sl[1].start) * CELL
        cf, ring = cliff_fraction(M, comp)
        if cf != cf:
            continue
        rows.append(dict(cells=cells, short=min(w, h), lng=max(w, h), cliff=cf))
    if not rows:
        print(f'{nm}: пусто'); return None
    cf = np.array([r['cliff'] for r in rows])
    area = np.array([r['cells'] for r in rows], float)
    ramp = cf < 0.5
    box = cf >= 0.8
    print(f'\n=== {nm} ===  областей типа 2: {len(rows)}')
    print(f'   обрыв <50% периметра (ПАНДУС/проход):  {ramp.sum():3d} шт, '
          f'{100*area[ramp].sum()/area.sum():4.1f}% площади')
    print(f'   обрыв 50-80% (смешанное):              {((cf>=0.5)&(cf<0.8)).sum():3d} шт, '
          f'{100*area[(cf>=0.5)&(cf<0.8)].sum()/area.sum():4.1f}%')
    print(f'   обрыв >=80% периметра (ЯЩИК/платформа):{box.sum():3d} шт, '
          f'{100*area[box].sum()/area.sum():4.1f}% площади')
    print(f'   медиана доли обрыва по всем областям: {np.median(cf):.2f}')
    if box.sum():
        bs = [r for r in rows if r['cliff'] >= 0.8]
        print(f'   габарит настоящих ящиков: медиана '
              f'{np.median([r["short"] for r in bs]):.0f}x{np.median([r["lng"] for r in bs]):.0f}u')
    return dict(nm=nm, cf=cf, area=area, rows=rows)


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    res = []
    for f in sorted(glob.glob(os.path.join(base, '*.nav'))):
        if os.path.basename(f)[:-4] not in GOOD:
            continue
        r = run(f)
        if r: res.append(r)
    cf = np.concatenate([r['cf'] for r in res])
    ar = np.concatenate([r['area'] for r in res])
    print('\n########## ИТОГ ##########')
    print(f'  всего областей, помеченных синим: {len(cf)}')
    print(f'  ПАНДУСЫ/проходы (обрыв<50%):  {100*(cf<0.5).mean():.1f}% числа, '
          f'{100*ar[cf<0.5].sum()/ar.sum():.1f}% площади')
    print(f'  ЯЩИКИ (обрыв>=80%):           {100*(cf>=0.8).mean():.1f}% числа, '
          f'{100*ar[cf>=0.8].sum()/ar.sum():.1f}% площади')
