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


РАЗРЕЗ = None
if '--разрез' in sys.argv:
    i = sys.argv.index('--разрез')
    РАЗРЕЗ = (sys.argv[i+1], sys.argv[i+2])
    del sys.argv[i:i+3]

СНАП = '--снап' in sys.argv
if СНАП:
    sys.argv = [a for a in sys.argv if a != '--снап']
    sys.argv.append('--снап')          # разбор читает его сам

БЕЗ_ТЕЛ = '--безтел' in [a.lower() for a in sys.argv]
if БЕЗ_ТЕЛ:
    sys.argv = [a for a in sys.argv if a.lower() != '--безтел']


def разрез(места, точки, узлы, adj, IV, solid, X0, Y0, W, H):
    """Что физически стоит на прямой между двумя местами и где рвётся путь.
    Отвечает на вопрос «кто барикадит», не гадая по скриншоту."""
    A, B = РАЗРЕЗ
    if A not in точки or B not in точки or точки[A] is None or точки[B] is None:
        print(f'  разрез: нет такой пары. Есть: {", ".join(места)}')
        return
    a, b = точки[A], точки[B]
    d = hodba.волна(adj, a)
    дошли = {(c[0], c[1]) for c in d}
    n = max(abs(b[0]-a[0]), abs(b[1]-a[1]))
    print(f'\n  РАЗРЕЗ «{A}» -> «{B}», {n} шагов по {U}u '
          f'(путь {"есть" if b in d else "НЕ НАЙДЕН"}):')
    проф = []
    for k in range(n+1):
        cx = round(a[0] + (b[0]-a[0])*k/n); cy = round(a[1] + (b[1]-a[1])*k/n)
        есть = (cx, cy) in дошли
        zs = узлы.get((cx, cy), [])
        сост = 'идём' if есть else ('стоим' if zs else 'нет узла')
        проф.append((k, cx, cy, сост, zs))
    # профиль отметок: где рвётся, там и виновник
    print('    отметки узлов по шагам (в скобках — состояние):')
    строка = []
    for k, cx, cy, сост, zs in проф:
        м = {'идём': '', 'стоим': '*', 'нет узла': '#'}[сост]
        строка.append(f'{k}:{",".join(f"{z:.0f}" for z in zs) or "-"}{м}')
    for i in range(0, len(строка), 8):
        print('      ' + '  '.join(строка[i:i+8]))
    print('    * — узел есть, но от старта не достижим · # — узла нет')
    # Разбор блока 2x2: узел строится по ЧЕТЫРЁМ клеткам, и если он оказался
    # не там, где пол, надо видеть все четыре, а не центральную.
    for k, cx, cy, сост, zs in проф:
        if сост == 'идём':
            continue
        if k % 6 and k not in (проф[0][0],):
            continue
        print(f'    блок на шаге {k} ({X0+cx*U+U/2:.0f} {Y0+cy*U+U/2:.0f}):')
        for (dx, dy) in ((0,0),(1,0),(0,1),(1,1)):
            j = (cy+dy)*W + (cx+dx)
            iv = IV[j] if 0 <= j < len(IV) else []
            print(f'      +{dx}+{dy}: ' + (' | '.join(
                f'{i[0]:.0f}..{i[1]:.0f} {solid[i[2][0]]["mat"].split("/")[-1][:18]}'
                for i in iv[:4]) or 'пусто'))
    прошлое = None
    for k, cx, cy, сост, zs in проф:
        if сост != прошлое:
            iv = IV[cy*W + cx] if 0 <= cx < W and 0 <= cy < H else []
            wx, wy = X0 + cx*U + U/2, Y0 + cy*U + U/2
            что = ' | '.join(f'{solid[i[2][0]]["mat"].split("/")[-1][:20]} {i[0]:.0f}..{i[1]:.0f}'
                             for i in iv[:3]) or 'пусто'
            print(f'    шаг {k:3}  ({wx:.0f} {wy:.0f})  {сост:9}  {что}')
            прошлое = сост


def разбор(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
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

    узлы, adj, X0, Y0, W, H, IV = hodba.сетка(solid, column, вернутьIV=True)
    имена = list(места)
    точки = {n: hodba.ближайший(узлы, X0, Y0, места[n]) for n in имена}
    # Диагностика прилипания: если точка места села на отметку далеко от своей,
    # значит она прилипла к верху стены или к ящику, и всё дальнейшее — мусор.
    if '--снап' in sys.argv:
        print(f'\n  прилипание точек мест ({path}):')
        for n in имена:
            t = точки[n]
            if t is None:
                print(f'    {n:20} УЗЛА НЕТ ВООБЩЕ')
                continue
            dz = t[2] - места[n][2]
            dxy = math.hypot((X0 + t[0]*U + U/2) - места[n][0],
                             (Y0 + t[1]*U + U/2) - места[n][1])
            метка = ' <-- ПОДОЗРИТЕЛЬНО' if abs(dz) > 64 or dxy > 100 else ''
            print(f'    {n:20} dz {dz:+7.0f}u  сдвиг {dxy:5.0f}u{метка}')
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
    if РАЗРЕЗ:
        разрез(места, точки, узлы, adj, IV, solid, X0, Y0, W, H)
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
