#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ВЫСОТЫ УКРЫТИЙ из брашей BSP. Земля = ВЫСШИЙ верх браша, лежащий ниже укрытия,
среди брашей, чей след пересекает окрестность укрытия. Это поверхность под игроком.
Силуэт CS2: стоя 72u (глаз 64u), присев 54u (глаз 46u), запрыгивание 59u, шаг 18u."""
import sys, os, collections
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from bsp import parse
STAND, CROUCH, JUMP, STEP = 72., 54., 59., 18.
PAD = 48.0

def analyse(path, maxfoot=512.0):
    B = parse(path)['brushes']
    lo = np.array([b['lo'] for b in B]); hi = np.array([b['hi'] for b in B])
    sz = hi - lo
    foot = np.maximum(sz[:,0], sz[:,1])
    rows = []
    for i, b in enumerate(B):
        if foot[i] > maxfoot or sz[i,2] < 4: continue
        top = hi[i,2]
        # браши, чей след пересекает окрестность укрытия
        ov = (hi[:,0] > lo[i,0]-PAD) & (lo[:,0] < hi[i,0]+PAD) & \
             (hi[:,1] > lo[i,1]-PAD) & (lo[:,1] < hi[i,1]+PAD)
        ov[i] = False
        cand = hi[ov,2]
        cand = cand[cand < top - 2]
        if len(cand) == 0: continue
        gz = float(cand.max())            # поверхность под игроком
        h = top - gz
        if h <= 4 or h > 320: continue
        rows.append(dict(h=h, w=min(sz[i,0],sz[i,1]), l=max(sz[i,0],sz[i,1])))
    return rows

def band(h):
    if h < STEP:   return '0. ступень <18u'
    if h < CROUCH: return '1. не кроет присевшего 18-54u'
    if h < STAND:  return '2. кроет присевшего 54-72u'
    if h <= 128:   return '3. КРОЕТ СТОЯЩЕГО 72-128u'
    return '4. высокое >128u'

allh=[]; allw=[]; alll=[]
for f in sys.argv[1:]:
    rows = analyse(f)
    if not rows: print(f'{f}: пусто'); continue
    hh=np.array([x['h'] for x in rows]); allh.append(hh)
    allw.append(np.array([x['w'] for x in rows])); alll.append(np.array([x['l'] for x in rows]))
    print(f'\n=== {os.path.basename(f)} === укрытий {len(rows)}')
    c=collections.Counter(band(x) for x in hh)
    for k in sorted(c):
        sel=hh[[band(x)==k for x in hh]]
        print(f'   {k:31s} {c[k]:4d}  {100*c[k]/len(hh):5.1f}%  медиана {np.median(sel):5.0f}u')
    print(f'   кроет стоящего >=72u: {100*(hh>=STAND).mean():5.1f}%   '
          f'не кроет присевшего <54u: {100*(hh<CROUCH).mean():5.1f}%   '
          f'влезаемо <=59u: {100*(hh<=JUMP).mean():5.1f}%')

hh=np.concatenate(allh); ww=np.concatenate(allw); ll=np.concatenate(alll)
print('\n########## ОБЕ КАРТЫ ##########')
print(f'  укрытий {len(hh)},  высота медиана {np.median(hh):.0f}u кв [{np.percentile(hh,25):.0f}..{np.percentile(hh,75):.0f}]')
print(f'  след медиана {np.median(ww):.0f} x {np.median(ll):.0f}u')
print(f'\n{"":30s}{"РЕАЛЬНЫЕ":>10}{"ГЕНЕРАТОР":>12}')
print(f'  {"кроет стоящего (>=72u)":28s}{100*(hh>=STAND).mean():9.1f}%{17.5:11.1f}%')
print(f'  {"кроет присевшего (54-72u)":28s}{100*((hh>=CROUCH)&(hh<STAND)).mean():9.1f}%{35.0:11.1f}%')
print(f'  {"НЕ кроет присевшего (<54u)":28s}{100*(hh<CROUCH).mean():9.1f}%{44.9:11.1f}%')
print('\n  распределение высот, полосы по 16u:')
for a in range(0,224,16):
    n=((hh>=a)&(hh<a+16)).sum()
    if n: print(f'   {a:3d}-{a+16:3d}u {100*n/len(hh):5.1f}% {"#"*int(70*n/len(hh))}')
