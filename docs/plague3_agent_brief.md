# 第三灾美术并行建模简报（每个建模子代理先读这份）

项目：`D:/CodeWorkSpace/rusty-lake-paradise-3d`，《锈湖：天堂岛》(Rusty Lake Paradise) 的 Three.js 3D 粉丝复刻
（纯 ES module，无构建；Windows + Git Bash；截图用 `python dev/common/shot.py`）。第一、二、四灾已完成，第五灾开发中，现在做第三灾（蚊灾和虱灾）。
**这一轮只做美术资产（模型、贴图、动画方法），不写章节逻辑、不写测试**——章节逻辑会由另一个 AI 按文档实现。
你是并行团队里的一员，只负责任务里写明的文件。

## 1. 必读 / 按需深读
- `AGENTS.md`（项目约束，特别是“人物模型”一节）。
- `docs/plague3_api.md`：**接口契约**。你的实现必须符合里面写的 id、方法名、子物体名、状态字段；确需偏差时在最终报告里写清楚。
- 风格样板（照着写）：`src/art/props_p2_house.js`、`props_p2_lake.js`、`props_p2_shared.js`（第二灾道具，最接近要求的写法）、
  `src/art/props_inner.js`（画像、木器、玻璃）、`src/art/props_beach.js`（石头、门）、`src/art/props_frogs.js`（小物件）、
  `src/art/props_lake.js`（神殿道具）。人物：`src/art/cast.js`、`src/art/human.js`、`src/art/charkit.js`。
- 第三灾公共工具：`src/art/props_p3_shared.js`（几何小工具、红漆符号、蚊群、陶轮造型数据），`src/art/props_p3_items.js`（物品模型，
  19 件物品模型已经做完，**直接 import 它的 `FACTORIES` 用**）。
- **用户要求：之前场景里做得好的模型，拿过来稍微修改后复用**（见 `docs/plague3_api.md` §1 的“可复用的现有模型”）。
  能 import 现有工厂再改（缩放、换颜色材质、加贴花、加子物体）的就不要重新建模；改不了的可以把函数复制到你的文件里改。
- 参考视频：`dev/common/ref/P03_第三灾-蚊子灾_BV1bo4y1y7fm.mp4`（1920×1080，30 fps，863.9 秒）。
  - 逐秒帧 `dev/common/ref/plague3/frames/f_NNNN.jpg`（960×540，f_NNNN = 第 NNNN 秒，例：05:42 = 342 秒 → f_0342.jpg）。
  - 拼图 `dev/common/ref/plague3/sheets/s_XX.jpg`（4×4，每格隔 2 秒，左上角黄字时间）。用 Read 直接看图。
  - 需要更清楚 / 更密的帧时直接从原视频抽（`ffmpeg` 可用；文件名有中文，用通配符）：
    ```
    V=$(ls dev/common/ref/P03_*.mp4)
    # 某一秒的高清局部（1920×1080 坐标，crop=宽:高:x:y）
    ffmpeg -loglevel error -y -ss 342.5 -i "$V" -frames:v 1 -vf "crop=900:700:300:100" <草稿目录>/x.png
    # 从第 158 秒起 4 秒，每秒 4 帧
    ffmpeg -loglevel error -y -ss 158 -t 4 -i "$V" -vf "fps=4,scale=640:-1" -q:v 3 <草稿目录>/t_%03d.jpg
    ```
  - 抽出来的图放你自己的草稿目录（见第 2 节第 6 条），不要放进项目。

## 2. 硬性规则（工作区被多个会话同时使用）
1. **只改任务里列出的文件。** 不要改 `src/core/*`、`src/chapters/*`、`src/art/props.js`、`characters.js`、`cast.js`、`human.js`、`charkit.js`、
   `materials.js`、`props_p3_shared.js`、`props_p3_items.js`、其它章节的文件、`dev/minitool/*`。需要共享改动时写进最终报告，由协调者统一改。
   - 例外：`cast.js` 末尾已经追加导出了一批内部工具（`mergePose / STOOP / bags / brow / roundCollar / sashBow / stripedCap / gerardBeard / gerardPockets / buildIda / buildCaroline …`），直接 import。
