import sys, numpy as np
sys.path.insert(0,'/home/claude/iz/v61/parsers'); sys.path.insert(0,'/home/claude/mini')
from navlib2 import read_nav2
from scipy import ndimage
import render, collections
D='/home/claude/iz/v61/data'; NUKE='/home/claude/nuke/de_nuke_rmc/maps/de_nuke_rmc'
M=[('de_dust2',f'{D}/bsp/de_dust2_fps.nav'),('de_tuscan',f'{D}/nav_files/de_tuscan.nav'),
   ('de_inferno',f'{D}/nav_files/de_inferno.nav'),('de_ancient',f'{D}/nav_files/de_ancient.nav'),
   ('cs2_anubis',f'{D}/nav_files/cs2_anubis.nav'),('de_cache',f'{D}/nav_files/de_cache.nav'),
   ('de_overpass',f'{D}/nav_files/de_overpass_SUSPECT.nav'),('de_nuke',NUKE+'.nav')]
for name,nav in M:
    A=read_nav2(nav)['areas']
    ar=collections.Counter()
    for a in A:
        w=(a['hi'][0]-a['lo'][0])*(a['hi'][1]-a['lo'][1])
        ar[a['pname'] or '(без имени)'] += w
    tot=sum(ar.values())
    print(f"\n=== {name}: зон {len([k for k in ar if k!='(без имени)'])}, пол {tot/1000:.0f}k u2")
    for k,v in ar.most_common():
        print(f"    {v/1000:7.0f}k {100*v/tot:5.1f}%  {k}")
