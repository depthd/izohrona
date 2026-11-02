/* ============ ядро: three-lane + не-трубные коридоры + тела зон ============ */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let W=43,H=48; function setSize(w,h){W=w;H=h;}
let ISLAND=false, RAMPS=true;   // остров (вертикаль, в build) / клинья-пандусы (в VMF)
let THRU=true, DECOR=false;     // ЭКСП: сквозные 2-ур. проходы (VMF) / богатый декор укрытий (makeCover)
let PALACE=false;               // палас: дроп-площадки у плентов (влияет на баланс — внутри цикла сходимости)
let DOORS=true, FINEW=false;                // дверные проёмы/арки на каждом входе между зонами (VMF)
let LMARK=true, ZONELIGHT=false;   // v81: заливка у стен выжигала стену вблизи — убрана, светит солнце и подвесы             // v58: лендмарки на развилках/косяки дверей; заливка светом по зонам
let TUNP=0.5;                  // доля коридоров, накрытых крышей (тоннели), 0..1
const JUMPZ=0.82;
const TUNH=192;                // высота крыши тоннелей над полом, юниты              // макс. подъём за шаг (~59u прыжок): выше — непроходимо вверх, дроп только вниз
let COVDENS=1.0;                // плотность заполнения открытых полей телами (0 редко .. 1 плотно)
/* v120: было 0.55, но ползунок годами загонял сюда сырое 3..9, оно зажималось
   до 1, и фактически всё время работала единица. Ставим то, что и работало. */
let PWIDTH=0;                  // смещение ширины коридоров (горлышки-входы всегда >=1)
const BW=104, BH=74;
/* ====== ЯДРО ПЛЕНТА (v60) ======
   Замер 12 реальных плентов: свободный радиус у точки закладки 176-330u (медиана 205),
   из точки видно 69-88% области, и область НИКОГДА не распадается больше чем на один карман.
   У нас было 48u / 48% / до двух карманов.
   Причина: плент не был объектом. Узел с флагом plant=1 выравнивал высоту — и всё.
   Дальше его резали по очереди divider, fillZone и блок подразделения, каждый по своим
   правилам, ни один про плент не знал.
   Ядро — прямоугольник CORER клеток вокруг точки закладки, в который НЕ ИМЕЕТ ПРАВА
   зайти ни один проход, ставящий стены. Считается одинаково в build() и makeCover(). */
/* ================== v61: НОВОЕ, ПО ЗАМЕРАМ ИЗ BSP ==================
   Каждый пункт — отдельный флаг. Ломает — гаси один, не весь блок.
   Источник чисел: ETALON_BSP.md (de_dust2_fps, de_mirage_fps, VBSP v21).      */
/* ================== v63 — только слой ЭКСПОРТА И УКРЫТИЙ ==================
   Планировщик не тронут: побайтовый диф v60/v61 показал, что baseNodes, makeEdges,
   corridorVar, carveRoom, divider, planStructures, waypoints и OPT идентичны.
   Значит структура остаётся v60-ской, меняется только то, что на ней стоит.

   anchor — ГЛАВНОЕ. Заполнение открытых полей брало кандидатов с wd>=2, то есть
            СПЕЦИАЛЬНО ставило укрытия не ближе двух клеток от стены. Замер говорит
            обратное: одиночный объект в открытом поле укрытия не даёт (lift 0.58 по
            IN_COVER), а прижатие к геометрии даёт lift 1.51-1.70 — единственное
            сравнение во всей работе, свободное от конфаунда представления.
            Теперь 2/3 кандидатов — пристенные (wd==1), 1/3 — открытое поле.
   pair   — укрытие в открытом поле ставится ПАРОЙ под прямым углом («уступ» из
            SISTEMA_UKRYTIY §3): один куб оставляет три открытые стороны, угол — одну.
   arch   — косяк вдвигается в проём, просвет min(160,max(80,W-64)), глубина 32u.
            Парный A/B: длина узкого участка 8u -> 24u при реальных 16u.
   trim06 — доза трима x0.6. При x1.5 полоса 32-54u раздувалась до 16% (норма 8%),
            это повтор ошибки из CHANGELOG v61 про передозировку.
*/
const V63 = { anchor:true, pair:true, arch:true, archW3:true, trim06:true };
/* ================== v64 ==================
   noblock  — укрытие не ставится, если после него в проходе останется меньше одной
              клетки (96u). Проверяется свободный пробег по обеим осям через клетку.
   sober    — палитра без «бекрумса». `paint` красила стены в 7 насыщенных цветов зон
              (yellow_light/orange/yellow/grey/green/red/blue) — отсюда мультяшность.
              Здесь стена одна на всю карту (крашеный бетон без цветового суффикса),
              зоны различаются ПОЛОМ и ЦВЕТОМ СВЕТА, как на картах 1.6.
              Берутся только материалы, помеченные в файле как [OK].
   decor    — пилястры на длинных стенах и второй ярус на части высоких укрытий.
              Пилястра выступает на 12u: на проходе 96u+ это не мешает движению.
   fixtures — корпус лампы и подвес из брашей под каждым источником света.
*/
const V64 = { noblock:true, sober:true, decor:true, fixtures:true };
/* ================== v65 ==================
   stone   — каменная палитра из реальных материалов CS2 вместо крашеного бетона.
   bulb    — плафон НАД лампой, лампочка ПОД плафоном. В v64 источник стоял на верхней
             грани плафона и светил себе в дно.
   sconce  — настенные светильники на длинных стенах: свет и декор одной сущностью.
   varycov — поворот части ящиков (rboxZ уже поддерживался, но rot никто не выставлял)
             и Г-сборки из двух кусков разной высоты вместо одиночных кубов.
   beams   — потолочные балки поперёк тоннелей.
*/
const V65 = { stone:true, bulb:true, sconce:false, varycov:true, beams:true };   // v81: бра у стен убраны
/* ================== v66: ФАСАД ВМЕСТО КОРОБКИ ==================
   Раньше вся масса стен шла от пола до потолка: карта была коробкой без горизонта.
   Теперь:
     - стена, к которой игрок прижимается, кончается на 288-416u (высота по хешу клетки);
     - глубокая масса стен превращается в ЗАДНИК: дома разной высоты 256-768u,
       карнизы, башенки — то, что видно поверх стены;
     - над всем этим NODRAW от верха до потолка: невидим, но телесен, поэтому
       карта остаётся запечатанной и на крыши не залезть.
   Ходибельная часть не меняется ни на юнит — правится только то, что выше стены. */
const V66 = { facade:true, backdrop:true };
/* ====== v70: НЕБО ОТКРЫТО ======
   Стена перестаёт быть колонной до потолка. Каждая область стены получает свою высоту.
   Минимум 320u над ЛОКАЛЬНЫМ полом — это гарантия, что игровой слой не меняется:
   буст даёт глаз на ~190u, палуба +192 даёт глаз на 256u. Всё, что выше 320 — свободно.
   Меняются только траектории гранат: они начинают летать поверх стен, как на реальных картах.
   g, коллизия на уровне игрока, тайминги, прострелы — не трогаются. */
const V70 = { sky:true, cornice:true, terrace:true, balcony:false, city:true, roofslab:true };
/* 384 — не с потолка: игрок на палубе (+192) с бустом (+72) имеет глаз на 328u над
   локальным полом. 384 оставляет 56u запаса. Ниже 384 внутренние стены не опускаются. */
const V70H = { inner:[384,448,512,576], outer:[640,768,896,1024] };
/* ====== v71: УКРЫТИЯ НЕ В ПРОХОДЕ ======
   minw — минимальная ширина прохода в клетках, при которой в клетку вообще можно ставить тело
   выше шага (18u). 3 клетки = 288u: тело оставляет 192u. В коридоре 2 клетки оставалось 96u —
   это и есть места, которые приходилось перегенерировать руками.
   connect — глобальная гарантия: после расстановки весь пол остаётся связным. */
const V71 = { throat:true, minw:3, connect:true, fitrot:true };
/* Не запрет, а потолок высоты по ширине прохода:
   >=3 клетки (288u) — что угодно; 2 клетки (192u) — только низкое (<=40u, перепрыгивается);
   1 клетка — только трим (<=18u, проходится шагом). Плотность не падает, проходы живут. */
const V71H = { w1:18, w2:40 };
/* fill — досыпка пустых зон: пока есть клетка пола дальше fillR клеток от любого тела или
   стены, ставим туда тело. Заполняет именно дыры, а не размазывает плотность равномерно. */
const V71F = { fill:true, fillR:6, fillMax:30 };  // fillR — макс. допустимое расстояние до ближайшего тела, клеток
/* Свет: было ярко и в упор. Меньше люменов, больше радиус. */
/* v102. СВЕТ. Что было не так на скомпилированной карте: 318 ламп, часть под
   открытым небом, и стена рядом с лампой выжигалась добела.
   Три причины, все — одна и та же болячка:
     1) шаг расстановки задан в КЛЕТКАХ; на клетке 16u он стал вшестеро чаще
        по каждой оси, то есть в 36 раз плотнее по площади;
     2) лампа цеплялась за СТЕНУ, а не за потолок — под открытым небом
        она не нужна, там уже светит солнце;
     3) яркость высокая, а радиус небольшой: у источника пятно, дальше темно.
   Лечение: шаг в юнитах, обязательная крыша над лампой, и «большой радиус,
   но блёкло» — люмены вниз, радиус вверх, показатель затухания ниже единицы,
   чтобы свет не имел горячего пятна вплотную к поверхности.
   Документацию Valve по light_omni2 из этой сессии не достать (egress режет
   developer.valvesoftware.com), поэтому кривая подобрана на глаз — все четыре
   числа лежат здесь одним блоком и правятся в одну строку. */
