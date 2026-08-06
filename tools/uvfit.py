"""Проверка подгонки текстуры по граням экспорта.

ВАЖНО ПРО КУСКИ, И ПОЧЕМУ ЭТОТ ПРИБОР — ВСПОМОГАТЕЛЬНЫЙ. Вычитание режет коробку,
и куски НАРОЧНО наследуют оси целой коробки: иначе на разрезе рисунок прыгнет.
У куска вдоль грани лежит нецелое число повторов, и это ПРАВИЛЬНО.
Отделить куски по файлу до конца нельзя: тот, у кого отрезали дальний край,
сохраняет ближний угол, а значит и нулевой тексель на нём — от целой коробки он
неотличим. Здесь по нулевому текселю отсеиваются только куски, отрезанные с
БЛИЖНЕГО края; в остатке целые вперемешку с обрезанными с дальнего.
Поэтому дробные повторы в выводе ожидаемы и сами по себе дефектом не являются.
ТОЧНАЯ проверка — tools/uvchk.js: она идёт по списку коробок в момент сборки,
до вычитания, и кусков не видит вовсе. Здесь же смотрят на распределение
периодов и на то, что подгонка вообще доехала до файла.

Формат VMF: "uaxis" "[ux uy uz uoff] uscale",  тексель = (точка·ось)/uscale + uoff.
Период в юнитах = uscale * (текселей в повторе) = uscale * натуральный/UVS.
UVS и натуральный размер берутся из сборки: 8 и 32 по умолчанию.

    python3 tools/uvfit.py <файл.vmf> [натуральный размер] [UVS]
"""
import re, sys, collections

path = sys.argv[1]
TILE = float(sys.argv[2]) if len(sys.argv) > 2 else 32.0
UVS  = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0
TEXW = TILE / UVS                      # текселей на один повтор; TILE = НАТУРАЛЬНЫЙ размер (32u)

t = open(path, encoding='utf-8', errors='replace').read()
RE  = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RM  = re.compile(r'"material" "([^"]+)"')
RA  = re.compile(r'"([uv])axis" "\[([-\d.e ]+)\] ([-\d.e]+)"')


def num3(s):
    a = s.split()
    return tuple(float(v) for v in a[:3]), (float(a[3]) if len(a) > 3 else 0.0)


tot = collections.Counter()
badrep, badoff = [], []
reps_hist = collections.Counter()

for chunk in t.split('\tsolid\n')[1:]:
    pts = []
    for m in RE.finditer(chunk):
        for k in range(1, 4):
            a = m.group(k).split()
            if len(a) == 3:
                pts.append(tuple(float(v) for v in a))
    if not pts:
        continue
    mats = RM.findall(chunk)
    if not mats or mats[0].upper().startswith('TOOLS'):
        continue
    corners = [(x, y, z) for x in (min(p[0] for p in pts), max(p[0] for p in pts))
                         for y in (min(p[1] for p in pts), max(p[1] for p in pts))
                         for z in (min(p[2] for p in pts), max(p[2] for p in pts))]
    for ax, vec, sc in RA.findall(chunk):
        v, off = num3(vec)
        sc = float(sc)
        if sc <= 0:
            continue
        pr = [v[0] * c[0] + v[1] * c[1] + v[2] * c[2] for c in corners]
        c0, c1 = min(pr), max(pr)
        L = c1 - c0
        if L < 1:
            tot['грань короче юнита'] += 1
            continue
        if abs(sc - UVS) < 1e-9:
            tot['мировая сетка'] += 1
            continue
        u0 = c0 / sc + off                    # тексель в ближнем углу грани
        if abs(u0) > 0.005 * max(1.0, TEXW):  # шов не на ребре -> это кусок после вычитания
            tot['кусок: шов не на ребре'] += 1
            continue
        tot['шов на ребре (целые + обрезанные с дальнего края)'] += 1
        reps = L / (sc * TEXW)
        r = round(reps)
        reps_hist[r if r <= 8 else '9+'] += 1
        if abs(reps - r) > 0.01 or r < 1:
            badrep.append((round(L), sc, round(reps, 3), mats[0]))

print(f'\n{path}   тайл {TILE:.0f}u, UVS {UVS:.0f}, текселей в повторе {TEXW:.0f}')
for k, v in tot.most_common():
    print(f'  {v:7}  {k}')
n = tot['шов на ребре (целые + обрезанные с дальнего края)']
if n:
    print(f'\n  целых повторов: {n-len(badrep)} из {n} '
          f'({100*(n-len(badrep))//n}%) — дробных {len(badrep)}')
    print('  (дробные — куски, обрезанные с дальнего края; точный ответ у tools/uvchk.js)')
    hh = '  '.join(f'{k}:{v}' for k, v in sorted(reps_hist.items(), key=lambda kv: str(kv[0])))
    print(f'  повторов на грань: {hh}')
for name, bad in (('ПРИМЕРЫ ДРОБНЫХ', badrep),):
    if bad:
        print(f'\n  {name}, первые 5:')
        for b in bad[:5]:
            print('   ', b)
