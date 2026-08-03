#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ЧЕСТНОЕ СРАВНЕНИЕ. Гипотеза: весь «разрыв по дугам» — следствие того, что
пространство генератора крупнее в 1.3 раза, а порог просвета я держал фиксированным.

Проверка: порог задаём НЕ абсолютным числом, а кратно собственному медианному
лучу каждой карты. k = 512/208 = 2.46 (из реальных карт при 16u).
Если гипотеза верна — гистограммы сойдутся.
"""
import sys, os, glob
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from cover_robust import rays, sample, load_real, load_gen
from cover_d import arcs

REAL = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']
K = 512.0 / 208.0


def hist_norm(R, k=K):
    lane = k * np.median(np.median(R, axis=1))     # порог от масштаба самой карты
    openm = R > lane
    na = np.array([len(arcs(openm[i])) for i in range(len(R))])
    return (100 * (na <= 1).mean(), 100 * (na == 2).mean(),
            100 * (na >= 3).mean(), lane)


if __name__ == '__main__':
    NS = 900
    print(f'коэффициент k = {K:.2f} (порог = k * медианный луч карты)\n')
    print(f'{"карта":>26} | {"порог":>6} | {"1дуга":>6}{"2дуги":>7}{"3+":>7}')
    print('-' * 62)

    ra = []
    for nm in REAL:
        M = load_real(nm)
        R = rays(M, sample(M, NS), 32, 16.0)
        h = hist_norm(R)
        ra.append(h)
        print(f'{nm:>26} | {h[3]:6.0f} | {h[0]:6.1f}{h[1]:7.1f}{h[2]:7.1f}')
    print('-' * 62)
    ga = []
    for f in sorted(glob.glob('batch/*.vmf'))[:6]:
        M = load_gen(f)
        R = rays(M, sample(M, NS), 32, 16.0)
        h = hist_norm(R)
        ga.append(h)
        print(f'{os.path.basename(f):>26} | {h[3]:6.0f} | {h[0]:6.1f}{h[1]:7.1f}{h[2]:7.1f}')

    ra = np.array(ra); ga = np.array(ga)
    print('=' * 62)
    print(f'{"РЕАЛЬНЫЕ (среднее)":>26} | {ra[:,3].mean():6.0f} | '
          f'{ra[:,0].mean():6.1f}{ra[:,1].mean():7.1f}{ra[:,2].mean():7.1f}')
    print(f'{"ГЕНЕРАТОР (среднее)":>26} | {ga[:,3].mean():6.0f} | '
          f'{ga[:,0].mean():6.1f}{ga[:,1].mean():7.1f}{ga[:,2].mean():7.1f}')
    print(f'{"РАЗРЫВ":>26} | {"":>6} | {ga[:,0].mean()-ra[:,0].mean():+6.1f}'
          f'{ga[:,1].mean()-ra[:,1].mean():+7.1f}{ga[:,2].mean()-ra[:,2].mean():+7.1f}')
    print(f'\nразброс 3+ : реальные {ra[:,2].min():.1f}..{ra[:,2].max():.1f}, '
          f'генератор {ga[:,2].min():.1f}..{ga[:,2].max():.1f}')
    print(f'масштаб (медианный луч): реальные {ra[:,3].mean()/K:.0f}u, '
          f'генератор {ga[:,3].mean()/K:.0f}u  -> в {ga[:,3].mean()/ra[:,3].mean():.2f} раза крупнее')
