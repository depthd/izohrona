#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ВЕРТИКАЛЬНЫЕ ПРОХОДЫ.
Нав: связи между областями с перепадом -> ступени / прыжки / спрыгивания / лестницы.
BSP: наклонные грани -> пандусы; стопки мелких тел -> лестницы.
Игрок: шаг 18u, прыжок 59u, безопасное падение до ~200u."""
import struct, sys, os, collections
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from bsp import lumps, parse
from navlib2 import read_nav2

STEP, JUMP = 18., 59.


def nav_ladders(path):
    """пересчёт лестничных связей: парсер их пропускает, но счётчики читает"""
    d = open(path, 'rb').read(); p = [0]
    def rd(f):
        s = struct.calcsize('<'+f); v = struct.unpack_from('<'+f, d, p[0]); p[0] += s; return v
    magic, ver = rd('II')
    minor = rd('I')[0] if ver >= 10 else 0
    rd('I')
    if ver >= 14: rd('B')
    places = ['']
    (pc,) = rd('H')
    for _ in range(pc):
        (ln,) = rd('H'); places.append(d[p[0]:p[0]+ln-1].decode('latin-1')); p[0] += ln
    if ver > 11: rd('B')
    (ac,) = rd('I')
    lad_up = lad_dn = 0
    for _ in range(ac):
        rd('I')
        if ver <= 8: rd('B')
        elif ver < 13: rd('H')
        else: rd('I')
        rd('3f'); rd('3f'); rd('2f')
        for _ in range(4):
            (c,) = rd('I')
            if c: rd('%dI' % c)
        (hs,) = rd('B')
        for _ in range(hs): rd('I3fB')
        if ver < 15:
            (ap,) = rd('B'); p[0] += ap*14
        (ec,) = rd('I')
        for _ in range(ec):
            rd('IBIB'); (sc,) = rd('B'); p[0] += sc*5
        rd('H')
        if ver >= 6:
            (cu,) = rd('I'); p[0] += cu*4; lad_up += cu
            (cd,) = rd('I'); p[0] += cd*4; lad_dn += cd
            rd('2f')
        if ver >= 11: rd('4f')
        if ver >= 16:
            (vc,) = rd('I'); p[0] += vc*5
            rd('I')
            (gc,) = rd('B'); p[0] += gc*14
    return lad_up, lad_dn, p[0], len(d)


def transitions(navf):
    r = read_nav2(navf)
    A = {a['id']: a for a in r['areas']}
    seen = set(); out = []
    for a in r['areas']:
        za = (a['lo'][2] + a['hi'][2]) * 0.5
        for d in range(4):
            for nid in a['conns'][d]:
                b = A.get(nid)
                if b is None: continue
                k = (min(a['id'], nid), max(a['id'], nid))
                if k in seen: continue
                seen.add(k)
                zb = (b['lo'][2] + b['hi'][2]) * 0.5
                out.append(abs(zb - za))
    return np.array(out), r


def ramps(bspf):
    """наклонные верхние грани: нормаль с 0.3 < nz < 0.99"""
    d, ver, L = lumps(bspf)
    planes = np.frombuffer(L[1], dtype=np.dtype([('n','<3f4'),('dist','<f4'),('type','<i4')]))
    brushes = np.frombuffer(L[18], dtype=np.dtype([('first','<i4'),('num','<i4'),('contents','<i4')]))
    sides = np.frombuffer(L[19], dtype=np.dtype([('plane','<u2'),('texinfo','<i2'),
                                                 ('dispinfo','<i2'),('bevel','<i2')]))
    nramp = 0; slopes = []
    for b in brushes:
        ss = sides[b['first']:b['first']+b['num']]
        for s in ss:
            n = planes[s['plane']]['n']
            nz = float(n[2])
            if 0.30 < nz < 0.995:
                slopes.append(np.degrees(np.arccos(min(1.0, nz))))
                nramp += 1
                break
    return nramp, len(brushes), np.array(slopes)


if __name__ == '__main__':
    for bspf, navf in [('de_dust2_fps.bsp','de_dust2_fps.nav'),
                       ('de_mirage_fps.bsp','de_mirage_fps.nav')]:
        print(f'\n{"="*68}\n=== {os.path.basename(bspf)}')
        dz, r = transitions(navf)
        n = len(dz)
        print(f'  связей между областями нава: {n}')
        bands = [(0, 8, 'ровно <8u'), (8, STEP, 'ступень 8-18u'),
                 (STEP, JUMP, 'ПРЫЖОК 18-59u'), (JUMP, 200, 'спрыгнуть 59-200u'),
                 (200, 1e9, 'обрыв >200u')]
        for a, b, nm in bands:
            k = ((dz >= a) & (dz < b)).sum()
            print(f'    {nm:20s} {k:6d}  {100*k/n:5.1f}%')
        vert = dz[dz >= STEP]
        print(f'  ВЕРТИКАЛЬНЫХ переходов (>=18u): {len(vert)} = {100*len(vert)/n:.1f}% связей')
        if len(vert):
            print(f'    величина: медиана {np.median(vert):.0f}u  '
                  f'кв [{np.percentile(vert,25):.0f}..{np.percentile(vert,75):.0f}]  макс {vert.max():.0f}u')
        lu, ld, cons, tot = nav_ladders(navf)
        print(f'  лестничных связей нава: вверх {lu}, вниз {ld}  (сходимость {cons}/{tot})')
        nr, nb, sl = ramps(bspf)
        print(f'  тел с наклонной гранью (пандусы/скосы): {nr} из {nb} = {100*nr/nb:.1f}%')
        if len(sl):
            print(f'    угол наклона: медиана {np.median(sl):.0f}°  '
                  f'кв [{np.percentile(sl,25):.0f}..{np.percentile(sl,75):.0f}]°')
        # ступенчатые лестницы: тела высотой 8-18u, сгруппированные
        B = parse(bspf)['brushes']
        sz = np.array([b['hi']-b['lo'] for b in B])
        stair = ((sz[:,2] >= 6) & (sz[:,2] <= 20)).sum()
        print(f'  тел ростом 6-20u (ступени лестниц): {stair} = {100*stair/len(B):.1f}%')
