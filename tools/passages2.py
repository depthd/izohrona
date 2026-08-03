#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ПРОХОДЫ И ПРОСВЕТЫ, исправлено.
Ширина — только на срединной оси (гребне поля расстояний), иначе клетка у стены
в большом зале считается «узким проходом».
Потолок — сравнение с ЛОКАЛЬНЫМ полом под самим телом, не с глобальным минимумом."""
import sys, os
import numpy as np
from scipy import ndimage
sys.path.insert(0,'.')
from bsp import parse
from navlib2 import read_nav2

def build(bspf,navf,cell):
    B=parse(bspf)['brushes']; nav=read_nav2(navf)['areas']
    xs=[a['lo'][0] for a in nav]+[a['hi'][0] for a in nav]
    ys=[a['lo'][1] for a in nav]+[a['hi'][1] for a in nav]
    x0,y0=min(xs),min(ys)
    W=int((max(xs)-x0)/cell)+2; H=int((max(ys)-y0)/cell)+2
    floor=np.full((H,W),np.nan,np.float32)
    for a in nav:
        ax0=max(0,int((a['lo'][0]-x0)/cell)); ax1=min(W,int(np.ceil((a['hi'][0]-x0)/cell)))
        ay0=max(0,int((a['lo'][1]-y0)/cell)); ay1=min(H,int(np.ceil((a['hi'][1]-y0)/cell)))
        if ax1<=ax0 or ay1<=ay0: continue
        z=(a['lo'][2]+a['hi'][2])*0.5
        cur=floor[ay0:ay1,ax0:ax1]
        floor[ay0:ay1,ax0:ax1]=np.where(np.isnan(cur),z,np.minimum(cur,z))
    return B,floor,(x0,y0),cell

def headroom(B,floor,org,cell):
    """потолок = низ тела, висящего выше ЛОКАЛЬНОГО пола + рост"""
    H,W=floor.shape; x0,y0=org
    known=~np.isnan(floor)
    idx=ndimage.distance_transform_edt(~known,return_distances=False,return_indices=True)
    ref=floor[tuple(idx)]
    ceil=np.full((H,W),np.inf,np.float32)
    for b in B:
        ax0=max(0,int((b['lo'][0]-x0)/cell)); ax1=min(W,int(np.ceil((b['hi'][0]-x0)/cell)))
        ay0=max(0,int((b['lo'][1]-y0)/cell)); ay1=min(H,int(np.ceil((b['hi'][1]-y0)/cell)))
        if ax1<=ax0 or ay1<=ay0: continue
        sub=ref[ay0:ay1,ax0:ax1]
        # тело считается потолком там, где его НИЗ выше локального пола на рост
        m=(b['lo'][2]-sub)>=72.0
        if not m.any(): continue
        cur=ceil[ay0:ay1,ax0:ax1]
        cur[m]=np.minimum(cur[m],b['lo'][2])
    return np.where(known&np.isfinite(ceil), ceil-floor, np.nan), known

for bspf,navf in [('de_dust2_fps.bsp','de_dust2_fps.nav'),('de_mirage_fps.bsp','de_mirage_fps.nav')]:
    print(f'\n{"="*72}\n=== {bspf}')
    print(f'  {"сетка":>6} {"ширина НА ОСИ: медиана / квартили":>42} {"узкие p10":>12}')
    for c in (32.,16.,8.,4.,2.):
        B,floor,org,_=build(bspf,navf,c)
        g=~np.isnan(floor)
        if g.sum()<100: continue
        d=ndimage.distance_transform_edt(g)
        # гребень поля расстояний = срединная ось
        mx=ndimage.maximum_filter(d,size=3)
        ridge=g&(d>=mx-1e-6)&(d>0.9)
        w=d[ridge]*2*c
        print(f'  {c:6.0f}u {np.median(w):20.0f}u [{np.percentile(w,25):.0f}..{np.percentile(w,75):.0f}]'
              f'{np.percentile(w,10):14.0f}u   (клеток на оси {ridge.sum()})')
    # просветы на 8u
    B,floor,org,_=build(bspf,navf,8.)
    hd,known=headroom(B,floor,org,8.)
    hv=hd[np.isfinite(hd)]
    print(f'\n  ПЕРЕКРЫТО СВЕРХУ: {100*np.isfinite(hd).sum()/known.sum():.1f}% пола')
    if len(hv):
        print(f'    просвет: медиана {np.median(hv):.0f}u кв [{np.percentile(hv,25):.0f}..{np.percentile(hv,75):.0f}]')
        for a,b_,nm in [(72,128,'низкая АРКА 72-128u'),(128,200,'проём 128-200u'),
                        (200,320,'комната 200-320u'),(320,1e9,'высокий зал >320u')]:
            n=((hv>=a)&(hv<b_)).sum()
            if n: print(f'      {nm:22s} {100*n/known.sum():5.1f}% всего пола  ({100*n/len(hv):4.1f}% перекрытого)')
    # ширина на оси по полосам, 4u
    B,floor,org,_=build(bspf,navf,4.)
    g=~np.isnan(floor); d=ndimage.distance_transform_edt(g)
    mx=ndimage.maximum_filter(d,size=3); ridge=g&(d>=mx-1e-6)&(d>0.9)
    w=d[ridge]*8.
    print(f'\n  ШИРИНЫ НА ОСИ (сетка 4u):')
    for a,b_,nm in [(0,96,'дверь <96u'),(96,160,'узкий 96-160u'),(160,256,'коридор 160-256u'),
                    (256,448,'широкий 256-448u'),(448,768,'зал 448-768u'),(768,1e9,'площадь >768u')]:
        print(f'    {nm:20s} {100*((w>=a)&(w<b_)).mean():5.1f}%')
