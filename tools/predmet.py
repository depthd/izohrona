"""ОДИН ПРЕДМЕТ В ОБЪЁМЕ. Смотрит на маленький кусок .vmf сбоку-сверху и рисует
его в .png — чтобы увидеть ФОРМУ, а не таблицу координат.

Зачем. Он судит по картинкам, а все мои приборы отвечают числами. Когда он
сказал «поломалось» про ящики, у меня не было ни одного способа показать
пальцем, что именно поломалось и что стало после правки. Числа «ядер пропало
15 из 115» ему не говорят ничего.

Как. Коробки рисуются тремя гранями (верх и два бока), дальние первыми, ближние
поверх — обычная укладка маляра. Тело ящика (картинка ящика в материале) красится
тёплым, рама и всё прочее — серым: сразу видно, есть ли внутри рамы ящик.

Чего прибор НЕ умеет и о чём нельзя забыть, глядя на картинку: клин он рисует
габаритной коробкой, потому что берёт готовый разбор из `vise`. На пандусе и
на лестнице картинка соврёт в сторону «сплошнее, чем на самом деле».

    python3 tools/predmet.py <файл.vmf> cx cy cz [радиус] [выход.png] [подпись]
    python3 tools/predmet.py --пара а.vmf cx cy cz б.vmf cx cy cz выход.png
"""
import sys, math
sys.path.insert(0, 'tools')
from PIL import Image, ImageDraw, ImageFont
# Разбор брашей берётся из vise ТЕМ ЖЕ способом, что у остальных тринадцати
# приборов: исходник читается до строки запуска и выполняется. Прямой импорт сюда
# не годится — vise при импорте запускает себя на argv[1] импортёра. Починить это
# в самом vise я пробовал: `if __name__` там ломает все тринадцать разом, потому
# что они режут исходник по этой самой строке. Правило 5.6.
_src = open('tools/vise.py', encoding='utf-8').read().split('path = sys.argv[1]')[0]
_ns = {}
exec(_src, _ns)
parse_solids = _ns['parse_solids']

ФОН = (24, 26, 30)


def _шрифт(n):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(p, n)
        except OSError:
            pass
    return ImageFont.load_default()


def коробки(path, cx, cy, cz, r, rz):
    txt = open(path, encoding='utf-8', errors='replace').read()
    world = txt.split('\nentity\n')[0]
    из = []
    for s in parse_solids(world):
        if s['tool']:
            continue
        if s['x1'] <= cx - r or s['x0'] >= cx + r:  continue
        if s['y1'] <= cy - r or s['y0'] >= cy + r:  continue
        if s['z1'] <= cz - rz or s['z0'] >= cz + rz: continue
        из.append(s)
    return из


def цвет(s):
    """Материал решает окраску: картинка ящика — тёплая, всё прочее — серое.
    Так на картинке сразу видно, где ТЕЛО ящика, а где рама вокруг него."""
    m = s['mat'].lower()
    if 'crate' in m or 'picrate' in m or 'box' in m:
        return (196, 148, 92)
    if 'stones_single' in m or 'trim' in m:
        return (108, 118, 132)
    return (78, 84, 94)


def тень(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def рисовать(d, из, cx, cy, cz, ox, oy, k):
    """Изометрия: экран_x = (x-y)*cos30, экран_y = (x+y)*sin30 - z.
    Наблюдатель со стороны +X+Y+Z, поэтому дальние коробки — с меньшей
    суммой x+y+z, их и рисуем первыми."""
    c30, s30 = math.cos(math.radians(30)), math.sin(math.radians(30))

    def П(x, y, z):
        return (ox + ((x - cx) - (y - cy)) * c30 / k,
                oy + ((x - cx) + (y - cy)) * s30 / k - (z - cz) / k)

    из = sorted(из, key=lambda s: s['x0'] + s['y0'] + s['z0'])
    for s in из:
        x0, y0, z0, x1, y1, z1 = s['x0'], s['y0'], s['z0'], s['x1'], s['y1'], s['z1']
        c = цвет(s)
        кр = тень(c, 0.35)
        # верх
        d.polygon([П(x0, y0, z1), П(x1, y0, z1), П(x1, y1, z1), П(x0, y1, z1)],
                  fill=тень(c, 1.0), outline=кр)
        # бок к наблюдателю по X (грань x1) и по Y (грань y1)
        d.polygon([П(x1, y0, z0), П(x1, y1, z0), П(x1, y1, z1), П(x1, y0, z1)],
                  fill=тень(c, 0.72), outline=кр)
        d.polygon([П(x0, y1, z0), П(x1, y1, z0), П(x1, y1, z1), П(x0, y1, z1)],
                  fill=тень(c, 0.52), outline=кр)


def панель(path, cx, cy, cz, r, rz, W, H, подпись, низ=''):
    им = Image.new('RGB', (W, H), ФОН)
    d = ImageDraw.Draw(им)
    из = коробки(path, cx, cy, cz, r, rz)
    k = (2 * r) / (W * 0.62)
    рисовать(d, из, cx, cy, cz, W / 2, H * 0.60, k)
    d.text((16, 12), подпись, font=_шрифт(26), fill=(236, 238, 242))
    if низ:
        d.text((16, H - 40), низ, font=_шрифт(20), fill=(150, 158, 170))
    return им


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == '--пара':
        (ф1, x1, y1, z1, ф2, x2, y2, z2, вых) = a[1:10]
        п1 = a[10] if len(a) > 10 else 'было'
        п2 = a[11] if len(a) > 11 else 'стало'
        W, H = 700, 620
        и1 = панель(ф1, float(x1), float(y1), float(z1), 150, 150, W, H, п1)
        и2 = панель(ф2, float(x2), float(y2), float(z2), 150, 150, W, H, п2)
        общ = Image.new('RGB', (W * 2 + 8, H), (60, 64, 72))
        общ.paste(и1, (0, 0)); общ.paste(и2, (W + 8, 0))
        общ.save(вых)
        print('записано', вых)
    else:
        ф, x, y, z = a[0], float(a[1]), float(a[2]), float(a[3])
        r = float(a[4]) if len(a) > 4 else 150
        вых = a[5] if len(a) > 5 else '/tmp/predmet.png'
        подпись = a[6] if len(a) > 6 else ''
        панель(ф, x, y, z, r, r, 800, 700, подпись).save(вых)
        print('записано', вых)
