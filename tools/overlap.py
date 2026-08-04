"""Пересечения брашей в .vmf — то, из-за чего в игре дерутся две текстуры.

Считает пары ОСЕВЫХ коробок с положительным объёмом пересечения. Инструментальные
браши (TOOLS*) не рисуются, поэтому выносятся отдельно: они мешать не могут.

    python3 tools/overlap.py <файл.vmf> [сколько примеров]
"""
import re, sys
from collections import defaultdict, Counter

def boxes_of(path):
    t = open(path, encoding='utf-8', errors='replace').read()
    out = []
    for bl in t.split('solid\n')[1:]:
        end = bl.find('\n\t}')
        body = bl[:end if end > 0 else 8000]
        pl = re.findall(r'"plane" "\(([-\d\. e]+)\) \(([-\d\. e]+)\) \(([-\d\. e]+)\)"', body)
        if len(pl) != 6:
            continue
        pts = [tuple(map(float, s.split())) for tri in pl for s in tri]
        xs = {round(q[0], 2) for q in pts}
        ys = {round(q[1], 2) for q in pts}
        zs = {round(q[2], 2) for q in pts}
        if not (len(xs) == 2 and len(ys) == 2 and len(zs) == 2):
            continue
        mats = re.findall(r'"material" "([^"]+)"', body)
        m = mats[0] if mats else '?'
        out.append((min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), m))
    return out

def overlaps(boxes, grid=512):
    g = defaultdict(list)
    for i, b in enumerate(boxes):
        for gx in range(int(b[0] // grid), int(b[1] // grid) + 1):
            for gy in range(int(b[2] // grid), int(b[3] // grid) + 1):
                g[(gx, gy)].append(i)
    seen, res = set(), []
    for cell in g.values():
        for a in range(len(cell)):
            for c in range(a + 1, len(cell)):
                i, j = sorted((cell[a], cell[c]))
                if (i, j) in seen:
                    continue
                seen.add((i, j))
                A, B = boxes[i], boxes[j]
                dx = min(A[1], B[1]) - max(A[0], B[0])
                dy = min(A[3], B[3]) - max(A[2], B[2])
                dz = min(A[5], B[5]) - max(A[4], B[4])
                if dx > .01 and dy > .01 and dz > .01:
                    res.append((dx * dy * dz, dx, dy, dz, A, B))
    return res

if __name__ == '__main__':
    bs = boxes_of(sys.argv[1])
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    tool = lambda m: m.upper().startswith('TOOLS')
    res = overlaps(bs)
    vis = [r for r in res if not tool(r[4][6]) and not tool(r[5][6])]
    mix = [r for r in res if tool(r[4][6]) != tool(r[5][6])]
    print(f'коробок {len(bs)}, пар с пересечением {len(res)}')
    print(f'  из них ВИДИМЫХ (обе не TOOLS): {len(vis)}   ← только эти мерцают')
    print(f'  видимое × инструментальное: {len(mix)} (безвредно)')
    if vis:
        print(f'  объём видимых пересечений: {sum(r[0] for r in vis)/1e6:.1f} млн ю³')
        c = Counter(tuple(sorted((r[4][6].split("/")[-1][:24], r[5][6].split("/")[-1][:24]))) for r in vis)
        print('\nчаще всего:')
        for k, v in c.most_common(n):
            print(f'  {v:5} × {k[0]} | {k[1]}')
        vis.sort(reverse=True)
        print('\nсамые крупные (объём, dx dy dz, где):')
        for r in vis[:n]:
            print(f'  {int(r[0]):>12}  {int(r[1])}x{int(r[2])}x{int(r[3])}  @({int(r[4][0])},{int(r[4][2])},{int(r[4][4])})'
                  f'  {r[4][6].split("/")[-1][:20]} | {r[5][6].split("/")[-1][:20]}')
