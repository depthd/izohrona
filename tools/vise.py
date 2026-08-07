"""Два дефекта, которые видно глазом, но не видно в растре:

  СПАВН В ТЕЛЕ   — точка спавна внутри браша, без пола под ней, на неровной
                   площадке или висит над полом.

Про наклон отдельно. Прежняя версия считала дефектом ЛЮБУЮ наклонную грань под
спавном, независимо от крутизны. По этому критерию гейт краснел на спавнах, у
которых разброс пола под ногами был 12 юнитов — при шаге игрока 18, то есть
площадка ровная. Наклонная грань там — фаска между двумя уровнями пола, стоять
на ней нормально. Дефект определяется РАЗБРОСОМ высот под площадкой 32x32, а
не тем, наклонён ли браш; фаска печатается справочно.
  ВИСИТ В ВОЗДУХЕ — низ браша заметно выше того, что под ним. Декор, не севший
                   на пандус, выглядит именно так: ступени в пустоте.

Браши разбираются ЧЕСТНО, по полуплоскостям, а не по габаритному ящику: клин —
это пять граней, и его габарит враньё. Плоскость VMF задана тремя точками по
часовой стрелке снаружи; внешняя нормаль = (p1-p2) x (p3-p2), внутри значит n*p <= n*p1.

    python3 tools/vise.py <файл.vmf>
"""
import re, sys, collections, math

RE_PL = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RE_MAT = re.compile(r'"material" "([^"]+)"')
RE_ENT = re.compile(r'^entity\n\{(.*?)\n\}', re.M | re.S)


def parse_solids(txt):
    out = []
    for chunk in txt.split('\tsolid\n')[1:]:
        planes, pts = [], []
        for m in RE_PL.finditer(chunk):
            tri = []
            for k in range(1, 4):
                a = m.group(k).split()
                if len(a) != 3:
                    break
                tri.append(tuple(float(v) for v in a))
            if len(tri) != 3:
                continue
            p1, p2, p3 = tri
            ux, uy, uz = p1[0]-p2[0], p1[1]-p2[1], p1[2]-p2[2]
            vx, vy, vz = p3[0]-p2[0], p3[1]-p2[1], p3[2]-p2[2]
            n = (uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx)
            ln = math.sqrt(sum(c*c for c in n))
            if ln < 1e-9:
                continue
            n = tuple(c/ln for c in n)
            planes.append((n, n[0]*p1[0]+n[1]*p1[1]+n[2]*p1[2]))
            pts.extend(tri)
        if not planes or not pts:
            continue
        mats = RE_MAT.findall(chunk)
        mat = mats[0] if mats else '?'
        X = [p[0] for p in pts]; Y = [p[1] for p in pts]; Z = [p[2] for p in pts]
        out.append({'planes': planes, 'mat': mat, 'nsides': len(planes),
                    'x0': min(X), 'x1': max(X), 'y0': min(Y), 'y1': max(Y),
                    'z0': min(Z), 'z1': max(Z),
                    'tool': mat.upper().startswith('TOOLS'),
                    'slope': any(abs(n[2]) > 1e-6 and abs(n[2]) < 1-1e-6
                                 for n, _ in planes)})
    return out


def column(sd, x, y):
    """Занятый интервал по Z в точке (x,y). None — колонна мимо тела."""
    top, bot = 1e18, -1e18
    for (nx, ny, nz), d in sd['planes']:
        r = d - nx*x - ny*y
        if abs(nz) < 1e-9:
            if r < -0.01:
                return None                 # вертикальная грань отсекает точку
            continue
        z = r/nz
        if nz > 0:
            top = min(top, z)
        else:
            bot = max(bot, z)
    if top <= bot + 1e-6 or top > 1e17 or bot < -1e17:
        return None
    return (bot, top)


path = sys.argv[1]
txt = open(path, encoding='utf-8', errors='replace').read()
world = txt.split('\nentity\n')[0]
solids = parse_solids(world)
solid = [s for s in solids if not s['tool']]
print(f'\n{path}')
print(f'брашей мира {len(solids)}, из них не-tools {len(solid)}, '
      f'с наклонной гранью {sum(1 for s in solid if s["slope"])}')

