"""ВЫРЕЗ ИЗ .vmf: квадрат карты вокруг точки, все сущности целиком.

Зачем. Целая карта — 11 МБ .vmf и в разы больше в текстовом .vmap. Чтобы он
сохранил её у себя в Hammer и прислал обратно, хватит куска: в нём есть все
виды браш-тел и все виды сущностей, а файл маленький.

    python3 tools/vyrez.py <карта.vmf> <выход.vmf> [центр: A|B|x,y] [полуширина=1200]

Браш остаётся, если центр его габарита внутри квадрата. Сущности (спавны,
свет, зоны закупки, пленты, места) остаются все — по ним и смотрим формат.
"""
import re, sys

путь, выход = sys.argv[1], sys.argv[2]
центр = sys.argv[3] if len(sys.argv) > 3 else 'A'
R = float(sys.argv[4]) if len(sys.argv) > 4 else 1200.0
src = open(путь, encoding='utf-8').read()
RE_PT = re.compile(r'\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)')


def блоки(text, имя):
    """Блоки `имя { ... }` на верхнем уровне text: (начало, конец)."""
    out, i = [], 0
    pat = re.compile(r'^(\t*)' + имя + r'\n\1\{', re.M)
    for m in pat.finditer(text):
        d, j = 0, m.end() - 1
        while True:
            c = text[j]
            if c == '{': d += 1
            elif c == '}':
                d -= 1
                if d == 0: break
            j += 1
        out.append((m.start(), j + 1))
    return out


def габарит(block):
    pts = [tuple(map(float, p)) for p in RE_PT.findall(block)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2


w0, w1 = блоки(src, 'world')[0]
world = src[w0:w1]
solids = блоки(world, 'solid')
if ',' in центр:
    cx, cy = map(float, центр.split(','))
else:
    # центр плента: N-я по счёту зона func_bomb_target (A — первая, B — вторая)
    ents = [src[a:b] for a, b in блоки(src, 'entity')]
    bt = [e for e in ents if '"classname" "func_bomb_target"' in e]
    cx, cy = габарит(bt[0 if центр == 'A' else 1])
keep = [world[a:b] for a, b in solids
        if abs(габарит(world[a:b])[0] - cx) <= R and abs(габарит(world[a:b])[1] - cy) <= R]
шапка = world[:solids[0][0]] if solids else world[:-1]
нов = шапка + '\n'.join(keep) + '\n}'
open(выход, 'w', encoding='utf-8').write(src[:w0] + нов + src[w1:])
print(f'центр {cx:.0f},{cy:.0f} ±{R:.0f}: брашей {len(keep)} из {len(solids)}, '
      f'размер {len(src[:w0] + нов + src[w1:]) // 1024} КБ')
