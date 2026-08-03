#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""КАНАЛ D — АНАТОМИЯ УКРЫТОЙ ПОЗИЦИИ.
Гипотеза после канала C: укрытие = закрыть почти всё, оставить один просвет.
Проверяем на всех картах: сколько просветов, какой ширины, куда смотрят.

Просвет = направление, где луч длиннее LANE (реальная дистанция боя).
Дуга = связная группа соседних открытых направлений (32 направления = шаг 11.25°).
"""
import sys, os, math, glob
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, CELL
from cover_c import ray_field, NDIR
from navlib2 import HS_IN_COVER, HS_EXPOSED, HS_GOOD_SNIPER, HS_IDEAL_SNIPER

LANE = 512.0
GOOD = ['de_mirage', 'de_dust2_v16_CORRECT', 'de_inferno', 'cs2_anubis',
        'de_ancient', 'de_cache', 'de_tuscan']


def arcs(open_mask):
    """связные дуги открытых направлений на кольце; вернуть список длин (в направлениях)"""
    n = len(open_mask)
    if open_mask.all():
        return [n]
    if not open_mask.any():
        return []
    out, run = [], 0
    start = int(np.argmin(open_mask))
    for i in range(n):
        v = open_mask[(start + i) % n]
        if v:
            run += 1
        elif run:
            out.append(run); run = 0
    if run:
        out.append(run)
    return out


def zone_center(M, want):
    place, names = M['place'], M['names']
    for i, n in enumerate(names):
        if n.lower().replace(' ', '') == want:
            m = (place == i)
            if m.sum() > 20:
                yy, xx = np.nonzero(m)
                return yy.mean(), xx.mean()
    return None


def analyse(path):
    nm = os.path.basename(path)[:-4]
    M = raster(path)
    g = M['g'].astype(bool)
    x0, y0 = M['org']
    H, W = g.shape

    groups = {'IN_COVER': [], 'EXPOSED': [], 'SNIPER': []}
    for a in M['nav']['areas']:
        for h in a['hides']:
            hx, hy, _ = h['pos']
            cx = int((hx - x0) / CELL); cy = int((hy - y0) / CELL)
            if not (0 <= cx < W and 0 <= cy < H) or not g[cy, cx]:
                continue
            f = h['flags']
            if f & HS_IN_COVER: groups['IN_COVER'].append((cy, cx))
            elif f & HS_EXPOSED: groups['EXPOSED'].append((cy, cx))
            if f & (HS_GOOD_SNIPER | HS_IDEAL_SNIPER): groups['SNIPER'].append((cy, cx))

    yy, xx = np.nonzero(g)
    rs = np.random.RandomState(5)
    idx = rs.choice(len(yy), size=min(1200, len(yy)), replace=False)
    groups['СЛУЧАЙНО'] = list(zip(yy[idx], xx[idx]))

    T = zone_center(M, 'tspawn')
    CT = zone_center(M, 'ctspawn')

    print(f'\n=== {nm} ===')
    out = {}
    for k in ['IN_COVER', 'EXPOSED', 'SNIPER', 'СЛУЧАЙНО']:
        pts = groups[k]
        if len(pts) < 10:
            continue
        R = ray_field(M, pts)
        openm = R > LANE
        nlane = openm.sum(axis=1)
        arclist = [arcs(openm[i]) for i in range(len(pts))]
        narc = np.array([len(a) for a in arclist])
        biggest = np.array([max(a) if a else 0 for a in arclist])
        deg = biggest * (360.0 / NDIR)

        # куда смотрит главный просвет: к врагу или нет
        toward = np.nan
        if T is not None and CT is not None:
            best_dir = R.argmax(axis=1)
            ang = best_dir * (2 * math.pi / NDIR)
            vx, vy = np.cos(ang), np.sin(ang)
            P = np.array(pts, np.float32)
            # ближе к какому спавну точка — тот «свой», смотреть должна на чужой
            dT = np.hypot(P[:, 0] - T[0], P[:, 1] - T[1])
            dCT = np.hypot(P[:, 0] - CT[0], P[:, 1] - CT[1])
            ex = np.where(dT[:, None] < dCT[:, None], CT[1] - P[:, 1:2], T[1] - P[:, 1:2])[:, 0]
            ey = np.where(dT[:, None] < dCT[:, None], CT[0] - P[:, 0:1], T[0] - P[:, 0:1])[:, 0]
            en = np.hypot(ex, ey) + 1e-6
            cosang = (vx * ex + vy * ey) / en
            toward = float((cosang > 0.5).mean())

        print(f'   {k:11s} n={len(pts):4d}  просветов>{LANE:.0f}u: медиана {np.median(nlane):3.0f}/32  '
              f'дуг {np.median(narc):.0f}  главная дуга {np.median(deg):5.0f}°  '
              + (f'смотрит на врага {100*toward:3.0f}%' if toward == toward else ''))
        out[k] = dict(nlane=nlane, narc=narc, deg=deg, toward=toward)
    return nm, out


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    agg = {}
    for f in sorted(glob.glob(os.path.join(base, '*.nav'))):
        if os.path.basename(f)[:-4] not in GOOD:
            continue
        nm, out = analyse(f)
        for k, v in out.items():
            agg.setdefault(k, []).append(v)

    print('\n\n########## СВОДКА ПО ВСЕМ КАРТАМ ##########')
    for k, lst in agg.items():
        nl = np.concatenate([v['nlane'] for v in lst])
        na = np.concatenate([v['narc'] for v in lst])
        dg = np.concatenate([v['deg'] for v in lst])
        tw = [v['toward'] for v in lst if v['toward'] == v['toward']]
        print(f'   {k:11s} просветов {np.median(nl):3.0f}/32 (кв {np.percentile(nl,25):.0f}..{np.percentile(nl,75):.0f})  '
              f'дуг {np.median(na):.0f}  главная дуга {np.median(dg):5.0f}° '
              f'(кв {np.percentile(dg,25):.0f}..{np.percentile(dg,75):.0f})'
              + (f'  на врага {100*np.mean(tw):3.0f}%' if tw else ''))
