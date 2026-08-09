"""КАРТИНКА ДЛЯ ЧЕЛОВЕКА: где на карте узкие места.

Человек не читает таблицы координат. Прибор рисует план карты сверху, серым —
пол, красным — клетки, где проход уже 96 юнитов, и подписывает ближайшие
каллауты. Пишет .svg рядом.

    python3 tools/kartinka.py <файл.vmf> <куда.svg>
"""
import math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

путь = sys.argv[1]
куда = sys.argv[2] if len(sys.argv) > 2 else '/tmp/karta.svg'
txt = open(путь, encoding='utf-8', errors='replace').read()
solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
места = {}
for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
    b = m.group(1)
    nm = re.search(r'"place_name" "([^"]*)"', b)
    og = re.search(r'"origin" "([-\d.e ]+)"', b)
    if '"env_cs_place"' in b and nm and og:
        места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())
узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)

сп = None
for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
    if '"info_player_terrorist"' in m.group(1):
        og = re.search(r'"origin" "([-\d.e ]+)"', m.group(1))
        if og:
            сп = tuple(float(v) for v in og.group(1).split())
            break
s0 = hodba.ближайший(узлы, X0, Y0, сп)
дост = hodba.волна(adj, s0)
ход = bytearray(W * H)
for (cx, cy, _z) in дост:
    ход[cy * W + cx] = 1

INF = 1 << 20
d = [0 if not ход[i] else INF for i in range(W * H)]
for y in range(H):
    for x in range(W):
        i = y * W + x
        if not d[i]:
            continue
        b = INF
        for dx, dy in ((-1, 0), (0, -1), (-1, -1), (1, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                b = min(b, d[ny * W + nx] + (3 if dx and dy else 2))
        d[i] = min(d[i], b)
for y in range(H - 1, -1, -1):
    for x in range(W - 1, -1, -1):
        i = y * W + x
        if not d[i]:
            continue
        b = d[i]
        for dx, dy in ((1, 0), (0, 1), (1, 1), (-1, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                b = min(b, d[ny * W + nx] + (3 if dx and dy else 2))
        d[i] = b
ПОТ = 16
шир = {}
for i in range(W * H):
    if not ход[i]:
        continue
    шир[i] = 0.0
for i in range(W * H):
    if not ход[i]:
        continue
    r = min(d[i] / 2.0, ПОТ)
    if r < 0.5:
        continue
    R = int(r)
    cx, cy = i % W, i // W
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            if dx * dx + dy * dy > r * r:
                continue
            x, y = cx + dx, cy + dy
            if 0 <= x < W and 0 <= y < H:
                j = y * W + x
                if j in шир and 2 * r * U > шир[j]:
                    шир[j] = 2 * r * U

К = 2                                   # пикселей на клетку
ш, в = W * К, H * К
кус = []
for i in range(W * H):
    if not ход[i]:
        continue
    x, y = (i % W) * К, (H - 1 - i // W) * К
    цвет = '#e03a3a' if шир[i] < 96 else ('#8a6a34' if шир[i] < 128 else '#3d4650')
    кус.append(f'<rect x="{x}" y="{y}" width="{К}" height="{К}" fill="{цвет}"/>')
подп = []
for nm, p in места.items():
    x = (p[0] - X0) / U * К
    y = (H - 1 - (p[1] - Y0) / U) * К
    подп.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="3" fill="#eaeef2"/>'
                f'<text x="{x+6:.0f}" y="{y+4:.0f}" font-family="monospace" '
                f'font-size="11" fill="#eaeef2">{nm}</text>')
узк = sum(1 for i in шир if шир[i] < 96)
вс = len(шир)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{ш}" height="{в+34}" '
       f'viewBox="0 0 {ш} {в+34}"><rect width="100%" height="100%" fill="#0b0f14"/>'
       + ''.join(кус) + ''.join(подп)
       + f'<text x="8" y="{в+22}" font-family="monospace" font-size="13" fill="#e03a3a">'
       f'красное — проход уже 96u (в него игрок протискивается): {узк} клеток из {вс}</text>'
       + '</svg>')
open(куда, 'w', encoding='utf-8').write(svg)
print(куда, f'узких клеток {узк} из {вс}')
