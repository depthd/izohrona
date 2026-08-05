"""Растры настоящих навов на клетке 16u в JSON — чтобы прогнать по ним ТОТ ЖЕ код,
что работает в сборке. Не «похожий алгоритм на питоне», а буквально та же функция
computePlaces из билда. Единственный способ не наступить на §5.4 в третий раз.

    python3 tools/navdump.py [клетка] > data/navraster16.json
"""
import sys, os, json, base64
sys.path.insert(0, os.path.dirname(__file__))
from ref16 import raster, FILES
from navlib2 import read_nav2

CELL = int(sys.argv[1]) if len(sys.argv) > 1 else 16
out = {}
for name, pth in FILES:
    if not os.path.exists(pth):
        continue
    g, W, H = raster(pth, CELL, 'touch')
    nav = [x for x in read_nav2(pth)['places'] if x]
    out[name] = dict(W=W, H=H, cell=CELL, nav=len(nav), names=nav,
                     g=base64.b64encode(bytes(g)).decode('ascii'))
json.dump(out, sys.stdout)
