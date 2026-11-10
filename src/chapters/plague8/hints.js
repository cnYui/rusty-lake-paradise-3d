// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第八灾：id / after（直接前置）/ done（只读旗标）/ text（去哪里 + 做什么，不报谜题答案）。数组顺序 = 同时可做时的优先级。
export const HINTS = [
  // ---- 门外 ----
  { id: 'box', after: [], done: (s) => s.flag('box_open'),
    text: '点一下画面里的小岛走到天堂门前。门口地上有个木盒：把 I、II、III 三个滑块各自挪到刻着左、中、右三个乐手长相的那一列。' },
  { id: 'axe', after: ['box'], done: (s) => s.flag('axe_taken'),
    text: '拿起木盒里的斧子。' },
  { id: 'gate', after: ['axe'], done: (s) => s.flag('gate_open'),
    text: '选中斧子，用在天堂门上钉着的木板上。' },

  // ---- 雾里的树林和木屋 ----
  { id: 'chorus', after: ['gate'], done: (s) => s.flag('mantis_awake'),
    text: '进门后路口的五棵树上各趴着一只蝗虫，趴得越高叫得越高。照门外乐谱架上那六个音的高低，按顺序点对应的蝗虫。' },
  { id: 'shovel', after: ['gate'], done: (s) => s.flag('shovel_taken'),
    text: '沿路走到木屋，进屋拿起白墙边的铲子。' },
  { id: 'moth', after: ['gate'], done: (s) => s.flag('moth_taken'),
    text: '木屋门边的灯周围飞着发光的蛾子，捉一只。' },
  { id: 'goat', after: ['chorus', 'moth'], done: (s) => s.flag('goat_taken'),
    text: '白桦林的雾里有只山羊：把发光的蛾子用在它身上，然后等一等。' },
  { id: 'eyes', after: ['goat'], done: (s) => s.flag('eyes_taken'),
    text: '捡起山羊骨头中间的两颗眼睛。' },
  { id: 'sight', after: ['eyes'], done: (s) => s.flag('sight_on'),
    text: '把羊眼睛交给木屋里的红发女人。' },

  // ---- 看穿雾 ----
  { id: 'eye_house', after: ['sight'], done: (s) => s.flag('firefly_revealed'),
    text: '木屋前有一棵树刻着一只眼睛，点它看一看。' },
  { id: 'firefly', after: ['eye_house'], done: (s) => s.flag('firefly_taken'),
    text: '在门边那盏灯的蛾群里捉住那只不一样的光。' },
  { id: 'owl', after: ['firefly'], done: (s) => s.flag('owl_taken'),
    text: '树林里有只猫头鹰蹲在树枝上的窝里：把萤火虫用在它身上。' },
  { id: 'key', after: ['owl'], done: (s) => s.flag('key_taken'),
    text: '捡起掉在地上的窝里的钥匙。' },
  { id: 'eye_grove', after: ['sight'], done: (s) => s.flag('dig_revealed'),
    text: '白桦林里，羊骨头旁边那棵树也刻着眼睛，点它看一看。' },
  { id: 'dig', after: ['eye_grove', 'shovel'], done: (s) => s.flag('chest_dug'),
    text: '选中铲子，用在羊骨头旁边地上的圈里。' },
  { id: 'chest', after: ['dig', 'key'], done: (s) => s.flag('horn_taken'),
    text: '用钥匙打开挖出来的箱子，拿走里面的号角。' },

  // ---- 湖边和神殿 ----
  { id: 'boat', after: ['chest'], done: (s) => s.flag('horn_given'),
    text: '去湖边，把号角递给小船上的老奶奶。' },
  { id: 'memory', after: ['boat'], done: (s) => s.flag('cube_taken'),
    text: '点空船上方浮着的黑方块进入回忆，再拿起回忆里的黑方块。' },
  { id: 'place_cube', after: ['memory'], done: (s) => s.flag('holder_cube'),
    text: '去湖边的神殿，走近吊架，选中黑方块用在吊架上。' },
  { id: 'see_reflection', after: ['place_cube'], done: (s) => s.flag('reflection_seen'),
    text: '点吊架下面的圣水盆，看看水面。' },
  { id: 'lower_cube', after: ['see_reflection'], done: (s) => s.flag('font_lit'),
    text: '再点吊架，让它把黑方块降进圣水盆里。' },
  { id: 'finish_painting', after: ['lower_cube'], done: (s) => s.flag('plague8_complete'),
    text: '点圣水盆壁龛里的那幅画走近，再连续点画，直到画面不再变化。' },
];
