# 第二灾并行开发简报（所有子代理先读这份）

项目：`D:/CodeWorkSpace/rusty-lake-paradise-3d`，《锈湖：天堂岛》(Rusty Lake Paradise) 的 Three.js 3D 粉丝复刻
（纯 ES module，无构建；Windows + Git Bash；截图用 `python dev/shot.py`）。第一灾（血灾）已完成并上线，
现在做第二灾（蛙灾）。你是并行团队里的一员，只负责任务里写明的文件。

## 1. 必读 / 按需深读
- `AGENTS.md`（项目约束）、`ARCHITECTURE.md`
- `docs/plague2_design.md`：全章设计（流程、旗标、视图、物品）。**位置以 `src/chapters/plague2/world.js` 的 `SPOTS` 和 `src/art/layout.js` 当前内容为准**
  （layout.js 在 10-08 之后加了全岛栅栏 / 小屋围墙，设计文档里的个别坐标可能过时）。
- `docs/plague2_api.md`：模块接口契约。你的实现必须符合里面写的 id、方法名、子物体名；确需偏差时在最终报告里写清楚。
- `dev/ref/p2/analysis/*.md`：参考视频的逐帧分析（`core_engine_guide.md` 引擎接入、`chars-props_reuse.md` 角色 / 道具构建套路和 viewer 的坑、
  `world-env_reuse.md` 场景复用，`video_*.md` 各段逐帧）。
- 参考视频单帧：`dev/ref/p2/frames/f_NNNN.jpg`（960x540，**f_NNNN = 视频第 NNNN−1 秒**；例：10:33 = 633 秒 → f_0634），
  拼图 `dev/ref/p2/sheets/s_XX.jpg`（4x4，每格隔 2 秒，左上角黄字时间戳）。用 Read 直接看图。游戏画面约占帧的 x 30–830，右边是物品栏。
- **原视频**：`dev/ref/P02_第二灾-蛙灾_BV1bo4y1y7fm.mp4`（1920x1080，30 fps，849 秒；`dev/ref/` 里还有第 1、3–10 灾的视频，第一灾的帧在 `dev/ref/p1/`）。
  1 fps 的单帧不够时（动作时序、动画细节、小物件细节），直接从原视频抽更密的帧或高清局部（`ffmpeg` 可用，抽 2 秒只要零点几秒）：
  ```
  # 从第 766 秒起 2 秒，每秒 5 帧，缩到 960 宽（动作快的用 fps=10）
  ffmpeg -loglevel error -y -ss 766 -t 2 -i dev/ref/P02_*.mp4 -vf "fps=5,scale=960:-1" -q:v 3 <草稿目录>/<模块>/t_%03d.jpg
  # 某一秒的高清局部（1920x1080 坐标，裁 w:h:x:y；帧坐标 ×2 就是原视频坐标）
  ffmpeg -loglevel error -y -ss 766.4 -i dev/ref/P02_*.mp4 -frames:v 1 -vf "crop=700:600:500:200" <草稿目录>/<模块>/crop.png
  ```
  文件名里有中文，用 `P02_*.mp4` 通配符。抽出来的图放草稿目录，不要放进项目。
- 第一灾同类代码是最好的风格样板：`src/art/props_*.js`、`src/art/characters.js`、`src/chapters/plague1/*.js`、`src/art/props_frogs.js`（青蛙和第二灾物品，已完成）、
  `src/chapters/plague2/*`（章节骨架，已完成：world.js 布景 + 视图 + 导航热点，puzzles.js 纯逻辑，beach / forest / house / temple 四个待填充的部分）。

## 2. 硬性规则（工作区被多个 Claude 会话同时使用）
1. **只改任务里列出的文件。** 其它会话（小红书小工具会话会批量还原 `src/` 里的老文件）也在同一个工作区里改东西，所以：
   - 不要改 `src/art/characters.js`、`props_beach.js`、`props_inner.js`、`props_lake.js`、`sky.js`、`materials.js`、`lake.js`、`buildings.js`、
     `src/chapters/index.js`、`src/chapters/plague1/*`、`styles.css`、`src/core/*`、`props.js`、`characters_p2.js`。
     需要共享改动时，在最终报告的 issues 里提出，由协调者统一改。characters.js 导出的 `CHAR_KIT` 里没有的函数，在你自己的文件里复制一份小工具。
   - **不要从任何备份“还原”文件，不要整体重写别人的文件。** 用 Edit 做小范围精确替换。
   - 第一灾文字里的“x灾 / 装有x的壶”是另一个会话的审核实验，不要动。
