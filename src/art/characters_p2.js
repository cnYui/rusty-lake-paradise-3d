// 第二灾角色：把各角色模块注册进 makeCharacter。接口见 docs/plague2_api.md 第 B 节。
//   gerard（chars_p2_gerard.js）、ida / caroline（chars_p2_ida.js）、margaret_cook / david_p2（chars_p2_family.js）
// 章节和 viewer 只需要 import 这个文件一次（副作用：注册），之后照常用 makeCharacter(id)。
import { registerCharacter } from './characters.js';
import { BUILDERS as GERARD } from './chars_p2_gerard.js';
import { BUILDERS as IDA } from './chars_p2_ida.js';
import { BUILDERS as FAMILY } from './chars_p2_family.js';

for (const m of [GERARD, IDA, FAMILY]) for (const [id, b] of Object.entries(m)) registerCharacter(id, b);

export const CHARACTER_P2_IDS = [GERARD, IDA, FAMILY].flatMap((m) => Object.keys(m));
