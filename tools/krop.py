"""КРОПЫ ВОКРУГ МЕТОК: шесть кусков плана крупно, чтобы посмотреть глазами.

Когда прибор не находит того, на что показал человек, спорить с человеком
бессмысленно — надо посмотреть. Прибор режет план вокруг каждой метки и
складывает в один .svg: серое — пол, крестик — метка.

    python3 tools/krop.py <файл.vmf> <метки.json> <куда.svg>
"""
import json, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

путь, мпуть = sys.argv[1], sys.argv[2]
куда = sys.argv[3] if len(sys.argv) > 3 else '/tmp/krop.svg'
М = json.load(open(мпуть, encoding='utf-8'))['метки']
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
дост = hodba.волна(adj, hodba.ближайший(узлы, X0, Y0, сп))
ход = {(c[0], c[1]) for c in дост}
# Чёрное на плане бывает двух совсем разных сортов, и путать их нельзя:
# КАМЕНЬ — стоять негде вообще;
# ОТРЕЗАНО — стоять есть где, но дойти нельзя. Это уже комната, в которую нет
# входа, то есть ровно то, на что человек показывает пальцем.
# Узлы есть и НА КРЫШАХ: верх любой стены — тоже поверхность, над которой
# помещается игрок. Если красить их как «отрезанную комнату», синим зальёт
# полкарты и картинка соврёт. Комната — это та, что на ОДНОМ УРОВНЕ с полом
# по соседству: рядом (до 10 клеток) есть достижимая клетка с похожей отметкой.
zход = {}
for (cx, cy, z) in дост:
    zход[(cx, cy)] = max(zход.get((cx, cy), -1e9), z)
отрез = set()
for (cx, cy), zs in узлы.items():
    if (cx, cy) in ход:
        continue
    z = min(zs)
    ок = False
    for dy in range(-10, 11):
        for dx in range(-10, 11):
            zc = zход.get((cx + dx, cy + dy))
            if zc is not None and abs(zc - z) < 96:
                ок = True
                break
        if ок:
            break
    if ок:
        отрез.add((cx, cy))

Р = 22          # полразмера кропа в клетках -> 45x45 клеток = 720u
К = 9           # пикселей на клетку
ст = 2 * Р + 1
шаг = ст * К + 26
кол = 3
ш = кол * шаг + 10
в = math.ceil(len(М) / кол) * (шаг + 16) + 34
куски = [f'<rect width="100%" height="100%" fill="#0b0f14"/>']
for i, м in enumerate(М):
    ox = 10 + (i % кол) * шаг
    oy = 10 + (i // кол) * (шаг + 16)
    cx, cy = round((м['x'] - X0) / U), round((м['y'] - Y0) / U)
    куски.append(f'<rect x="{ox-2}" y="{oy-2}" width="{ст*К+4}" height="{ст*К+4}" '
                 f'fill="#05080b" stroke="#22303c"/>')
    for dy in range(-Р, Р + 1):
        for dx in range(-Р, Р + 1):
            k = (cx + dx, cy + dy)
            ц = '#5a6773' if k in ход else ('#2f6ea8' if k in отрез else None)
            if ц is None:
                continue
            px = ox + (dx + Р) * К
            py = oy + (Р - dy) * К
            куски.append(f'<rect x="{px}" y="{py}" width="{К}" height="{К}" fill="{ц}"/>')
    m0 = ox + Р * К + К / 2
    n0 = oy + Р * К + К / 2
    куски.append(f'<circle cx="{m0}" cy="{n0}" r="{К*1.4:.0f}" fill="none" '
                 f'stroke="#ffd21e" stroke-width="2"/>')
    бл = sorted(места, key=lambda n: (места[n][0] - м['x']) ** 2 + (места[n][1] - м['y']) ** 2)[:2]
    for nm in бл:
        p = места[nm]
        dx, dy = round((p[0] - м['x']) / U), round((p[1] - м['y']) / U)
        if abs(dx) > Р or abs(dy) > Р:
            continue
        px, py = ox + (dx + Р) * К, oy + (Р - dy) * К
        куски.append(f'<circle cx="{px}" cy="{py}" r="3" fill="#eaeef2"/>'
                     f'<text x="{px+5}" y="{py+4}" font-family="monospace" font-size="11" '
                     f'fill="#eaeef2">{nm}</text>')
    куски.append(f'<text x="{ox}" y="{oy+ст*К+16}" font-family="monospace" font-size="12" '
                 f'fill="#ffd21e">{i+1}. {м["x"]} {м["y"]} — {", ".join(бл)}</text>')
куски.append(f'<text x="10" y="{в-8}" font-family="monospace" font-size="12" fill="#eaeef2">'
             f'серое — куда доходишь · синее — пол есть, а дойти нельзя · чёрное — камень</text>')
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{ш}" height="{в+8}">'
       + ''.join(куски) + '</svg>')
open(куда, 'w', encoding='utf-8').write(svg)
print(куда, f'· кроп {ст*U}x{ст*U}u вокруг каждой метки')
