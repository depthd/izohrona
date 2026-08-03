#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Разбор брашей из VBSP (Source 1, версия 21).
Даёт то, чего нет в наве: ТОЧНЫЕ ВЫСОТЫ и габариты всего, что стоит на карте.

Лампы: 1 PLANES, 18 BRUSHES, 19 BRUSHSIDES, 6 TEXINFO, 2 TEXDATA,
       43 TEXDATA_STRING_DATA, 44 TEXDATA_STRING_TABLE, 0 ENTITIES.
"""
import struct, sys, os
import numpy as np
from itertools import combinations

CONTENTS = {
    'SOLID': 0x1, 'WINDOW': 0x2, 'GRATE': 0x8, 'WATER': 0x20,
    'PLAYERCLIP': 0x10000, 'MONSTERCLIP': 0x20000,
    'LADDER': 0x20000000,
}


def lumps(path):
    d = open(path, 'rb').read()
    magic, ver = struct.unpack_from('<4sI', d, 0)
    assert magic == b'VBSP', 'не VBSP'
    L = {}
    for i in range(64):
        ofs, ln, lver, cc = struct.unpack_from('<iii4s', d, 8 + i * 16)
        L[i] = d[ofs:ofs + ln] if ln > 0 else b''
    return d, ver, L


def parse(path):
    d, ver, L = lumps(path)

    planes = np.frombuffer(L[1], dtype=np.dtype([
        ('n', '<3f4'), ('dist', '<f4'), ('type', '<i4')]))
    brushes = np.frombuffer(L[18], dtype=np.dtype([
        ('first', '<i4'), ('num', '<i4'), ('contents', '<i4')]))
    sides = np.frombuffer(L[19], dtype=np.dtype([
        ('plane', '<u2'), ('texinfo', '<i2'), ('dispinfo', '<i2'), ('bevel', '<i2')]))

    # имена материалов
    names = []
    try:
        tbl = np.frombuffer(L[44], dtype='<i4')
        blob = L[43]
        for o in tbl:
            e = blob.find(b'\0', o)
            names.append(blob[o:e].decode('latin-1'))
        texinfo = np.frombuffer(L[6], dtype=np.dtype([
            ('tv', '<32f4'), ('flags', '<i4'), ('texdata', '<i4')]))
        texdata = np.frombuffer(L[2], dtype=np.dtype([
            ('refl', '<3f4'), ('nameid', '<i4'), ('w', '<i4'), ('h', '<i4'),
            ('vw', '<i4'), ('vh', '<i4')]))
    except Exception:
        texinfo = texdata = None

    out = []
    for bi, b in enumerate(brushes):
        ss = sides[b['first']:b['first'] + b['num']]
        pl = [(planes[s['plane']]['n'], float(planes[s['plane']]['dist'])) for s in ss]
        # вершины = пересечения троек плоскостей, удовлетворяющие всем остальным
        pts = []
        n = len(pl)
        if n < 4:
            continue
        for i, j, k in combinations(range(n), 3):
            A = np.array([pl[i][0], pl[j][0], pl[k][0]], float)
            if abs(np.linalg.det(A)) < 1e-6:
                continue
            try:
                p = np.linalg.solve(A, np.array([pl[i][1], pl[j][1], pl[k][1]], float))
            except Exception:
                continue
            ok = True
            for m in range(n):
                if np.dot(pl[m][0], p) - pl[m][1] > 0.1:
                    ok = False; break
            if ok:
                pts.append(p)
        if len(pts) < 4:
            continue
        P = np.array(pts)
        lo = P.min(axis=0); hi = P.max(axis=0)
        mats = set()
        if texinfo is not None:
            for s in ss:
                ti = s['texinfo']
                if 0 <= ti < len(texinfo):
                    td = texinfo[ti]['texdata']
                    if 0 <= td < len(texdata):
                        nid = texdata[td]['nameid']
                        if 0 <= nid < len(names):
                            mats.add(names[nid].upper())
        out.append(dict(i=bi, contents=int(b['contents']), lo=lo, hi=hi,
                        size=hi - lo, mats=mats))
    return dict(ver=ver, brushes=out, ents=L[0].decode('latin-1', 'replace'))


def cflags(c):
    return [k for k, v in CONTENTS.items() if c & v]


if __name__ == '__main__':
    for f in sys.argv[1:]:
        r = parse(f)
        B = r['brushes']
        print(f'\n=== {os.path.basename(f)} === брашей {len(B)}')
        import collections
        cc = collections.Counter()
        for b in B:
            for k in cflags(b['contents']) or ['(нет)']:
                cc[k] += 1
        print('  содержимое:', dict(cc.most_common()))
        mm = collections.Counter()
        for b in B:
            for m in b['mats']:
                mm[m] += 1
        print('  материалы:', dict(mm.most_common(12)))
        sz = np.array([b['size'] for b in B])
        print(f'  высота брашей (z): медиана {np.median(sz[:,2]):.0f}u  '
              f'кв [{np.percentile(sz[:,2],25):.0f}..{np.percentile(sz[:,2],75):.0f}]')
        ext = np.array([b['lo'] for b in B]).min(axis=0), np.array([b['hi'] for b in B]).max(axis=0)
        print(f'  габарит карты: {ext[1]-ext[0]}')
