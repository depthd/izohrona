#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ХОДИБЕЛЬНЫЙ МЕШ ИЗ ГЕОМЕТРИИ (не из нава).

Ошибка №9 из свода: «растр читает верх любого тела с просветом как пол».
Здесь она снята заливкой по связности от спавна с ограничением шага:
на верх стены 400u не шагнёшь, значит стена полом не станет.

Правила движения взяты как у нава:
  подъём  <= 18u  — шаг
  подъём  <= 64u  — прыжок
  спуск   <= 250u — падение
  просвет над поверхностью >= 72u — стоя помещается
"""
import re, sys, struct
import numpy as np
from scipy import ndimage

STEP_UP, JUMP_UP, DROP, HEAD = 18.0, 64.0, 250.0, 72.0


def hull2d(pts):
    p = sorted({(round(float(a), 2), round(float(b), 2)) for a, b in pts})
    if len(p) < 3:
        return p
    def half(seq):
        h = []
        for q in seq:
            while len(h) >= 2 and ((h[-1][0]-h[-2][0])*(q[1]-h[-2][1])
                                   - (h[-1][1]-h[-2][1])*(q[0]-h[-2][0])) <= 0:
                h.pop()
            h.append(q)
        return h
    return half(p)[:-1] + half(p[::-1])[:-1]


def fill_convex(hp, x0, y0, cell, W, H):
    """Клетки, ЦЕНТР которых внутри выпуклого многоугольника.
    Растеризация по касанию раздувала каждое тело на клетку с каждой стороны —
    на сетке 8u это +16u фальшивой стены и заткнутые проёмы."""
    P = np.asarray(hp, float)
    gx0 = max(0, int(np.floor((P[:, 0].min()-x0)/cell))-1)
    gx1 = min(W, int(np.ceil((P[:, 0].max()-x0)/cell))+1)
    gy0 = max(0, int(np.floor((P[:, 1].min()-y0)/cell))-1)
    gy1 = min(H, int(np.ceil((P[:, 1].max()-y0)/cell))+1)
    if gx1 <= gx0 or gy1 <= gy0:
        return None
    xs = x0 + (np.arange(gx0, gx1)+0.5)*cell
    ys = y0 + (np.arange(gy0, gy1)+0.5)*cell
    X, Y = np.meshgrid(xs, ys)
    inside = np.ones(X.shape, bool)
    n = len(P)
    ar = 0.0
    for i in range(n):
        ax, ay = P[i]; bx, by = P[(i+1) % n]
        ar += ax*by - bx*ay
    sgn = 1.0 if ar > 0 else -1.0
    for i in range(n):
        ax, ay = P[i]; bx, by = P[(i+1) % n]
        inside &= (sgn*((bx-ax)*(Y-ay) - (by-ay)*(X-ax)) >= -1e-9)
        if not inside.any():
            return None
    yy, xx = np.nonzero(inside)
    return yy+gy0, xx+gx0


def _verts(N, D):
    n = len(N); pts = []
    for i in range(n-2):
        for j in range(i+1, n-1):
            for k in range(j+1, n):
                A = N[[i, j, k]]
                if abs(np.linalg.det(A)) < 1e-6:
                    continue
                p = np.linalg.solve(A, D[[i, j, k]])
                if np.all(N @ p - D <= 0.1):
                    pts.append(p)
    return pts


def vmf_solids(path):
    t = open(path, encoding='latin-1').read()
    out = []
    for blk in re.findall(r'\tsolid\n\t\{(.*?)\n\t\}', t, re.S):
        sd = re.findall(r'"plane" "\(([-\d\. e]+)\) \(([-\d\. e]+)\) \(([-\d\. e]+)\)"\s*\n\s*"material" "([^"]+)"', blk)
        if len(sd) < 4:
            continue
        N, D, mats = [], [], set()
        for a, b, c, mat in sd:
            p1 = np.array([float(x) for x in a.split()]); p2 = np.array([float(x) for x in b.split()])
            p3 = np.array([float(x) for x in c.split()])
            nn = np.cross(p3-p1, p2-p1); L = np.linalg.norm(nn)
            if L < 1e-9:
                continue
            nn /= L; N.append(nn); D.append(float(nn @ p1)); mats.add(mat.upper())
        if len(N) < 4:
            continue
        N = np.array(N); D = np.array(D)
        if any('TOOLSSKYBOX' in m or 'TRIGGER' in m for m in mats):
            continue
        pts = _verts(N, D)
        if len(pts) < 4:
            continue
        P = np.array(pts)
        out.append((P[:, :2], float(P[:, 2].min()), float(P[:, 2].max())))
    return out


def vmf_ents(path):
    t = open(path, encoding='latin-1').read()
    out = {}
    for blk in re.findall(r'\nentity\n\{(.*?)\n\}', t, re.S):
        cn = re.search(r'"classname" "([^"]+)"', blk)
        og = re.search(r'"origin" "([-\d\. e]+)"', blk)
        if not cn or not og:
            continue
        v = [float(x) for x in og.group(1).split()]
        out.setdefault(cn.group(1), []).append(v)
    return out


def bsp_solids(path):
    d = open(path, 'rb').read()
    L = {}
    for i in range(64):
        ofs, ln, lv, cc = struct.unpack_from('<iii4s', d, 8+i*16)
        L[i] = d[ofs:ofs+ln] if ln > 0 else b''
    planes = np.frombuffer(L[1], dtype=np.dtype([('n','<3f4'),('dist','<f4'),('type','<i4')]))
    brushes = np.frombuffer(L[18], dtype=np.dtype([('first','<i4'),('num','<i4'),('contents','<i4')]))
    sides = np.frombuffer(L[19], dtype=np.dtype([('plane','<u2'),('texinfo','<i2'),('dispinfo','<i2'),('bevel','<i2')]))
    out = []
    for b in brushes:
        if not (int(b['contents']) & 0x10001):      # SOLID | PLAYERCLIP
            continue
        ss = sides[b['first']:b['first']+b['num']]
        if len(ss) < 4:
            continue
        N = np.array([planes[s['plane']]['n'] for s in ss], float)
        D = np.array([float(planes[s['plane']]['dist']) for s in ss], float)
        pts = _verts(N, D)
        if len(pts) < 4:
            continue
        P = np.array(pts)
        out.append((P[:, :2], float(P[:, 2].min()), float(P[:, 2].max())))
    return out, L[0].decode('latin-1', 'replace')


def bsp_ents(txt):
    out = {}
    for blk in txt.split('}'):
        cn = re.search(r'"classname" "([^"]+)"', blk)
        og = re.search(r'"origin" "([-\d\. e]+)"', blk)
        if cn and og:
            out.setdefault(cn.group(1), []).append([float(x) for x in og.group(1).split()])
    return out


def walkable(solids, cell, seeds, drop=190.0, verbose=False):
    """Ходибельный меш из геометрии. Многоярусно: у клетки может быть несколько
    поверхностей, связность считается по ним, а не по одной на клетку.
    Скайбокс и крыши отсекаются сами — до них не дошагать."""
    allp = np.vstack([s[0] for s in solids])
    x0, y0 = allp.min(0) - cell; x1, y1 = allp.max(0) + cell
    W = int((x1-x0)/cell)+1; H = int((y1-y0)/cell)+1
    area = W*H
    ci, zl, zh = [], [], []
    for xy, a, b in solids:
        hp = hull2d(xy)
        if len(hp) < 3:
            continue
        r = fill_convex(hp, x0, y0, cell, W, H)
        if r is None:
            continue
        ys, xs = r
        ci.append(ys*W + xs); zl.append(np.full(len(ys), a)); zh.append(np.full(len(ys), b))
    ci = np.concatenate(ci); zl = np.concatenate(zl); zh = np.concatenate(zh)
    o = np.lexsort((zh, ci)); ci, zl, zh = ci[o], zl[o], zh[o]
    st = np.searchsorted(ci, np.arange(area)); en = np.searchsorted(ci, np.arange(area), side='right')
    sz = float(np.median([s[2] for s in seeds])) if seeds else 0.0
    LOZ, HIZ = sz - 768, sz + 1280

    cz = []; cs = np.zeros(area+1, np.int64)
    for c in range(area):
        s, e = st[c], en[c]
        if s == e:
            cs[c+1] = cs[c]; continue
        a = zl[s:e]; b = zh[s:e]; k = 0
        for t2 in b:
            if t2 < LOZ or t2 > HIZ:
                continue
            if not np.any((a < t2 + HEAD - 1e-6) & (b > t2 + 1e-6)):
                cz.append(t2); k += 1
        cs[c+1] = cs[c] + k
    cz = np.array(cz, np.float32)
    if verbose:
        print(f'   поверхностей-кандидатов {len(cz)} на {area} клеток')

    from collections import deque
    reach = np.zeros(len(cz), bool)
    q = deque()
    for sx, sy, szz in seeds:
        jx = int((sx-x0)/cell); jy = int((sy-y0)/cell)
        best = None; bd = 1e18
        for dy in range(-6, 7):
            for dx in range(-6, 7):
                yy, xx = jy+dy, jx+dx
                if not (0 <= yy < H and 0 <= xx < W):
                    continue
                c = yy*W+xx
                for k in range(cs[c], cs[c+1]):
                    d = abs(cz[k]-szz+32) + 0.1*(dx*dx+dy*dy)
                    if abs(cz[k]-szz+32) < 96 and d < bd:
                        bd = d; best = k
        if best is not None and not reach[best]:
            reach[best] = True; q.append(best)
    cell_of = np.repeat(np.arange(area), np.diff(cs))
    NB = (-1, 1, -W, W)
    while q:
        k = q.popleft(); c = cell_of[k]; z = cz[k]
        cx = c % W
        for d in NB:
            n = c + d
            if n < 0 or n >= area:
                continue
            if d in (-1, 1) and abs((n % W) - cx) != 1:
                continue
            for j in range(cs[n], cs[n+1]):
                if reach[j]:
                    continue
                dz = cz[j] - z
                if dz > JUMP_UP or dz < -drop:
                    continue
                reach[j] = True; q.append(j)
    msk = np.zeros(area, bool); zf = np.full(area, np.nan, np.float32)
    rc = cell_of[reach]; rz = cz[reach]
    msk[rc] = True
    np.minimum.at(zf, rc, rz)
    return msk.reshape(H, W), zf.reshape(H, W), (x0, y0)
