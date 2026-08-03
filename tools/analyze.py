import sys, json, numpy as np
sys.path.insert(0,'/home/claude/iz/v61/parsers'); sys.path.insert(0,'/home/claude/mini')
from navlib2 import read_nav2
from scipy import ndimage
import render

D='/home/claude/iz/v61/data'; NUKE='/home/claude/nuke/de_nuke_rmc/maps/de_nuke_rmc'
M=[('de_dust2',f'{D}/bsp/de_dust2_fps.nav',{}),
   ('de_mirage',f'{D}/bsp/de_mirage_fps.nav',{}),
   ('de_tuscan',f'{D}/nav_files/de_tuscan.nav',{}),
   ('de_inferno',f'{D}/nav_files/de_inferno.nav',{}),
   ('de_ancient',f'{D}/nav_files/de_ancient.nav',{}),
   ('cs2_anubis',f'{D}/nav_files/cs2_anubis.nav',{}),
   ('de_cache',f'{D}/nav_files/de_cache.nav',{}),
   ('de_overpass',f'{D}/nav_files/de_overpass_SUSPECT.nav',{}),
   ('de_nuke_main',NUKE+'.nav',dict(clip_q=1,zband=(-200,1e9))),
   ('de_nuke_lower',NUKE+'.nav',dict(clip_q=1,zband=(-1e9,-200)))]
C=render.CELL
print(f"{'карта':14s} {'зон':>4} {'пол,ку':>9} {'ширина мед':>11} {'p90':>6} {'горл<192':>9} {'хаб>=352':>9} {'залов':>6} {'самый большой':>13}")
res={}
for name,nav,kw in M:
    fz,(x0,y0,W,H)=render.nav_floor(nav, kw.get('clip_q'), kw.get('zband'))
    m=~np.isnan(fz)
    dt=ndimage.distance_transform_edt(m)*C*2.0          # ширина = 2*расстояние до стены
    mx=ndimage.maximum_filter(dt,size=3)
    ridge=m&(dt>=mx-1e-6)&(dt>0)
    w=dt[ridge]
    hub=(dt>=352)&m
    lab,n=ndimage.label(hub, np.ones((3,3)))
    sz=ndimage.sum(hub,lab,range(1,n+1))*C*C if n else np.array([])
    big=[s for s in sz if s>=200000]                     # зал считаем от 200k u2
    places=set()
    try:
        nv=read_nav2(nav); places={a['pname'] for a in nv['areas'] if a['pname']}
    except Exception: pass
    area=m.sum()*C*C
    res[name]=dict(zones=len(places), area=area, wmed=float(np.median(w)),
                   w90=float(np.percentile(w,90)), thin=float((w<192).mean()),
                   hubsh=float((w>=352).mean()), halls=len(big),
                   maxhall=float(max(sz)) if len(sz) else 0.0,
                   names=sorted(places))
    r=res[name]
    print(f"{name:14s} {r['zones']:4d} {r['area']/1000:8.0f}k {r['wmed']:10.0f}u {r['w90']:5.0f}u "
          f"{100*r['thin']:8.1f}% {100*r['hubsh']:8.1f}% {r['halls']:6d} {r['maxhall']/1000:12.0f}k")
json.dump(res, open('/home/claude/mini/stats.json','w'), ensure_ascii=False, indent=1)
