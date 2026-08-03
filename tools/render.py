#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""МИНИКАРТЫ. Пол берётся из нава (проверенный источник ходибельности),
тела — из BSP (нав ниже 72u слеп). Единый масштаб для всех карт, чтобы
схемы сравнивались друг с другом, а не каждая со своей.

Классы клетки:
  ФОН    — ни пола, ни тела
  МАССИВ — тело есть, пола нет (стена/здание)
  ПОЛ    — ходибельно, над полом ничего
  ТЕЛО   — ходибельно, но стоит объект; цвет по высоте над локальным полом
"""
import sys, os, struct, math
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '/home/claude/iz/v61/parsers')
from navlib2 import read_nav2

CELL = 2.0          # u на пиксель — одинаково для всех карт
PAD = 96.0

# ---------- BSP: браши как выпуклые многогранники ----------
def bsp_brushes(path):
    d = open(path, 'rb').read()
    magic, ver = struct.unpack_from('<4sI', d, 0)
    assert magic == b'VBSP'
    L = {}
    for i in range(64):
        ofs, ln, lv, cc = struct.unpack_from('<iii4s', d, 8 + i * 16)
        L[i] = d[ofs:ofs + ln] if ln > 0 else b''
    planes = np.frombuffer(L[1], dtype=np.dtype([('n', '<3f4'), ('dist', '<f4'), ('type', '<i4')]))
    brushes = np.frombuffer(L[18], dtype=np.dtype([('first', '<i4'), ('num', '<i4'), ('contents', '<i4')]))
    sides = np.frombuffer(L[19], dtype=np.dtype([('plane', '<u2'), ('texinfo', '<i2'),
                                                 ('dispinfo', '<i2'), ('bevel', '<i2')]))
    SOLID = 0x1
    out = []
    for b in brushes:
        if not (int(b['contents']) & SOLID):
            continue
        ss = sides[b['first']:b['first'] + b['num']]
        pl = [(planes[s['plane']]['n'], float(planes[s['plane']]['dist'])) for s in ss]
        n = len(pl)
        if n < 4:
            continue
        N = np.array([p[0] for p in pl], float)
        D = np.array([p[1] for p in pl], float)
        pts = []
        for i in range(n - 2):
            for j in range(i + 1, n - 1):
                for k in range(j + 1, n):
                    a, bb, c = N[i], N[j], N[k]
                    det = (a[0] * (bb[1] * c[2] - bb[2] * c[1])
                           - a[1] * (bb[0] * c[2] - bb[2] * c[0])
                           + a[2] * (bb[0] * c[1] - bb[1] * c[0]))
                    if abs(det) < 1e-6:
                        continue
                    d1, d2, d3 = D[i], D[j], D[k]
                    x = (d1 * (bb[1] * c[2] - bb[2] * c[1])
                         - a[1] * (d2 * c[2] - bb[2] * d3)
                         + a[2] * (d2 * c[1] - bb[1] * d3)) / det
                    y = (a[0] * (d2 * c[2] - bb[2] * d3)
                         - d1 * (bb[0] * c[2] - bb[2] * c[0])
                         + a[2] * (bb[0] * d3 - d2 * c[0])) / det
                    z = (a[0] * (bb[1] * d3 - d2 * c[1])
                         - a[1] * (bb[0] * d3 - d2 * c[0])
                         + d1 * (bb[0] * c[1] - bb[1] * c[0])) / det
                    p = np.array([x, y, z])
                    if np.all(N @ p - D <= 0.1):
                        pts.append(p)
        if len(pts) < 4:
            continue
        P = np.array(pts)
        out.append((P[:, :2], float(P[:, 2].min()), float(P[:, 2].max())))
    return out


def hull2d(pts):
    p = sorted({(round(float(a), 2), round(float(b), 2)) for a, b in pts})
    if len(p) < 3:
        return p
    def half(seq):
        h = []
        for q in seq:
            while len(h) >= 2 and ((h[-1][0] - h[-2][0]) * (q[1] - h[-2][1])
                                   - (h[-1][1] - h[-2][1]) * (q[0] - h[-2][0])) <= 0:
                h.pop()
            h.append(q)
        return h
    return half(p)[:-1] + half(p[::-1])[:-1]


# ---------- нав: поле пола ----------
def nav_floor(navpath, clip_q=None, zband=None):
    A = read_nav2(navpath)['areas']
    lo = np.array([a['lo'] for a in A], float)
    hi = np.array([a['hi'] for a in A], float)
    keep = np.ones(len(A), bool)
    if clip_q:                                   # оставить крупнейший связный кластер
        from scipy import ndimage
        C = 256.0
        gx0, gy0 = lo[:, 0].min(), lo[:, 1].min()
        GW = int((hi[:, 0].max() - gx0) / C) + 2; GH = int((hi[:, 1].max() - gy0) / C) + 2
        g = np.zeros((GH, GW), bool)
        for i in range(len(A)):
            a0 = int((lo[i, 0] - gx0) / C); a1 = max(a0 + 1, int(np.ceil((hi[i, 0] - gx0) / C)))
            b0 = int((lo[i, 1] - gy0) / C); b1 = max(b0 + 1, int(np.ceil((hi[i, 1] - gy0) / C)))
            g[b0:b1, a0:a1] = True
        lab, n = ndimage.label(g, np.ones((3, 3)))
        if n > 1:
            sizes = ndimage.sum(g, lab, range(1, n + 1))
            best = int(np.argmax(sizes)) + 1
            cx = ((lo[:, 0] + hi[:, 0]) / 2 - gx0) / C
            cy = ((lo[:, 1] + hi[:, 1]) / 2 - gy0) / C
            ii = np.clip(cy.astype(int), 0, GH - 1); jj = np.clip(cx.astype(int), 0, GW - 1)
            keep = lab[ii, jj] == best
    if zband:
        zc = (lo[:, 2] + hi[:, 2]) / 2
        keep &= (zc >= zband[0]) & (zc < zband[1])
    lo, hi = lo[keep], hi[keep]
    x0 = lo[:, 0].min() - PAD; x1 = hi[:, 0].max() + PAD
    y0 = lo[:, 1].min() - PAD; y1 = hi[:, 1].max() + PAD
    W = int(math.ceil((x1 - x0) / CELL)); H = int(math.ceil((y1 - y0) / CELL))
    fz = np.full((H, W), np.nan, np.float32)
    for i in range(len(lo)):
        ax0 = max(0, int((lo[i, 0] - x0) / CELL)); ax1 = min(W, int(math.ceil((hi[i, 0] - x0) / CELL)))
        ay0 = max(0, int((lo[i, 1] - y0) / CELL)); ay1 = min(H, int(math.ceil((hi[i, 1] - y0) / CELL)))
        if ax1 <= ax0 or ay1 <= ay0:
            continue
        zz = (lo[i, 2] + hi[i, 2]) * .5
        cur = fz[ay0:ay1, ax0:ax1]
        fz[ay0:ay1, ax0:ax1] = np.where(np.isnan(cur), zz, np.minimum(cur, zz))
    return fz, (x0, y0, W, H)


# ---------- сборка ----------
PALETTE = dict(
    bg=(7, 10, 14), mass=(24, 35, 47), massedge=(46, 64, 82),
    floor_lo=(122, 142, 160), floor_hi=(226, 238, 247),
    low=(196, 158, 66), mid=(214, 118, 58), tall=(150, 62, 52),
    grid=(18, 26, 35),
)


def render(name, navpath, bsppath=None, clip_q=None, note='', navonly=False, zband=None, brushes=None):
    fz, (x0, y0, W, H) = nav_floor(navpath, clip_q, zband)
    have = ~np.isnan(fz)
    topz = np.full((H, W), np.nan, np.float32)
    mass = np.zeros((H, W), bool)

    if bsppath:
        br = brushes if brushes is not None else bsp_brushes(bsppath)
        area_map = W * H
        for xy, zlo, zhi in br:
            hp = hull2d(xy)
            if len(hp) < 3:
                continue
            px = [((a - x0) / CELL, (b - y0) / CELL) for a, b in hp]
            mnx = max(0, int(min(p[0] for p in px)) - 1); mxx = min(W, int(max(p[0] for p in px)) + 2)
            mny = max(0, int(min(p[1] for p in px)) - 1); mxy = min(H, int(max(p[1] for p in px)) + 2)
            if mxx <= mnx or mxy <= mny:
                continue
            w, h = mxx - mnx, mxy - mny
            if w * h > area_map * 0.45:           # скайбокс/оболочка
                continue
            im = Image.new('1', (w, h), 0)
            ImageDraw.Draw(im).polygon([(p[0] - mnx, p[1] - mny) for p in px], fill=1)
            m = np.array(im, bool)
            if not m.any():
                continue
            sub_f = fz[mny:mxy, mnx:mxx]
            sub_t = topz[mny:mxy, mnx:mxx]
            sub_m = mass[mny:mxy, mnx:mxx]
            nof = m & np.isnan(sub_f)
            sub_m |= nof
            ok = m & ~np.isnan(sub_f) & (zlo <= sub_f + 24) & (zhi > sub_f + 8) & (zhi < sub_f + 640)
            sub_t[ok] = np.where(np.isnan(sub_t[ok]), zhi, np.maximum(sub_t[ok], zhi))
            mass[mny:mxy, mnx:mxx] = sub_m
            topz[mny:mxy, mnx:mxx] = sub_t

    img = np.zeros((H, W, 3), np.uint8)
    img[:, :] = PALETTE['bg']
    # сетка 256u
    step = int(256 / CELL)
    img[::step, :] = PALETTE['grid']; img[:, ::step] = PALETTE['grid']
    if navonly:
        img[:, :] = PALETTE['mass']
        img[::step, :] = PALETTE['grid']; img[:, ::step] = PALETTE['grid']
    img[mass & ~have] = PALETTE['mass']
    # пол — рампа по высоте
    if have.any():
        zs = fz[have]
        lo_z, hi_z = np.percentile(zs, 2), np.percentile(zs, 98)
        t = np.clip((np.nan_to_num(fz, nan=lo_z) - lo_z) / max(1e-6, hi_z - lo_z), 0, 1)
        a = np.array(PALETTE['floor_lo'], float); b = np.array(PALETTE['floor_hi'], float)
        ramp = (a[None, None, :] + (b - a)[None, None, :] * t[:, :, None]).astype(np.uint8)
        img[have] = ramp[have]
    # тела
    if bsppath:
        hgt = topz - fz
        ok = have & ~np.isnan(topz)
        img[ok & (hgt <= 54)] = PALETTE['low']
        img[ok & (hgt > 54) & (hgt <= 128)] = PALETTE['mid']
        img[ok & (hgt > 128)] = PALETTE['tall']
    out = Image.fromarray(img[::-1])              # Y вверх, как на радаре
    return out, dict(W=W, H=H, x0=x0, y0=y0,
                     floor_px=int(have.sum()), note=note,
                     size_u=(W * CELL, H * CELL))