/* v114. Разнобой «одна лампа выжигает стену, другая нет» — это разные семейства
   с разными люменами и разным расстоянием до поверхности. Выравниваем: люмены вниз,
   радиусы оставляем большими, чтобы свет был мягкий и дальний, а не пятном. */
const V71L = { tun:190, bld:240, scn:260, zone:340, rTun:4600, rBld:5200, rScn:3000, rZone:5600 };
const V102L = { falloff:"0.55", stepTun:512, stepZone:640, wallFind:288, perZone:6 };
/* clipLid — ОДИН потолок для игрока на всю карту, на фиксированной высоте над локальным полом.
   Заменяет точечные клипы над крышами: одно правило, ничего не забыто, визуально невидим.
   routeMax — насколько маршруту разрешено удлиниться из-за тел. Больше — снимаем виновных. */
const V83 = { site:true };
/* Версия печатается в заголовке вкладки, в углу панели и В САМ .vmf
   (ключ "comment" у worldspawn). Иначе по присланному файлу нельзя сказать,
   каким билдом он собран, и разбор начинается со спора об этом. */
const ВЕРСИЯ = "izohrona v142";
const V81 = { radar:true, ladder:true, ladderMax:6, ladderDrop:112 };   // v87: столько, сколько ловушек   // v84: порог по факту перепадов
const V79 = { pal:true, smooth:true, minRun:1, accent:true, steps:true, stepMax:96 };
/* ====== v127: ТЕКСТУРА ПО РАЗМЕРУ БРАША ======
   Раньше на все грани шёл один скейл UVS, а смещение было нулевое. Значит рисунок
   лежал сеткой мира и резался краем браша где придётся: ящик 96u получал кусок
   тайла, стена 736u — несколько повторов, последний обрубленный.
   Теперь на каждую грань считается СВОЙ скейл, чтобы вдоль неё уложилось ЦЕЛОЕ
   число повторов, и своё смещение, чтобы шов сел ровно на край браша.

   ---- v127.1. ЧИСЛО, НА КОТОРОМ ВСЁ СЛОМАЛОСЬ ----
   В первой редакции одна величина `tile` делала два разных дела: и задавала,
   КАКОГО РАЗМЕРА хочется видеть рисунок, и служила физической опорой «сколько
   юнитов занимает повтор при скейле UVS». Это разные числа, и от их смешения
   подгонка самоуничтожилась: число повторов бралось как L/tile, а скейл как
   L·UVS/(tile·повторов) — tile сокращался, скейл всегда выходил равным UVS,
   то есть ровно тем, что было до всей работы. Менялось только смещение, и в
   игре не менялось ничего.

   Физическую опору теперь дают ЗАМЕРЫ, а не мои догадки. Два ящика, собранных
   руками в Hammer 2 (yashiki.vmap, материал cs_italy/picrate1):
       куб 32u -> textureScale 0.125,  смещение по Y 128 текселей;
       куб 16u -> textureScale 0.0625, смещения нулевые;
   на обоих ровно ОДИН повтор на грань. Отсюда:
     * скейл Source 2 — это ЮНИТОВ НА ТЕКСЕЛЬ, picrate1 = 256 текселей,
       значит при 0.125 повтор занимает 256·0.125 = 32 юнита;
     * импортёр делит скейл VMF на 64 И УМНОЖАЕТ смещение на 64
       (VMF 2 -> Source 2 128 — сходится на первом ящике).
   Проверка — tools/uvref.js, воспроизводит оба ящика до последней цифры.

   unit — сколько юнитов занимает повтор при опорном скейле UVS. 32 по замеру.
          Это СВОЙСТВО МАТЕРИАЛА (текстура вдвое больше — вдвое больше и unit),
          поэтому вынесено ползунком: если рисунок в игре вышел вдвое мельче
          ожидаемого, это ровно эта ручка.
   want — какого размера хочется видеть ОДИН повтор. Влияет только на выбор
          ЧИСЛА повторов, на скейл не влияет. 96 — размер ящика на реальных картах.
   snap — насколько можно тянуть повтор, чтобы попасть в целое число: 1.35 или
          1/1.35, дальше берётся соседнее число повторов.
   all  — подгонять и пол со стенами. По умолчанию нет: они нарезаны жадным
          мешером на плиты произвольного размера, и своя подгонка у каждой плиты
          разорвала бы рисунок на каждом стыке. */
/* v127.2. ВЫКЛЮЧЕНО ПО УМОЛЧАНИЮ. В игре подгонка выглядит хуже исходного:
   ящик получает свою текстуру растянутой втрое против натуральной, и рядом
   стоящие тела перестают выглядеть одинаково. Математика верна (uvref.js
   воспроизводит ручные ящики из Hammer до цифры), но задача была не в ней.
   Код и обе ручки оставлены: включается тумблером «Текстура по размеру браша».
   При fit=false экспорт пишет ровно те же оси и скейлы, что до всей работы. */
/* v140. ПОДГОН ВКЛЮЧЁН. Правила подтверждены живым человеком в CS2 на семи
   площадках tools/uvlab.py: годными он назвал ровно те, где на грань приходится
   ЦЕЛОЕ число картинок и шов сидит на ребре. Значит и делитель импортёра 16, и
   256 текселей в picrate1 — верны, и формула L/16 даёт ровно одну картинку. */
const V127 = { fit:true, unit:64, want:96, snap:1.35, all:false, мин:24 };
/* v140. Ящик с бортами: рама по рёбрам другим материалом, пропорциональна телу.
   вылМакс — сколько раме позволено торчать наружу: она встаёт ПОСЛЕ растра, и
   каждый лишний юнит съедает проход, о котором дейкстра не знает. */
const V140 = { борта:true, аМакс:8, вылМакс:8 };
/* ====== v132: ПОЛ ПЕЧАТАЕТСЯ РОВНО ПО РАСТРУ ======
   Растр — это карта, по которой генератор считает связность, тайминги, баланс и
   расстановку. Пол в экспорте до сих пор строился двумя разными способами:
   плоские клетки по zfield, а наклонные полосы — ОДНИМ КЛИНОМ на всю полосу, по
   её концевым отметкам. Клин линеен, zfield внутри полосы — нет, и поверхность
   расходилась с растром.
   Замер (cur.__surf, три карты): расходится 7629..11175 клеток из 31278..37293,
   то есть 24..34% ВСЕГО ПОЛА; максимум расхождения 159..340 юнитов; и 2557..3595
   клеток расходятся больше чем на 59 юнитов — это обрыв, которого генератор не
   видит вовсе. Отсюда и «ты опять забаррикадировал проход»: генератор мерил
   крюк между соседними местами максимум x1.7..x2.3, а по экспорту выходило до
   x9.6. Считали по одной карте, ходили по другой.
   Лечение простое: клиньев для пола больше нет. Наклонная полоса печатается
   теми же плоскими коробками по qz(zfield), что и всё остальное, то есть
   ступенями по 16 юнитов. Шаг игрока 18u — ступени проходятся не глядя, а
   поверхность совпадает с растром ПО ПОСТРОЕНИЮ, а не по договорённости. */
const V132 = { plain:true };
const V75 = { swallow:true };   // удалять браши, целиком спрятанные внутри других
const V72 = { clipLid:true, clipH:400, clipT:256, variety:true, routeGuard:true, routeMax:1.20 };
const V61 = {
  coverH:   true,   // высоты укрытий по замеру: медиана 115u вместо 64u
  trim:     true,   // тела 8-32u (паребрики/бортики): 17-19% реальных тел, у v60 ноль
  core:     true,   // плент A 3x3 (288u) / B 5x5: реальные 288x304 и 384x448
  corePerm: true,   // укрытия ВНУТРИ плента: реально занято 21-29%, у v60 ядро пустое
  rise:     true,   // перепад полосами: levels.py даёт уровней 21.5->13.2, пандусов 27.7->14.4% (эталон 9 и 1.7%)
  narrow:   false,  // ОТКЛЮЧЕНО: сузил ВЕСЬ коридор -> кишка 1696u. Цель была неверной, см. CHANGELOG
};
/* Замеренные высоты укрытий (доля, полоса):
   <54u 19% | 54-72u 8% | 72-128u 25% | 128-320u 47%.  Медиана реального укрытия 115u. */
/* pickCovH отдаёт ТОЛЬКО >=54u. Полосу <54u целиком закрывает трим — иначе две
   низкие популяции складываются и медиана падает (ошибка первой сборки v61). */
const COVH = [[64,.099],[80,.111],[96,.099],[112,.099],
              [144,.160],[168,.148],[192,.148],[224,.136]];
