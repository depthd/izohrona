#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ВХОДЫ НА ПЛЕНТ. Не один кратчайший путь, а все отдельные входы.
Обводим точку закладки окружностью радиуса R, ищем места, где ходибельный пол
пересекает границу. Каждая связная группа = отдельный вход.
Затем: из каких входов есть путь к T-спавну В ОБХОД сайта -> это T-подходы."""
import sys, os, collections
import numpy as np
from scipy import ndimage
sys.path.insert(0,'.')
from navlib2 import read_nav2
CELL=8.0

def gridnav(navf):
    r=read_nav2(navf); A=r['areas']
    xs=[a['lo'][0] for a in A]+[a['hi'][0] for a in A]
    ys=[a['lo'][1] for a in A]+[a['hi'][1] for a in A]
    x0,y0=min(xs),min(ys)
    W=int((max(xs)-x0)/CELL)+2; H=int((max(ys)-y0)/CELL)+2
    g=np.zeros((H,W),bool); pl=np.full((H,W),-1,np.int16)
    names=r['places']; nid={n:i for i,n in enumerate(names)}
    for a in A:
        ax0=max(0,int((a['lo'][0]-x0)/CELL)); ax1=min(W,int(np.ceil((a['hi'][0]-x0)/CELL)))
        ay0=max(0,int((a['lo'][1]-y0)/CELL)); ay1=min(H,int(np.ceil((a['hi'][1]-y0)/CELL)))
        if ax1<=ax0 or ay1<=ay0: continue
        g[ay0:ay1,ax0:ax1]=True
        i=nid.get(a['pname'],-1)
        if i>=0: pl[ay0:ay1,ax0:ax1]=i
    return g,pl,names,(x0,y0)

def zcenter(pl,names,sub):
    for i,n in enumerate(names):
        if sub in n.lower().replace(' ',''):
            m=(pl==i)
            if m.sum()>20:
                yy,xx=np.nonzero(m); return int(yy.mean()),int(xx.mean())
    return None

def entrances(g,c,R):
    """связные группы пола, пересекающие окружность радиуса R вокруг c"""
    H,W=g.shape
    yy,xx=np.ogrid[:H,:W]
    d=np.sqrt((yy-c[0])**2+(xx-c[1])**2)*CELL
    ring=g&(d>=R)&(d<R+CELL*2.5)
    lab,n=ndimage.label(ring,structure=np.ones((3,3)))
    out=[]
    for i in range(1,n+1):
        m=(lab==i)
        if m.sum()<2: continue
        yy2,xx2=np.nonzero(m)
        out.append((int(m.sum()), int(yy2.mean()), int(xx2.mean())))
    return out,d

def reach_avoiding(g,d,R,start,targets):
    """из каких входов достижим start, если НЕ заходить внутрь радиуса R"""
    H,W=g.shape
    free=g&(d>=R-CELL)
    lab,n=ndimage.label(free,structure=np.ones((3,3)))
    sy,sx=start
    if not free[sy,sx]:
        yy,xx=np.nonzero(free)
        k=np.argmin((yy-sy)**2+(xx-sx)**2); sy,sx=yy[k],xx[k]
    comp=lab[sy,sx]
    ok=0
    for sz,ey,ex in targets:
        if lab[ey,ex]==comp: ok+=1
    return ok

MAPS=[('dust2','/home/claude/maps/de_dust2_fps.nav'),
      ('мираж','/home/claude/pack/pack60/nav_files/de_mirage.nav'),
      ('инферно','/home/claude/pack/pack60/nav_files/de_inferno.nav'),
      ('эншент','/home/claude/pack/pack60/nav_files/de_ancient.nav')]
if __name__=='__main__':
    print(f'{"карта":>10} {"сайт":>5} {"R":>5} {"входов":>7} {"из них к T в обход":>19}')
    for nm,navf in MAPS:
        g,pl,names,org=gridnav(navf)
        T=zcenter(pl,names,'tspawn')
        for sub,lbl in (('bombsitea','A'),('bombsiteb','B')):
            c=zcenter(pl,names,sub)
            if c is None or T is None: continue
            for R in (320.,448.,576.):
                ent,d=entrances(g,c,R)
                nT=reach_avoiding(g,d,R,T,ent)
                print(f'{nm:>10} {lbl:>5} {R:5.0f}u {len(ent):7d} {nT:19d}')
