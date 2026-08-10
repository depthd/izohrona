"""ГДЕ НАПРАШИВАЕТСЯ ДВЕРЬ: тонкая стена, за ней пол, а обходить далеко.

Все прежние приборы отвечали про СУЩЕСТВУЮЩИЕ проходы: проходим ли, широк ли,
не длинен ли обход. Человек показывал на другое — на места, где прохода НЕТ, а
он напрашивается: две площадки стоят вплотную, между ними стенка в несколько
клеток, и чтобы попасть из одной в другую, надо обежать полкарты.

    python3 tools/dveri.py <файл.vmf> [куда.svg]
"""
import collections, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

путь = sys.argv[1]
куда = sys.argv[2] if len(sys.argv) > 2 else None
# ПОРОГИ ВЗЯТЫ С ЖИВОГО ЧЕЛОВЕКА, а не из головы. Он разметил шесть мест в
# tools/tykalka.html и прислал координаты; замер по ним (tools/svermetki.py):
#   камень 80..320u, обход 752..2256u.
# Прежние 128u отсекали половину его меток — прибор искал стены вдвое тоньше,
# чем те, сквозь которые он ждёт прохода.
ТОЛЩ = 20         # камень не толще 20 клеток (320u)
ТОНКО = 3         # и не тоньше 3 клеток (48u): столбик — не стена
ОБХОД = 45        # обход длиннее 45 клеток (720u) — дверь напрашивается
# Ослабление до 640u давало 90 мест вместо 21 и НЕ ловило те же две метки:
# значит промах не в пороге обхода, а в форме — там массив стоит углом и
# луч сквозь него не проходит ни по оси, ни по диагонали. Оставлено как есть,
# 4 метки из 6; враньё про 6 из 6 хуже честных четырёх.

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
ход = {}
for (cx, cy, z) in дост:
    ход.setdefault((cx, cy), (cx, cy, z))

# Кандидаты: пол по обе стороны тонкой стены.
# Раньше луч шёл только по двум осям. Половина мест, на которые показал человек,
# смотрит НА УГОЛ: массив стоит по диагонали, и по осям сквозь него до пола не
# добраться. Добавлены четыре диагонали.
канд = []
for (cx, cy) in list(ход):
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        for t in range(ТОНКО, ТОЛЩ + 1):
            if any((cx + dx * k, cy + dy * k) in ход for k in range(1, t + 1)):
                break
            b = (cx + dx * (t + 1), cy + dy * (t + 1))
            if b in ход:
                канд.append((cx, cy, b[0], b[1], t))
                break

D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
UP = hodba.UP


# Обход мерится ЧЕСТНО — волной от одной стороны с потолком в ОБХОД шагов.
# Прикидка «разница расстояний от спавна» врёт: две точки бывают одинаково
# далеко от спавна и при этом на разных концах длинной петли.
def далеко(a, b, потолок=None):
    П = потолок or ОБХОД
    са, сб = ход[a], ход[b]
    d = {са: 0}
    оч = collections.deque([са])
    while оч:
        c = оч.popleft()
        if d[c] >= П:
            continue
        for dx, dy in D8:
            n = (c[0] + dx, c[1] + dy)
            у = ход.get(n)
            if у is None or у in d:
                continue
            if у[2] - c[2] > UP:
                continue
            d[у] = d[c] + 1
            if у == сб:
                return d[у]
            оч.append(у)
    return П + 1


