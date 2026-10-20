// 现实世界的参考尺寸（米）。所有章节的模型都按这张表建，世界里 scale 一律为 1；
// 镜头、座位和摆放去适配模型，不要再用缩放凑画面。量尺寸和对照：python dev/plague4/measure_scale.py
// 完整说明与当前实测见 docs/art_scale.md。

/** 人物身高（头骨顶，站直）。和 cast.js 里各角色的 height 一致。 */
export const HUMAN = {
  nicholas: 1.88, gerard: 1.84, david: 1.78, jakob: 1.76, caroline: 1.66, ida: 1.58,
  margaret: 1.56, margaretStooped: 1.47, elizabeth: 1.3, jakobChild: 1.3, soul: 1.97,
};
/** 坐姿：坐高（坐面到头顶）≈ 身高 × 0.52；椅面 0.45，座位上的人头顶 = 椅面 + 坐高。 */
export const SEATED_RATIO = 0.52;
export const seatedTop = (height, seat = 0.45) => seat + height * SEATED_RATIO;

/** 家具与建筑（米）。 */
export const FURNITURE = {
  seatHeight: 0.45,                       // 椅面 / 凳面
  stool: { height: 0.45, diameter: 0.36 },
  chair: { seat: 0.45, back: [0.9, 1.15], width: 0.45 },
  highChair: { seat: 0.49, back: [1.05, 1.25], width: 0.5 },
  table: { height: 0.75, round: [0.9, 1.2], side: [0.55, 0.75] },   // 餐桌 / 小边桌台面直径
  chest: [0.7, 0.5, 0.5],                 // 宽 × 高 × 深（木箱）
  door: { width: 0.9, height: 2.0 },
  windowSill: 0.9,
  stairStep: 0.18,
  book: { closed: [0.3, 0.42], thickness: 0.05 },   // 大开本老书；摊开宽 = 2 × 0.3
  candle: { height: 0.2, dish: 0.12 },
  cauldron: { diameter: [0.8, 1.1], height: [0.8, 1.1] },   // 能坐进一个老人的铁锅
};

/** 动物（米）。 */
export const ANIMALS = {
  rabbitSitting: { length: 0.4, height: 0.3, withEars: 0.5 },
  sandpiper: { length: 0.2, height: 0.16 },
  goat: { length: 1.1, height: 0.75 },
  hermitCrab: { length: 0.06 },
  urchin: { diameter: 0.08 },
};

/**
 * 允许放大的例外（都要在 docs/art_scale.md 里写明）：
 *  - 谜题棋盘上的小生物 / 贝壳按格子放大（格 0.36 m），不按真实大小；
 *  - 可拾取的小物件（心脏、宝石、虫子）至少放大到 0.1 m，方便点击；
 *  - 超自然生物（苍蝇人、蛹）按"能孵出一个成年人"来定，和人物一样大。
 */
export const EXEMPT_MIN_PICKUP = 0.1;

/** 一个包围盒是否在期望范围内。real = { w?, h?, d?: [min,max] | 数, tol?, note }；exempt 表示按设计例外，不检查。 */
export function checkSize(real, size) {
  if (real.exempt) return { ok: true, why: '' };
  const range = (v, tol) => (Array.isArray(v) ? v : [v * (1 - tol), v * (1 + tol)]);
  const tol = real.tol ?? 0.2, bad = [];
  for (const [k, label] of [['w', '宽'], ['h', '高'], ['d', '深']]) {
    if (real[k] == null) continue;
    const [lo, hi] = range(real[k], tol), got = size[{ w: 'x', h: 'y', d: 'z' }[k]];
    if (got < lo - 0.005 || got > hi + 0.005) bad.push(`${label} ${got.toFixed(2)} 不在 ${lo.toFixed(2)}–${hi.toFixed(2)}`);
  }
  return { ok: bad.length === 0, why: bad.join('；') };
}

/**
 * 第四灾每个布景对象的期望尺寸（键 = world.js 里 W 的名字；w/h/d = 宽/高/深，米）。
 * exempt = 按设计例外（公共模型、谜题放大、可拾取小物件），不检查大小，但表里写明原因。
 */
