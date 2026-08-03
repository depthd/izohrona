"""Расширенный парсер .nav — сохраняет то, что navlib.py выбрасывает:
   - attributeFlags областей (в v16: OBSTACLE_TOP, CLIFF, STAIRS, CROUCH...)
   - hiding spots + их флаги (IN_COVER / GOOD_SNIPER / IDEAL_SNIPER / EXPOSED)
   - encounter spots (пути, вдоль которых происходят первые контакты)
   Совместим по байтам с navlib.read_nav — self-check по consumed==total.
"""
import struct

# --- флаги hiding spot (все версии) ---
HS_IN_COVER      = 0x01
HS_GOOD_SNIPER   = 0x02
HS_IDEAL_SNIPER  = 0x04
HS_EXPOSED       = 0x08

# --- attributeFlags, полный набор (v13+, 32 бита) ---
ATTR32 = {
    'CROUCH': 0x0001, 'JUMP': 0x0002, 'PRECISE': 0x0004, 'NO_JUMP': 0x0008,
    'STOP': 0x0010, 'RUN': 0x0020, 'WALK': 0x0040, 'AVOID': 0x0080,
    'TRANSIENT': 0x0100, 'DONT_HIDE': 0x0200, 'STAND': 0x0400,
    'NO_HOSTAGES': 0x0800, 'STAIRS': 0x1000, 'NO_MERGE': 0x2000,
    'OBSTACLE_TOP': 0x4000, 'CLIFF': 0x8000,
}
# --- attributeFlags в v<=8 — один байт, старый набор ---
ATTR8 = {
    'CROUCH': 0x01, 'JUMP': 0x02, 'PRECISE': 0x04, 'NO_JUMP': 0x08,
    'STOP': 0x10, 'RUN': 0x20, 'WALK': 0x40, 'AVOID': 0x80,
}


def read_nav2(path):
    d = open(path, 'rb').read(); N = len(d); p = [0]

    def rd(fmt):
        s = struct.calcsize('<' + fmt)
        v = struct.unpack_from('<' + fmt, d, p[0]); p[0] += s
        return v

    magic, ver = rd('II')
    assert magic == 0xFEEDFACE, 'not nav'
    minor = rd('I')[0] if ver >= 10 else 0
    bsp = rd('I')[0]
    analyzed = rd('B')[0] if ver >= 14 else 0

    places = ['']
    (pc,) = rd('H')
    for _ in range(pc):
        (ln,) = rd('H')
        places.append(d[p[0]:p[0] + ln - 1].decode('latin-1')); p[0] += ln
    if ver > 11:
        rd('B')

    (ac,) = rd('I')
    areas = []
    for _ in range(ac):
        (aid,) = rd('I')
        if ver <= 8:
            attr = rd('B')[0]
        elif ver < 13:
            attr = rd('H')[0]
        else:
            attr = rd('I')[0]

        nw = rd('3f'); se = rd('3f'); nez, swz = rd('2f')

        conns = []
        for _ in range(4):
            (c,) = rd('I')
            conns.append(list(rd('%dI' % c)) if c else [])

        # --- hiding spots: id, xyz, flags ---
        hides = []
        (hs,) = rd('B')
        for _ in range(hs):
            hid, hx, hy, hz, hf = rd('I3fB')
            hides.append(dict(id=hid, pos=(hx, hy, hz), flags=hf))

        if ver < 15:
            (ap,) = rd('B'); p[0] += ap * 14

        # --- encounter spots: путь from->to и точки контакта вдоль него ---
        encs = []
        (ec,) = rd('I')
        for _ in range(ec):
            f_id, f_dir, t_id, t_dir = rd('IBIB')
            (sc,) = rd('B')
            spots = []
            for _ in range(sc):
                said, t = rd('IB')
                spots.append((said, t / 255.0))
            encs.append(dict(frm=f_id, to=t_id, spots=spots))

        (place,) = rd('H')
        if ver >= 6:
            for _ in range(2):
                (c,) = rd('I'); p[0] += c * 4
            rd('2f')
        if ver >= 11:
            rd('4f')
        vis = []
        if ver >= 16:
            (vc,) = rd('I')
            for _ in range(vc):
                vid, vat = rd('IB')
                vis.append(vid)
            rd('I')
            (gc,) = rd('B'); p[0] += gc * 14

        lo = (min(nw[0], se[0]), min(nw[1], se[1]), min(nw[2], se[2], nez, swz))
        hi = (max(nw[0], se[0]), max(nw[1], se[1]), max(nw[2], se[2], nez, swz))
        areas.append(dict(
            id=aid, attr=attr,
            lo=lo, hi=hi,
            nw=nw, se=se, nez=nez, swz=swz,
            conns=conns, hides=hides, encs=encs, vis=vis,
            pname=places[place] if place < len(places) else ''))

    return dict(ver=ver, areas=areas, places=places[1:],
                consumed=p[0], total=N, analyzed=analyzed)


def attr_names(attr, ver):
    tbl = ATTR8 if ver <= 8 else ATTR32
    return [k for k, v in tbl.items() if attr & v]


if __name__ == '__main__':
    import glob, os, collections
    for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', 'nav_files', '*.nav'))):
        try:
            r = read_nav2(f)
            tail = r['total'] - r['consumed']
            nh = sum(len(a['hides']) for a in r['areas'])
            ne = sum(len(a['encs']) for a in r['areas'])
            ns = sum(len(e['spots']) for a in r['areas'] for e in a['encs'])
            ac = collections.Counter()
            for a in r['areas']:
                for n in attr_names(a['attr'], r['ver']):
                    ac[n] += 1
            print(f"{os.path.basename(f):28s} v{r['ver']:2d} tail={tail:3d} areas={len(r['areas']):5d} "
                  f"hide={nh:5d} encPath={ne:5d} encSpot={ns:5d}")
            print(f"    attrs: {dict(ac.most_common())}")
        except Exception as e:
            print(f"{os.path.basename(f):28s} ERR {type(e).__name__}: {e}")
