// 第三灾人物变体汇总：characters.js 把这里的构建函数并入 makeCharacter。
// 各变体复用 cast.js 的身体（manBody / womanBody / margaretBody / gerardBody / nicholasBody），只加章节道具、发型和动作。
// 还没做好的变体先用最接近的现有人物顶上（接口方法都是返回 Promise 的空操作），章节逻辑可以先按 docs/plague3_api.md 开发。
import { CAST as BASE } from './cast.js';
import { CAST as HUT } from './cast_p3_hut.js';          // gerard_barber、ida_barber
import { CAST as FAMILY } from './cast_p3_family.js';    // margaret_gnats、david_table
import { CAST as MEMORY } from './cast_p3_memory.js';    // caroline_rose、margaret_baby、ida_child、nicholas_stand、gerard_young

// id → [现有人物, 接口方法]
const FALLBACK = {
  gerard_barber: ['gerard', ['setHair', 'snipHair', 'showScalpMap', 'cutEar']],
  ida_barber: ['ida', ['holdScissors', 'snip', 'cutEar']],
  margaret_gnats: ['margaret', ['setGnats', 'takeSwatter', 'swat']],
  david_table: ['david', ['talk', 'coverWithGnats', 'vanish']],
  caroline_rose: ['caroline', ['dropPetals']],
  margaret_baby: ['margaret', []],
  ida_child: ['elizabeth_pheasant', []],
  nicholas_stand: ['nicholas', []],
  gerard_young: ['gerard', []],
};

function fallback(id) {
  const [baseId, methods] = FALLBACK[id];
  return () => {
    const rig = BASE[baseId]();
    let state = {};
    for (const m of methods) if (!rig[m]) rig[m] = () => Promise.resolve();
    rig.setState = (s = {}) => { state = { ...state, ...s }; return Promise.resolve(); };
    rig.getState = () => ({ ...state });
    if (baseId === 'ida') rig.showFrog?.(false);
    if (baseId === 'elizabeth_pheasant') rig.setMask?.(null);
    rig.placeholder = true;
    return rig;
  };
}

const REAL = { ...HUT, ...FAMILY, ...MEMORY };
export const CAST_P3 = { ...Object.fromEntries(Object.keys(FALLBACK).map((id) => [id, fallback(id)])), ...REAL };
