"""СКОЛЬКО НЕЗАВИСИМЫХ ДОРОГ ведёт от спавна к пленту и к миду.

Все прежние меры отвечали «путь есть» и «крюк единица». На карте, где на плент
ведёт ОДИН коридор, обе говорят «нормально» — а играть нельзя: сайт держится
одним углом, и вся карта сводится к одной дуэли. На настоящих картах к каждому
пленту ведут три-четыре независимые дороги.

Меряем минимальный разрез: сколько клеток надо заткнуть, чтобы от спавна не
осталось пути. Это и есть суммарная ширина всех дорог в самом узком месте,
в клетках по 16u. Одна «дорога» шириной с игрока — это 2 клетки.

    python3 tools/dorogi.py <файл.vmf> [ещё.vmf ...]
"""
import collections, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']


def разрез(adj, истоки, стоки, предел=40):
    """Максимальный поток при ЁМКОСТИ УЗЛА 1 = число независимых дорог.
    Узел v расщепляется на v_in -> v_out. Поиск дополняющих путей в ширину."""
    ИСТ, СТОК = ('S',), ('T',)
    поток = collections.defaultdict(int)          # (u,v) -> сколько занято
    ёмк = collections.defaultdict(int)
    рёбра = collections.defaultdict(list)

    def реб(u, v, c):
        if c and not рёбра[u].count(v):
            рёбра[u].append(v)
        if not рёбра[v].count(u):
            рёбра[v].append(u)
        ёмк[(u, v)] += c

    for v in adj:
        реб(('i', v), ('o', v), 1)
    for v, лст in adj.items():
        for w in лст:
            if w in adj or w in стоки:
                реб(('o', v), ('i', w), 1)
    # Исток и сток подключаются В ОБХОД собственной ёмкости узла: иначе поток
    # ограничен ЧИСЛОМ ИСТОКОВ, и прибор меряет не дороги, а сколько точек ему
    # дали. Первая редакция так и делала — «8 дорог» оказалось «8 точек спавна»,
    # а «1 дорога от мида» — «мид задан одной точкой».
    for v in истоки:
        реб(ИСТ, ('o', v), 1 << 20)
    for v in стоки:
        реб(('i', v), СТОК, 1 << 20)

    n = 0
    разрезКл = []
    while n < предел:
        род = {ИСТ: None}
        оч = collections.deque([ИСТ])
        while оч and СТОК not in род:
            u = оч.popleft()
            for v in рёбра[u]:
                if v in род:
                    continue
                if ёмк[(u, v)] - поток[(u, v)] + поток[(v, u)] <= 0:
                    continue
                род[v] = u
                оч.append(v)
        if СТОК not in род:
            # достижимое из истока по остаточной сети = сторона разреза
            разрезКл[:] = [v[1] for v in род if isinstance(v, tuple) and len(v) == 2
                           and v[0] == 'i' and ('o', v[1]) not in род]
            break
        v = СТОК
        while v != ИСТ:
            u = род[v]
            if поток[(v, u)] > 0:
                поток[(v, u)] -= 1
            else:
                поток[(u, v)] += 1
            v = u
        n += 1
    return n, разрезКл


