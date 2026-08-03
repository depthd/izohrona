#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""СИЛУЭТ УКРЫТИЙ. Нав -> пол. BSP -> что на нём стоит.
Учитываются только брашы, СТОЯЩИЕ на полу и не выше пола+320u:
скайбокс, потолки и навесы исключены. Объект = связная область силуэта,
поэтому составной ящик из трёх брашей считается ОДНИМ укрытием."""
import sys, os, collections
import numpy as np
from scipy import ndimage
sys.path.insert(0,'.')
from bsp import parse
from navlib2 import read_nav2
CELL=16.0; STAND,CROUCH,JUMP,STEP=72.,54.,59.,18.

def build(bspf,navf):
    B=parse(bspf)['brushes']; nav=read_nav2(navf)['areas']
    xs=[a['lo'][0] for a in nav]+[a['hi'][0] for a in nav]
    ys=[a['lo'][1] for a in nav]+[a['hi'][1] for a in nav]
    zs=[a['lo'][2] for a in nav]+[a['hi'][2] for a in nav]
    x0,y0=min(xs),min(ys); zmin,zmax=min(zs),max(zs)
    W=int((max(xs)-x0)/CELL)+2; H=int((max(ys)-y0)/CELL)+2
    floor=np.full((H,W),np.nan,np.float32)
    for a in nav:
        ax0=max(0,int((a['lo'][0]-x0)/CELL)); ax1=min(W,int(np.ceil((a['hi'][0]-x0)/CELL)))
        ay0=max(0,int((a['lo'][1]-y0)/CELL)); ay1=min(H,int(np.ceil((a['hi'][1]-y0)/CELL)))
        if ax1<=ax0 or ay1<=ay0: continue
        z=(a['lo'][2]+a['hi'][2])*0.5
        cur=floor[ay0:ay1,ax0:ax1]
        floor[ay0:ay1,ax0:ax1]=np.where(np.isnan(cur),z,np.minimum(cur,z))
    top=np.full((H,W),-1e9,np.float32); used=0
    for b in B:
        # стоит на полу и не выше пола+320
        if b['hi'][2] > zmax+320 or b['hi'][2] < zmin-32: continue
        if b['lo'][2] > zmax+64: continue
        ax0=max(0,int((b['lo'][0]-x0)/CELL)); ax1=min(W,int(np.ceil((b['hi'][0]-x0)/CELL)))
        ay0=max(0,int((b['lo'][1]-y0)/CELL)); ay1=min(H,int(np.ceil((b['hi'][1]-y0)/CELL)))
        if ax1<=ax0 or ay1<=ay0: continue
        used+=1
        cur=top[ay0:ay1,ax0:ax1]; np.maximum(cur,b['hi'][2],out=cur)
    known=~np.isnan(floor)
    idx=ndimage.distance_transform_edt(~known,return_distances=False,return_indices=True)
    ref=floor[tuple(idx)]; dist=ndimage.distance_transform_edt(~known)*CELL
    rise=np.where((dist<=128)&(top>-1e8), top-ref, np.nan)
    return rise,known,used,len(B)

def objects(rise,known):
    m=np.isfinite(rise)&(rise>STEP)&(rise<=320)&(~known)
    lab,_=ndimage.label(m)
    out=[]
    for i,sl in enumerate(ndimage.find_objects(lab),start=1):
        if sl is None: continue
        c=(lab[sl]==i)
        if c.sum()<1: continue
        h=float(np.nanmedian(rise[sl][c]))
        w=(sl[1].stop-sl[1].start)*CELL; l=(sl[0].stop-sl[0].start)*CELL
        if max(w,l)>640: continue
        out.append(dict(h=h,w=min(w,l),l=max(w,l),cells=int(c.sum())))
    return out

def band(h):
    if h<CROUCH: return '1. не кроет присевшего 18-54u'
    if h<STAND:  return '2. кроет присевшего 54-72u'
    if h<=128:   return '3. КРОЕТ СТОЯЩЕГО 72-128u'
    return '4. высокое 128-320u'

if __name__=='__main__':
    allh=[];allw=[];alll=[]
    for bspf,navf in [('de_dust2_fps.bsp','de_dust2_fps.nav'),('de_mirage_fps.bsp','de_mirage_fps.nav')]:
        rise,known,used,tot=build(bspf,navf); O=objects(rise,known)
        if not O: print(f'{bspf}: пусто'); continue
        hh=np.array([o['h'] for o in O]); allh.append(hh)
        allw.append(np.array([o['w'] for o in O])); alll.append(np.array([o['l'] for o in O]))
        print(f'\n=== {bspf} === брашей в работе {used}/{tot}, объектов-укрытий {len(O)}')
        c=collections.Counter(band(x) for x in hh)
        for k in sorted(c):
            sel=hh[[band(x)==k for x in hh]]
            print(f'   {k:31s} {c[k]:4d}  {100*c[k]/len(hh):5.1f}%  медиана {np.median(sel):5.0f}u')
        print(f'   кроет стоящего >=72u: {100*(hh>=STAND).mean():5.1f}%   влезаемо <=59u: {100*(hh<=JUMP).mean():5.1f}%')
    hh=np.concatenate(allh); ww=np.concatenate(allw); ll=np.concatenate(alll)
    print('\n########## ОБЕ КАРТЫ ##########')
    print(f'  укрытий {len(hh)}, высота медиана {np.median(hh):.0f}u кв [{np.percentile(hh,25):.0f}..{np.percentile(hh,75):.0f}]')
    print(f'  след медиана {np.median(ww):.0f} x {np.median(ll):.0f}u')
    print(f'\n{"":32s}{"РЕАЛЬНЫЕ":>10}{"ГЕНЕРАТОР":>12}')
    print(f'  {"кроет стоящего (>=72u)":30s}{100*(hh>=STAND).mean():9.1f}%{17.5:11.1f}%')
    print(f'  {"кроет присевшего (54-72u)":30s}{100*((hh>=CROUCH)&(hh<STAND)).mean():9.1f}%{35.0:11.1f}%')
    print(f'  {"НЕ кроет присевшего (<54u)":30s}{100*(hh<CROUCH).mean():9.1f}%{44.9:11.1f}%')
    print('\n  распределение высот, полосы 16u:')
    for a in range(16,320,16):
        n=((hh>=a)&(hh<a+16)).sum()
        if n: print(f'   {a:3d}-{a+16:3d}u {100*n/len(hh):5.1f}% {"#"*int(70*n/len(hh))}')
