"""Что стоит в конкретном куске карты: все браши, накрывающие прямоугольник XY,
с высотами, числом граней и признаком наклона. Нужен, чтобы не гадать по
скриншоту, а посмотреть, ЧТО именно под ногами у спавна или под висящим ящиком.

    python3 tools/zone.py <файл.vmf> x0 y0 x1 y1 [сколько строк]
"""
import sys, collections
sys.path.insert(0, 'tools')
from vise import parse_solids, column   # разбор один на оба инструмента

path, x0, y0, x1, y1 = sys.argv[1], *(float(v) for v in sys.argv[2:6])
N = int(sys.argv[6]) if len(sys.argv) > 6 else 30
txt = open(path, encoding='utf-8', errors='replace').read()
world = txt.split('\nentity\n')[0]
sol = [s for s in parse_solids(world) if not s['tool']]

hit = [s for s in sol if not (s['x1'] < x0 or s['x0'] > x1 or s['y1'] < y0 or s['y0'] > y1)]
hit.sort(key=lambda s: s['z0'])
print(f'\nв прямоугольнике x {x0:.0f}..{x1:.0f}, y {y0:.0f}..{y1:.0f}: брашей {len(hit)}')
print(f'{"низ":>7} {"верх":>7} {"габарит XY":>15} {"гр":>3} {"накл":>5}  материал')
for s in hit[:N]:
    print(f'{s["z0"]:7.0f} {s["z1"]:7.0f} {s["x1"]-s["x0"]:7.0f}x{s["y1"]-s["y0"]:<7.0f}'
          f' {s["nsides"]:3} {"ДА" if s["slope"] else "":>5}  {s["mat"].split("/")[-1][:34]}'
          f'   @({s["x0"]:.0f} {s["y0"]:.0f})')

cx, cy = (x0+x1)/2, (y0+y1)/2
print(f'\nколонна в центре ({cx:.0f} {cy:.0f}) снизу вверх:')
col = []
for s in hit:
    c = column(s, cx, cy)
    if c:
        col.append((c[0], c[1], s))
col.sort()
for b, t, s in col:
    print(f'  {b:8.0f} .. {t:8.0f}   {"КЛИН" if s["slope"] else "коробка"}  '
          f'{s["mat"].split("/")[-1][:30]}')
if not col:
    print('  ПУСТО — здесь нет ничего')