for путь in sys.argv[1:]:
    txt = open(путь, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
    узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)

    сп, зоны, места = {}, {}, {}
    for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
        b = m.group(1)
        og = re.search(r'"origin" "([-\d.e ]+)"', b)
        cn = re.search(r'"classname" "info_player_(\w+)"', b)
        if cn and og:
            сп.setdefault(cn.group(1), []).append(tuple(float(v) for v in og.group(1).split()))
        nm = re.search(r'"place_name" "([^"]*)"', b)
        if '"env_cs_place"' in b and nm and og:
            места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())
        if '"func_bomb_target"' in b:
            xs, ys = [], []
            for pm in re.finditer(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"', b):
                for k in range(1, 4):
                    a = pm.group(k).split()
                    xs.append(float(a[0])); ys.append(float(a[1]))
            tn = re.search(r'"targetname" "([^"]*)"', b)
            if xs:
                зоны[tn.group(1) if tn else f'site{len(зоны)}'] = (min(xs), min(ys), max(xs), max(ys))

    # ПАРЫ, которые меряем: не только от спавна. Разрез у спавна показывает
    # ширину выхода из спавна, а вопрос «сколько дорог на плент» — это разрез
    # между мидом и плентом и между плентами.
    старт = [hodba.ближайший(узлы, X0, Y0, p) for p in сп.get('terrorist', [])]
    старт = [s for s in старт if s]
    дост = set()
    for s in старт[:1]:
        дост |= set(hodba.волна(adj, s))
    print(f'\n{путь}')
    for имя, (x0, y0, x1, y1) in sorted(зоны.items()):
        цель = [c for c in дост
                if x0 <= X0 + c[0] * U + U / 2 <= x1 and y0 <= Y0 + c[1] * U + U / 2 <= y1]
        if not цель:
            print(f'  {имя}: недостижим')
            continue
        k, кл = разрез(adj, старт, set(цель))
        print(f'  T -> {имя:12s}  независимых дорог (клеток в узком месте): {k}'
              f'   ≈ {k*U}u суммарной ширины')
        # где именно режется: группируем клетки разреза в пятна
        пт = [(c[0], c[1]) for c in кл]
        мн, гр = set(пт), []
        while мн:
            a = мн.pop(); ст, ком = [a], [a]
            while ст:
                c = ст.pop()
                for dx in (-2,-1,0,1,2):
                    for dy in (-2,-1,0,1,2):
                        n2 = (c[0]+dx, c[1]+dy)
                        if n2 in мн: мн.discard(n2); ст.append(n2); ком.append(n2)
            гр.append(ком)
        гр.sort(key=len, reverse=True)
        for ком in гр[:4]:
            xs=[c[0] for c in ком]; ys=[c[1] for c in ком]
            wx, wy = X0+sum(xs)/len(xs)*U, Y0+sum(ys)/len(ys)*U
            бл = sorted(места, key=lambda nm:(места[nm][0]-wx)**2+(места[nm][1]-wy)**2)[:2]
            print(f'        горло {len(ком)} клеток у ({wx:.0f} {wy:.0f})  рядом: {", ".join(бл)}')
    # ---- разрезы между ключевыми местами ----
    def узелМеста(nm):
        return hodba.ближайший(узлы, X0, Y0, места[nm]) if nm in места else None
    пары = []
    сайты = {}
    for имя,(x0,y0,x1,y1) in зоны.items():
        c=[q for q in дост if x0<=X0+q[0]*U+U/2<=x1 and y0<=Y0+q[1]*U+U/2<=y1]
        if c: сайты[имя]=set(c)
    мид = None
    for nm in ('Middle','МИД','Mid'):
        if nm in места: мид=узелМеста(nm); break
    def горла(кл, метка):
        пт=[(c[0],c[1]) for c in кл]; мн=set(пт); гр=[]
        while мн:
            a=мн.pop(); ст,ком=[a],[a]
            while ст:
                c=ст.pop()
                for dx in (-2,-1,0,1,2):
                    for dy in (-2,-1,0,1,2):
                        n2=(c[0]+dx,c[1]+dy)
                        if n2 in мн: мн.discard(n2); ст.append(n2); ком.append(n2)
            гр.append(ком)
        гр.sort(key=len,reverse=True)
        for ком in гр[:3]:
            xs=[c[0] for c in ком]; ys=[c[1] for c in ком]
            wx,wy=X0+sum(xs)/len(xs)*U, Y0+sum(ys)/len(ys)*U
            бл=sorted(места,key=lambda nm:(места[nm][0]-wx)**2+(места[nm][1]-wy)**2)[:2]
            print(f'        {метка} горло {len(ком)} клеток ({len(ком)*U}u) у ({wx:.0f} {wy:.0f})  рядом: {", ".join(бл)}')
    if мид:
        for имя,цель in sorted(сайты.items()):
            k,кл=разрез(adj,[мид],цель)
            print(f'  МИД -> {имя:12s}  дорог {k}  ≈ {k*U}u')
            горла(кл,'')
    if len(сайты)==2:
        (иA,цA),(иB,цB)=sorted(сайты.items())
        k,_=разрез(adj,list(цA),цB)
        print(f'  {иA} -> {иB}  (ротация) дорог {k}  ≈ {k*U}u')
    ктспавн=[hodba.ближайший(узлы,X0,Y0,p) for p in сп.get('counterterrorist',[])][:1]
    ктспавн=[q for q in ктспавн if q]
    if ктспавн:
        for имя,цель in sorted(сайты.items()):
            k,_=разрез(adj,ктспавн,цель)
            print(f'  CT -> {имя:12s}  дорог {k}  ≈ {k*U}u')
