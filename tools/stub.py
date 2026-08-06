"""Тупиковые отростки: коридор, который упирается в стену и никуда не ведёт.

Растр восстанавливается ИЗ САМОГО .vmf: браши от базы с низким верхом — пол,
с высоким — стена. Дальше ищем «отростки»: куски пола, которые висят на одной
узкой горловине и внутри которых нет ничего (ни плента, ни спавна). Именно так
выглядит «проход забаррикадирован» с точки зрения игрока: идёшь по коридору
и упираешься.

    python3 tools/stub.py <файл.vmf> [x0 y0 x1 y1]
"""
import re, sys, collections

t = open(sys.argv[1], encoding='utf-8', errors='replace').read()
RE = re.compile(r'"plane" "\(([-\d.e ]+)\) \(([-\d.e ]+)\) \(([-\d.e ]+)\)"')
RM = re.compile(r'"material" "([^"]+)"')
U = 16

recs = []
for chunk in t.split('\tsolid\n')[1:]:
    xs, ys, zs = [], [], []
    for m in RE.finditer(chunk):
        for k in range(1, 4):
            a = m.group(k).split()
            if len(a) == 3:
                xs.append(float(a[0])); ys.append(float(a[1])); zs.append(float(a[2]))
    if not xs:
        continue
    mats = RM.findall(chunk)
    if not mats or mats[0].upper().startswith('TOOLS'):
        continue
    recs.append((min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)))

base = min(r[2] for r in recs)
X1 = max(r[3] for r in recs); Y1 = max(r[4] for r in recs)
W = int(X1 // U) + 2; H = int(Y1 // U) + 2
top = [-10 ** 9] * (W * H)          # самый высокий верх среди брашей от базы

for x0, y0, z0, x1, y1, z1 in recs:
    if abs(z0 - base) > 1:
        continue
    cx0, cx1 = int(x0 // U), int((x1 - 1) // U)
    cy0, cy1 = H - int(y1 // U) - 1, H - int(y0 // U) - 2
    if (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 40000:
        continue
    for cy in range(max(0, cy0), min(H - 1, cy1) + 1):
        row = cy * W
        for cx in range(max(0, cx0), min(W - 1, cx1) + 1):
            if z1 > top[row + cx]:
                top[row + cx] = z1

vals = sorted(v for v in top if v > -10 ** 8)
if not vals:
    print('пусто'); sys.exit()
# порог «стена»: верх выше пола более чем на 400u
med = vals[len(vals) // 2]
g = bytearray(W * H)
for i in range(W * H):
    if top[i] > -10 ** 8 and top[i] < med + 400:
        g[i] = 1
floor = sum(g)
print(f'сетка {W}x{H}, база {base:.0f}, порог стены {med+400:.0f}')
print(f'клеток пола {floor}, стен {W*H-floor}')

# ---- отростки: эрозия 2x2, компоненты, и связь каждой с главной ----
D8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
er = bytearray(W * H)
for y in range(H - 1):
    for x in range(W - 1):
        i = y * W + x
        if g[i] and g[i + 1] and g[i + W] and g[i + W + 1]:
            er[i] = 1
lab = [-1] * (W * H)
comps = []
for i in range(W * H):
    if not er[i] or lab[i] >= 0:
        continue
    cid = len(comps); st = [i]; lab[i] = cid; n = 0
    while st:
        j = st.pop(); n += 1
        x, y = j % W, j // W
        for dx, dy in D8:
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                k = ny * W + nx
                if er[k] and lab[k] < 0:
                    lab[k] = cid; st.append(k)
    comps.append(n)
comps_sorted = sorted(comps, reverse=True)
print(f'\nсвязных кусков проходимого пола: {len(comps)}')
print('  размеры (клеток):', comps_sorted[:8])
if len(comps) > 1:
    отрезано = sum(comps_sorted[1:])
    print(f'  ОТРЕЗАНО от главного куска: {отрезано} клеток '
          f'({round(100*отрезано/max(1,sum(comps)))}% проходимого пола)')

if len(sys.argv) > 5:
    ax0, ay0, ax1, ay1 = map(float, sys.argv[2:6])
    print(f'\nв области x {ax0:.0f}..{ax1:.0f}, y {ay0:.0f}..{ay1:.0f}:')
    cnt = collections.Counter()
    for cy in range(H):
        for cx in range(W):
            wx, wy = cx * U, (H - cy) * U
            if ax0 <= wx <= ax1 and ay0 <= wy <= ay1:
                i = cy * W + cx
                cnt['пол' if g[i] else 'стена'] += 1
                if er[i]:
                    cnt['кусок #%d' % lab[i]] += 1
    for k, v in cnt.most_common(8):
        print(f'   {k}: {v}')
