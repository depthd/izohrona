#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""КАНАЛ B — геометрия укрытий из меша.

В наве укрытие проявляется двумя РАЗНЫМИ способами:
  ТИП 1  ГЛУХОЕ  — непроходимо, не запрыгнуть => ДЫРА в ходибельной области.
                   Отдельно стоящая дыра, замкнутая полом = столб/машина/высокий ящик.
  ТИП 2  ВЛЕЗАЕМОЕ — на него можно запрыгнуть => ОСТРОВ пола выше окружения на 24..80u.
                   Ящик, платформа, поддон. Даёт и укрытие, и угол сверху.

Что честно: тип 1 «замкнутый» и тип 2 — однозначны.
Что нечестно: ящик, прижатый к стене, в меше неотличим от тонкой стены. Для него
              даём только верхнюю оценку через спектр выступов (гранулометрия).
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'parsers'))
from navlib2 import read_nav2

CELL = 16.0
PH = 72.0
STEP = 18.0      # шаг без прыжка
JUMP = 59.0      # прыжок с места
GOOD = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def raster(path):
    r = read_nav2(path)
    A = r['areas']
    xs = [a['lo'][0] for a in A] + [a['hi'][0] for a in A]
    ys = [a['lo'][1] for a in A] + [a['hi'][1] for a in A]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    W = int((x1 - x0) / CELL) + 2
    H = int((y1 - y0) / CELL) + 2
    g = np.zeros((H, W), np.uint8)
    z = np.full((H, W), np.nan, np.float32)
    place = np.full((H, W), -1, np.int16)
    names = r['places']
    nidx = {n: i for i, n in enumerate(names)}
    for a in A:
        ax0 = int((a['lo'][0] - x0) / CELL); ax1 = int(math.ceil((a['hi'][0] - x0) / CELL))
        ay0 = int((a['lo'][1] - y0) / CELL); ay1 = int(math.ceil((a['hi'][1] - y0) / CELL))
        zz = (a['lo'][2] + a['hi'][2]) * 0.5
        g[ay0:ay1, ax0:ax1] = 1
        cur = z[ay0:ay1, ax0:ax1]
        z[ay0:ay1, ax0:ax1] = np.where(np.isnan(cur), zz, np.maximum(cur, zz))
        pi = nidx.get(a['pname'], -1)
        if pi >= 0:
            place[ay0:ay1, ax0:ax1] = pi
    return dict(g=g, z=z, place=place, names=names, W=W, H=H,
                org=(x0, y0), areas=A, nav=r)


DISK = {}
def disk(r):
    if r not in DISK:
        y, x = np.ogrid[-r:r + 1, -r:r + 1]
        DISK[r] = (x * x + y * y <= r * r)
    return DISK[r]


def blocking(M):
    """ТИП 1: дыры в полу, замкнутые полом со всех сторон."""
    g = M['g'].astype(bool)
    notg = ~g
    # заливка извне: всё непроходимое, связанное с рамкой кадра
    lab, n = ndimage.label(notg)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    border.discard(0)
    outer = np.isin(lab, list(border))
    holes = notg & ~outer

    hl, hn = ndimage.label(holes)
    objs = []
    for i, sl in enumerate(ndimage.find_objects(hl), start=1):
        m = (hl[sl] == i)
        cells = int(m.sum())
        hgt = (sl[0].stop - sl[0].start) * CELL
        wid = (sl[1].stop - sl[1].start) * CELL
        short, lng = min(wid, hgt), max(wid, hgt)
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        objs.append(dict(kind='block', cells=cells, area=cells * CELL * CELL,
                         short=short, lng=lng, elong=lng / max(short, CELL),
                         fill=cells / max(1, m.size), cy=cy, cx=cx))
    return objs, holes, outer


def mountable(M):
    """ТИП 2: острова пола выше окружения на 24..80u, с малым следом."""
    g = M['g'].astype(bool)
    z = M['z'].copy()
    zf = np.where(np.isnan(z), np.inf, z)
    # минимальная высота в окрестности 96u
    lo = ndimage.minimum_filter(zf, footprint=disk(6), mode='nearest')
    rel = np.where(g, z - lo, 0)
    high = g & (rel > 24) & (rel < 80)
    high = ndimage.binary_opening(high, disk(1))

    hl, hn = ndimage.label(high)
    objs = []
    for i, sl in enumerate(ndimage.find_objects(hl), start=1):
        if sl is None:
            continue
        m = (hl[sl] == i)
        cells = int(m.sum())
        if cells < 2:
            continue
        hgt = (sl[0].stop - sl[0].start) * CELL
        wid = (sl[1].stop - sl[1].start) * CELL
        short, lng = min(wid, hgt), max(wid, hgt)
        # насколько остров окружён более низким полом
        full = (hl == i)
        dil = ndimage.binary_dilation(full, disk(1)) & ~full
        nb = dil & g
        drop = float((rel[dil & g] < -0) .sum()) if nb.any() else 0
        lower = float((z[nb] < (np.nanmean(z[full]) - 24)).sum()) / max(1, int(nb.sum()))
        objs.append(dict(kind='mount', cells=cells, area=cells * CELL * CELL,
                         short=short, lng=lng, elong=lng / max(short, CELL),
                         rise=float(np.nanmean(rel[full])), free=lower,
                         cy=(sl[0].start + sl[0].stop) / 2,
                         cx=(sl[1].start + sl[1].stop) / 2))
    return objs, high


