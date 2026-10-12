# 第二灾：共享注册点与并行开发分工

## 修改
- `src/art/characters.js` 末尾新增两个导出：
  - `registerCharacter(id, builder)`：注册新角色，之后 `makeCharacter(id)` 就能用；重复注册会警告。
  - `CHAR_KIT`：全部构建工具和现有角色的构建函数。后续章节在独立文件里单向 import 它。characters.js 顶层 await 了 props.js，所以不能反过来 import 新文件，否则会成环。
- `src/art/characters_p2.js`（新）：把 `chars_p2_gerard.js`、`chars_p2_ida.js`、`chars_p2_family.js` 各自导出的 `BUILDERS` 注册进去。章节和 viewer import 这个文件一次即可。
- `dev/viewer.js`：`?char=` 会先加载 characters_p2.js。
- `src/art/props.js`：改成按模块表 `MODULES` 合并，id 重复时 console.warn。已注册 `props_p2_lake.js`、`props_p2_house.js`、`props_p2_temple.js`（都是新建的空壳，FACTORIES = {}）。
- `docs/plague2_api.md`：按上面的拆分写明了文件归属。

## 验证
- `dev/viewer.html?char=david`、`?prop=frog` 截图无报错。

## 分工（workflow wf_8726c309-e68，每个模块都是“实现 → 独立审查 → 修复”）
| 模块 | 内容 |
|---|---|
| props-lake | 睡莲叶棋盘、蛙卵盆 |
| props-house | 锅、小桌、箱子、回忆黑框 |
| props-temple | 凳子、转盘锁柜、木柴堆 |
| char-gerard | Gerard |
| char-ida | Ida、Caroline |
| char-family | 厨房的 Margaret、David 扩展 |
| chapter-scaffold | 第二灾章节骨架、世界布景、物品、文本、纯逻辑、成就 |
| audio | 第二灾音效 |

- 另外恢复了分析 workflow wf_80a68112-2e5，补蛙卵规则那段视频分析和联网攻略。
- 已通知第三灾会话这两个共享注册点的用法。