function pickCovH(r){ let t=r(), a=0; for(const [h,w] of COVH){ a+=w; if(t<=a) return h; } return 144; }
/* Мелочь 8-32u. 55% реальных таких тел <=18u — проходятся шагом, движение не ломают. */
const TRIMH=[8,10,12,16,16,18,24,32];
const CORER=2;                      // радиус в клетках по Чебышёву: 2 -> 5x5 = 480u, свободный радиус 192u
function coreR(k){ return V61.core ? (k==='A'?1:2) : CORER; }   // v61: A 3x3=288u, B 5x5=480u
function coreMask(px){ const m=new Uint8Array(W*H);
  for(const k of ['A','B']){ const n=px[k]; if(!n) continue; const CR=coreR(k);
    for(let oy=-CR;oy<=CR;oy++)for(let ox=-CR;ox<=CR;ox++){
      const x=n.x+ox, y=n.y+oy; if(x>0&&x<W-1&&y>0&&y<H-1) m[y*W+x]=1; } }
  return m; }
function rs(w,h){ const k=Math.sqrt((W*H)/(BW*BH)); return [Math.max(4,Math.round(w*k)), Math.max(4,Math.round(h*k))]; }
function baseNodes(){return {
  T:{x:.50,y:.90,room:rs(10,6),z:0.0}, CT:{x:.50,y:.12,room:rs(10,6),z:0.0},
  // v60 L3: bbox реальных плентов 10-16 x 9-18 клеток, минимальная сторона 9-11.
  // Было 9x6 и 6x5 — короткая сторона вдвое меньше реальной, ядро 5x5 и кольцо укрытий
  // туда физически не помещаются. И B на 4 картах из 6 БОЛЬШЕ A: тесность настоящего B
  // в числе входов и длине прострелов, а не в площади. Уравниваю.
  A:{x:.80,y:.28,room:rs(19,17),z:0.0}, B:{x:.20,y:.28,room:rs(19,18),z:0.0},
  M:{x:.50,y:.48,room:rs(12,10),z:0.0}, ML:{x:.50,y:.66,room:rs(4,4),z:0.0},
  SR:{x:.66,y:.78,room:rs(4,4),z:0.0}, SL:{x:.34,y:.78,room:rs(4,4),z:0.0},
  AM:{x:.82,y:.55,room:rs(4,4),z:0.0}, BM:{x:.18,y:.55,room:rs(4,4),z:0.0},
  AC:{x:.66,y:.38,room:rs(4,4),z:0.0}, BC:{x:.34,y:.38,room:rs(4,4),z:0.0},
  AM2:{x:.93,y:.44,room:rs(4,4),z:0.30}, BM2:{x:.07,y:.44,room:rs(4,4),z:0.30},   // вторые прямые заходы
};}
// АСИММЕТРИЯ САЙТОВ (замерено по 8 навам: mirage A6/B3, ancient A4/B3, cache A4/B3, inferno A2/B3, overpass A1/B3)
// «открытый» сайт: 2 прямых захода с T-стороны + мид + CT.  «тесный»: 1 прямой + мид + CT.
let OPENSITE='A';
let EDGES=[];
function makeEdges(){
  const E=[
    ['T','SR',3],['T','SL',3],['T','ML',3],
    ['ML','M',3],['SR','ML',3],['SL','ML',3],
    ['M','AC',3],['AC','A',3],['M','BC',3],['BC','B',3],   // мид -> оба сайта (есть всегда)
    ['M','CT',4],['CT','A',3],['CT','B',3],                 // CT -> оба сайта
  ];
  if(OPENSITE==='A'){
    E.push(['SR','AM',4],['AM','A',3]);      // прямой 1
    E.push(['SR','AM2',3],['AM2','A',3]);    // прямой 2  -> A: 2 прямых + мид + CT = 4
    E.push(['SL','BM',4],['BM','B',3]);      // B: 1 прямой + мид + CT = 3
  } else {
    E.push(['SL','BM',4],['BM','B',3]);
    E.push(['SL','BM2',3],['BM2','B',3]);
    E.push(['SR','AM',4],['AM','A',3]);
  }
  /* ============ v140. ПЕТЛИ: ПОПРОБОВАНО И ОТКАЧЕНО ============
     Список выше — жёсткий: тринадцать узлов и восемнадцать дорог, и он лежит в
     коде с первой версии в репозитории. Всё, чего в нём нет, остаётся КАМНЕМ,
     каким бы близким оно ни было: два узла стоят в трёхстах юнитах, а идти между
     ними две тысячи. Человек ткнул шесть раз подряд (tools/tykalka.html), и все
     шесть попали в такой камень, а не в закрытую дверь. ЭТО И ЕСТЬ ПЕРВОПРИЧИНА:
     у карты нет петель, кроме больших — через мид и через CT.
     Правка была очевидная: добавить связи между узлами, которые стоят рядом, но
     в списке не значатся — шесть ближайших, не дальше 0.26 поля. Замер на одном
     сиде показал, что стало ХУЖЕ:
                        до петель   после
       ротация A<->B      448u       208u
       мид -> плент B     544u       208u
       T   -> плент B     288u       208u
     Причина: ближайшие пары сидят на одной стороне карты (AM2/BM2 есть только у
     «открытого» сайта), симметрия ломается, и решатель баланса выбирает другую,
     более узкую карту. Список рёбер задаёт не только топологию, но и ширины, и
     асимметрию сайтов; шесть рёбер поверх него — не правка причины, а новый
     костыль, только в другом месте.
     Чинить надо ГРАФ ЦЕЛИКОМ: строить его из геометрии узлов симметрично, с
     проектными ширинами, и заново подбирать баланс. Это переделка планировщика,
     и делать её вслепую нельзя — нужен эталон с настоящей карты (тыкалка умеет
     читать чужие .vmf). Не сделано. */
  // 45% связей — узкие (ровно 2 клетки = 192u, реальная 'арка'); магистрали к сайтам оставляем широкими
  const wide=new Set(['A','B','T','CT']);
  E.forEach((e,i)=>{ if(wide.has(e[0])&&wide.has(e[1])) return;
    if(((i*2654435761)>>>0)%100 < 80) e[2]=2; });
  return E;
}
EDGES=makeEdges();
function stretch(n,o,f){return {x:o.x+(n.x-o.x)*f, y:o.y+(n.y-o.y)*f, room:n.room};}
// площадка-остров: поднятое плато с ОДНИМ подъёмом (heaven/палас), периметр — стена/обрыв
function tryPlace(b,node,rng){ const {g,zfield}=b; const [rw0,rh0]=node.room;
  const pw=Math.min(6,Math.max(4,(rw0*0.4)|0)), ph=Math.min(5,Math.max(3,(rh0*0.4)|0));
  const sx=node.x<W/2?-1:1, sy=node.y<H/2?-1:1;
  const fl=(x,y)=>x>0&&x<W-1&&y>0&&y<H-1&&g[y*W+x];
  for(const f of [0.30,0.22,0.14]){
    const cx=node.x+sx*Math.round(rw0*f), cy=node.y+sy*Math.round(rh0*f);
    const x0=cx-(pw>>1),y0=cy-(ph>>1),x1=x0+pw-1,y1=y0+ph-1; let ok=true;
    for(let y=y0;y<=y1&&ok;y++)for(let x=x0;x<=x1;x++) if(!fl(x,y)){ok=false;break;}
    if(!ok) continue;
    const baseZ=zfield[cy*W+cx];
    /* v61: реальная медиана вертикального перехода 28-35u, кв 22-56u.
       Было 0.55..0.85 (40-61u) — вдвое выше нормы и впритык к прыжку 59u. */
    const RB=[0.28,0.34,0.40,0.45,0.52,0.62,0.78];
    const rise = V61.rise ? RB[(rng()*RB.length)|0] : (0.55+rng()*0.30);
    const topZ=baseZ+rise;
    const rampSide=(Math.abs(node.x-cx)>=Math.abs(node.y-cy))?(sx>0?'W':'E'):(sy>0?'N':'S');
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) zfield[y*W+x]=topZ;
    const wall=(x,y)=>{ if(x>0&&x<W-1&&y>0&&y<H-1) g[y*W+x]=0; };
    for(let x=x0;x<=x1;x++){ if(rampSide!=='N') wall(x,y0); if(rampSide!=='S') wall(x,y1); }
    for(let y=y0;y<=y1;y++){ if(rampSide!=='W') wall(x0,y); if(rampSide!=='E') wall(x1,y); }
    const RL=2;
    const rmk=(x,y)=>{ if(b.rampMask) b.rampMask[y*W+x]=1; };
    if(rampSide==='W'||rampSide==='E'){ const xr=rampSide==='W'?x0:x1,dir=rampSide==='W'?-1:1;
      for(let s=1;s<=RL;s++){ const x=xr+dir*s; for(let y=y0+1;y<=y1-1;y++) if(x>0&&x<W-1&&g[y*W+x]){ zfield[y*W+x]=topZ+(baseZ-topZ)*(s/(RL+1)); rmk(x,y); } } }
    else { const yr=rampSide==='N'?y0:y1,dir=rampSide==='N'?-1:1;
      for(let s=1;s<=RL;s++){ const y=yr+dir*s; for(let x=x0+1;x<=x1-1;x++) if(y>0&&y<H-1&&g[y*W+x]){ zfield[y*W+x]=topZ+(baseZ-topZ)*(s/(RL+1)); rmk(x,y); } } }
    b.island={x0,y0,x1,y1,topZ,rampSide}; return b.island; }
  return null; }
