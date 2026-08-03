#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ПЕРЕКРЁСТНАЯ ПРОВЕРКА двух независимых каналов.
Канал B (моя геометрия) нашёл объекты. Канал A (разметка Valve) даёт точки IN_COVER.
Если объект — настоящее укрытие, точки IN_COVER должны липнуть к нему.
Нулевая модель: случайные точки на полу той же численности.
Считаем lift = (доля IN_COVER рядом с объектом) / (доля случайных точек рядом).
lift ~ 1 -> объект неотличим от шума. lift >> 1 -> объект реален.
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, blocking, mountable, classify, CELL
from navlib2 import HS_IN_COVER, HS_EXPOSED

GOOD = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']
NEAR = 96.0     # «рядом» = не дальше 96u от края объекта


def check(path, rng):
    nm = os.path.basename(path)[:-4]
    M = raster(path)
    g = M['g'].astype(bool)
    x0, y0 = M['org']
    bl, holes, outer = blocking(M)
    mo, high = mountable(M)

    # маски по классам
    hl, _ = ndimage.label(holes)
    small = np.zeros_like(g)
    arch = np.zeros_like(g)
    tiny = np.zeros_like(g)
    for i, sl in enumerate(ndimage.find_objects(hl), start=1):
        m = (hl[sl] == i)
        hgt = (sl[0].stop - sl[0].start) * CELL
        wid = (sl[1].stop - sl[1].start) * CELL
        s, l = min(wid, hgt), max(wid, hgt)
        tgt = tiny if s < 32 else (small if (l <= 192 and s <= 192) else arch)
        sub = tgt[sl]; sub |= m; tgt[sl] = sub

    R = int(NEAR / CELL)
    from cover_b import disk
    masks = {
        'ТИП1 мелкая дыра <=192u': small,
        'ТИП1 мусор <32u': tiny,
        'ТИП1 архитектура >192u': arch,
        'ТИП2 влезаемое': high.astype(bool),
    }

    # точки
    inc, exp = [], []
    for a in M['nav']['areas']:
        for h in a['hides']:
            hx, hy, _ = h['pos']
            cx = int((hx - x0) / CELL); cy = int((hy - y0) / CELL)
            H, W = g.shape
            if not (0 <= cx < W and 0 <= cy < H):
                continue
            (inc if h['flags'] & HS_IN_COVER else
             (exp if h['flags'] & HS_EXPOSED else [])).append((cy, cx))

    # нулевая модель: случайные клетки пола
    yy, xx = np.nonzero(g)
    idx = rng.choice(len(yy), size=min(4000, len(yy)), replace=False)
    rnd = list(zip(yy[idx], xx[idx]))

    print(f'\n=== {nm} ===  IN_COVER={len(inc)}  EXPOSED={len(exp)}  случайных={len(rnd)}')
    rows = []
    for label, m in masks.items():
        if not m.any():
            print(f'   {label:26s} — нет объектов')
            continue
        near = ndimage.binary_dilation(m, disk(R))
        f_inc = np.mean([near[c] for c in inc]) if inc else 0
        f_exp = np.mean([near[c] for c in exp]) if exp else float('nan')
        f_rnd = np.mean([near[c] for c in rnd])
        lift = f_inc / f_rnd if f_rnd > 0 else float('nan')
        liftE = (f_exp / f_rnd) if (f_rnd > 0 and exp) else float('nan')
        print(f'   {label:26s} площадь {100*m.mean():4.1f}%  '
              f'рядом: IN_COVER {100*f_inc:5.1f}%  случай {100*f_rnd:5.1f}%  '
              f'lift {lift:4.2f}' + (f'   (EXPOSED lift {liftE:4.2f})' if exp else ''))
        rows.append((label, lift))
    return nm, rows


if __name__ == '__main__':
    rng = np.random.RandomState(11)
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    agg = {}
    for f in sorted(glob.glob(os.path.join(base, '*.nav'))):
        if os.path.basename(f)[:-4] not in GOOD:
            continue
        nm, rows = check(f, rng)
        for label, lift in rows:
            agg.setdefault(label, []).append(lift)
    print('\n########## СВОДКА lift по картам ##########')
    for label, v in agg.items():
        v = [x for x in v if x == x]
        print(f'   {label:26s} медиана {np.median(v):4.2f}   '
              f'[{min(v):4.2f} .. {max(v):4.2f}]  n={len(v)}')
