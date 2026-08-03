#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""УСТОЙЧИВОСТЬ ГЛАВНОГО ВЫВОДА.
Вывод «генератор открытее реальных карт» держится на трёх произвольных числах:
порог просвета 512u, 32 направления, сетка 16u. Плюс на допущении, что
растеризация нава и растеризация VMF сравнимы.

Проверяем всё четыре. Лучи считаем ОДИН раз при 64 направлениях — тогда
порог и число направлений прогоняются бесплатно (прореживанием).
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, disk
from cover_d import arcs
from sight_vmf import raster_vmf

PH = 72.0
REAL = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def rays(M, pts, ndir, cell, maxlen_u=2400):
    g = M['g'].astype(bool)
    z = np.where(np.isnan(M['z']), -1e6, M['z'])
    H, W = g.shape
    maxc = int(maxlen_u / cell)
    out = np.zeros((len(pts), ndir), np.float32)
    P = np.array(pts, np.float32)
    zy = z[P[:, 0].astype(int), P[:, 1].astype(int)]
    for k in range(ndir):
        ang = 2 * math.pi * k / ndir
        dy, dx = math.sin(ang), math.cos(ang)
        alive = np.ones(len(pts), bool)
        cur = np.zeros(len(pts), np.float32)
        for s in range(1, maxc):
            yy = (P[:, 0] + dy * s).astype(int)
            xx = (P[:, 1] + dx * s).astype(int)
            ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
            yy = np.clip(yy, 0, H - 1); xx = np.clip(xx, 0, W - 1)
            blocked = (~(g[yy, xx] & ok)) | (z[yy, xx] - zy > PH)
            newly = alive & blocked
            cur[newly] = s * cell
            alive &= ~blocked
            if not alive.any():
                break
        cur[alive] = maxc * cell
        out[:, k] = cur
    return out


def hist(R, lane, ndir_use):
    """гистограмма дуг при заданном пороге и прореживании направлений"""
    full = R.shape[1]
    step = full // ndir_use
    Rs = R[:, ::step][:, :ndir_use]
    openm = Rs > lane
    na = np.array([len(arcs(openm[i])) for i in range(len(Rs))])
    return 100 * (na <= 1).mean(), 100 * (na == 2).mean(), 100 * (na >= 3).mean()


def sample(M, n, seed=17):
    g = M['g'].astype(bool)
    yy, xx = np.nonzero(g)
    rs = np.random.RandomState(seed)
    idx = rs.choice(len(yy), size=min(n, len(yy)), replace=False)
    return list(zip(yy[idx], xx[idx]))


def load_real(nm, cell=16.0, dilate=0):
    import cover_b
    cover_b.CELL = cell
    M = raster(os.path.join(os.path.dirname(__file__), '..', 'nav_files', nm + '.nav'))
    if dilate:
        g2 = ndimage.binary_dilation(M['g'].astype(bool), disk(dilate))
        z = M['z'].copy()
        # высоту продлеваем ближайшей известной
        idx = ndimage.distance_transform_edt(np.isnan(z), return_distances=False,
                                             return_indices=True)
        z = z[tuple(idx)]
        M = dict(g=g2.astype(np.uint8), z=np.where(g2, z, np.nan), org=M['org'], nav=M['nav'],
                 place=M['place'], names=M['names'])
    return M


def load_gen(path, erode=0):
    Mv = raster_vmf(path)
    g = Mv['g'].astype(bool)
    z = Mv['z']
    if erode:
        g = ndimage.binary_erosion(g, disk(erode))
        z = np.where(g, z, np.nan)
    return dict(g=g.astype(np.uint8), z=z)


