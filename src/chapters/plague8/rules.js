// 第八灾的谜题只依赖可序列化的数据：存档、点击和自动通关共用同一套规则（设计见 docs/plague8_design.md）。
// 本文件不 import three，node 测试直接 import。

// ---- 乐手木盒：面板上 6 列刻痕，每列 4 行（帽子 / 胡子 / 白发 / 大肚子），横杠 = 有、三个圆点 = 没有 ----
// 滑轨上 I、II、III 三个滑块对应门外从左到右站着的三个乐手；三个滑块都停在“画的就是他”的那一列，盒子就打开。
export const ATTRS = ['hat', 'mustache', 'white_hair', 'fat'];
export const MUSICIANS = [
  { id: 'fat', attrs: [1, 1, 0, 1] },       // I：左边的胖子，八字胡，戴礼帽
  { id: 'feather', attrs: [1, 0, 0, 0] },   // II：中间的年轻人，帽子上插着羽毛
  { id: 'old', attrs: [0, 1, 1, 0] },       // III：右边的白发老人，两撇细胡子，不戴帽子（Nicholas 的网格模型有八字胡）
];
export const BOX_COLUMNS = [
  [1, 0, 0, 0], [0, 1, 1, 0], [1, 1, 0, 1], [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 0, 1],
];
export const BOX_START = [0, 1, 2];   // 开局三个滑块停在第 1、2、3 列

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** 把滑块 slider 挪到第 col 列（那一列已有别的滑块就互换）；不合法返回 null。 */
export function moveSlider(slots, slider, col) {
  if (!Array.isArray(slots) || !(slider in slots) || !Number.isInteger(col) || col < 0 || col >= BOX_COLUMNS.length) return null;
  const next = [...slots], other = next.indexOf(col);
  if (other >= 0) next[other] = next[slider];
  next[slider] = col;
  return next;
}
/** 每个滑块所在列画的都是它对应的乐手（按属性比对，不按列号写死）。 */
export const boxSolved = (slots) => Array.isArray(slots) && slots.length === MUSICIANS.length
  && slots.every((col, i) => BOX_COLUMNS[col] && same(BOX_COLUMNS[col], MUSICIANS[i].attrs));
/** 每个乐手对应的列（自动通关用）。 */
export const boxAnswer = () => MUSICIANS.map((m) => BOX_COLUMNS.findIndex((c) => same(c, m.attrs)));

// ---- 蝗虫合唱：5 棵树干上各趴一只蝗虫，趴得越高叫声越高（1 最低 … 5 最高）；照乐谱架上的 6 个音按顺序点 ----
export const LOCUST_LEVELS = [3, 1, 5, 2, 4];   // 从左到右每棵树上蝗虫的高度档
export const SCORE = [2, 4, 3, 5, 1, 4];

/** 点了一只高度档为 level 的蝗虫：返回新的进度（点错从头来；点错的那只正好是第一个音就算开了个头）。 */
export function chorusPress(step, level) {
  const s = Number.isInteger(step) && step >= 0 && step < SCORE.length ? step : 0;
  if (level === SCORE[s]) return s + 1;
  return level === SCORE[0] ? 1 : 0;
}
export const chorusDone = (step) => step >= SCORE.length;
/** 高度档 → 第几棵树（自动通关用）。 */
export const treeOfLevel = (level) => LOCUST_LEVELS.indexOf(level);

// ---- 引螳螂：螳螂只来找发光或发声的东西 ----
export const LURES = { glow_moth: 'goat', firefly: 'owl', fog_horn: 'margaret' };
