#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Отрисовка найденных укрытий поверх пола — для проверки глазами."""
import sys, os, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from cover_b import raster, blocking, mountable, classify, CELL
from navlib2 import HS_IN_COVER, HS_EXPOSED


def draw(nav, out):
    nm = os.path.basename(nav)[:-4]
    M = raster(nav)
    g = M['g'].astype(bool)
    bl, holes, outer = blocking(M)
    mo, high = mountable(M)

    H, W = g.shape
    img = np.zeros((H, W, 3), np.float32)
    img[...] = 1.0
    img[g] = (0.82, 0.82, 0.84)          # пол
    img[outer] = (1.0, 1.0, 1.0)          # снаружи

    hl, _ = ndimage.label(holes)
    for i, sl in enumerate(ndimage.find_objects(hl), start=1):
        m = (hl[sl] == i)
        hgt = (sl[0].stop - sl[0].start) * CELL
        wid = (sl[1].stop - sl[1].start) * CELL
        s, l = min(wid, hgt), max(wid, hgt)
        if s < 32:
            col = (0.75, 0.75, 0.55)
        elif l <= 192 and s <= 192:
            col = (0.85, 0.15, 0.15)      # укрытие-дыра
        else:
            col = (0.45, 0.30, 0.30)      # архитектура
        sub = img[sl]
        sub[m] = col
        img[sl] = sub

    ml, _ = ndimage.label(high)
    for i, sl in enumerate(ndimage.find_objects(ml), start=1):
        m = (ml[sl] == i)
        sub = img[sl]
        sub[m] = (0.15, 0.35, 0.90)       # влезаемое
        img[sl] = sub

    fig, ax = plt.subplots(figsize=(W / 45, H / 45), dpi=110)
    ax.imshow(img, origin='lower', interpolation='nearest')

    # хайдспоты
    x0, y0 = M['org']
    cx_i, cy_i, cx_e, cy_e = [], [], [], []
    for a in M['nav']['areas']:
        for h in a['hides']:
            hx, hy, _ = h['pos']
            cx = (hx - x0) / CELL; cy = (hy - y0) / CELL
            if h['flags'] & HS_IN_COVER:
                cx_i.append(cx); cy_i.append(cy)
            elif h['flags'] & HS_EXPOSED:
                cx_e.append(cx); cy_e.append(cy)
    ax.scatter(cx_e, cy_e, s=3, c='#bbbbbb', marker='.', linewidths=0, label='EXPOSED')
    ax.scatter(cx_i, cy_i, s=6, c='#0a8a3a', marker='.', linewidths=0, label='IN_COVER')

    # подписи зон
    place, names = M['place'], M['names']
    for i, znm in enumerate(names):
        m = (place == i)
        if m.sum() < 40:
            continue
        yy, xx = np.nonzero(m)
        ax.text(xx.mean(), yy.mean(), znm, fontsize=6, color='#1133aa',
                ha='center', va='center', weight='bold', alpha=0.75)

    ax.set_title(f'{nm} — красное: глухое укрытие(дыра)  синее: влезаемое  '
                 f'тёмное: архитектура  зелёное: IN_COVER', fontsize=9)
    ax.set_xticks([]); ax.set_yticks([])
    plt.tight_layout()
    plt.savefig(out, dpi=110)
    print('saved', out, img.shape)


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), '..', 'nav_files')
    for nm in (sys.argv[1:] or ['de_dust2_v16_CORRECT']):
        draw(os.path.join(base, nm + '.nav'), f'/home/claude/out_{nm}.png')
