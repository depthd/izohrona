"""ЛИНЕЙКА ДЛЯ ИМПОРТЁРА. Один .vmf, десять кубов, у каждого свой uscale.

Зачем. Всё в подгонке текстур упирается в одно число: во сколько раз импортёр
CS2 меняет скейл при переводе .vmf в .vmap. У меня в коде оно записано как 64,
но записано было ПО ПАМЯТИ, не по замеру, и проверить его отсюда нечем — CS2 в
этой среде не запускается. Дальше это число молча портит всё остальное.

Как замерить. Кубы стоят в ряд по +X, шаг 256u, каждый 128x128x128, все со своей
цифрой скейла. Импортировать файл в Hammer 2 и посмотреть на любой куб:

  1) СКОЛЬКО ЯЩИКОВ на грани 128u — это и есть период в юнитах: один ящик = 128u,
     два = 64u, полящика = 256u. Отсюда сразу «сколько юнитов занимает повтор»
     при этом скейле, без всяких коэффициентов;
  2) что показывает поле Scale в Tool Properties при выбранной грани — отсюда
     переводной коэффициент между .vmf и тем, что видит редактор.

Последние два куба — проверка СДВИГА: тот же скейл, что у восьмого, но uoffset
2 и 4. Если сдвиг работает как ожидается, рисунок на них съедет на четверть и
на половину повтора соответственно.

    python3 tools/uvruler.py > /tmp/uvruler.vmf
"""
import sys

MAT = "cs_italy/picrate1"
SIZE = 128
STEP = 256
# скейлы по возрастанию: каждый следующий вдвое крупнее рисунок
CUBES = [(0.5, 0), (1, 0), (2, 0), (4, 0), (8, 0), (16, 0), (32, 0), (64, 0),
         (8, 2), (8, 4)]

_id = [0]


def nid():
    _id[0] += 1
    return _id[0]


def side(p1, p2, p3, u, v):
    return (f'\t\tside\n\t\t{{\n\t\t"id" "{nid()}"\n'
            f'\t\t"plane" "({p1}) ({p2}) ({p3})"\n'
            f'\t\t"material" "{MAT}"\n'
            f'\t\t"uaxis" "{u}"\n\t\t"vaxis" "{v}"\n'
            f'\t\t"rotation" "0"\n\t\t"lightmapscale" "16"\n'
            f'\t\t"smoothing_groups" "0"\n\t\t}}')


def cube(x0, y0, z0, x1, y1, z1, sc, off):
    ux = f'[1 0 0 {off}] {sc}'
    uy = f'[0 1 0 {off}] {sc}'
    vy = f'[0 -1 0 {off}] {sc}'
    vz = f'[0 0 -1 {off}] {sc}'
    s = [side(f'{x0} {y1} {z1}', f'{x1} {y1} {z1}', f'{x1} {y0} {z1}', ux, vy),
         side(f'{x0} {y0} {z0}', f'{x1} {y0} {z0}', f'{x1} {y1} {z0}', ux, vy),
         side(f'{x0} {y1} {z1}', f'{x0} {y0} {z1}', f'{x0} {y0} {z0}', uy, vz),
         side(f'{x1} {y1} {z0}', f'{x1} {y0} {z0}', f'{x1} {y0} {z1}', uy, vz),
         side(f'{x1} {y1} {z1}', f'{x0} {y1} {z1}', f'{x0} {y1} {z0}', ux, vz),
         side(f'{x1} {y0} {z0}', f'{x0} {y0} {z0}', f'{x0} {y0} {z1}', ux, vz)]
    return ('\tsolid\n\t{\n\t"id" "%d"\n' % nid()) + '\n'.join(s) + \
           '\n\t\teditor { "color" "0 180 220" }\n\t}'


solids = []
for k, (sc, off) in enumerate(CUBES):
    x = k * STEP
    solids.append(cube(x, 0, 0, x + SIZE, SIZE, SIZE, sc, off))
# плита-подставка, чтобы ряд читался как один объект и было с чем сравнить масштаб
solids.append(cube(-64, -64, -32, len(CUBES) * STEP + 64, SIZE + 64, 0, 8, 0))

wid = nid()
print('versioninfo\n{\n\t"editorversion" "400"\n\t"editorbuild" "8000"\n'
      '\t"mapversion" "1"\n\t"formatversion" "100"\n\t"prefab" "0"\n}\n'
      'visgroups\n{\n}\nviewsettings\n{\n\t"bSnapToGrid" "1"\n'
      '\t"bShowGrid" "1"\n\t"nGridSpacing" "64"\n}\n'
      f'world\n{{\n\t"id" "{wid}"\n\t"mapversion" "1"\n'
      '\t"classname" "worldspawn"\n\t"skyname" "sky_dust"\n'
      + '\n'.join(solids) +
      '\n}\ncameras\n{\n\t"activecamera" "-1"\n}\n'
      'cordons\n{\n\t"active" "0"\n}')

print('\n'.join('// куб %d @x=%d  uscale %s  uoffset %s'
                % (k + 1, k * STEP, sc, off) for k, (sc, off) in enumerate(CUBES)),
      file=sys.stderr)
