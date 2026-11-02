"""САМОПРОВЕРКА .vmap: сетка каждого меша цела и атрибуты как у его Hammer.

Правило 3: прибор сначала гоняется на файле с заведомо верным ответом — на том,
что сохранил его Hammer. Там обязано быть ноль ошибок, и только потом прибор
смотрит на наш файл.

    python3 tools/vmapcheck.py <файл.vmap> [образец=data/obrazec.vmap.txt]
"""
import sys
sys.path.insert(0, 'tools')
from kv2lib import parse, get

путь = sys.argv[1]
образец = sys.argv[2] if len(sys.argv) > 2 else 'data/obrazec.vmap.txt'


def меши(ch):
    for c in ch:
        if c['cls'] == 'CMapMesh': yield c
        yield from меши(get(c, 'children') or [])


def поток(arr, имя):
    for s in get(arr, 'streams'):
        if get(s, 'name') == имя: return get(s, 'data')


def сетка(md):
    I = lambda k: [int(x) for x in get(md, k)]
    to, opp, nxt, fc = I('edgeVertexIndices'), I('edgeOppositeIndices'), I('edgeNextIndices'), I('edgeFaceIndices')
    ve, fe, edi = I('vertexEdgeIndices'), I('faceEdgeIndices'), I('edgeDataIndices')
    H, V, F = len(to), len(ve), len(fe)
    ош = []
    if not (len(opp) == len(nxt) == len(fc) == H): ош.append('длины массивов рёбер разные')
    for e in range(H):
        if opp[opp[e]] != e or opp[e] == e: ош.append(f'пара ребра {e}'); break
        if fc[e] < 0: continue
        if fc[nxt[e]] != fc[e]: ош.append(f'следующее за {e} в чужой грани'); break
        if to[opp[nxt[e]]] != to[e]: ош.append(f'после ребра {e} обход рвётся'); break
        if edi[e] != edi[opp[e]]: ош.append(f'данные ребра {e} не как у пары'); break
    seen = set()
    for f in range(F):
        e, n = fe[f], 0
        while True:
            if fc[e] != f: ош.append(f'грань {f}: чужое ребро'); break
            seen.add(e); e = nxt[e]; n += 1
            if e == fe[f] or n > H: break
        if n > H: ош.append(f'грань {f}: обход не замкнут')
    открытых = sum(1 for e in range(H) if fc[e] < 0)   # Hammer допускает: дыра в меше
    if len(seen) + открытых != H: ош.append(f'рёбер вне граней: {H - len(seen) - открытых}')
    for v in range(V):
        if to[opp[ve[v]]] != v: ош.append(f'вершина {v}: её ребро не из неё'); break
    sz = lambda k: int(get(get(md, k), 'size'))
    if sz('vertexData') != V: ош.append('размер данных вершин')
    if sz('faceVertexData') != H: ош.append('размер данных углов')
    if sz('faceData') != F: ош.append('размер данных граней')
    if sz('edgeData') * 2 != H: ош.append('размер данных рёбер')
    pos = [list(map(float, p.split())) for p in поток(get(md, 'vertexData'), 'position:0')]
    # объём по формуле дивергенции: >0 — грани смотрят наружу
    vol = 0.0
    for f in range(F):
        loop, e = [], fe[f]
        while True:
            loop.append(pos[to[e]]); e = nxt[e]
            if e == fe[f]: break
        a = loop[0]
        for b, c in zip(loop[1:], loop[2:]):
            vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    if vol <= 0: ош.append(f'грани смотрят внутрь (объём {vol:.0f})')
    return ош


def ключи(el):
    return [k for k, t, v in el['a'] if k != 'id']


roots = parse(путь)
обр = parse(образец)
root = [r for r in roots if r['cls'] == 'CMapRootElement'][0]
world = get(root, 'world')
ороot = [r for r in обр if r['cls'] == 'CMapRootElement'][0]
oworld = get(ороot, 'world')
омеш = next(меши(get(oworld, 'children')))
осущ = {get(get(c, 'entity_properties'), 'classname'): c for c in get(oworld, 'children') if c['cls'] == 'CMapEntity'}

плохих, всего = 0, 0
for m in меши(get(world, 'children')):
    всего += 1
    ош = сетка(get(m, 'meshData'))
    if ключи(m) != ключи(омеш): ош.append('атрибуты меша не как у образца')
    if ош:
        плохих += 1
        if плохих <= 5: print('  меш', get(m, 'nodeID'), ':', '; '.join(ош))
print(f'мешей {всего}, с ошибками {плохих}')
for c in get(world, 'children'):
    if c['cls'] != 'CMapEntity': continue
    cls = get(get(c, 'entity_properties'), 'classname')
    if cls in осущ and ключи(c) != ключи(осущ[cls]):
        print('  сущность', cls, ': атрибуты не как у образца')
print('корень как у образца' if ключи(root) == ключи(ороot) and ключи(world) == ключи(oworld) else 'КОРЕНЬ ОТЛИЧАЕТСЯ')
sys.exit(1 if плохих else 0)
