#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ПОДХОД К ПЛЕНТУ: узко -> хаб -> узко -> сайт?
Идём по графу нава от спавна к сайту и снимаем ЛОКАЛЬНУЮ ШИРИНУ вдоль пути.
Хаб = участок пути, где ширина держится >=256u на длине >=256u.
"""
import sys, os, heapq, collections
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from navlib2 import read_nav2

CELL = 8.0


def build(navf):
    r = read_nav2(navf)
    A = r['areas']
    xs = [a['lo'][0] for a in A] + [a['hi'][0] for a in A]
    ys = [a['lo'][1] for a in A] + [a['hi'][1] for a in A]
    x0, y0 = min(xs), min(ys)
    W = int((max(xs)-x0)/CELL)+2; H = int((max(ys)-y0)/CELL)+2
    g = np.zeros((H, W), bool)
    place = np.full((H, W), -1, np.int16)
    names = r['places']; nidx = {n: i for i, n in enumerate(names)}
    for a in A:
        ax0 = max(0, int((a['lo'][0]-x0)/CELL)); ax1 = min(W, int(np.ceil((a['hi'][0]-x0)/CELL)))
        ay0 = max(0, int((a['lo'][1]-y0)/CELL)); ay1 = min(H, int(np.ceil((a['hi'][1]-y0)/CELL)))
        if ax1 <= ax0 or ay1 <= ay0: continue
        g[ay0:ay1, ax0:ax1] = True
        i = nidx.get(a['pname'], -1)
        if i >= 0: place[ay0:ay1, ax0:ax1] = i
    width = ndimage.distance_transform_edt(g) * 2 * CELL
    return dict(nav=r, g=g, place=place, names=names, org=(x0, y0), width=width)


def center(M, want):
    """центр зоны по подстроке имени"""
    pl, names = M['place'], M['names']
    for i, n in enumerate(names):
        if want in n.lower().replace(' ', ''):
            m = (pl == i)
            if m.sum() > 20:
                yy, xx = np.nonzero(m)
                return int(yy.mean()), int(xx.mean())
    return None


def path(M, src, dst):
    """кратчайший путь по полу (8-связность)"""
    g = M['g']; H, W = g.shape
    INF = 1e18
    dist = np.full((H, W), INF)
    prev = {}
    dist[src] = 0
    pq = [(0.0, src)]
    nb = [(-1,0,1),(1,0,1),(0,-1,1),(0,1,1),(-1,-1,1.414),(-1,1,1.414),(1,-1,1.414),(1,1,1.414)]
    while pq:
        d, (y, x) = heapq.heappop(pq)
        if d > dist[y, x] + 1e-9: continue
        if (y, x) == dst: break
        for dy, dx, w in nb:
            ny, nx = y+dy, x+dx
            if ny < 0 or ny >= H or nx < 0 or nx >= W or not g[ny, nx]: continue
            nd = d + w
            if nd < dist[ny, nx]:
                dist[ny, nx] = nd; prev[(ny, nx)] = (y, x)
                heapq.heappush(pq, (nd, (ny, nx)))
    if dist[dst] >= INF: return None
    p = [dst]
    while p[-1] != src:
        p.append(prev[p[-1]])
    return p[::-1]


def profile(M, p, narrow=176., wide=256., minhub=256.):
    """снять ширину вдоль пути, найти хабы и горловины"""
    w = np.array([M['width'][y, x] for y, x in p])
    s = np.arange(len(w)) * CELL          # путь в юнитах (приблизительно)
    # хабы: связные участки w>=wide длиной >=minhub
    hubs = []; i = 0
    while i < len(w):
        if w[i] >= wide:
            j = i
            while j < len(w) and w[j] >= wide: j += 1
            if (j-i)*CELL >= minhub:
                hubs.append(((j-i)*CELL, float(w[i:j].max()), float(w[i:j].mean())))
            i = j
        else: i += 1
    # горловины: связные участки w<narrow
    thr = []; i = 0
    while i < len(w):
        if w[i] < narrow:
            j = i
            while j < len(w) and w[j] < narrow: j += 1
            thr.append(((j-i)*CELL, float(w[i:j].min())))
            i = j
        else: i += 1
    return w, hubs, thr


MAPS = [
    ('де-даст2',   '/home/claude/maps/de_dust2_fps.nav', 'tspawn'),
    ('мираж',      '/home/claude/pack/pack60/nav_files/de_mirage.nav', 'tspawn'),
    ('инферно',    '/home/claude/pack/pack60/nav_files/de_inferno.nav', 'tspawn'),
    ('эншент',     '/home/claude/pack/pack60/nav_files/de_ancient.nav', 'tspawn'),
]

if __name__ == '__main__':
    for nm, navf, spawn in MAPS:
        if not os.path.exists(navf):
            print(f'{nm}: нет файла'); continue
        M = build(navf)
        print(f'\n{"="*70}\n=== {nm} === зон {len(M["names"])}, пол {M["g"].sum()*CELL*CELL/1e6:.2f}M u²')
        src = center(M, spawn)
        if src is None or not M['g'][src]:
            yy, xx = np.nonzero(M['g'])
            if src is None: print('  спавн не найден'); continue
            k = np.argmin((yy-src[0])**2 + (xx-src[1])**2); src = (yy[k], xx[k])
        for site in ('bombsitea', 'bombsiteb'):
            dst = center(M, site)
            if dst is None: continue
            if not M['g'][dst]:
                yy, xx = np.nonzero(M['g'])
                k = np.argmin((yy-dst[0])**2 + (xx-dst[1])**2); dst = (yy[k], xx[k])
            p = path(M, src, dst)
            if not p: print(f'  {site}: пути нет'); continue
            w, hubs, thr = profile(M, p)
            L = len(p)*CELL
            lbl = 'A' if site.endswith('a') else 'B'
            print(f'  спавн -> сайт {lbl}: путь {L:.0f}u, ширина медиана {np.median(w):.0f}u '
                  f'[{w.min():.0f}..{w.max():.0f}]')
            print(f'     горловин (<176u): {len(thr)}  ' +
                  ('длины ' + ', '.join(f'{a:.0f}u' for a, b in thr[:6]) if thr else ''))
            print(f'     ХАБОВ (>=256u, длиннее 256u): {len(hubs)}  ' +
                  ('; '.join(f'{a:.0f}u длиной, шире до {b:.0f}u' for a, b, c in hubs[:4]) if hubs else '—'))
        # зоны
        sizes = []
        for i, zn in enumerate(M['names']):
            k = int((M['place'] == i).sum())
            if k >= 10: sizes.append((k*CELL*CELL/1000., zn))
        sizes.sort(reverse=True)
        if sizes:
            v = np.array([a for a, _ in sizes])
            print(f'  зоны: {len(sizes)} шт, медиана {np.median(v):.0f}k u², '
                  f'кв [{np.percentile(v,25):.0f}..{np.percentile(v,75):.0f}], '
                  f'мин {v.min():.0f}k макс {v.max():.0f}k')