export const REAL = {
  p4: {
    // —— 人物（坐姿 / 蜷姿；站姿身高见 HUMAN）
    father: { h: [1.35, 1.7], note: '尼古拉斯坐高背椅：椅面 0.49 + 坐高 0.98' },
    memoryFather: { h: [1.35, 1.7], note: '坐在 0.49 的凳上' },
    memorySon: { h: [1.25, 1.42], note: '少年 Jakob 1.30' },
    grandmother: { h: [0.45, 0.75], note: '玛格丽特坐进铁锅，只看得见头和肩（坐高 0.8，下半身在锅里）' },
    uncle: { w: [0.8, 1.3], d: [0.8, 1.3], note: '杰拉德蜷在坑里（成人蜷缩 ≈ 1 m）' },
    fly: { h: [1.8, 2.9], note: '成年人大小 1.85，含翅膀约 2.7' },
    insideFly: { h: [1.8, 2.9], note: '同上' },
    // —— 家具
    table: { h: [0.7, 0.8], w: [0.9, 1.3], note: '圆桌台面高 0.75，直径 0.9–1.2' },
    bookTable: { h: [0.7, 0.8], w: [0.9, 1.3], note: '同上' },
    chair: { h: [1.05, 1.3], w: [0.4, 0.6], note: '高背椅：椅面 0.49，靠背顶 1.05–1.25' },
    memoryStool: { h: [0.42, 0.55], w: [0.3, 0.45], note: '木凳：凳面 0.45，直径 0.36' },
    chest: { w: [0.6, 0.9], h: [0.45, 0.65], d: [0.4, 0.65], note: '木箱约 0.75 × 0.55 × 0.5' },
    cauldron: { h: [0.9, 1.2], note: '铁锅口径 ≈ 1.0，高 ≈ 1.05（含锅盖 / 柴堆的宽度另算）' },
    window: { w: [1.3, 1.8], h: [1.5, 2.0], note: '拱形窗 1.55 × 1.7，窗台 ≈ 1.1' },
    book: { w: [0.3, 0.42], d: [0.36, 0.48], note: '合上的老书 0.34 × 0.43；摊开宽 0.67' },
    candle: { h: [0.25, 0.45], note: '蜡烛 0.2 + 火苗 + 小碟' },
    // —— 动物、地面物
    bird: { d: [0.18, 0.32], h: [0.1, 0.2], note: '小滨鹬 ≈ 0.2 m' },
    rabbit: { h: [0.35, 0.65], d: [0.3, 0.55], note: '兔坐高 0.3 + 耳朵，体长 0.4' },
    rabbitHole: { w: [0.25, 0.5], note: '兔洞口径 0.3–0.4' },
    pit: { w: [0.9, 1.3], note: '地洞直径 1.1：刚好蜷下一个成年人' },
    branch0: { d: [1.2, 1.6], note: '盖坑的木板长 1.4' }, branch1: { d: [1.2, 1.6], note: '同上' }, branch2: { d: [1.2, 1.6], note: '同上' },
    trap: { w: [0.4, 0.7], note: '石板 0.5 m，和 0.2 m 的鸟相称' },
    cocoon: { w: [1.9, 2.8], note: '能孵出成年人：蛹长约 2 m（含地面影圈）' },
    carrot: { h: [0.2, 0.45], note: '胡萝卜 0.2 + 叶 0.15' },
    cube: { w: [0.12, 0.25], note: '黑方块 ≈ 0.15 m' },
    fatherCube: { w: [0.1, 0.2], note: '双手能捧住的 0.13 m' },
    // —— 例外
    gate: { exempt: true, note: '公共：天堂门（第一灾模型）' },
    shed: { exempt: true, note: '公共：木小屋门' },
    owl: { exempt: true, note: '公共：猫头鹰图腾 2.4 m 高（真实图腾柱 2–3 m）' },
    stoneDoor: { exempt: true, note: '盖住神殿塔的公共门洞，沿用门洞大小' },
    font: { exempt: true, note: '公共：圣水盆，神殿大厅比例' },
    holder: { exempt: true, note: '公共：带翅的吊架，象征物' },
    omen: { exempt: true, note: '窗外预兆画框' },
    board: { exempt: true, note: '谜题沙盘：格 0.36 m，小生物按格子放大' },
    freeCrab: { exempt: true, note: '谜题放大：寄居蟹 0.35 m，能被苍蝇人一口吃掉' },
    crabRemains: { exempt: true, note: '同上' },
    gem: { exempt: true, note: '可拾取小物件放大，镶在猫头鹰嘴里' },
    doorGem: { exempt: true, note: '同上，镶在石门上' },
    owlHeart: { exempt: true, note: '猫头鹰嘴里的心（随图腾缩放）' },
    crabHeart: { w: [0.1, 0.2], note: '可拾取小物件至少 0.1 m' },
    rabbitHeart: { w: [0.1, 0.2], note: '同上' },
    birdHeart: { w: [0.1, 0.2], note: '同上' },
  },
};
