"""ОБА: растр генератора и напечатанный .vmf одной меркой, клетка в клетку.

Генератор считает связность по растру, приёмка — по файлу. Когда они говорят
разное («крюк x1.1» против «пути нет»), спорить бесполезно: надо положить одно
на другое. Прибор берёт пару, которую пишет tools/rastr.js, гоняет ОДНУ И ТУ ЖЕ
волну по обеим сеткам и печатает, где растр проходим, а печать нет.

Модель узла общая: блок 2x2 клеток по 16u, отметка — высшая опора в блоке,
подъём не выше UP, спуск свободный. Для растра опора берётся из zfield, для
печати — из брашей (tools/hodba.py).

    node tools/rastr.js builds/izohrona_v120.html /tmp/oba [сид:цель:ковёр]
    python3 tools/oba.py /tmp/oba
"""
import collections, json, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U, UP

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

папка = sys.argv[1] if len(sys.argv) > 1 else '/tmp/oba'
R = json.load(open(f'{папка}/r.rastr.json', encoding='utf-8'))
W, H, S = R['W'], R['H'], R['S']
g, z = R['g'], R['z']
print(f"растр {W}x{H} клетка {S}u · сид {R['сид']}:{R['аим']}:{R['ков']}")

# ---- волна по растру, модель узла та же, что у приёмки ----
D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
узлР = bytearray(W * H)
zР = [0] * (W * H)
for y in range(H - 1):
    for x in range(W - 1):
        i = y * W + x
        if g[i] and g[i + 1] and g[i + W] and g[i + W + 1]:
            узлР[i] = 1
            zР[i] = max(z[i], z[i + 1], z[i + W], z[i + W + 1])


def волнаР(старт):
    d = {старт: 0}
    q = collections.deque([старт])
    while q:
        c = q.popleft()
        cx, cy = c % W, c // W
        for dx, dy in D8:
            nx, ny = cx + dx, cy + dy
            if not (0 <= nx < W - 1 and 0 <= ny < H - 1):
                continue
            j = ny * W + nx
            if not узлР[j] or j in d:
                continue
            if zР[j] - zР[c] > UP:
                continue
            d[j] = d[c] + 1
            q.append(j)
    return d


def близР(cx, cy, r=8):
    л = []
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            x, y = cx + dx, cy + dy
            if 0 <= x < W - 1 and 0 <= y < H - 1 and узлР[y * W + x]:
                л.append((dx * dx + dy * dy, y * W + x))
    л.sort()
    return л[0][1] if л else None