2. 单向依赖：`props_p2_*.js` 可以 import `materials.js`、`props_frogs.js`、`core/tween.js`，**绝不能 import `characters.js`**
   （characters.js 顶层 await 了 props.js，反向引用会成环）。角色文件 `chars_p2_*.js` 只 import `characters.js` 导出的 `CHAR_KIT`。
   各道具文件里的 `once / place / mesh / lathe / hitBox / profileR` 都是模块私有的，自己写一份并给缓存键加命名空间前缀。
3. 写代码的风格：
   - 1 单位 = 1 米；道具原点在地面（或挂点），正面朝 +z；物品原点在中心、长轴沿 +x。
   - 材质用 `toon()`（带描边）；贴图材质的基色用 `#ffffff`（否则贴图被基色相乘变暗）；共享缓存材质运行时不能改（会影响物品图标）。
   - 状态方法返回 Promise，**最后一个参数支持 `{ instant: true }`**（直接跳到终态，供 `sync()` 读档恢复，幂等）。
   - 动画只用 `src/core/tween.js` 的 `animate / wait`（跟随 `engine.timeScale`）；**每个方法尽量只开一个 animate 任务**（多段用 `seg(k, a, b)` 分段），
     否则 viewer 的 `&call=` 会死锁（`&call` 先同步推进再 await，帧循环还没启动）。
   - 每帧更新挂 `obj.update(dt, t)`（章节用 `ctx.register('prop', id, obj)` 注册后核心每帧调用）。
   - 可点部件用透明点击盒：`material.visible=false` 时必须 `userData.proxy = true`，或者用 `colorWrite:false` 的不可见材质（热点会跳过 `visible=false` 的物体）。
     点击盒不要放进物品模型里（会撑大图标包围盒）。
   - 控制 draw call：静态网格合并、重复物用 InstancedMesh。注释用中文。
4. 忠于原作：外观（形状、比例、颜色 hex、描边风格）、动作和时序都对照参考帧。
5. 每个模块用时间戳写一份中文记录：`date +%Y%m%d-%H%M%S` 取时间戳，新建
   `docs/ai/context/<时间戳>-plague2-<模块>.md`（做了什么、实际接口、验证、遗留问题）。不要覆盖已有记录。
6. 临时文件放会话草稿目录 `C:/Users/yui/AppData/Local/Temp/claude/D--CodeWorkSpace-rusty-lake-paradise-3d/b3cce8f9-1cae-4740-86c7-5ef158725ba9/scratchpad/<你的模块>/`。截图放 `dev/shots/p2/<你的模块>/`。

## 3. 视觉验证流程（必须做，至少迭代 2–3 轮）
- 预览：`python dev/shot.py "dev/viewer.html?prop=<id>&hud=0&cam=px,py,pz,tx,ty,tz&fov=40&bg=%23cfc8b8" dev/shots/p2/<模块>/x.png`
  （`?char=<id>` 会自动加载 characters_p2.js；`&call=method:arg;method2`；`&anim=talk`；`&freeze=1`；`--js "异步函数体"`，里面可以用
  `window.VIEW = { THREE, scene, camera, renderer, obj, rig, advance(sec), call(name, ...), render() }`）。
  多段 await 的方法用 `&freeze=1` + `--js` 手动 `VIEW.advance(0.1)` 循环推进（见 `chars-props_reuse.md` 第 5 节）。
- 用 Read 打开你的截图和对应的参考帧，**逐项对比**形状、比例、颜色、描边、构图，找出明显不像的地方改，再截图。
  shot.py 有错误时退出码为 1：控制台不能有错误或警告（THREE 的 `toNonIndexed` / `flatShading` 警告是别的模块的，可以忽略）。
- viewer 的灯光和游戏里不一样，最后要进游戏看一遍：`index.html?chapter=2&skipIntro=1&view=<视图>`（章节骨架已经能加载，`RLP.ctx.p2.world` 能看布景锚点）。
- 物品图标：同一个模型也用作物品栏图标（`core/items.js`：图标就是工厂刚建好时的样子，192px 位图，界面里显示得更小），小零件要做大、描边在图标里很粗。

## 4. 最终报告（你的最后一条消息，会被协调者读到）
文件清单、**实际实现的接口**（id、方法签名、子物体名、挂点、默认尺寸朝向）和与 `docs/plague2_api.md` 的所有偏差、验证过程和结论、截图路径、
已知未解决的问题、对共享文件的改动请求。要简洁、具体，不要复述任务。
