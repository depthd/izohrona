import sys, time, json
sys.path.insert(0,'/home/claude/mini')
import render, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT='/mnt/user-data/outputs/minimaps'
import os; os.makedirs(OUT, exist_ok=True)
D='/home/claude/iz/v61/data'
NUKE='/home/claude/nuke/de_nuke_rmc/maps/de_nuke_rmc'
JOBS=[
 ('de_dust2',   f'{D}/bsp/de_dust2_fps.nav',  f'{D}/bsp/de_dust2_fps.bsp',  {}, 'BSP+нав, fps-версия'),
 ('de_mirage',  f'{D}/bsp/de_mirage_fps.nav', f'{D}/bsp/de_mirage_fps.bsp', {}, 'BSP+нав, fps-версия'),
 ('de_tuscan',  f'{D}/nav_files/de_tuscan.nav','/home/claude/tuscan/de_tuscan.bsp', {}, 'BSP+нав'),
 ('de_nuke_rmc_main',  NUKE+'.nav', NUKE+'.bsp', dict(clip_q=1, zband=(-200,1e9)), 'BSP+нав, MINECRAFT-ремейк, верхний ярус'),
 ('de_nuke_rmc_lower', NUKE+'.nav', NUKE+'.bsp', dict(clip_q=1, zband=(-1e9,-200)), 'BSP+нав, MINECRAFT-ремейк, нижний ярус'),
 ('de_ancient', f'{D}/nav_files/de_ancient.nav', None, dict(navonly=True), 'только нав — мелкие тела не видны'),
 ('cs2_anubis', f'{D}/nav_files/cs2_anubis.nav', None, dict(navonly=True), 'только нав — мелкие тела не видны'),
 ('de_cache',   f'{D}/nav_files/de_cache.nav',   None, dict(navonly=True), 'только нав — мелкие тела не видны'),
 ('de_inferno', f'{D}/nav_files/de_inferno.nav', None, dict(navonly=True), 'только нав — мелкие тела не видны'),
 ('de_overpass',f'{D}/nav_files/de_overpass_SUSPECT.nav', None, dict(navonly=True), 'только нав, файл помечен SUSPECT'),
]
cache={}
meta={}
for name, nav, bsp, kw, note in JOBS:
    t=time.time()
    br=None
    if bsp:
        if bsp not in cache: cache[bsp]=render.bsp_brushes(bsp)
        br=cache[bsp]
    im, m = render.render(name, nav, bsp, brushes=br, note=note, **kw)
    # подпись
    d=ImageDraw.Draw(im)
    try: f=ImageFont.load_default(size=22); f2=ImageFont.load_default(size=15)
    except TypeError: f=f2=ImageFont.load_default()
    d.rectangle([0,0,im.size[0],46], fill=(7,10,14))
    d.text((10,6), name, fill=(235,245,252), font=f)
    d.text((10,28), f"{m['size_u'][0]:.0f}x{m['size_u'][1]:.0f}u | {render.CELL:.0f}u/px | {note}", fill=(125,146,164), font=f2)
    im.save(f'{OUT}/{name}.png')
    meta[name]=dict(px=im.size, u=m['size_u'], floor_px=m['floor_px'], sec=round(time.time()-t,1))
    print(f"{name:22s} {im.size[0]:5d}x{im.size[1]:5d}px  {m['size_u'][0]:.0f}x{m['size_u'][1]:.0f}u  {time.time()-t:.1f}s")
json.dump(meta, open(f'{OUT}/_meta.json','w'), ensure_ascii=False, indent=1)