def granulometry(M):
    """спектр размеров непроходимого: сколько площади уходит при открытии радиусом r.
       Отделяет 'мелкое' (укрытия) от 'крупного' (архитектура)."""
    g = M['g'].astype(bool)
    env = ndimage.binary_dilation(g, disk(8))      # игровая оболочка: 128u вокруг пола
    obst = env & ~g                                 # препятствия у самого пола
    tot = int(obst.sum())
    out = []
    prev = tot
    for r in (1, 2, 3, 4, 6, 8, 12):
        op = ndimage.binary_opening(obst, disk(r))
        cur = int(op.sum())
        out.append((r * 2 * CELL, prev - cur, cur))  # ширина, сколько отвалилось, остаток
        prev = cur
    return tot, out


def classify(o):
    """игровая роль по габаритам следа"""
    s, l = o['short'], o['lng']
    if s < 32:
        return 'мусор/шов'
    if l <= 96 and s <= 96:
        return 'точечное (столб/бочка)'
    if l <= 192 and s <= 192:
        return 'ящик'
    if l <= 384 and s <= 256:
        return 'крупное (стопка/машина)'
    if o['elong'] >= 3:
        return 'линейное (парапет/стена)'
    return 'архитектура'


def report(path):
    nm = os.path.basename(path)[:-4]
    M = raster(path)
    g = M['g'].astype(bool)
    floor = int(g.sum()) * CELL * CELL

    bl, holes, outer = blocking(M)
    mo, high = mountable(M)

    bl_real = [o for o in bl if o['short'] >= 32]
    mo_real = [o for o in mo if o['short'] >= 32 and o['free'] > 0.35]

    print(f'\n=== {nm} ===   пол {floor/1e6:.2f}M u²')
    print(f'  ТИП 1 глухое, замкнутое полом: {len(bl)} шт (из них >=32u: {len(bl_real)})')
    from collections import Counter
    c1 = Counter(classify(o) for o in bl_real)
    for k, v in c1.most_common():
        sel = [o for o in bl_real if classify(o) == k]
        ms = np.median([o['short'] for o in sel]); ml = np.median([o['lng'] for o in sel])
        print(f'      {k:26s} {v:3d}  медиана следа {ms:.0f}x{ml:.0f}u')
    print(f'  ТИП 2 влезаемое (подъём 24..80u): {len(mo)} шт (свободностоящих: {len(mo_real)})')
    c2 = Counter(classify(o) for o in mo_real)
    for k, v in c2.most_common():
        sel = [o for o in mo_real if classify(o) == k]
        ms = np.median([o['short'] for o in sel]); ml = np.median([o['lng'] for o in sel])
        mr = np.median([o['rise'] for o in sel])
        print(f'      {k:26s} {v:3d}  след {ms:.0f}x{ml:.0f}u  подъём {mr:.0f}u')

    tot, spec = granulometry(M)
    print(f'  гранулометрия препятствий у пола (всего {tot*CELL*CELL/1e6:.2f}M u²):')
    for w, gone, left in spec:
        print(f'      уже {w:4.0f}u: отвалилось {100*gone/max(tot,1):5.1f}%   осталось {100*left/max(tot,1):5.1f}%')

    return dict(nm=nm, floor=floor, bl=bl_real, mo=mo_real, M=M,
                holes=holes, high=high, spec=spec, tot=tot)


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    res = []
    only = sys.argv[1:] or GOOD
    for f in sorted(glob.glob(os.path.join(base, '*.nav'))):
        if os.path.basename(f)[:-4] not in only:
            continue
        res.append(report(f))

    if len(res) > 1:
        print('\n\n########## СВОДКА ##########')
        for r in res:
            per = r['floor'] / 1e6
            print(f"{r['nm']:26s} глухих {len(r['bl']):3d} ({len(r['bl'])/per:5.1f}/M u²)  "
                  f"влезаемых {len(r['mo']):3d} ({len(r['mo'])/per:5.1f}/M u²)")
        allb = [o for r in res for o in r['bl']]
        allm = [o for r in res for o in r['mo']]
        if allb:
            print(f"глухие: след медиана {np.median([o['short'] for o in allb]):.0f} x "
                  f"{np.median([o['lng'] for o in allb]):.0f}u")
        if allm:
            print(f"влезаемые: след медиана {np.median([o['short'] for o in allm]):.0f} x "
                  f"{np.median([o['lng'] for o in allm]):.0f}u, "
                  f"подъём {np.median([o['rise'] for o in allm]):.0f}u")