# ---- сетка ускорения по XY ----
G = 256
grid = collections.defaultdict(list)
for i, s in enumerate(solid):
    for gx in range(int(s['x0']//G), int(s['x1']//G)+1):
        for gy in range(int(s['y0']//G), int(s['y1']//G)+1):
            grid[(gx, gy)].append(i)


def at(x, y):
    """Все занятые интервалы в точке, снизу вверх."""
    res = []
    for i in grid.get((int(x//G), int(y//G)), ()):
        s = solid[i]
        if not (s['x0']-1 <= x <= s['x1']+1 and s['y0']-1 <= y <= s['y1']+1):
            continue
        c = column(s, x, y)
        if c:
            res.append((c[0], c[1], i))
    res.sort()
    return res


# ---------------- СПАВНЫ ----------------
spawns = []
for m in RE_ENT.finditer(txt):
    b = m.group(1)
    cn = re.search(r'"classname" "(info_player_\w+)"', b)
    og = re.search(r'"origin" "([-\d.e ]+)"', b)
    if cn and og:
        x, y, z = (float(v) for v in og.group(1).split())
        spawns.append((cn.group(1), x, y, z))

print(f'\n=== СПАВНЫ ({len(spawns)}) ===')
плохо = collections.Counter()
detail = []
for cn, x, y, z in spawns:
    # Игрок стоит НА z, занимает 32x32 в плане и 72u вверх.
    # Пробы берутся на 15u, а не на 16: угол ровно на границе коробки игрока
    # попадал ВНУТРЬ соседнего ящика, стоящего вплотную (грань в грань), и
    # спавн объявлялся «в теле», хотя игрок ящика не касается.
    # Так гейт краснел на одном спавне из шестнадцати: ящик 32x32 стоял
    # соседней клеткой, y-край ящика совпадал с y-краем коробки игрока.
    углы = [(x+dx, y+dy) for dx in (-15, 0, 15) for dy in (-15, 0, 15)]
    полы, вкл, наклон = [], 0, 0
    for (ax, ay) in углы:
        col = at(ax, ay)
        под = [c for c in col if c[1] <= z+2]
        внутри = [c for c in col if c[0] < z+64 and c[1] > z+2]
        if под:
            h = max(c[1] for c in под)
            полы.append(h)
            i = max(под, key=lambda c: c[1])[2]
            if solid[i]['slope']:
                наклон += 1
        if внутри:
            вкл += 1
    if not полы:
        плохо['НЕТ ПОЛА ПОД СПАВНОМ'] += 1
        detail.append((cn, x, y, z, 'нет пола'))
        continue
    разброс = max(полы)-min(полы)
    зазор = z - max(полы)
    if вкл:
        плохо['ВНУТРИ ТЕЛА'] += 1
        detail.append((cn, x, y, z, f'в теле, углов {вкл}/9'))
    elif разброс > 18:
        плохо['ПЛОЩАДКА НЕРОВНАЯ'] += 1
        detail.append((cn, x, y, z, f'разброс пола {разброс:.0f}u'))
    elif abs(зазор) > 20:
        плохо['ВИСИТ / УТОПЛЕН'] += 1
        detail.append((cn, x, y, z, f'зазор до пола {зазор:.0f}u'))
    else:
        плохо['ок'] += 1
        if наклон >= 3:
            плохо['  из них на фаске (не дефект)'] += 1
for k, v in плохо.most_common():
    print(f'  {v:4}  {k}')
for d in detail[:14]:
    print(f'    {d[0][12:]:15} ({d[1]:.0f} {d[2]:.0f} {d[3]:.0f})  {d[4]}')

# ---------------- ВИСЯЩИЕ ТЕЛА ----------------
print('\n=== ВИСИТ В ВОЗДУХЕ ===')
def опёрт_боком(s):
    """Плита может держаться не полом, а СТЕНАМИ по краям — так стоит крыша над
    коридором. Проверяем восемь точек чуть за габаритом: если там есть тело,
    перекрывающее высоту плиты, это опора, а не висящий декор."""
    e = 3.0
    z = (s['z0']+s['z1'])/2
    mx, my = (s['x0']+s['x1'])/2, (s['y0']+s['y1'])/2
    для = [(s['x0']-e, my), (s['x1']+e, my), (mx, s['y0']-e), (mx, s['y1']+e),
           (s['x0']-e, s['y0']-e), (s['x1']+e, s['y0']-e),
           (s['x0']-e, s['y1']+e), (s['x1']+e, s['y1']+e)]
    for (ax, ay) in для:
        for b, t, j in at(ax, ay):
            if b <= z <= t:
                return True
    return False

def кандидаты(s):
    """Индексы брашей, чья ячейка сетки пересекается со следом s."""
    из = set()
    for gx in range(int(s['x0']//G), int(s['x1']//G)+1):
        for gy in range(int(s['y0']//G), int(s['y1']//G)+1):
            из.update(grid.get((gx, gy), ()))
    return из


база = min(s['z0'] for s in solid)
# Опорой считается ЛЮБОЙ чужой браш, который либо кончается вплотную под низом,
# либо перекрывает низ по высоте: пилястра, утопленная в стену, держится стеной,
# и звать её висящей — ошибка прибора. Точек пробы девять, а не одна: палуба
# стоит на угловых колоннах, и по центру под ней пусто законно.
вис = []
for i, s in enumerate(solid):
    if s['z0'] < база + 8:
        continue                       # от базовой плиты — это стена/пол
    if (s['x1']-s['x0']) < 24 or (s['y1']-s['y0']) < 24:
        continue                       # обвязка, карниз
    # Проба в девяти точках промахивалась мимо тонкой опоры: навес 408x408
    # стоит на четырёх столбиках 20x20 по углам, а угловая проба берётся на 2u
    # внутрь от габарита — и попадает мимо, потому что навес свисает за столбики
    # на 12u. Так гейт краснел на «телах без опоры», которых нет.
    # Считаем по СЛЕДУ: опора — любой чужой браш, чей след пересекается с нашим
    # и который либо кончается вплотную под низом, либо перекрывает нашу высоту,
    # либо начинается вплотную над верхом (тогда мы подвешены).
    зазор = None
    for j in кандидаты(s):
        if j == i:
            continue
        o = solid[j]
        if o['x1'] <= s['x0']+1 or o['x0'] >= s['x1']-1:
            continue
        if o['y1'] <= s['y0']+1 or o['y0'] >= s['y1']-1:
            continue
        if o['z1'] > s['z0']+1 and o['z0'] < s['z1']-1:
            зазор = 0.0; break                  # объёмы перекрываются: утоплен, врезан
        if o['z0'] >= s['z1']-1 and o['z0'] <= s['z1']+24:
            зазор = 0.0; break                  # подвешен сверху: лампа, балка
        if o['z1'] <= s['z0']+1:
            d = s['z0']-o['z1']
            зазор = d if зазор is None else min(зазор, d)
    лучший = 1e9 if зазор is None else зазор
    if лучший > 24 and not опёрт_боком(s):
        вис.append((i, s['z0'], None if лучший > 1e8 else лучший))
print(f'  тел без опоры ни снизу, ни сверху, ни сбоку: {len(вис)}')
gr = collections.Counter()
for i, z0, gap in вис:
    s = solid[i]
    gr[(round(s['x1']-s['x0']), round(s['y1']-s['y0']), round(s['z1']-s['z0']),
        s['mat'].split('/')[-1], s['nsides'])] += 1
for (dx, dy, dz, mat, ns), n in gr.most_common(12):
    print(f'    {n:4}  {dx:5}x{dy:5}x{dz:4}  граней {ns}  {mat[:32]}')
print('\n  примеры (координаты низа и зазор):')
for i, z0, gap in вис[:8]:
    s = solid[i]
    print(f'    ({s["x0"]:.0f} {s["y0"]:.0f} {z0:.0f})  {s["x1"]-s["x0"]:.0f}x'
          f'{s["y1"]-s["y0"]:.0f}x{s["z1"]-s["z0"]:.0f}  зазор '
          f'{"нет опоры" if gap is None else f"{gap:.0f}u"}  {s["mat"].split("/")[-1]}')
