"""Откуда берутся узкие торчащие браши: по материалу и габариту видно, стена это,
пол или тело. Пока не знаешь, что именно торчит, чинить нечего.

    python3 tools/slivers.py <файл.vmf>
"""
import re, sys, collections

p = sys.argv[1]
t = open(p, encoding='utf-8', errors='replace').read()
RE = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RM = re.compile(r'"material" "([^"]+)"')

kinds = collections.Counter()
mats = collections.Counter()
examples = collections.defaultdict(list)
tot = 0

for chunk in t.split('\tsolid\n')[1:]:
    xs, ys, zs = [], [], []
    for m in RE.finditer(chunk):
        for k in range(1, 4):
            a = m.group(k).split()
            if len(a) != 3:
                continue
            xs.append(float(a[0])); ys.append(float(a[1])); zs.append(float(a[2]))
    if not xs:
        continue
    tot += 1
    dx, dy, dz = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
    nar, lng = min(dx, dy), max(dx, dy)
    mm = RM.findall(chunk)
    mat = collections.Counter(mm).most_common(1)[0][0] if mm else '?'
    if mat.upper().startswith('TOOLS'):
        continue
    # лезвие: тонкое в плане и высокое
    if nar <= 32 and dz >= 192:
        kind = 'ЛЕЗВИЕ'
        if lng <= 64:
            kind = 'ЛЕЗВИЕ-ШИП'          # ещё и короткое: одиночный зуб
        kinds[kind] += 1
        mats[mat] += 1
        if len(examples[kind]) < 5:
            examples[kind].append((int(dx), int(dy), int(dz), int(min(zs)), mat.split('/')[-1]))
    elif dz <= 24 and nar <= 32:
        kinds['ПЛОСКАЯ ПОЛОСКА'] += 1
    else:
        kinds['обычный'] += 1

print(f'\n{p}: брашей всего {tot}\n')
for k, v in kinds.most_common():
    print(f'  {k:18} {v}')
print('\nматериалы лезвий:')
for m, v in mats.most_common(6):
    print(f'  {v:5}  {m}')
print('\nпримеры (dx dy dz низ материал):')
for k, ex in examples.items():
    for e in ex:
        print(f'  {k:12} {e[0]:5} x {e[1]:5} x {e[2]:5}   низ {e[3]:6}   {e[4]}')
