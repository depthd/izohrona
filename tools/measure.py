#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ЕДИНЫЙ ЗАМЕР. Один прибор на реальные карты (BSP) и на генератор (VMF):
ходибельное строится заливкой по геометрии, нав не участвует нигде.
Иначе сравнение мешает два растра — ошибка №5 свода."""
import sys, re, json
import numpy as np
sys.path.insert(0, '/home/claude/gen')
import walk
from scipy import ndimage
from skimage.graph import MCP_Geometric

CELL = 8.0


def brush_ents(path, cls):
    """центры брашевых сущностей в VMF"""
    t = open(path, encoding='latin-1').read()
    out = []
    for blk in re.split(r'\nentity\n', t)[1:]:
        if f'"classname" "{cls}"' not in blk:
            continue
        pts = re.findall(r'"plane" "\(([-\d\. e]+)\) \(([-\d\. e]+)\) \(([-\d\. e]+)\)"', blk)
        v = np.array([[float(x) for x in g.split()] for p in pts for g in p])
        if len(v):
            out.append(v.mean(0))
    return out


def bsp_brush_ents(txt, cls):
    out = []
    for blk in txt.split('}'):
        if f'"classname" "{cls}"' in blk:
            og = re.search(r'"origin" "([-\d\. e]+)"', blk)
            if og:
                out.append([float(x) for x in og.group(1).split()])
    return out


def close_r(m, r):
    return ndimage.distance_transform_edt(ndimage.distance_transform_edt(~m) <= r) > r-1e-9


def measure(name, solids, seeds, sites, note=''):
    flat = [p for v in seeds.values() for p in v] if isinstance(seeds, dict) else list(seeds)
    m, zf, org = walk.walkable(solids, CELL, flat)
    H, W = m.shape; x0, y0 = org
    if m.sum() < 100:
        print(f'{name}: заливка не пошла'); return None

    dt = ndimage.distance_transform_edt(m)*CELL*2.0
    mx = ndimage.maximum_filter(dt, size=3)
    ridge = m & (dt >= mx-1e-6) & (dt > 0)
    w = dt[ridge]

    # тела: браш, чей верх стоит над полом на 8..64u — по нему ходят, но он мешает
    body = np.zeros((H, W), bool)
    for xy, a, b in solids:
        hp = walk.hull2d(xy)
        if len(hp) < 3:
            continue
        r = walk.fill_convex(hp, x0, y0, CELL, W, H)
        if r is None:
            continue
        ys, xs = r
        f = zf[ys, xs]
        ok = np.isfinite(f) & (b > f+8) & (b <= f+64) & (a <= f+8)
        body[ys[ok], xs[ok]] = True

    # оболочка карты
    small = m[::2, ::2]
    env = ndimage.binary_fill_holes(close_r(small, 256/(CELL*2)))
    dens = 100*small.sum()/env.sum()

    # горловины: клетка гребня уже 160u
    thr = ridge & (dt < 160)
    if thr.sum():
        cost = np.where(m, 1.0, np.inf)
        mcp = MCP_Geometric(cost)
        d2thr, _ = mcp.find_costs(list(zip(*np.nonzero(thr))))
        dth = d2thr[m]*CELL
        dth = dth[np.isfinite(dth)]
    else:
        dth = np.array([1e9])

    # пустота: сколько идти до ближайшего тела или стены
    obst = (~m) | body
    demp = ndimage.distance_transform_edt(~obst)*CELL

    # изохроны
    iso = {}
    if seeds and sites:
        cost = np.where(m, 1.0, np.inf)
        for tag, pts in seeds.items():
            cum = None
            ss = []
            for p in pts:
                jy = int((p[1]-y0)/CELL); jx = int((p[0]-x0)/CELL)
                if 0 <= jy < H and 0 <= jx < W:
                    ys, xs = np.nonzero(m[max(0, jy-8):jy+8, max(0, jx-8):jx+8])
                    if len(ys):
                        ss.append((max(0, jy-8)+ys[0], max(0, jx-8)+xs[0]))
            if not ss:
                continue
            cum, _ = MCP_Geometric(cost).find_costs(ss)
            for sn, sp in sites.items():
                jy = int((sp[1]-y0)/CELL); jx = int((sp[0]-x0)/CELL)
                sub = cum[max(0, jy-10):jy+10, max(0, jx-10):jx+10]
                v = sub[np.isfinite(sub)]
                if len(v):
                    iso[f'{tag}->{sn}'] = float(v.min()*CELL)

    r = dict(name=name, note=note,
             floor=float(m.sum()*CELL*CELL), dens=float(dens),
             wmed=float(np.median(w)), w90=float(np.percentile(w, 90)),
             thin=float(100*(w < 192).mean()), wide=float(100*(w > 448).mean()),
             thr_med=float(np.median(dth)), thr_90=float(np.percentile(dth, 90)),
             emp_med=float(np.median(demp[m])), emp_90=float(np.percentile(demp[m], 90)),
             emp_max=float(demp[m].max()), bodies=int(body.sum()),
             iso=iso, shape=(H, W), org=org)
    return r, m, zf, body, dt


def run_len(dt, ridge, thresh=256):
    """длины непрерывных участков гребня шире порога — «проход без сужения»"""
    wide = ridge & (dt >= thresh)
    lab, n = ndimage.label(wide, np.ones((3, 3)))
    if not n:
        return np.array([0.0])
    sz = ndimage.sum(wide, lab, range(1, n+1))*CELL
    return sz
