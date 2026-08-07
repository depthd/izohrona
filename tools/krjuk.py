"""КРЮК МЕЖДУ СОСЕДНИМИ МЕСТАМИ — приёмка структуры карты по экспорту.

Один вопрос: если два каллаута рядом, можно ли между ними пройти НАПРЯМУЮ.
Считается по .vmf — по тому, что реально уходит в игру, а не по растру.

Для каждой пары мест, чьи центры ближе ПОРОГ_БЛИЗКО юнитов, берётся отношение
длины пути по земле к прямой. Хорошая карта: почти все пары в пределах 1.4,
редкие обходы вокруг помещения до 1.8. Крюк выше 2 — это забаррикадированный
проход: обход есть, но играть по нему никто не станет.

    python3 tools/krjuk.py <файл.vmf> [ещё файлы...]
"""
import re, sys, collections, math

ПОРОГ_БЛИЗКО = 1800      # «рядом» — центры не дальше этого
ПЛОХО = 2.0              # крюк выше этого считаем барикадой

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']


БЕЗ_ТЕЛ = '--безтел' in [a.lower() for a in sys.argv]
if БЕЗ_ТЕЛ:
    sys.argv = [a for a in sys.argv if a.lower() != '--безтел']


def разбор(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['tool']]
    if БЕЗ_ТЕЛ:
        # Пол и стены печатаются ОТ БАЗЫ, тела ставятся НА пол. Отсечение по низу
        # оставляет только каркас — так видно, кто барикадит: растр или тела.
        база = min(s['z0'] for s in solid)
        solid = [s for s in solid if s['z0'] < база + 8]
    места = {}
    for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
        b = m.group(1)
        if '"env_cs_place"' not in b:
            continue
        nm = re.search(r'"place_name" "([^"]*)"', b)
        og = re.search(r'"origin" "([-\d.e ]+)"', b)
        if nm and og:
            места[nm.group(1)] = tuple(float(v) for v in og.group(1).split())

    узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)
    имена = list(места)
    точки = {n: hodba.ближайший(узлы, X0, Y0, места[n]) for n in имена}
    пары, кэш = [], {}
    for i, a in enumerate(имена):
        if точки[a] is None:
            continue
        for b in имена[i + 1:]:
            if точки[b] is None:
                continue
            пр = math.dist(места[a][:2], места[b][:2])
            if пр > ПОРОГ_БЛИЗКО or пр < 200:
                continue
            if a not in кэш:
                кэш[a] = hodba.волна(adj, точки[a])
            d = кэш[a].get(точки[b])
            пары.append((a, b, пр, None if d is None else d * U))
    return места, пары, len(узлы)


for path in sys.argv[1:]:
    места, пары, нузлов = разбор(path)
    крюки = [(d / пр if d else None, a, b, пр, d) for (a, b, пр, d) in пары]
    жив = sorted([k for k in крюки if k[0] is not None], key=lambda k: -k[0])
    нет = [k for k in крюки if k[0] is None]
    med = sorted(k[0] for k in жив)
    плохие = [k for k in жив if k[0] > ПЛОХО]
    print(f'\n{path}')
    print(f'  мест {len(места)}, ходибельных клеток {нузлов}, близких пар {len(крюки)}')
    if жив:
        print(f'  КРЮК: медиана {med[len(med)//2]:.2f} · максимум {жив[0][0]:.2f} · '
              f'хуже {ПЛОХО}: {len(плохие)} · пути нет: {len(нет)}')
    for k, a, b, пр, d in жив[:6]:
        print(f'    x{k:.2f}  {a} -> {b}   {d:.0f}u по земле, {пр:.0f}u напрямую'
              f'  {"БАРИКАДА" if k > ПЛОХО else ""}')
    for _, a, b, пр, _ in нет[:4]:
        print(f'    ПУТИ НЕТ  {a} -> {b}   {пр:.0f}u напрямую')
