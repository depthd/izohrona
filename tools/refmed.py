"""Реальные карты РОВНО тем же кодом, что auditStats в браузере.

ref16.py считает <192u и >448u по СВОБОДНОМУ ПРОГОНУ, а браузер — по локальной
ширине на срединной оси, и распределение по осям чамфера у них тоже разное
(браузер ходит по диагоналям с весом 1.4142, ref16 — только по осям).
Сравнивать их между собой нельзя: это опять §5.4. Здесь один прибор на обе стороны —
построчный перевод auditStats:

    расстояние до стены — чамфер 3-4 с диагоналями 1.4142, два прохода;
    срединная ось — клетка, у которой расстояние не меньше, чем у всех восьми соседей;
    ЛОКАЛЬНАЯ ШИРИНА = 2 x расстояние, выборка ТОЛЬКО по срединной оси;
    луч — самый длинный свободный прогон через клетку по восьми направлениям,
          выборка по ВСЕМУ полу.

    python3 tools/refmed.py [клетка] [режим]
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from ref16 import raster, FILES

CELL = int(sys.argv[1]) if len(sys.argv) > 1 else 16
MODE = sys.argv[2] if len(sys.argv) > 2 else 'touch'
INF = 1e9
SQ2 = 1.4142


def audit(g, W, H, U):
    D = [0.0 if not g[i] else INF for i in range(W * H)]
    for y in range(1, H):
        for x in range(1, W - 1):
            i = y * W + x
            if not g[i]:
                continue
            D[i] = min(D[i], D[i - W] + 1, D[i - 1] + 1, D[i - W - 1] + SQ2, D[i - W + 1] + SQ2)
    for y in range(H - 2, -1, -1):
        for x in range(W - 2, 0, -1):
            i = y * W + x
            if not g[i]:
                continue
            D[i] = min(D[i], D[i + W] + 1, D[i + 1] + 1, D[i + W + 1] + SQ2, D[i + W - 1] + SQ2)

    wid = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            i = y * W + x
            if not g[i]:
                continue
            mx = 0.0
            for oy in (-1, 0, 1):
                for ox in (-1, 0, 1):
                    j = i + oy * W + ox
                    if g[j] and D[j] > mx:
                        mx = D[j]
            if D[i] >= mx - 1e-6:
                wid.append(D[i] * 2 * U)

    # луч: самый длинный свободный прогон через клетку по восьми направлениям
    S = [0.0] * (W * H)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        ln = SQ2 if (dx and dy) else 1.0
        R = [0] * (W * H)
        xr = range(1, W - 1) if dx > 0 else range(W - 2, 0, -1)
        yr = range(1, H - 1) if dy > 0 else range(H - 2, 0, -1)
        for y in yr:
            for x in xr:
                i = y * W + x
                if not g[i]:
                    R[i] = 0
                    continue
                j = (y - dy) * W + (x - dx)
                R[i] = (R[j] if g[j] else 0) + 1
        for i in range(W * H):
            if g[i] and (R[i] - 1) * ln > S[i]:
                S[i] = (R[i] - 1) * ln
    sight = [S[i] * U for i in range(W * H) if g[i]]

    floor = sum(1 for i in range(W * H) if g[i])
    wid.sort()
    sight.sort()
    q = lambda t, a: a[min(len(a) - 1, int(len(a) * t))] if a else 0
    return dict(
        полk=round(floor * U * U / 1000),
        шир=round(q(.5, wid)), p90=round(q(.9, wid)),
        узк=round(100 * sum(1 for v in wid if v < 192) / max(1, len(wid))),
        шир448=round(100 * sum(1 for v in wid if v > 448) / max(1, len(wid))),
        лучМед=round(q(.5, sight)), лучP90=round(q(.9, sight)),
        лучМакс=round(sight[-1]) if sight else 0)


hdr = ['карта', 'пол_k', 'локШир', 'локP90', '<192u', '>448u', 'лучМед', 'лучP90', 'лучМакс']
print(f'\nКЛЕТКА {CELL}u, режим {MODE!r} — прибор auditStats\n')
print('  '.join(h.ljust(8) for h in hdr))
for name, pth in FILES:
    if not os.path.exists(pth):
        continue
    g, W, H = raster(pth, CELL, MODE)
    m = audit(g, W, H, CELL)
    print('  '.join(str(v).ljust(8) for v in
          [name, m['полk'], m['шир'], m['p90'], f"{m['узк']}%", f"{m['шир448']}%",
           m['лучМед'], m['лучP90'], m['лучМакс']]))
