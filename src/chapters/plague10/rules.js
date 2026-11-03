// 第十灾的纯规则（不 import three，node 测试直接用）。设计见 docs/plague9_10_design.md「第十灾」。

// ---- 鼓：Nicholas 敲一段左右手的节奏，照着敲；敲错从头来（敲错的那下正好是第一拍就算开了头）----
export const RHYTHM = ['L', 'R', 'R', 'L', 'R'];
export function drumHit(step, side) {
  const s = Number.isInteger(step) && step >= 0 && step < RHYTHM.length ? step : 0;
  if (RHYTHM[s] === side) return s + 1;
  return side === RHYTHM[0] ? 1 : 0;
}
export const drumDone = (step) => step >= RHYTHM.length;

// ---- 骨箭：箭杆 + 羽毛 + 尖骨头，任意顺序 ----
export const ARROW_RECIPES = [
  ['arrow_shaft', 'feather', 'arrow_fletched'],
  ['arrow_shaft', 'bone_tip', 'arrow_tipped'],
  ['arrow_fletched', 'bone_tip', 'bone_arrow'],
  ['arrow_tipped', 'feather', 'bone_arrow'],
];
export function combineArrow(a, b) {
  for (const [x, y, out] of ARROW_RECIPES) if ((a === x && b === y) || (a === y && b === x)) return out;
  return null;
}

// ---- Ida 的脸：五道竖条，每点一下 白 → 绿 → 红 → 白 轮换；照墙上的面具画 ----
export const FACE_CYCLE = ['white', 'green', 'red'];
export const FACE = ['green', 'white', 'red', 'white', 'green'];
export const FACE_START = ['white', 'white', 'white', 'white', 'white'];
export function paintStripe(face, i) {
  if (!Array.isArray(face) || face.length !== FACE.length || !(i in face)) return null;
  const next = [...face]; next[i] = FACE_CYCLE[(FACE_CYCLE.indexOf(face[i]) + 1) % FACE_CYCLE.length]; return next;
}
export const faceDone = (face) => Array.isArray(face) && FACE.every((c, i) => face[i] === c);
/** 从 face 起每道竖条要点几下（自动通关用）。 */
export const faceClicks = (face = FACE_START) => FACE.map((c, i) => (FACE_CYCLE.indexOf(c) - FACE_CYCLE.indexOf(face[i]) + 3) % 3);

// ---- 孵小鸡：蛋在锅里、炉子点着（顺序随意）----
export const hatches = (eggInPan, stoveLit) => !!(eggInPan && stoveLit);

// ---- 食丸里的骨头字母：四组各转 0–3 个 90°；O 任意、W 只有 0（转 180° 是 M）、L 只有 0、S 是 0 或 2 ----
export const BONE_LETTERS = ['O', 'W', 'L', 'S'];
export const BONES_START = [1, 2, 3, 1];
const OK_ROT = { O: [0, 1, 2, 3], W: [0], L: [0], S: [0, 2] };
export function turnBones(rots, i) {
  if (!Array.isArray(rots) || rots.length !== BONE_LETTERS.length || !(i in rots)) return null;
  const next = [...rots]; next[i] = (next[i] + 1) % 4; return next;
}
export const bonesRead = (rots) => Array.isArray(rots) && BONE_LETTERS.every((l, i) => OK_ROT[l].includes(rots[i]));
/** 每组还要点几下才读得出来（自动通关用，取最少的）。 */
export const bonesClicks = (rots = BONES_START) => BONE_LETTERS.map((l, i) => Math.min(...OK_ROT[l].map((ok) => (ok - rots[i] + 4) % 4)));

// ---- 井下字母门：四列，每列 6 个字母循环；读成 OWLS 就开。开局每列第 1 个字母（RATE）----
export const LETTERS = [
  ['R', 'O', 'A', 'E', 'U', 'I'],
  ['A', 'E', 'W', 'O', 'I', 'H'],
  ['T', 'N', 'R', 'L', 'M', 'D'],
  ['E', 'K', 'D', 'T', 'S', 'N'],
];
export const LETTER_WORD = 'OWLS';
export const LETTERS_START = [0, 0, 0, 0];
export const readLetters = (idx) => (Array.isArray(idx) ? idx.map((v, i) => LETTERS[i]?.[v] ?? '?').join('') : '');
export function turnLetter(idx, i) {
  if (!Array.isArray(idx) || idx.length !== LETTERS.length || !(i in idx)) return null;
  const next = [...idx]; next[i] = (next[i] + 1) % LETTERS[i].length; return next;
}
export const lettersOpen = (idx) => readLetters(idx) === LETTER_WORD;
export const letterClicks = (idx = LETTERS_START) => LETTERS.map((col, i) => (col.indexOf(LETTER_WORD[i]) - idx[i] + col.length) % col.length);

// ---- 鹰雕像底座上的七块六边形（中间一块 + 周围六块）：每点一块转 60°，七块都回到 0 才拼成红猫头鹰 ----
export const HEX_START = [2, 4, 1, 3, 5, 2, 4];
export function turnHex(h, i) {
  if (!Array.isArray(h) || h.length !== HEX_START.length || !(i in h)) return null;
  const next = [...h]; next[i] = (next[i] + 1) % 6; return next;
}
export const hexDone = (h) => Array.isArray(h) && h.length === HEX_START.length && h.every((v) => v === 0);
export const hexClicks = (h = HEX_START) => h.map((v) => (6 - v) % 6);

// ---- 面具：给对的人才接 ----
export const PEOPLE = ['gerard', 'david', 'ida', 'margaret', 'nicholas'];
export const MASK_OF = { gerard: 'mask_boar', david: 'mask_rabbit', ida: 'mask_pheasant', margaret: 'mask_pigeon', nicholas: 'mask_deer' };
export const MASKS = PEOPLE.map((p) => MASK_OF[p]);
export const maskFits = (person, item) => MASK_OF[person] === item;
export const allMasked = (masked) => Array.isArray(masked) && PEOPLE.every((p) => masked.includes(p));