if __name__ == '__main__':
    NS = 900
    realM = [(nm, load_real(nm)) for nm in REAL]
    genfiles = sorted(glob.glob('batch/*.vmf'))[:6]
    genM = [(os.path.basename(f), load_gen(f)) for f in genfiles]

    print('считаю лучи при 64 направлениях, сетка 16u ...')
    Rreal = [rays(M, sample(M, NS), 64, 16.0) for _, M in realM]
    Rgen = [rays(M, sample(M, NS), 64, 16.0) for _, M in genM]
    RR = np.concatenate(Rreal); RG = np.concatenate(Rgen)

    print('\n===== 1. ПОРОГ ПРОСВЕТА (направлений 32, сетка 16u) =====')
    print(f'{"порог":>8} | {"реальные 1/2/3+":>22} | {"генератор 1/2/3+":>22} | разрыв по 3+')
    for lane in (256, 384, 512, 768, 1024, 1536):
        a = hist(RR, lane, 32); b = hist(RG, lane, 32)
        print(f'{lane:8.0f} | {a[0]:6.1f}{a[1]:8.1f}{a[2]:8.1f} | '
              f'{b[0]:6.1f}{b[1]:8.1f}{b[2]:8.1f} | {b[2]-a[2]:+6.1f}')

    print('\n===== 2. ЧИСЛО НАПРАВЛЕНИЙ (порог 512u, сетка 16u) =====')
    print(f'{"напр":>8} | {"реальные 1/2/3+":>22} | {"генератор 1/2/3+":>22} | разрыв по 3+')
    for nd in (8, 16, 32, 64):
        a = hist(RR, 512, nd); b = hist(RG, 512, nd)
        print(f'{nd:8d} | {a[0]:6.1f}{a[1]:8.1f}{a[2]:8.1f} | '
              f'{b[0]:6.1f}{b[1]:8.1f}{b[2]:8.1f} | {b[2]-a[2]:+6.1f}')

    print('\n===== 3. СЕТКА (порог 512u, 32 направления) =====')
    print(f'{"сетка":>8} | {"реальные 1/2/3+":>22} | {"генератор 1/2/3+":>22} | разрыв по 3+')
    for cell in (8.0, 16.0, 32.0):
        rm = [load_real(nm, cell=cell) for nm in REAL]
        rr = np.concatenate([rays(M, sample(M, NS), 32, cell) for M in rm])
        gg = np.concatenate([rays(M, sample(M, NS), 32, cell) for _, M in genM]) \
            if cell == 16.0 else None
        if gg is None:
            import cover_b
            gm = [load_gen(f) for f in genfiles]
            gg = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in gm])
        a = hist(rr, 512, 32); b = hist(gg, 512, 32)
        print(f'{cell:8.0f} | {a[0]:6.1f}{a[1]:8.1f}{a[2]:8.1f} | '
              f'{b[0]:6.1f}{b[1]:8.1f}{b[2]:8.1f} | {b[2]-a[2]:+6.1f}')
        import cover_b; cover_b.CELL = 16.0

    print('\n===== 4. КОНФАУНД РАСТЕРИЗАЦИИ =====')
    print('Нав — консервативная аппроксимация: он МЕНЬШЕ настоящего ходибельного пола.')
    print('VMF-растр берёт любую поверхность с просветом 73u. Значит реальные карты')
    print('могли выйти «закрытее» просто из-за представления. Проверяем в обе стороны:')
    print('расширяем нав реальных карт и сужаем пол генератора.\n')
    print(f'{"вариант":>34} | {"1 дуга":>7}{"2 дуги":>8}{"3+":>8}')
    a = hist(RR, 512, 32)
    print(f'{"реальные, как есть":>34} | {a[0]:7.1f}{a[1]:8.1f}{a[2]:8.1f}')
    for d in (1, 2):
        rm = [load_real(nm, dilate=d) for nm in REAL]
        rr = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in rm])
        h = hist(rr, 512, 32)
        print(f'{f"реальные, нав расширен на {d*16}u":>34} | {h[0]:7.1f}{h[1]:8.1f}{h[2]:8.1f}')
    b = hist(RG, 512, 32)
    print(f'{"генератор, как есть":>34} | {b[0]:7.1f}{b[1]:8.1f}{b[2]:8.1f}')
    for e in (1, 2):
        gm = [load_gen(f, erode=e) for f in genfiles]
        gg = np.concatenate([rays(M, sample(M, NS), 32, 16.0) for M in gm])
        h = hist(gg, 512, 32)
        print(f'{f"генератор, пол сужен на {e*16}u":>34} | {h[0]:7.1f}{h[1]:8.1f}{h[2]:8.1f}')