# Укрупнение до трёх клеток глотало кандидатов: если в том же блоке уже
# проверили соседнюю пару и она не прошла, настоящая пропускалась. Ключ теперь
# помнит и НАПРАВЛЕНИЕ, и пропускаем только уже НАЙДЕННОЕ.
видано, нашли = set(), set()
наход = []
for (ax, ay, bx, by, t) in канд:
    d = (0 if bx == ax else (1 if bx > ax else -1),
         0 if by == ay else (1 if by > ay else -1))
    если = (ax // 2, ay // 2, d)
    if если in видано or (ax // 4, ay // 4) in нашли:
        continue
    видано.add(если)
    о = далеко((ax, ay), (bx, by), 200)      # потолок выше: важно НАСКОЛЬКО далеко
    if о > ОБХОД:
        наход.append((ax, ay, bx, by, t, о))
        нашли.add((ax // 4, ay // 4))

цена = {}
for x, y, _, _, _, о in наход:
    цена[(x, y)] = max(цена.get((x, y), 0), о)
мн = set(цена)
гр = []
while мн:
    s0 = мн.pop()
    ст, ком = [s0], [s0]
    while ст:
        c = ст.pop()
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                k = (c[0] + dx, c[1] + dy)
                if k in мн:
                    мн.discard(k)
                    ст.append(k)
                    ком.append(k)
    гр.append(ком)
# Сортировка по величине обхода, а не по размеру пятна: чем длиннее крюк,
# который дверь уберёт, тем нужнее дверь. Пятно в одну клетку с обходом в две
# тысячи важнее пятна в десять клеток с обходом в восемьсот.
гр.sort(key=lambda k: -max(цена[c] for c in k))
print(f'{путь}')
print(f'  мест, где стена тонкая, за ней пол, а обход больше {ОБХОД*U}u: {len(гр)}')
for ком in гр[:12]:
    xs = [c[0] for c in ком]
    ys = [c[1] for c in ком]
    wx, wy = X0 + sum(xs) / len(xs) * U, Y0 + sum(ys) / len(ys) * U
    # у старых сборок каллаутов ещё не было — тогда просто без имён
    бл = sorted(места, key=lambda n: (места[n][0] - wx) ** 2 + (места[n][1] - wy) ** 2)[:2] or ['?']
    о = max(цена[c] for c in ком)
    print(f'    обход {("больше "+str(200*U)) if о>200 else о*U}u  ({wx:.0f} {wy:.0f})'
          f'  клеток {len(ком):3d}   между: {", ".join(бл)}')

# Если дали метки человека — сразу сказать, сколько из них прибор поймал.
import os, json as _j
_м = os.environ.get('МЕТКИ')
if _м:
    руч = _j.load(open(_м, encoding='utf-8'))['метки']
    поймал = 0
    for i, м in enumerate(руч, 1):
        cx, cy = round((м['x'] - X0) / U), round((м['y'] - Y0) / U)
        # человек тычет примерно, да и дверь может быть чуть в стороне вдоль стены
        есть = any(abs(c[0] - cx) <= 12 and abs(c[1] - cy) <= 12 for ком in гр for c in ком)
        поймал += есть
        print(f'    метка {i} ({м["x"]} {м["y"]}): {"НАШЁЛ" if есть else "мимо"}')
    print(f'  поймано меток человека: {поймал} из {len(руч)}')

if куда:
    К = 2
    ш, в = W * К, H * К
    кус = [f'<rect x="{cx*К}" y="{(H-1-cy)*К}" width="{К}" height="{К}" fill="#3d4650"/>'
           for (cx, cy) in ход]
    for ком in гр[:12]:
        for (x, y) in ком:
            кус.append(f'<rect x="{x*К-3}" y="{(H-1-y)*К-3}" width="{К+6}" height="{К+6}" fill="#ffd21e"/>')
    if _м:
        for м in руч:
            x=(м['x']-X0)/U*К; y=(H-1-(м['y']-Y0)/U)*К
            кус.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="11" fill="none" '
                       f'stroke="#5aa9e6" stroke-width="2"/>')
    подп = []
    for nm, p in места.items():
        x = (p[0] - X0) / U * К
        y = (H - 1 - (p[1] - Y0) / U) * К
        подп.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="3" fill="#eaeef2"/>'
                    f'<text x="{x+6:.0f}" y="{y+4:.0f}" font-family="monospace" '
                    f'font-size="11" fill="#eaeef2">{nm}</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{ш}" height="{в+34}">'
           f'<rect width="100%" height="100%" fill="#0b0f14"/>' + ''.join(кус) + ''.join(подп)
           + f'<text x="8" y="{в+22}" font-family="monospace" font-size="13" fill="#ffd21e">'
           f'жёлтое — стена, за которой пол рядом, а обходить больше {ОБХОД*U}u:'
           f' {len(гр)} мест</text></svg>')
    open(куда, 'w', encoding='utf-8').write(svg)
    print(' ', куда)
