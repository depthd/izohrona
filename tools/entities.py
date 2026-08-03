#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сущности и модели BSP: сайты (func_bomb_target), спавны, зоны закупки.
Всё в мировых координатах, БЕЗ сетки — точность исходная."""
import struct, sys, os, re
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from bsp import lumps


def models(path):
    d, ver, L = lumps(path)
    M = np.frombuffer(L[14], dtype=np.dtype([
        ('mins', '<3f4'), ('maxs', '<3f4'), ('origin', '<3f4'),
        ('head', '<i4'), ('ff', '<i4'), ('nf', '<i4')]))
    return M


def ents(path):
    d, ver, L = lumps(path)
    txt = L[0].decode('latin-1', 'replace')
    out = []
    for blk in re.findall(r'\{([^{}]*)\}', txt):
        kv = dict(re.findall(r'"([^"]*)"\s+"([^"]*)"', blk))
        if kv:
            out.append(kv)
    return out


def vec(s):
    try:
        return np.array([float(v) for v in s.split()])
    except Exception:
        return None


def report(path):
    nm = os.path.basename(path)
    E = ents(path)
    M = models(path)
    print(f'\n{"="*66}\n=== {nm}')

    # --- спавны ---
    for cls, tag in (('info_player_terrorist', 'T'), ('info_player_counterterrorist', 'CT')):
        P = [vec(e['origin']) for e in E if e.get('classname') == cls and 'origin' in e]
        P = np.array([p for p in P if p is not None])
        if len(P):
            c = P.mean(axis=0)
            sp = P.max(axis=0) - P.min(axis=0)
            print(f'  спавн {tag:2s}: {len(P):3d} точек, центр ({c[0]:7.0f},{c[1]:7.0f},{c[2]:6.0f}), '
                  f'разброс {sp[0]:.0f}x{sp[1]:.0f}u, z-разброс {sp[2]:.0f}u')

    # --- сайты ---
    sites = []
    for e in E:
        if e.get('classname') != 'func_bomb_target':
            continue
        mi = e.get('model', '')
        if mi.startswith('*'):
            k = int(mi[1:])
            mm = M[k]
            lo = np.array(mm['mins'], float); hi = np.array(mm['maxs'], float)
            sz = hi - lo
            sites.append(dict(lo=lo, hi=hi, sz=sz, name=e.get('targetname', '')))
    sites.sort(key=lambda s: s['lo'][0])
    for i, s in enumerate(sites):
        lbl = 'A' if i == len(sites) - 1 else 'B'
        print(f'  САЙТ {lbl}: {s["sz"][0]:5.0f} x {s["sz"][1]:5.0f} u  '
              f'(= {s["sz"][0]/96:.1f} x {s["sz"][1]/96:.1f} клеток по 96u), '
              f'высота объёма {s["sz"][2]:.0f}u, площадь {s["sz"][0]*s["sz"][1]/1000:.0f}k u², '
              f'центр ({(s["lo"][0]+s["hi"][0])/2:.0f},{(s["lo"][1]+s["hi"][1])/2:.0f})')
    if len(sites) == 2:
        d = np.hypot(*(( (sites[0]['lo']+sites[0]['hi'])/2 - (sites[1]['lo']+sites[1]['hi'])/2 )[:2]))
        r = sites[1]['sz'][0]*sites[1]['sz'][1] / (sites[0]['sz'][0]*sites[0]['sz'][1])
        print(f'  A<->B: расстояние между центрами {d:.0f}u, отношение площадей A/B {r:.2f}')

    # --- зоны закупки ---
    for e in E:
        if e.get('classname') == 'func_buyzone' and e.get('model', '').startswith('*'):
            mm = M[int(e['model'][1:])]
            sz = np.array(mm['maxs'], float) - np.array(mm['mins'], float)
            print(f'  зона закупки: {sz[0]:.0f} x {sz[1]:.0f}u')

    # --- габарит мира ---
    w = M[0]
    sz = np.array(w['maxs'], float) - np.array(w['mins'], float)
    print(f'  габарит мира: {sz[0]:.0f} x {sz[1]:.0f} x {sz[2]:.0f}u  '
          f'(= {sz[0]/96:.0f} x {sz[1]/96:.0f} клеток)')
    return sites, E, M


if __name__ == '__main__':
    for f in sys.argv[1:]:
        report(f)
