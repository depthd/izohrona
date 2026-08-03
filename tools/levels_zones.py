#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ВЫСОТЫ, ПЛАТО, ЗОНЫ, ГОРЯЧИЕ ТОЧКИ. Многосеточно."""
import sys,os,re,collections
import numpy as np
from scipy import ndimage
sys.path.insert(0,'.')
from navlib2 import read_nav2
from bsp import parse
from entities import ents, models, vec
STEP=18.

def floorgrid(navf,cell):
    nav=read_nav2(navf)['areas']
    xs=[a['lo'][0] for a in nav]+[a['hi'][0] for a in nav]
    ys=[a['lo'][1] for a in nav]+[a['hi'][1] for a in nav]
    x0,y0=min(xs),min(ys)
    W=int((max(xs)-x0)/cell)+2; H=int((max(ys)-y0)/cell)+2
    z=np.full((H,W),np.nan,np.float32); pl=np.full((H,W),-1,np.int16)
    names=read_nav2(navf)['places']; nidx={n:i for i,n in enumerate(names)}
    for a in nav:
        ax0=max(0,int((a['lo'][0]-x0)/cell)); ax1=min(W,int(np.ceil((a['hi'][0]-x0)/cell)))
        ay0=max(0,int((a['lo'][1]-y0)/cell)); ay1=min(H,int(np.ceil((a['hi'][1]-y0)/cell)))
        if ax1<=ax0 or ay1<=ay0: continue
        zz=(a['lo'][2]+a['hi'][2])*0.5
        cur=z[ay0:ay1,ax0:ax1]
        z[ay0:ay1,ax0:ax1]=np.where(np.isnan(cur),zz,np.minimum(cur,zz))
        i=nidx.get(a['pname'],-1)
        if i>=0: pl[ay0:ay1,ax0:ax1]=i
    return z,pl,names,(x0,y0)

def retake_pts(path):
    if not os.path.exists(path): return {}
    t=open(path,encoding='latin-1').read()
    out=collections.defaultdict(list)
    cur=None
    for ln in t.splitlines():
        s=ln.strip()
        m=re.match(r'"(CT|T)"',s)
        if m: cur=m.group(1)
        m=re.match(r'"\d+"\s+"([-\d\. ]+)"',s)
        if m and cur:
            v=[float(x) for x in m.group(1).split()]
            if len(v)>=3: out[cur].append(v[:3])
    return out

for navf,bspf,rtk in [('de_dust2_fps.nav','de_dust2_fps.bsp','de_dust2_fps_retake.txt'),
                      ('de_mirage_fps.nav','de_mirage_fps.bsp','de_mirage_fps_retake.txt')]:
    print(f'\n{"="*72}\n=== {navf}')
    # --- высоты многосеточно ---
    print(f'  {"сетка":>6} {"плато":>7} {"плоско<8u":>11} {"ступень8-18":>13} {"средне18-64":>13} {"обрыв>64":>10}')
    for c in (32.,16.,8.,4.,2.):
        z,pl,names,org=floorgrid(navf,c)
        g=~np.isnan(z)
        if g.sum()<100: continue
        dz=[]
        for ax in (0,1):
            a=np.diff(z,axis=ax)
            m=np.isfinite(a)
            dz.append(np.abs(a[m]))
        d=np.concatenate(dz)
        # плато: связные области, где высота держится в пределах 18u
        zz=np.where(g,z,np.nan)
        lvl=np.floor((zz-np.nanmin(zz))/64.0)
        lab,n=ndimage.label(g&np.isfinite(lvl))
        # число уровней по гистограмме с корзиной 64u
        levels=len(set(int(v) for v in lvl[g] if np.isfinite(v)))
        print(f'  {c:6.0f}u {levels:7d} {100*(d<8).mean():10.1f}% {100*((d>=8)&(d<18)).mean():12.1f}%'
              f'{100*((d>=18)&(d<64)).mean():12.1f}% {100*(d>=64).mean():9.1f}%')
    # --- зоны ---
    z,pl,names,org=floorgrid(navf,8.)
    g=~np.isnan(z)
    sizes=[]
    for i,nm in enumerate(names):
        m=(pl==i)
        if m.sum()<10: continue
        sizes.append((m.sum()*64/1000., nm))
    sizes.sort(reverse=True)
    tot=g.sum()*64/1000.
    print(f'\n  ЗОН именованных: {len(sizes)}, площадь пола {tot:.0f}k u²')
    print(f'    размер зоны: медиана {np.median([s for s,_ in sizes]):.0f}k u² '
          f'кв [{np.percentile([s for s,_ in sizes],25):.0f}..{np.percentile([s for s,_ in sizes],75):.0f}]')
    print('    крупнейшие: '+', '.join(f'{n}({s:.0f}k)' for s,n in sizes[:6]))
    print('    мельчайшие: '+', '.join(f'{n}({s:.0f}k)' for s,n in sizes[-4:]))
    # --- горячие точки из retake ---
    R=retake_pts(rtk)
    for k,v in R.items():
        if not v: continue
        P=np.array(v)
        print(f'  РЕТЕЙК {k}: {len(P)} размеченных руками позиций, '
              f'разброс {P[:,0].max()-P[:,0].min():.0f}x{P[:,1].max()-P[:,1].min():.0f}u')
    # --- сайт: доля пола в объёме плента ---
    E=ents(bspf); M=models(bspf)
    for e in E:
        if e.get('classname')=='func_bomb_target' and e.get('model','').startswith('*'):
            mm=M[int(e['model'][1:])]
            lo=np.array(mm['mins'],float); hi=np.array(mm['maxs'],float)
            x0,y0=org
            ax0=max(0,int((lo[0]-x0)/8.)); ax1=min(g.shape[1],int(np.ceil((hi[0]-x0)/8.)))
            ay0=max(0,int((lo[1]-y0)/8.)); ay1=min(g.shape[0],int(np.ceil((hi[1]-y0)/8.)))
            sub=g[ay0:ay1,ax0:ax1]
            walk=100*sub.mean() if sub.size else 0
            print(f'    плент {hi[0]-lo[0]:.0f}x{hi[1]-lo[1]:.0f}u: ходибельного пола внутри {walk:.0f}%')
