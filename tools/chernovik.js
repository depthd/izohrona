'use strict';
/* ЧЕРНОВИК 1: кусок карты на ядре из вещей.
   Две комнаты и коридор, стены разной толщины, две двери с рамой, окошко,
   ящики с рамой — и нарочно плохие попытки, чтобы видно было, как
   диспетчерская их не пускает. Всё под открытым небом: над стенами только
   невидимая стена для игрока, солнце достаёт до пола.

     node tools/chernovik.js [папка=proby]
   Пишет chernovik_1.vmap (прямо для Hammer) и chernovik_1.vmf (запасной). */
const fs = require('fs');
const path = require('path');
const { Карта } = require('../core/yadro');
const { toVmap } = require('../core/vmap');
const { toVmf } = require('../core/vmf');

const ПОЛ = 'anubis/hr_stone_floor03_sand', ПЛИТКА = 'de_mirage/ground/de_mirage_tilef_diffuse';
const мат = {
  пол: ПОЛ, стена: 'de_mirage/hr_mirage/mirage_plaster_1', рама: 'anubis/models/market/wood_planks_4',
  ящик: 'cs_italy/picrate1', рамаЯщика: 'cs_italy/metal/metal_basic_1',
};

const к = new Карта();
к.помещение('Комната A', 0, 0, 512, 448, { пол: ПОЛ });
к.помещение('Комната B', 544, 0, 928, 448, { пол: ПОЛ });
к.помещение('Коридор', 0, 512, 928, 704, { пол: ПЛИТКА });

const AB = к.стена(512, 0, 544, 448, { высота: 192 });                 // тонкая, 32
const СЕВ = к.стена(0, 448, 928, 512, { высота: 224, мат: 'anubis/stone_wall03' }); // толстая, 64
к.стена(-32, -32, 960, 0, { высота: 256 });
к.стена(-32, 704, 960, 736, { высота: 256 });
к.стена(-32, 0, 0, 704, { высота: 256 });
к.стена(928, 0, 960, 704, { высота: 256 });

к.проём(AB, 'дверь', 160, 288, { верх: 128, рама: 8 });
к.проём(AB, 'дверь', 340, 420, { верх: 128, рама: 8 });       // нарочно узкая — не пустят
к.проём(СЕВ, 'дверь', 704, 832, { верх: 128, рама: 8 });
к.проём(СЕВ, 'окно', 192, 256, { низ: 48, верх: 104, рама: 4 });

к.ящик('Ящик 1', 104, 104, 72);
к.ящик('Ящик 2', 188, 104, 48);                                // вплотную к первому
к.ящик('Ящик у двери', 420, 180, 72);                          // перед дверью — не пустят
к.ящик('Ящик со щелью', 600, 0, 72);                           // щель 56 до стены — придвинут
к.ящик('Ящик B', 744, 250, 72);

к.точка('info_player_terrorist', 96, 608, { angles: [0, 0, 0] });
к.точка('info_player_counterterrorist', 850, 120, { angles: [0, 180, 0] });

const scene = {
  boxes: к.геометрия(мат),
  points: [...к.точки,
    /* Свет по настоящим картам (Mirage: солнце 630, небо 215; Dust2: 575 и 245),
       переведён так же, как переводит его Hammer: делить на 255. */
    { cls: 'light_environment', at: [464, 352, 768], angles: [55, 220, 0],
      props: { brightness: 2.43, skyintensity: 0.9, color: '252 238 214', skycolor: '190 208 236' } },
    // небо — то, что он сам поставил в образце; пустой env_sky Hammer создаёт сам
    { cls: 'env_sky', at: [0, 0, 0], props: { skyname: 'materials/dev/default_sky.vmat', targetname: 'default_sky' } }],
  brushEnts: [{ cls: 'func_buyzone', box: { x0: 0, y0: 512, z0: 0, x1: 256, y1: 704, z1: 128 }, props: { TeamNum: 2 } }],
  camera: { pos: [464, -700, 760], at: [464, 352, 0] },
};

const куда = process.argv[2] || 'proby';
fs.mkdirSync(куда, { recursive: true });
const корень = path.join(__dirname, '..');
const образец = fs.readFileSync(path.join(корень, 'data/obrazec.vmap.txt'), 'utf8');
const точки = JSON.parse(fs.readFileSync(path.join(корень, 'data/tekstury_tochek.json'), 'utf8'));
fs.writeFileSync(path.join(куда, 'chernovik_1.vmap'), toVmap(scene, образец, 1, точки));
fs.writeFileSync(path.join(куда, 'chernovik_1.vmf'), toVmf(scene, 'черновик 1 · ядро из вещей'));

console.log('ЖУРНАЛ ДИСПЕТЧЕРСКОЙ');
for (const s of к.журнал) console.log('  ' + s);
console.log('ПРИЁМКА');
for (const s of к.приёмка()) console.log('  ' + s);
console.log(`коробок ${scene.boxes.length}, сущностей ${scene.points.length + scene.brushEnts.length}`);