sT = близР(*R['px']['T'])
дР = волнаР(sT)
достР = {(c % W, c // W) for c in дР}
всегоР = sum(узлР)
print(f'  растр: узлов {всегоР}, достижимо от T {len(дР)} ({100*len(дР)/max(1,всегоР):.1f}%)')

# ---- то же по печати ----
txt = open(f'{папка}/r.vmf', encoding='utf-8', errors='replace').read()
solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['tool']]
# БЕЗТЕЛ=1 — контрфакт: пол и стены печатаются ОТ БАЗЫ, тела ставятся НА пол.
import os
if os.environ.get('БЕЗТЕЛ') == '1':
    база = min(s['z0'] for s in solid)
    solid = [s for s in solid if s['z0'] < база + 8]
    print('  (контрфакт: тела убраны)')
узлы, adj, X0, Y0, WE, HE, IV = hodba.сетка(solid, column, вернутьIV=True)

# мир: клетка растра (x,y) → координаты (x*S .. x*S+S, (H-y-1)*S .. (H-y)*S)
# сетка приёмки: клетка (ex,ey) → (X0+ex*U, Y0+ey*U). При S=U=16 это сдвиг.
сдвx = round(-X0 / U)
сдвy = round((H * S - Y0) / U)


def вЭксп(x, y):
    """Узел растра (блок клеток y и y+1) -> узел приёмки, накрывающий ТОТ ЖЕ
    квадрат мира. Ось Y у растра растёт вниз (wy = (H-y)*S), у приёмки вверх,
    поэтому блок растра {y, y+1} — это блок приёмки {ey-1, ey}, а не {ey, ey+1}.
    Первая версия прибора промахивалась на строку и уверенно печатала, что печать
    ставит клетку на 16 там, где растр держит 240."""
    return (x + сдвx, сдвy - y - 2)


тT = вЭксп(sT % W, sT // W)
старт = None
for r in range(0, 9):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            k = (тT[0] + dx, тT[1] + dy)
            if k in узлы:
                старт = (k[0], k[1], max(узлы[k]))
                break
        if старт:
            break
    if старт:
        break
дЭ = hodba.волна(adj, старт)
достЭ = {(c[0], c[1]) for c in дЭ}
print(f'  печать: узлов {len(узлы)}, достижимо от T {len(достЭ)}'
      f' ({100*len(достЭ)/max(1,len(узлы)):.1f}%)')

# ---- разница ----
только = []
for (x, y) in достР:
    if вЭксп(x, y) not in достЭ:
        только.append((x, y))
print(f'\n  ПРОХОДИМО В РАСТРЕ, НЕПРОХОДИМО В ПЕЧАТИ: {len(только)} клеток'
      f' ({100*len(только)/max(1,len(достР)):.1f}% достижимого растра)')
if not только:
    print('  растр и печать сходятся')
    sys.exit(0)

# кластеры, чтобы не печатать тысячу клеток
мн = set(только)
кл = []
while мн:
    s0 = мн.pop()
    ст, гр = [s0], [s0]
    while ст:
        cx, cy = ст.pop()
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                k = (cx + dx, cy + dy)
                if k in мн:
                    мн.discard(k)
                    ст.append(k)
                    гр.append(k)
    кл.append(гр)
кл.sort(key=len, reverse=True)
print(f'  пятен {len(кл)}, крупнейшие:')
места = {n: (x, y) for n, x, y in R['места']}
for гр in кл[:6]:
    xs = [p[0] for p in гр]
    ys = [p[1] for p in гр]
    рядом = sorted(места, key=lambda n: (места[n][0] - sum(xs) / len(xs)) ** 2
                   + (места[n][1] - sum(ys) / len(ys)) ** 2)[:2]
    # чем закрыто: узлов в печати нет вовсе или отметка не та
    нет, инаяZ = 0, 0
    for (x, y) in гр:
        k = вЭксп(x, y)
        if k not in узлы:
            нет += 1
        else:
            zр = zР[y * W + x]
            if all(abs(q - zр) > 16 for q in узлы[k]):
                инаяZ += 1
    print(f'    {len(гр):5d} клеток  x {min(xs)}..{max(xs)}  y {min(ys)}..{max(ys)}'
          f'   узла в печати нет {нет}, отметка не та {инаяZ}   рядом: {", ".join(рядом)}')
    # кто поднял: браши, чей верх выше растровой отметки клетки больше чем на 32u
    вин = collections.Counter()
    for (x, y) in гр:
        ex, ey = x + сдвx, сдвy - y - 1
        if not (0 <= ex < WE and 0 <= ey < HE):
            continue
        iv = IV[ey * WE + ex]
        if not iv:
            continue
        zр = z[y * W + x]
        for b, t, ии in iv:
            if t - zр <= 32 or b > zр + 72:
                continue
            for i in ии:
                s = solid[i]
                вин[(round(s['x1']-s['x0']), round(s['y1']-s['y0']),
                     round(s['z1']-s['z0']), s.get('mat', '?').split('/')[-1][:22])] += 1
    for (w0, h0, d0, м), k in вин.most_common(3):
        print(f'          поднято x{k:<4d} брашем {w0}x{h0}x{d0}  {м}')

# ---- ворота: где растр входит в пятно, а печать нет ----
общ = {p for p in достР if вЭксп(*p) in достЭ}
print('\n  ВОРОТА крупнейшего пятна (шаг, который растр берёт, а печать нет):')
гр = set(кл[0])
ворота = []
for (x, y) in кл[0]:
    for dx, dy in D8:
        n = (x + dx, y + dy)
        if n not in общ:
            continue
        zв, zс = zР[y * W + x], zР[n[1] * W + n[0]]
        kв, kс = вЭксп(x, y), вЭксп(*n)
        pв = узлы.get(kв, [])
        pс = узлы.get(kс, [])
        # какая отметка в печати ближе к растровой
        бв = min(pв, key=lambda q: abs(q - zв)) if pв else None
        бс = min(pс, key=lambda q: abs(q - zс)) if pс else None
        ворота.append((abs(zв - zс), x, y, zв, zс, бв, бс, n))
ворота.sort()
print(f'    стыковок {len(ворота)}; лучшие (наименьший перепад в растре):')
for пер, x, y, zв, zс, бв, бс, n in ворота[:8]:
    print(f'      растр ({x},{y}) z={zв} ← ({n[0]},{n[1]}) z={zс}  подъём {zв-zс:+d}u'
          f'   ||  печать: {бс} → {бв}'
          f'  подъём {"?" if бв is None or бс is None else f"{бв-бс:+.0f}u"}')
