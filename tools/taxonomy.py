#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ТОЧНАЯ ТАКСОНОМИЯ ВСЕХ ТЕЛ. Без сетки — координаты брашей это float,
пенёк 8u высотой виден так же точно, как стена.

Силуэт CS2: стоя 72u (глаз 64u), присев 54u (глаз 46u), шаг 18u, прыжок 59u.
"""
import sys, os, collections
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from bsp import parse

STAND, CROUCH, JUMP, STEP, EYE = 72., 54., 59., 18., 64.


def classify(s, zlo, zhi, floor_lo, floor_hi):
    """s = (dx,dy,dz). Классификация по РОЛИ для игрока."""
    dx, dy, dz = s
    short, lng = min(dx, dy), max(dx, dy)
    # висит в воздухе — потолок/навес/балка
    if zlo > floor_hi + 8:
        return 'навес/потолок/балка'
    if dz >= 256:
        return 'стена/здание (>=256u)'
    if dz < 4:
        return 'плита пола (<4u)'
    if dz <= STEP:
        return f'паребрик/ступень (<={int(STEP)}u)'
    if dz <= 32:
        return 'низкий бортик 18-32u'
    if dz < CROUCH:
        return 'пенёк 32-54u'
    if dz < STAND:
        return 'поясное 54-72u'
    if dz <= 128:
        return 'ростовое 72-128u'
    return 'высокое 128-256u'


def run(path):
    r = parse(path)
    B = r['brushes']
    lo = np.array([b['lo'] for b in B]); hi = np.array([b['hi'] for b in B])
    sz = hi - lo
    # опорный уровень пола карты — по медиане верхов широких плоских тел
    wide = (np.minimum(sz[:, 0], sz[:, 1]) > 128) & (sz[:, 2] < 64)
    fl = np.median(hi[wide, 2]) if wide.sum() > 3 else np.median(hi[:, 2])
    print(f'\n{"="*70}\n=== {os.path.basename(path)} === тел {len(B)}, опорный пол z={fl:.0f}')

    cats = collections.Counter()
    per = collections.defaultdict(list)
    for i, b in enumerate(B):
        c = classify(sz[i], lo[i, 2], hi[i, 2], fl - 64, fl + 64)
        cats[c] += 1
        per[c].append(i)

    order = ['плита пола (<4u)', 'паребрик/ступень (<=18u)', 'низкий бортик 18-32u',
             'пенёк 32-54u', 'поясное 54-72u', 'ростовое 72-128u',
             'высокое 128-256u', 'стена/здание (>=256u)', 'навес/потолок/балка']
    print(f'  {"категория":26s} {"шт":>5} {"%":>6}  {"толщина(корот)":>15} {"длина":>10} {"высота":>10}')
    for c in order:
        if c not in cats: continue
        idx = per[c]
        s = sz[idx]
        sh = np.minimum(s[:, 0], s[:, 1]); ln = np.maximum(s[:, 0], s[:, 1])
        print(f'  {c:26s} {cats[c]:5d} {100*cats[c]/len(B):5.1f}%  '
              f'{np.median(sh):8.0f}u [{np.percentile(sh,10):.0f}..{np.percentile(sh,90):.0f}] '
              f'{np.median(ln):8.0f}u {np.median(s[:,2]):8.0f}u')

    # --- стены: точная толщина ---
    wallish = [i for i in range(len(B)) if sz[i, 2] >= 96 and
               min(sz[i, 0], sz[i, 1]) < 128 and max(sz[i, 0], sz[i, 1]) >= 128]
    if wallish:
        s = sz[wallish]
        sh = np.minimum(s[:, 0], s[:, 1]); ln = np.maximum(s[:, 0], s[:, 1])
        print(f'\n  СТЕНЫ (высота>=96u, тонкие): {len(wallish)} шт')
        print(f'    толщина: медиана {np.median(sh):.0f}u  '
              f'кв [{np.percentile(sh,25):.0f}..{np.percentile(sh,75):.0f}]  '
              f'мин {sh.min():.0f}  макс {sh.max():.0f}')
        th = collections.Counter(int(round(v)) for v in sh)
        print(f'    частые толщины: ' + ', '.join(f'{k}u×{v}' for k, v in th.most_common(8)))
        print(f'    длина:   медиана {np.median(ln):.0f}u  '
              f'кв [{np.percentile(ln,25):.0f}..{np.percentile(ln,75):.0f}]  макс {ln.max():.0f}')
        print(f'    длина в клетках 96u: медиана {np.median(ln)/96:.1f}  '
              f'кв [{np.percentile(ln,25)/96:.1f}..{np.percentile(ln,75)/96:.1f}]')

    # --- мелочь, которая не должна уйти ---
    small = [i for i in range(len(B)) if 4 <= sz[i, 2] <= 32]
    if small:
        s = sz[small]
        sh = np.minimum(s[:, 0], s[:, 1]); ln = np.maximum(s[:, 0], s[:, 1])
        print(f'\n  МЕЛОЧЬ 4-32u (паребрики, ступени, бортики): {len(small)} шт '
              f'({100*len(small)/len(B):.1f}% всех тел)')
        print(f'    высота: медиана {np.median(s[:,2]):.0f}u, '
              f'частые: ' + ', '.join(f'{k}u×{v}' for k, v in
                                      collections.Counter(int(round(v)) for v in s[:, 2]).most_common(6)))
        print(f'    след: {np.median(sh):.0f} x {np.median(ln):.0f}u')
        print(f'    из них проходимых шагом (<=18u): {(s[:,2]<=STEP).sum()} '
              f'({100*(s[:,2]<=STEP).mean():.0f}%)')

    # --- точная гистограмма высот всех тел, шаг 8u ---
    h = sz[:, 2]
    print(f'\n  ГИСТОГРАММА ВЫСОТ ТЕЛ (шаг 8u, до 200u):')
    for a in range(0, 200, 8):
        n = ((h >= a) & (h < a + 8)).sum()
        if n:
            print(f'    {a:3d}-{a+8:3d}u {n:4d} {100*n/len(B):5.1f}% {"#"*int(50*n/len(B))}')
    print(f'    >=200u {(h>=200).sum():4d} {100*(h>=200).mean():5.1f}%')
    return B, sz, fl


if __name__ == '__main__':
    for f in sys.argv[1:]:
        run(f)