2. **不要从任何备份“还原”文件，不要整体重写别人的文件，不要 git checkout / reset / stash / commit。**
3. 单向依赖：`props_p3_*.js` 可以 import `three`、`materials.js`、`props_p3_shared.js`、`props_p3_items.js`、`props_p2_shared.js`、
   其它 `props_*.js`（拿现有工厂复用）和 `core/tween.js`；**绝不能 import `props.js` 或 `characters.js`**（会成环）。
   人物文件 `cast_p3_*.js` 只 import `cast.js`、`human.js`、`charkit.js`、`props_p3_shared.js`；要用道具模型时用 charkit 的 `getPropFactory()`（运行时由 characters.js 注入 makeProp）。
4. 写代码的风格：见 `docs/plague3_api.md` §0（1 m 单位、原点、+z 正面、`{instant}`、`setState`、单个 animate、点击盒、toon 描边、合并网格、中文注释）。
   每个工厂接受一个 `opts` 对象（可能是 `{}`）。导出 `export const FACTORIES = { id: (opts) => Object3D, … }`（人物文件导出 `export const CAST = { id: () => rig }`）。
5. 忠于原作：外观（形状、比例、颜色 hex、描边）、动作和时序都对照参考帧。原作是手绘 2D，3D 化时保持“粗黑描边 + 平涂 + 少量手绘纹理”的风格。
6. 临时文件放会话草稿目录 `<会话草稿目录>/<你的模块>/`（具体路径由协调者在任务里给出）。
   截图放 `dev/plague3/media/<你的模块>/`（这个目录不进 git）。
7. 不要写 `docs/ai/context/` 记录（协调者统一写），不要改 `AGENTS.md`。

## 3. 视觉验证流程（必须做，至少迭代 2–3 轮）
- 预览道具：`python dev/common/shot.py "dev/common/viewer.html?prop=<id>&mod=<你的模块>&hud=0&cam=px,py,pz,tx,ty,tz&fov=40&bg=%23cfc8b8" dev/plague3/media/<模块>/x.png --size 900x700`
  - `&call=method:arg;method2`（会按游戏时间推进动画再截图，`&callTime=秒`），`&advance=秒`，`&freeze=1`；
  - `--js "异步函数体"` 里可以用 `window.VIEW = { THREE, scene, camera, renderer, obj, advance(sec), call(name, ...), render() }`，
    例如 `--js "await VIEW.obj.setState({open:true}); VIEW.advance(0.1); return 1"`。多段 await 的方法用 `&freeze=1` + 在 js 里循环 `VIEW.advance(0.1)`。
  - 人物：`dev/common/viewer.html?char=<id>&hud=0`（rig 在 `VIEW.rig`），或身高对照 `dev/common/cast.html?ids=<id>,gerard,david&view=front`。
- 用 Read 打开你的截图和对应的参考帧，**逐项对比**形状、比例、颜色、描边、构图，改掉明显不像的地方，再截图。
- shot.py 有错误时退出码为 1：控制台不能有你的模块产生的错误（THREE 的 `toNonIndexed` / `flatShading` 两条警告是旧模块的，可以忽略）。
- 检查状态方法：每个 `setState` 至少测“初始 → 终态 → 回到初始”三次截图，确认能往回恢复；动画方法用 `&call=` 跑一遍不报错。
- viewer 的灯光和游戏里不一样，颜色以参考帧为准，不要为了 viewer 好看把颜色调亮。
- 物品 / 道具图标：同一个模型也用作物品栏图标（192px 位图，界面里更小），小零件要做大、描边要清楚。

## 4. 最终报告（你的最后一条消息，会被协调者读到）
文件清单、**实际实现的接口**（id、opts、方法签名、`setState` 字段、子物体 / 挂点名、默认尺寸和朝向、建议摆放的缩放）和与 `docs/plague3_api.md` 的所有偏差、
复用了哪些现有模型、验证过程和结论、截图路径（最终版各一张）、已知未解决的问题、对共享文件的改动请求。要简洁、具体，不要复述任务。