// ПАЛАС: дроп-площадка у плента. Подъём ТОЛЬКО по рампе, спрыгивание через открытый край на сайт,
// обратно не залезть (rise > JUMPZ) — честная односторонность, дейкстра это видит (правило прыжка).
function tryPalace(b,node,rng){ const {g,zfield}=b; const [rw0,rh0]=node.room;
  const fl=(x,y)=>x>0&&x<W-1&&y>0&&y<H-1&&g[y*W+x];
  const wall=(x,y)=>{ if(x>0&&x<W-1&&y>0&&y<H-1) g[y*W+x]=0; };
  const sides=['N','S','W','E']; for(let i=3;i>0;i--){const j=(rng()*(i+1))|0;[sides[i],sides[j]]=[sides[j],sides[i]];}
  const rise=0.95+rng()*0.30, RL=3;
  for(const side of sides){ let hit=null;
    const horiz=(side==='N'||side==='S');
    for(let shrink=0;shrink<=2&&!hit;shrink++){
      const pw=horiz?Math.max(4,Math.min(7,(rw0*0.5)|0)-shrink):Math.max(3,Math.min(4,(rw0*0.35)|0)-((shrink>1)?1:0));
      const ph=horiz?Math.max(3,Math.min(4,(rh0*0.35)|0)-((shrink>1)?1:0)):Math.max(4,Math.min(7,(rh0*0.5)|0)-shrink);
      const offMax=horiz?Math.max(3,(rh0>>1)-((ph>>1)||1)):Math.max(3,(rw0>>1)-((pw>>1)||1));
      for(let off=offMax;off>=3&&!hit;off--){
        const cx=node.x+(side==='W'?-off:side==='E'?off:0), cy=node.y+(side==='N'?-off:side==='S'?off:0);
        const x0=cx-(pw>>1),y0=cy-(ph>>1),x1=x0+pw-1,y1=y0+ph-1;
        let ok=true; for(let y=y0;y<=y1&&ok;y++)for(let x=x0;x<=x1;x++) if(!fl(x,y)){ok=false;break;}
        if(ok) hit={pw,ph,x0,y0,x1,y1,cx,cy}; } }
    if(!hit) continue;
    const {pw,ph,x0,y0,x1,y1,cx,cy}=hit;
    // дроп-край смотрит к центру зоны; там должен быть пол для приземления
    const dropSide= side==='N'?'S':side==='S'?'N':side==='W'?'E':'W';
    let land=0,tot=0;
    if(dropSide==='S'){for(let x=x0;x<=x1;x++){tot++;if(fl(x,y1+1))land++;}}
    else if(dropSide==='N'){for(let x=x0;x<=x1;x++){tot++;if(fl(x,y0-1))land++;}}
    else if(dropSide==='E'){for(let y=y0;y<=y1;y++){tot++;if(fl(x1+1,y))land++;}}
    else {for(let y=y0;y<=y1;y++){tot++;if(fl(x0-1,y))land++;}}
    if(land<tot*0.6) continue;
    // рампа с короткого торца, спуск на пол зоны
    const baseZ=zfield[cy*W+cx], topZ=baseZ+rise;
    const rampEnds=horiz?['W','E']:['N','S']; if(rng()<0.5) rampEnds.reverse();
    let ramp=null, RLen=RL;
    for(const rl of [RL,2]){ if(ramp)break;
      for(const re of rampEnds){ const cells=[];
        let bad=false;
        if(re==='W'||re==='E'){ const rw=Math.min(2,ph), ry0=y0+((ph-rw)>>1), ry1=ry0+rw-1;
          for(let s=1;s<=rl&&!bad;s++){ const x=re==='W'?x0-s:x1+s; for(let y=ry0;y<=ry1;y++){ if(!fl(x,y)){bad=true;break;} cells.push([x,y,s]); } } }
        else { const rw=Math.min(2,pw), rx0=x0+((pw-rw)>>1), rx1=rx0+rw-1;
          for(let s=1;s<=rl&&!bad;s++){ const y=re==='N'?y0-s:y1+s; for(let x=rx0;x<=rx1;x++){ if(!fl(x,y)){bad=true;break;} cells.push([x,y,s]); } } }
        if(!bad){ ramp={end:re,cells}; RLen=rl; break; } } }
    if(!ramp) continue;
    // поднять плато, стены по периметру КРОМЕ дроп-края и рампового торца
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) zfield[y*W+x]=topZ;
    for(let x=x0;x<=x1;x++){ if(dropSide!=='N'&&ramp.end!=='N') wall(x,y0-1); if(dropSide!=='S'&&ramp.end!=='S') wall(x,y1+1); }
    for(let y=y0;y<=y1;y++){ if(dropSide!=='W'&&ramp.end!=='W') wall(x0-1,y); if(dropSide!=='E'&&ramp.end!=='E') wall(x1+1,y); }
    for(const [x,y,s] of ramp.cells){ zfield[y*W+x]=topZ+(baseZ-topZ)*(s/(RLen+1)); if(b.rampMask) b.rampMask[y*W+x]=1; }
    (b.palaces=b.palaces||[]).push({x0,y0,x1,y1,topZ,dropSide,rampEnd:ramp.end,rampCells:ramp.cells,site:node===b.px.A?'A':'B'});
    return true; }
  return false; }
function addIsland(b,rng){ const cand=[b.px.A,b.px.M,b.px.B,b.px.CT].filter(Boolean);
  for(let i=cand.length-1;i>0;i--){const j=(rng()*(i+1))|0;[cand[i],cand[j]]=[cand[j],cand[i]];}
  for(const node of cand){ const r=tryPlace(b,node,rng); if(r) return r; } return null; }
