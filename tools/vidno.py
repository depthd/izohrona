"""ВИДНО РЯДОМ — ИДТИ ДАЛЕКО. Прибор, откалиброванный на живом человеке.

Он двадцать итераций показывал пальцем «тут должен быть проход», а все мои
мерки говорили, что всё в порядке: ширина в норме, связность есть, крюк между
каллаутами мал. Мерки были не про то. Он тыкал в места, где ДВЕ ТОЧКИ ПОЛА
ЛЕЖАТ В ЧЕТЫРЁХ ШАГАХ ДРУГ ОТ ДРУГА, А ПЕШКОМ МЕЖДУ НИМИ ПОЛКАРТЫ. Глаз видит
продолжение, ноги упираются в стенку. Это и есть «нет прохода».

Проверка прибора на заведомо известном ответе: шесть его меток на карте
86890799 — пять из шести попали в пятно этого прибора, четыре точно в ноль.
Всего таких пятен на карте оказалось восемь, то есть прибор не красит полкарты.

    python3 tools/vidno.py <файл.vmf> [метки.json|-] [предел_шагов]

БЛИЗКО — расстояние по прямой (клетки Чебышева, 2..4 = 32..64u), и между
точками обязан быть камень, иначе это просто открытое место.
ДАЛЕКО — пешком по ходибельной сетке дальше ПРЕДЕЛ шагов (по умолчанию 20,
то есть 320u).
"""
import collections
import json
import re
import sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

БЛИЗКО = 4          # клеток по прямой
ПРЕДЕЛ = 20         # шагов пешком

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']


def сетка(путь):
    txt = open(путь, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['нетело']]
    узлы, adj, X0, Y0, W, H = hodba.сетка(solid, column)
    сп = None
    for m in re.finditer(r'^entity\n\{(.*?)\n\}', txt, re.M | re.S):
        if '"info_player_terrorist"' in m.group(1):
            og = re.search(r'"origin" "([-\d.e ]+)"', m.group(1))
            if og:
                сп = tuple(float(v) for v in og.group(1).split())
                break
    дост = hodba.волна(adj, hodba.ближайший(узлы, X0, Y0, сп))
    адж = collections.defaultdict(set)
    for c, л in adj.items():
        if c not in дост:
            continue
        for n in л:
            if n in дост:
                адж[(c[0], c[1])].add((n[0], n[1]))
    пол = set(адж) | {(c[0], c[1]) for c in дост}
    return пол, адж, X0, Y0, W, H


def картинка(куда, пол, кл, W, H, подпись='', K=3, метки=()):
    """План карты: серое — пол, красное — пятна «видно рядом, идти далеко»."""
    from PIL import Image, ImageDraw, ImageFont
    try:
        шрифт = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    except OSError:                      # шрифта нет — подпись всё равно не важнее плана
        шрифт = None
    xs = [p[0] for p in пол]
    ys = [p[1] for p in пол]
    x0, x1, y0, y1 = min(xs) - 4, max(xs) + 4, min(ys) - 4, max(ys) + 4
    ш, в = (x1 - x0 + 1) * K, (y1 - y0 + 1) * K
    im = Image.new('RGB', (ш, в + 26), (16, 16, 20))
    d = ImageDraw.Draw(im)
    for (x, y) in пол:
        d.rectangle([(x - x0) * K, (y1 - y) * K + 26,
                     (x - x0) * K + K - 1, (y1 - y) * K + 26 + K - 1], fill=(150, 154, 160))
    for вес, гр in кл:
        r = max(7, min(26, int(4 + вес ** 0.5 * 1.6)))
        cx = sum(p[0] for p in гр) / len(гр)
        cy = sum(p[1] for p in гр) / len(гр)
        px, py = (cx - x0) * K, (y1 - cy) * K + 26
        d.ellipse([px - r, py - r, px + r, py + r], outline=(255, 60, 60), width=4)
    for mk in метки:
        px, py = (mk[0] - x0) * K, (y1 - mk[1]) * K + 26
        d.line([px - 9, py - 9, px + 9, py + 9], fill=(90, 200, 255), width=3)
        d.line([px - 9, py + 9, px + 9, py - 9], fill=(90, 200, 255), width=3)
    d.text((8, 4), подпись, fill=(255, 220, 120), font=шрифт)
    im.save(куда)
    return куда


