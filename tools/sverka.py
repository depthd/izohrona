"""СВЕРКА ДВУХ МЕР КРЮКА НА ОДНОЙ КАРТЕ — пара за парой, а не итогами.

Генератор считает крюк по своему растру, приёмка — по .vmf. На одних и тех же
картах они дают разные числа, и по итогам («у него максимум 2.9, у меня 9.5»)
нельзя понять, кто врёт. Здесь сравниваются ОДНИ И ТЕ ЖЕ ПАРЫ МЕСТ, и
печатаются те, где расхождение самое большое: дальше в них и надо смотреть
разрезом.

    python3 tools/sverka.py <папка от gate_export.js>
"""
import json, math, re, sys

sys.path.insert(0, 'tools')
import hodba
from hodba import U

src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
ns = {}
exec(src, ns)
parse_solids, column = ns['parse_solids'], ns['column']

папка = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dg3'
gen = json.load(open(f'{папка}/gen.json', encoding='utf-8'))

for карта in gen['карты']:
    путь = карта['файл']
    ген = {имя: k for k, имя in (карта['крюкГен'] or {}).get('все', [])}
    txt = open(путь, encoding='utf-8', errors='replace').read()
    solid = [s for s in parse_solids(txt.split('\nentity\n')[0]) if not s['tool']]
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
    точки = {n: hodba.ближайший(узлы, X0, Y0, места[n]) for n in места}
    имена = list(места)
    кэш, расх = {}, []
    for i, a in enumerate(имена):
        if точки[a] is None:
            continue
        for b in имена[i + 1:]:
            if точки[b] is None:
                continue
            пр = math.dist(места[a][:2], места[b][:2])
            if пр > 1800 or пр < 200:
                continue
            ключ = f'{a}->{b}'
            если = ген.get(ключ, ген.get(f'{b}->{a}'))
            if если is None:
                continue
            if a not in кэш:
                кэш[a] = hodba.волна(adj, точки[a])
            d = кэш[a].get(точки[b])
            мой = None if d is None else d * U / пр
            расх.append((abs((мой or 99) - если), если, мой, ключ, пр))
    расх.sort(reverse=True)
    print(f'\n{путь}  ·  общих пар {len(расх)}')
    print(f'{"расхождение":>12} {"растр":>7} {"экспорт":>8}   пара')
    for д, г, м, к, пр in расх[:8]:
        print(f'{д:12.2f} {г:7.2f} {"нет пути" if м is None else f"{м:8.2f}"}   {к}  ({пр:.0f}u)')
    сх = [x for x in расх if x[0] < 0.3]
    print(f'  сходятся (расхождение <0.3): {len(сх)} из {len(расх)}')