function build(rng,laneA,laneB,jit,vert,ringP){ vert=vert==null?1:vert; ringP=ringP==null?0.5:ringP;
  OPENSITE = rng()<0.5 ? 'A' : 'B'; EDGES = makeEdges();
  const g=new Uint8Array(W*H); const N=baseNodes();
  const stairMask=new Uint8Array(W*H), rampMask=new Uint8Array(W*H), vmask=new Uint8Array(W*H);
  const halls=[], pitMask=new Uint8Array(W*H);   // залы паласов (верх балконов) и тела ям — для крыш/колонн/света
  // v35: ВЕРТИКАЛЬНЫЙ ВХОД НА ПЛЕНТ — на каждый сайт максимум один коридор-балкон или коридор-яма
  const VPROF={};
  for(const k of ['SR','AM']) N[k]=stretch(N[k],N.T,laneA);
  for(const k of ['SL','BM']) N[k]=stretch(N[k],N.T,laneB);
  const Tsign=(rng()<0.5?1:-1);   // T elevated or sunk (Dust vs Inferno style). z in PLAYER UNITS.
  const LVLQ=64/72;                // v52: уровень = 64u. Замер dust2: типичный разрыв между плато 64u, три главные полосы разведены на 115-130u. Прежний квант 18u = высота ШАГА, а не этажа -> 24 уровня вместо 9.
  const QZ=z=>Math.round(z/LVLQ)*LVLQ;
  const px={}; for(const k in N){ const jx=(rng()*2-1)*jit, jy=(rng()*2-1)*jit;
    let zz=(N[k].z||0)*vert; if(k==='T'||k==='SR'||k==='SL') zz*=Tsign;   // T-side flips with map style (у коннекторов z не задан -> 0)
    px[k]={x:Math.round((N[k].x+jx)*W), y:Math.round((N[k].y+jy)*H), room:N[k].room, z:QZ(zz)}; }
  // === ВЫСОТЫ (замер по 7 картам: размах 1.8-5.5 роста, 4-15 связей с перепадом 0.75-2.7) ===
  // зоны стоят на ДИСКРЕТНЫХ плато; весь перепад — в переходе, лестницей 0.25/клетку (18u)
  {
    // v53: ПОЛОСЫ ВМЕСТО ЛЕСТНИЦЫ УРОВНЕЙ.
    // Замер dust2: 9 плато покрывают 98% пола, три главные полосы разведены на 115-130u,
    // и 4 стыка из 13 — РОВНЫЕ. Прежний код разводил каждую пару зон -> 9 зон = 9 уровней
    // -> лестница на каждом переходе -> лестниц оказалось больше, чем плато.
    const pick=a=>a[(rng()*a.length)|0];
    const B1=2*LVLQ;                              // одна полоса = 128u
    const Zc={};
    Zc.M=0;                                       // мид — опорная плоскость
    Zc.T=pick([B1,B1,0]);                         // T обычно наверху
    Zc.CT=pick([-B1,-B1,0]);                      // CT обычно внизу
    Zc.A=pick([0,B1]); Zc.B=pick([0,-B1]);        // сайты асимметричны по высоте
    Zc.ML=Zc.M;                                   // коннектор садится на полосу ОДНОГО из концов -> стык ровный
    Zc.SR=pick([Zc.T,Zc.M]); Zc.SL=pick([Zc.T,Zc.M]);
    Zc.AM=pick([Zc.A,Zc.M]); Zc.BM=pick([Zc.B,Zc.M]);
    Zc.AC=pick([Zc.A,Zc.CT]); Zc.BC=pick([Zc.B,Zc.CT]);
    Zc.AM2=Zc.AM; Zc.BM2=Zc.BM;
    for(const k in Zc) if(px[k]) px[k].z=QZ(Zc[k]*(vert==null?1:vert));
  }

  // v35: МЕЖЗОННАЯ ВЕРТИКАЛЬ ОБЯЗАТЕЛЬНА — соседние зоны почти всегда на разных уровнях.
  // Перепад 0.5..2.0 роста (36..144u, до «двух моделек»), реализуется лестницами/клиньями в переходах.
  // v53: блок принудительной межзонной вертикали ВЫКЛЮЧЕН — он и делал 9 уровней из 9 зон.
  const zfield=new Float32Array(W*H);
  // smooth undulation everywhere (~1/5 player), so no dead-flat floor; sites re-flattened later
  // v34: волны-undulation БОЛЬШЕ НЕТ. Официальные карты = плоские террасы + перепад в переходах.
  const set=(x,y,v)=>{ if(x>0&&x<W-1&&y>0&&y<H-1) g[y*W+x]=v; };
  const FLOORP=[];   // ЯВНЫЙ СПИСОК КУСКОВ ПОЛА: зона = прямоугольник, проход = полоса-пандус
  const rect=(cx,cy,w,h,v=1)=>{for(let y=cy-(h>>1);y<=cy-(h>>1)+h-1;y++)for(let x=cx-(w>>1);x<=cx-(w>>1)+w-1;x++)set(x,y,v);};
  const rectz=(cx,cy,w,h,zz)=>{for(let y=cy-(h>>1);y<=cy-(h>>1)+h-1;y++)for(let x=cx-(w>>1);x<=cx-(w>>1)+w-1;x++){if(x>0&&x<W-1&&y>0&&y<H-1)zfield[y*W+x]=zz;}};
  const carveRectZ=(cx,cy,w,h,z)=>{ rect(cx,cy,w,h,1);
    const x0=cx-(w>>1), y0=cy-(h>>1);
    for(let y=y0;y<=y0+h-1;y++)for(let x=x0;x<=x0+w-1;x++) if(x>0&&x<W-1&&y>0&&y<H-1) zfield[y*W+x]=(z||0);
    FLOORP.push({x0:Math.max(1,x0),y0:Math.max(1,y0),x1:Math.min(W-2,x0+w-1),y1:Math.min(H-2,y0+h-1),zA:(z||0),zB:(z||0),ax:'F'}); };
  const terraces=[];
  const carveRoom=p=>{ const bw=p.room[0]+1,bh=p.room[1]+1;
    const ar=0.6+rng()*1.1;                                   // случайное соотношение сторон (мид иногда длинный)
    const mw=Math.max(4*SC,Math.round(bw*Math.sqrt(ar))), mh=Math.max(4*SC,Math.round(bh/Math.sqrt(ar)));
    carveRectZ(p.x,p.y,mw,mh,p.z);
    const extra = (p.room[0]>=10*SC) ? 1+((rng()*2)|0) : (rng()<0.5?1:0);   // зона = 1..3 прямоугольника (Г/T-форма)
    for(let k=0;k<extra;k++){ const sw=Math.max(4*SC,Math.round(mw*(0.4+rng()*0.55))), sh=Math.max(4*SC,Math.round(mh*(0.4+rng()*0.55)));
      const ox=Math.round((rng()*2-1)*mw*0.42), oy=Math.round((rng()*2-1)*mh*0.42);
      carveRectZ(p.x+ox,p.y+oy,sw,sh,p.z); }
    // v37: клинья/террасы внутри зон убраны — зона плоская, перепад в проходе к ней
    let wedged=false;
    if(p.plant){ const pw=6*SC,phh=5*SC; for(let y=p.y-(phh>>1);y<=p.y+(phh>>1);y++)for(let x=p.x-(pw>>1);x<=p.x+(pw>>1);x++) if(x>0&&x<W-1&&y>0&&y<H-1) zfield[y*W+x]=(p.z||0);
      carveRectZ(p.x,p.y,(CORER*2+1)*SC,(CORER*2+1)*SC,p.z||0); } };   // v60: ядро вырезается ЯВНО — открытое место обязано существовать, а не получиться случайно
  const interzones=[];
  // variable-width L corridor: narrow throats at the two ends (doorways), body width in the middle
  // per-node port magnitude: big zones offset a lot (break straight shafts), tiny connectors barely
  px.ML.x += Math.round((rng()<.5?-1:1)*0.07*W);           // mid intermediate off-axis -> mid lane doglegs, no straight T<->CT shaft
  px.M.x  += Math.round((rng()<.5?-1:1)*0.04*W);            // slight mid-room offset too
  for(const k in px){ const r=px[k].room; px[k].pm = Math.max(0, Math.min(4*SC, (Math.min(r[0],r[1])>>1)-2*SC)); }
  px.ML.pm=Math.max(px.ML.pm,2*SC);
  const port=(from,toward,mag)=>{ if(mag<=0) return {x:from.x,y:from.y};
    const dx=toward.x-from.x,dy=toward.y-from.y,L=Math.hypot(dx,dy)||1; const s=(rng()<.5?-1:1);
    const m=1+((rng()*mag)|0); return {x:Math.round(from.x + (-dy/L)*m*s), y:Math.round(from.y + (dx/L)*m*s)}; };
  const lseg=(a,b,hf,out)=>{ const sx=a.x<=b.x?1:-1, sy=a.y<=b.y?1:-1;
    if(hf){ for(let x=a.x;x!==b.x;x+=sx)out.push([x,a.y]); for(let y=a.y;y!==b.y;y+=sy)out.push([b.x,y]); }
    else  { for(let y=a.y;y!==b.y;y+=sy)out.push([a.x,y]); for(let x=a.x;x!==b.x;x+=sx)out.push([x,b.y]); } };
  const corridorVar=(A,B,wBody,zA,zB,prof)=>{ const pts=[];
    const man=Math.abs(B.x-A.x)+Math.abs(B.y-A.y);
    if(V92.turn && man>=V92.turnMin*SC){
      /* v92: ИЗЛОМ. Прямой прогон рубится поперечным сдвигом посередине — скачок обзора
         без единой новой стены. Луч p90 у генератора 1960–2008u против 1752u у dust2. */
      const q=0.35+rng()*0.30, dx=B.x-A.x, dy=B.y-A.y, L=Math.hypot(dx,dy)||1, s=(rng()<0.5?-1:1);
      const K={ x:Math.max(2,Math.min(W-3, Math.round(A.x+dx*q + (-dy/L)*V92.turnOff*SC*s))),
                y:Math.max(2,Math.min(H-3, Math.round(A.y+dy*q + ( dx/L)*V92.turnOff*SC*s))) };
      const h1=rng()<0.5; lseg(A,K,h1,pts); lseg(K,B,!h1,pts);
    } else { lseg(A,B,rng()<0.5,pts); }
    pts.push([B.x,B.y]); const n=Math.max(1,pts.length-1);
    // ПРОФИЛЬ ВЫСОТ ПО КЛЮЧЕВЫМ ТОЧКАМ, растеризация лестницами <=0.20/клетку (14u, шаг без прыжка)
    const za=zA==null?0:zA, zb=zB==null?0:zB;
    const keys=[]; let protHi=false;
    const kOf=dz=>Math.max(1,Math.ceil(Math.abs(dz)/0.20))*SC;   // v95: уклон в ЮНИТАХ, а не в клетках
    if(prof==='heaven' && n>=kOf(zb+2.0-za)+6*SC){
      // БАЛКОН: тело поднимается до уровня плента +2.0 (144u) и ДРОПАЕТСЯ на сайт (обратно не залезть)
      const zt=zb+2.0, k=kOf(zt-za), s0=Math.round(n*0.15)+((rng()*Math.max(1,Math.round(n*0.4)-k))|0);
      keys.push([0,za],[s0,za],[s0+k,zt],[n,zt]); protHi=zt;
    } else if(prof==='pit' && n>=kOf(1.0)*2+8*SC){
      // ЯМА: тело уходит вниз, у выхода на плент подъём по ступеням до 2 моделек (как яма на Мираже)
      const depth=0.75+((rng()*4)|0)*0.25;                     // 0.75..1.5 ниже входа
      const zLow=Math.min(za,zb)-depth, kD=kOf(za-zLow), kU=kOf(zb-zLow);
      const d0=Math.round(n*0.10), u1=Math.round(n*0.86);
      if(d0+kD+2+kU<=u1) keys.push([0,za],[d0,za],[d0+kD,zLow],[u1-kU,zLow],[u1,zb],[n,zb]);
      else keys.push([0,za],[n,zb]);
    }
    if(!keys.length){ const k=kOf(zb-za), lo0=Math.max(1,Math.round(n*0.15)), hi0=Math.max(lo0+1,Math.round(n*0.85)-k);
      const s0=Math.abs(zb-za)<0.01?0:(lo0+((rng()*Math.max(1,hi0-lo0))|0));
      keys.push([0,za],[s0,za],[Math.min(n,s0+k),zb],[n,zb]); }
    const zAt=i=>{ for(let s=0;s<keys.length-1;s++){ const [i0,z0]=keys[s],[i1,z1]=keys[s+1];
      if(i<=i1) return i1===i0?z1:z0+(z1-z0)*((i-i0)/(i1-i0)); } return keys[keys.length-1][1]; };
    const hallCells=[]; const zLowAll=Math.min(za,zb)-0.3;
    for(let i=0;i<pts.length;i++){ const t=i/n, e=Math.min(t,1-t);
      let w;
      if(V92.door){
        /* v92: ПРОЁМ фиксированной длины у обоих концов, ВКЛЮЧАЯ узкие проходы (wBody===2),
           которые раньше шли ровной трубой 192u без единого сужения — а таких 80% рёбер.
           Провал флага gate (v57) был не в идее, а в том, что длина порога бралась долей
           пути: на длинном проходе порог растягивался в кишку (p90 длины 160→352u).
           Здесь длина в КЛЕТКАХ и от длины прохода не зависит. */
        /* v95: в ЮНИТАХ, а не в клетках. Замер реальных карт: проём 112–128u
           шириной и 16–24u длиной, толщина перегородки 32–80u. На клетке 96u
           это округляется до одной клетки и вырождается; на 16u выражается точно. */
        const dW=Math.max(1,Math.round(112/CELL));       // ширина проёма 112u
        const gW=Math.max(2,Math.round(176/CELL));       // тамбур за проёмом 176u
        const dL=Math.max(1,Math.round(48/CELL));        // длина проёма = толщина стены 48u
        const d0=Math.max(1,Math.min(Math.round(384/CELL),Math.round(n*0.12))), di=Math.min(i,n-i);
        w = (di<d0) ? wBody
          : (di<d0+dL)      ? Math.min(wBody,dW)
          : (di<d0+dL+dL)   ? Math.min(wBody,gW)
          : wBody;
      } else {
        w = (wBody===2) ? 2 : (e<0.10 ? 1 : (e<0.20 ? 2 : wBody));
      }
      const zz=zAt(i), st=Math.abs(zAt(Math.max(0,i-1))-zz)>0.01||Math.abs(zAt(Math.min(n,i+1))-zz)>0.01;
      const inHall=(protHi!==false && zz>zb+0.5 && !st);
      if(inHall) w=Math.max(w,wBody+2+(rng()<0.4?1:0));            // ЗАЛ: верх паласа шире тела коридора
      const lo=(w-1)>>1, hi=w>>1; const cx=pts[i][0],cy=pts[i][1];
      for(let oy=-lo;oy<=hi;oy++)for(let ox=-lo;ox<=hi;ox++){ const X=cx+ox,Y=cy+oy; set(X,Y,1); if(X>0&&X<W-1&&Y>0&&Y<H-1){ zfield[Y*W+X]=zz; if(st) stairMask[Y*W+X]=1;
        if(protHi!==false && zz>zb+0.5){ vmask[Y*W+X]=1; if(inHall) hallCells.push([X,Y]); }
        if(prof==='pit' && zz<zLowAll+0.05) pitMask[Y*W+X]=1; } } }
    // === записать куски прохода: каждый прямой отрезок с постоянным уклоном = одна полоса ===
    { let i0=0;
      const dirAt=i=>{ if(i+1>=pts.length) return null;
        return (pts[i+1][0]!==pts[i][0]) ? 'X' : 'Y'; };
      const slopeAt=i=>{ const a=zAt(i), b=zAt(Math.min(n,i+1)); return Math.abs(b-a)<0.005?0:Math.sign(b-a); };
      for(let i=0;i<pts.length;i++){
        const dEnd = (i===pts.length-1) || dirAt(i)!==dirAt(i0) || slopeAt(i)!==slopeAt(i0);
        if(!dEnd) continue;
        const a=pts[i0], b=pts[i];
        const t0=i0/n, e0=Math.min(t0,1-t0);
        let w0=(wBody===2)?2:(e0<0.10?1:(e0<0.20?2:wBody));
        const lo=(w0-1)>>1, hi=w0>>1;
        const ax=dirAt(i0)||'X';
        let X0,Y0,X1,Y1;
        if(ax==='X'){ X0=Math.min(a[0],b[0]); X1=Math.max(a[0],b[0]); Y0=a[1]-lo; Y1=a[1]+hi; }
        else        { Y0=Math.min(a[1],b[1]); Y1=Math.max(a[1],b[1]); X0=a[0]-lo; X1=a[0]+hi; }
        X0=Math.max(1,X0);Y0=Math.max(1,Y0);X1=Math.min(W-2,X1);Y1=Math.min(H-2,Y1);
        if(X1>=X0&&Y1>=Y0){
          const zS=zAt(i0), zE=zAt(i);
          FLOORP.push({x0:X0,y0:Y0,x1:X1,y1:Y1,zA:zS,zB:zE,
                       ax: Math.abs(zE-zS)<0.005 ? 'F' : ax,
                       rev: ax==='X' ? (b[0]<a[0]) : (b[1]<a[1]) });
        }
        i0=i;
      } }
    if(hallCells.length>=8){ const seen={}, uq=[];
      for(const c of hallCells){ const k=c[1]*W+c[0]; if(!seen[k]){seen[k]=1; uq.push(c);} }
      halls.push({cells:uq, zt:protHi}); } };
  // build waypoint chain for an edge (splitting long runs), each intermediate zone offset to force a bend
  const waypoints=(A,B,depth)=>{ const L=Math.hypot(A.x-B.x,A.y-B.y);
    if(L>20*SC && depth<2){ const mx=Math.round((A.x+B.x)/2),my=Math.round((A.y+B.y)/2);
      const dx=B.x-A.x,dy=B.y-A.y,pl=Math.hypot(dx,dy)||1,pxn=-dy/pl,pyn=dx/pl,off=(3+((rng()*3)|0))*SC*(rng()<.5?-1:1);
      const mid={x:mx+Math.round(pxn*off),y:my+Math.round(pyn*off),z:Math.round(((A.z||0)+(B.z||0))/2*4)/4}; const zw=(5+((rng()*4)|0))*SC,zh=(4+((rng()*3)|0))*SC;
      carveRectZ(mid.x,mid.y,zw,zh,mid.z); interzones.push({cx:mid.x,cy:mid.y,w:zw,h:zh}); mid.pm=Math.max(1,(Math.min(zw,zh)>>1)-1);
      const a=waypoints(A,mid,depth+1), b=waypoints(mid,B,depth+1); return a.concat(b.slice(1)); }
    return [A,B]; };
  const carveEdge=(A,B,wBody,prof)=>{ const wp=waypoints(A,B,0);
    for(let i=0;i<wp.length-1;i++){ const P=wp[i],Q=wp[i+1];
      const pP=port(P,Q,P.pm||0), pQ=port(Q,P,Q.pm||0);
      const narrow=(wBody===2);
      /* v61: у реальных карт медиана прохода 100-128u = ~1 клетка. Было 2 клетки=192u. */
      const wCorr = SC*(V61.narrow ? (narrow?1:Math.max(1,wBody+PWIDTH+((rng()<0.22)?1:0)))
                                 : (narrow?2:Math.max(1,wBody+PWIDTH+((rng()<0.4)?1:0))));
      corridorVar(pP,pQ, wCorr, P.z||0, Q.z||0, (i===wp.length-2)?prof:null); } };
  for(const site of ['A','B']){ const inc=EDGES.filter(e=>e[0]===site||e[1]===site);
    if(inc.length&&rng()<0.75){ const e=inc[(rng()*inc.length)|0];
      VPROF[e[0]+'|'+e[1]]=rng()<0.6?'heaven':'pit'; } }
  for(const [a,b,wd] of EDGES){ const pr=VPROF[a+'|'+b];
    if(pr&&(b==='A'||b==='B')) carveEdge(px[a],px[b],wd,pr);
    else if(pr&&(a==='A'||a==='B')) carveEdge(px[b],px[a],wd,pr);   // ориентируем: сайт всегда конец
    else carveEdge(px[a],px[b],wd); }
  const OPT=[['SR','M',3],['SL','M',3],['AM','AC',3],['BM','BC',3],['SR','SL',3],['AM','M',3],['BM','M',3]];
  const rings=[]; for(const e of OPT){ if(rng()<ringP){ carveEdge(px[e[0]],px[e[1]],e[2]); rings.push(e[0]+'-'+e[1]); } }
  px.A.plant=1; px.B.plant=1;
  for(const k in px) carveRoom(px[k]);   // rooms last: flat plateaus override ramp z at their footprint
  const CORE=coreMask(px);               // v60: с этого момента ядра плентов неприкосновенны
  // v35: ПРОХОД ВНУТРИ ЗДАНИЯ — перегородка поперёк комнаты, проём в центре (стена = 2 блока + дверь между).
  // Дверную перемычку над проёмом поставит детектор устьев автоматически. Меняет g -> внутри цикла сходимости.
  { const divider=(cx,cy,w,h,p)=>{ if(Math.min(w,h)<4||rng()<(p==null?0.35:p)) return;
      const alongX=w>=h;                                   // стена поперёк ДЛИННОЙ оси -> реально делит комнату
      const jit2=((rng()*3)|0)-1, gw=1+(rng()<0.35?1:0);
      const prot=(x,y)=>CORE[y*W+x];   // v60
      if(alongX){ const wxp=cx+jit2, gy0=cy-(gw>>1);
        let len=0; for(let y=cy-(h>>1);y<=cy+(h>>1);y++) if(y>0&&y<H-1&&g[y*W+wxp]) len++;
        if(len<4) return;
        for(let y=cy-(h>>1);y<=cy+(h>>1);y++){ if(y<=0||y>=H-1) continue;
          if(y>=gy0&&y<gy0+gw) continue; if(prot(wxp,y)) continue; g[y*W+wxp]=0; } }
      else { const wyp=cy+jit2, gx0=cx-(gw>>1);
        let len=0; for(let x=cx-(w>>1);x<=cx+(w>>1);x++) if(x>0&&x<W-1&&g[wyp*W+x]) len++;
        if(len<4) return;
        for(let x=cx-(w>>1);x<=cx+(w>>1);x++){ if(x<=0||x>=W-1) continue;
          if(x>=gx0&&x<gx0+gw) continue; if(prot(x,wyp)) continue; g[wyp*W+x]=0; } } };
    for(const k of ['AM','BM','AM2','BM2','AC','BC','ML','SR','SL']) if(px[k]&&rng()<0.7) divider(px[k].x,px[k].y,px[k].room[0],px[k].room[1]);
    // v37: большие залы (сайты/мид) тоже делятся стеной с проёмом — как на реальных сайтах
    for(const k of ['A','B','M','T','CT']) if(px[k]) { divider(px[k].x,px[k].y,px[k].room[0],px[k].room[1],0.05);
      if(Math.min(px[k].room[0],px[k].room[1])>=7) divider(px[k].x,px[k].y,px[k].room[0],px[k].room[1],0.25); }
    for(const iz of interzones) if(rng()<0.5) divider(iz.cx,iz.cy,iz.w,iz.h); }
  // КОЛОННЫ В ПАЛАСЕ (как во дворце Анубиса): разреженная решётка 1x1-стен в зале, все 8 соседей — пол зала
  for(const hl of halls){ for(const [x,y] of hl.cells){
    if(((x*2+y*3)%9)!==1) continue; const i=y*W+x;
    if(!g[i]||Math.abs(zfield[i]-hl.zt)>0.01) continue;
    let ok=true; for(const d of [1,-1,W,-W,W+1,W-1,-W+1,-W-1]){ const j=i+d;
      if(!g[j]||Math.abs(zfield[j]-hl.zt)>0.01){ok=false;break;} }
    if(ok) g[i]=0; } }
  // РЕМОНТ ШВОВ: пересечения коридоров/комнат на разных уровнях дают дикие обрывы 22-59u посреди пола.
  // Эрозия: любой непреднамеренный перепад >18u растягивается в лестницу по 0.25 (18u) на клетку.
  // Террасы и плент-плато защищены (их обрезы — намеренные).
  { const prot=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++) if(vmask[i]) prot[i]=1;   // балконы: дроп на плент — намеренный обрыв
    for(const t of terraces) for(let y=t.y0;y<=t.y1;y++)for(let x=t.x0;x<=t.x1;x++) if(x>0&&x<W-1&&y>0&&y<H-1) prot[y*W+x]=1;
    for(const k in px){ const p=px[k]; if(!p.plant) continue;
      for(let y=p.y-2;y<=p.y+2;y++)for(let x=p.x-3;x<=p.x+3;x++) if(x>0&&x<W-1&&y>0&&y<H-1) prot[y*W+x]=1; }
    for(let pass=0;pass<10;pass++){ let ch=0;
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]||prot[i]) continue;
        for(const d of [1,-1,W,-W]){ const j=i+d; if(!g[j]) continue;
          const dz=zfield[i]-zfield[j];
          if(dz>0.26){ zfield[i]=zfield[j]+0.25; ch++; } } }   // i не защищена -> опускаем в ступень
      if(!ch) break; }
    // анти-прыщи: ЛОКАЛЬНЫЙ ЭКСТРЕМУМ (все соседи-полы строго выше или строго ниже) = визуальный мусор.
    // Ступени/клинья лежат МЕЖДУ уровнями (соседи и выше, и ниже) — их не трогаем.
    for(let pass=0;pass<2;pass++){ let ch=0;
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=y*W+x; if(!g[i]||prot[i]||stairMask[i]) continue;
        let hi=0,lo=0,nn=0,best=null,bd=1e9;
        for(const d of [1,-1,W,-W]){ const j=i+d; if(!g[j]) continue; nn++;
          const dz=zfield[j]-zfield[i];
          if(dz>0.1)hi++; else if(dz<-0.1)lo++;
          const dd=Math.abs(dz); if(dd<bd){bd=dd;best=zfield[j];} }
        if(nn>=2&&(hi===nn||lo===nn)&&bd>=0.1&&bd<=0.55){ zfield[i]=best; ch++; } }
      if(!ch) break; } }
  // timing-neutral bodies in zones (donuts/islands)
  const bodies=[];
  const body=(cx,cy,w,h)=>{ // v60: тело, задевающее ядро плента, не ставится вовсе
    for(let y=cy-(h>>1);y<=cy-(h>>1)+h-1;y++)for(let x=cx-(w>>1);x<=cx-(w>>1)+w-1;x++)
      if(x>0&&x<W-1&&y>0&&y<H-1&&CORE[y*W+x]) return;
    bodies.push({cx,cy,w,h}); rect(cx,cy,w,h,0); };
  const fillZone=(node,minN,maxN,maxSz)=>{ const [w,h]=node.room; const nn=minN+((rng()*(maxN-minN+1))|0);
    for(let k=0;k<nn;k++){ const bw=2+((rng()*maxSz)|0),bh=2+((rng()*maxSz)|0);
      const rx=Math.max(0,(w>>1)-2-bw),ry=Math.max(0,(h>>1)-2-bh); const ox=((rng()*2-1)*rx)|0,oy=((rng()*2-1)*ry)|0;
      body(node.x+ox,node.y+oy,bw,bh); } };
  /* v60 L2: у ПЛЕНТОВ тела ставятся КОЛЬЦОМ вплотную за ядром, а не куда попало.
     Прежний fillZone считал смещение как max(0,(w>>1)-2-bw). При комнате A в 8-11 клеток
     (после калибровки габарита по реальным картам) это выражение равно НУЛЮ на всех
     пресетах размера — тело ложилось ровно в центр зоны, то есть на точку закладки.
     При старой базе 104x74 комната A была 17x12 и смещение выходило 1..4, поэтому
     на ранних версиях пленты были нормальные. Сломала их калибровка, а не правка тел.
     Здесь позиция задаётся от ядра, а не от размера комнаты, — от габарита не зависит. */
  const ringBody=(node,cnt,maxSz)=>{ let done=0;
    for(let t=0;t<cnt*14&&done<cnt;t++){
      const bw=2+((rng()*maxSz)|0), bh=2+((rng()*maxSz)|0);
      const ang=rng()*Math.PI*2, rad=CORER+1+((rng()*2)|0);      // кольцо сразу за ядром
      const cx=node.x+Math.round(Math.cos(ang)*(rad+(bw>>1))), cy=node.y+Math.round(Math.sin(ang)*(rad+(bh>>1)));
      let ok=true;
      for(let y=cy-(bh>>1);y<=cy-(bh>>1)+bh-1&&ok;y++)for(let x=cx-(bw>>1);x<=cx-(bw>>1)+bw-1;x++){
        if(x<1||y<1||x>=W-1||y>=H-1||!g[y*W+x]||CORE[y*W+x]){ok=false;break;} }
      if(!ok) continue;
      body(cx,cy,bw,bh); done++; }
    return done; };
  ringBody(px.A,1+((rng()*2)|0),3); ringBody(px.B,1,3); fillZone(px.M,1,2,3);

  // === ПОДРАЗДЕЛЕНИЕ: стены НАСКВОЗЬ через крупные открытые области, проём 1-2 клетки ===
  // у миража внутренние стены — массивы по 8 клеток, режущие пространство; огрызки не режут ничего
  {
    const MAXSIDE=3;
    const conn=()=>{ const st=[],seen=new Uint8Array(W*H);
      const s0=px.T.y*W+px.T.x; if(!g[s0])return false; seen[s0]=1; st.push(s0);
      while(st.length){const i=st.pop(),x=i%W,y=(i/W)|0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;
          if(nx<1||ny<1||nx>W-2||ny>H-2)continue;const j=ny*W+nx;if(!g[j]||seen[j])continue;
          if(Math.abs(zfield[j]-zfield[i])>0.82)continue; seen[j]=1;st.push(j);}}
      for(const k of ['CT','A','B','M']) if(!px[k]||!seen[px[k].y*W+px[k].x]) return false;
      return true; };
    for(let pass=0; pass<70; pass++){
      const vis=new Uint8Array(W*H); let best=null;
      for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
        const i=y*W+x; if(!g[i]||vis[i])continue;
        const cells=[],stk=[i]; vis[i]=1; let x0=x,x1=x,y0=y,y1=y;
        while(stk.length){const j=stk.pop(),jx=j%W,jy=(j/W)|0; cells.push([jx,jy]);
          if(jx<x0)x0=jx; if(jx>x1)x1=jx; if(jy<y0)y0=jy; if(jy>y1)y1=jy;
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=jx+dx,ny=jy+dy;
            if(nx<2||ny<2||nx>W-3||ny>H-3)continue;const k2=ny*W+nx;
            if(!g[k2]||vis[k2])continue;
            vis[k2]=1;stk.push(k2);}}
        const w=x1-x0+1,h=y1-y0+1;
        if(Math.min(w,h)>MAXSIDE && cells.length>=MAXSIDE*MAXSIDE+4){
          if(!best||cells.length>best.score) best={score:cells.length,cells,x0,x1,y0,y1,w,h}; } }
      if(!best) break;
      const vertCut = best.w>=best.h;
      const lo = vertCut? best.x0+2 : best.y0+2, hi = vertCut? best.x1-2 : best.y1-2;
      if(hi<lo) break;
      const cut = lo + ((rng()*(hi-lo+1))|0);
      const line = best.cells.filter(p => (vertCut? p[0]===cut : p[1]===cut));
      if(line.length<3) break;
      line.sort((p,q)=> vertCut ? p[1]-q[1] : p[0]-q[0]);
      const gapW = rng()<0.55 ? 2 : 1;
      const gp = Math.max(0, Math.min(line.length-gapW, Math.floor((0.22+rng()*0.56)*(line.length-gapW))));
      const removed=[];
      line.forEach((p,idx)=>{ if(idx>=gp && idx<gp+gapW) return;
        const j=p[1]*W+p[0]; if(CORE[j]) return;                     // v60: сквозь ядро плента не режем
        if(g[j]){ g[j]=0; removed.push(j); } });
      if(!conn()) for(const j of removed) g[j]=1;
    }
  }

  // === ЧИСТКА: оторванные куски и тупики (только это, больше ничего) ===
  {
    const ix=(x,y)=>y*W+x;
    // 1) оставить только пол, связанный с T (оторванные комнаты = мусор)
    const anchorFloor=(n)=>{ if(g[ix(n.x,n.y)]) return ix(n.x,n.y);
      for(let rr=1;rr<8;rr++) for(let oy=-rr;oy<=rr;oy++) for(let ox=-rr;ox<=rr;ox++){
        const x=n.x+ox,y=n.y+oy; if(x>0&&y>0&&x<W-1&&y<H-1&&g[ix(x,y)]) return ix(x,y); }
      return -1; };
    const s0=anchorFloor(px.T);
    if(s0>=0){
      const seen=new Uint8Array(W*H), st=[s0]; seen[s0]=1;
      while(st.length){ const i=st.pop(), x=i%W, y=(i/W)|0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy;
          if(nx<1||ny<1||nx>W-2||ny>H-2) continue; const j=ix(nx,ny);
          if(!g[j]||seen[j]) continue; if(Math.abs(zfield[j]-zfield[i])>0.82) continue;
          seen[j]=1; st.push(j); } }
      for(let i=0;i<W*H;i++) if(g[i]&&!seen[i]) g[i]=0;
    }
    // 2) срезать тупиковые отростки: клетка с одним соседом — не позиция, а артефакт
    for(let pass=0; pass<6; pass++){
      const kill=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=ix(x,y); if(!g[i]) continue;
        let n=0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(g[ix(x+dx,y+dy)]) n++;
        if(n<=1) kill.push(i); }
      if(!kill.length) break;
      for(const i of kill) g[i]=0;
    }
  }
  // склейка: два плоских куска одной высоты сливаем, если ИХ ОБЩАЯ РАМКА целиком на полу и той же высоты
  {
    const okRect=(x0,y0,x1,y1,z)=>{
      if(x0<1||y0<1||x1>W-2||y1>H-2) return false;
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
        const i=y*W+x; if(!g[i]) return false; if(Math.abs(zfield[i]-z)>0.005) return false; }
      return true; };
    let ch=true, guard=0;
    while(ch && guard++<400){ ch=false;
      outer:
      for(let i=0;i<FLOORP.length;i++){ const a=FLOORP[i]; if(a.ax!=='F') continue;
        for(let j=i+1;j<FLOORP.length;j++){ const b=FLOORP[j]; if(b.ax!=='F') continue;
          if(Math.abs(a.zA-b.zA)>0.005) continue;
          const X0=Math.min(a.x0,b.x0), Y0=Math.min(a.y0,b.y0),
                X1=Math.max(a.x1,b.x1), Y1=Math.max(a.y1,b.y1);
          if((X1-X0+1)*(Y1-Y0+1) > 400) continue;
          if(!okRect(X0,Y0,X1,Y1,a.zA)) continue;
          a.x0=X0;a.y0=Y0;a.x1=X1;a.y1=Y1;
          FLOORP.splice(j,1); ch=true; break outer; } } }
    // выкинуть куски, полностью накрытые другим
    for(let i=FLOORP.length-1;i>=0;i--){ const a=FLOORP[i]; if(a.ax!=='F') continue;
      for(let j=0;j<FLOORP.length;j++){ if(i===j) continue; const b=FLOORP[j]; if(b.ax!=='F') continue;
        if(Math.abs(a.zA-b.zA)>0.005) continue;
        if(b.x0<=a.x0&&b.y0<=a.y0&&b.x1>=a.x1&&b.y1>=a.y1){ FLOORP.splice(i,1); break; } } }
  }
  const R={floorPieces:FLOORP,g,px,bodies,interzones,rings,zfield,terraces,stairMask,rampMask,vmask,vprof:VPROF,halls,pitMask,zscale:{Tsign,PU:72}};
  if(ISLAND) addIsland(R,rng);   // остров учитывается в замерах баланса (build внутри цикла сходимости)
  if(PALACE&&rng()<0.35){ const first=rng()<0.5?px.A:px.B;
    tryPalace(R,first,rng); }   // v36: плоская дроп-площадка — редкость; настоящий ПАЛАС — зал-балкон (halls)
  return R;
}
function dijkstra(g,sx,sy,zf){
  const NN=W*H, dist=new Float64Array(NN).fill(Infinity), prev=new Int32Array(NN).fill(-1);
  const s=sy*W+sx; if(!g[s]) return {dist,prev}; dist[s]=0; const heap=[[0,s]];
  const push=(d,i)=>{heap.push([d,i]);let c=heap.length-1;while(c>0){const p=(c-1)>>1;if(heap[p][0]<=heap[c][0])break;[heap[p],heap[c]]=[heap[c],heap[p]];c=p;}};
  const pop=()=>{const t=heap[0];const l=heap.pop();if(heap.length){heap[0]=l;let c=0;for(;;){let a=2*c+1,b=2*c+2,m=c;if(a<heap.length&&heap[a][0]<heap[m][0])m=a;if(b<heap.length&&heap[b][0]<heap[m][0])m=b;if(m===c)break;[heap[m],heap[c]]=[heap[c],heap[m]];c=m;}}return t;};
  const SQ=Math.SQRT2,dirs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,SQ],[1,-1,SQ],[-1,1,SQ],[-1,-1,SQ]];
  while(heap.length){const [d,i]=pop();if(d>dist[i])continue;const x=i%W,y=(i/W)|0;
    for(const[dx,dy,c]of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const ni=ny*W+nx;if(!g[ni])continue;if(dx&&dy&&(!g[y*W+nx]||!g[ny*W+x]))continue;
      let vc=0; if(zf){const dz=zf[ni]-zf[i]; if(dz>JUMPZ) continue; vc=(dz>0?2.2:0.9)*Math.abs(dz)*72/CELL;}  // подъём дороже спуска; 72/96 = ZS/S (те же единицы, что в экспорте). изохрона теперь считает вертикаль.
      const nd=d+c+vc;if(nd<dist[ni]){dist[ni]=nd;prev[ni]=i;push(nd,ni);}}}
  return {dist,prev};
}
function nf(g,x,y){ if(g[y*W+x])return[x,y]; for(let r=1;r<9;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){const nx=x+ox,ny=y+oy;if(nx>0&&nx<W-1&&ny>0&&ny<H-1&&g[ny*W+nx])return[nx,ny];} return[x,y]; }
function measure(g,px,CTt,zf){
  const T=nf(g,px.T.x,px.T.y),C=nf(g,px.CT.x,px.CT.y),A=nf(g,px.A.x,px.A.y),B=nf(g,px.B.x,px.B.y),Mn=nf(g,px.M.x,px.M.y);
  const dT=dijkstra(g,T[0],T[1],zf),dC=dijkstra(g,C[0],C[1],zf); const at=(d,p)=>d.dist[p[1]*W+p[0]];
  const cCA=at(dC,A),cCB=at(dC,B); if(!isFinite(cCA)||!isFinite(cCB)||cCA<4||cCB<4)return null;
  const SEC=CTt/((cCA+cCB)/2),gg=x=>x*SEC;
  const tCA=gg(cCA),tCB=gg(cCB),tTA=gg(at(dT,A)),tTB=gg(at(dT,B)); if(!isFinite(tTA)||!isFinite(tTB))return null;
  const dA=dijkstra(g,A[0],A[1],zf);const rot=gg(dA.dist[B[1]*W+B[0]]);if(!isFinite(rot))return null;
  const tTm=gg(at(dT,Mn)),tCm=gg(at(dC,Mn));
  return {dT,dC,SEC,mA:tTA-tCA,mB:tTB-tCB,tCA,tTA,tCB,tTB,rot,midDiff:tTm-tCm,tTm,tCm,pts:{T,C,A,B,M:Mn}};
}