def найти(пол, адж, предел=ПРЕДЕЛ, близко=БЛИЗКО):
    """-> список пар (a,b) «видно рядом, идти далеко»"""
    # Смещения берутся ВСЕ, а не половина. Волна направленная: вниз с уступа
    # игрок спрыгивает даром, наверх не залезет. У обрыва «сверху вниз» один шаг,
    # «снизу вверх» полкарты, и половину обрывов проверка в одну сторону теряет.
    смещ = [(dx, dy) for dx in range(-близко, близко + 1)
            for dy in range(-близко, близко + 1)
            if 2 <= max(abs(dx), abs(dy)) <= близко]

    def перекрыто(a, b):
        n = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
        for k in range(1, n):
            p = (a[0] + round((b[0] - a[0]) * k / n), a[1] + round((b[1] - a[1]) * k / n))
            if p not in пол:
                return True
        return False

    канд = {}
    for c in пол:
        л = [b for b in ((c[0] + dx, c[1] + dy) for dx, dy in смещ)
             if b in пол and перекрыто(c, b)]
        if л:
            канд[c] = л
    плохие = []
    видано = set()
    for c, цели in канд.items():
        ост = set(цели)
        d = {c: 0}
        q = collections.deque([c])
        while q and ост:
            x = q.popleft()
            if d[x] >= предел:
                continue
            for n in адж.get(x, ()):
                if n in d:
                    continue
                d[n] = d[x] + 1
                ост.discard(n)
                q.append(n)
        for b in ост:
            ключ = (c, b) if c < b else (b, c)      # пара одна, направлений два
            if ключ in видано:
                continue
            видано.add(ключ)
            плохие.append((c, b))
    return плохие


def пятна(плохие, слип=3):
    """Пары -> пятна по средней точке. Возвращает [(вес, [клетки])]."""
    точки = collections.Counter()
    for a, b in плохие:
        точки[((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)] += 1
    мн = set(точки)
    кл = []
    while мн:
        ст = [мн.pop()]
        гр = list(ст)
        while ст:
            p = ст.pop()
            for dx in range(-слип, слип + 1):
                for dy in range(-слип, слип + 1):
                    q = (p[0] + dx, p[1] + dy)
                    if q in мн:
                        мн.discard(q)
                        ст.append(q)
                        гр.append(q)
        кл.append((sum(точки[p] for p in гр), гр))
    кл.sort(key=lambda t: -t[0])
    return кл


if __name__ == '__main__':
    путь = sys.argv[1]
    мпуть = sys.argv[2] if len(sys.argv) > 2 else '-'
    предел = int(sys.argv[3]) if len(sys.argv) > 3 else ПРЕДЕЛ
    пол, адж, X0, Y0, W, H = сетка(путь)
    плохие = найти(пол, адж, предел)
    кл = пятна(плохие)
    print(f'{путь}: пола {len(пол)} клеток · ВРЁТ ГЛАЗУ {len(плохие)} пар'
          f' в {len(кл)} пятнах (ближе {БЛИЗКО*U}u по прямой,'
          f' дальше {предел*U}u пешком)')
    for вес, гр in кл[:10]:
        xs = [p[0] for p in гр]
        ys = [p[1] for p in гр]
        print(f'   {вес:5d} пар  {len(гр)*U:4d}u вдоль стены   мир'
              f' x {round(X0+min(xs)*U)}..{round(X0+max(xs)*U)}'
              f'  y {round(Y0+min(ys)*U)}..{round(Y0+max(ys)*U)}')
    if мпуть != '-':
        М = json.load(open(мпуть, encoding='utf-8'))['метки']
        центры = [p for _, гр in кл for p in гр]
        попало = 0
        print('  метки человека:')
        for n, mk in enumerate(М, 1):
            cx, cy = int((mk['x'] - X0) // U), int((mk['y'] - Y0) // U)
            d = min((max(abs(p[0] - cx), abs(p[1] - cy)) for p in центры), default=999)
            попало += d * U <= 64
            print(f'    метка {n}: ближайшее пятно в {d*U}u')
        print(f'  ПОКРЫТО {попало} из {len(М)}')
    if len(sys.argv) > 4:
        мк = []
        if мпуть != '-':
            for mk in json.load(open(мпуть, encoding='utf-8'))['метки']:
                мк.append((int((mk['x'] - X0) // U), int((mk['y'] - Y0) // U)))
        print(' ', картинка(sys.argv[4], пол, кл, W, H,
                            f'{len(плохие)} пар в {len(кл)} пятнах', метки=мк))
