# Rusty Lake Paradise 3D — Architecture & Module Contracts

A faithful 3D fan remake of *Rusty Lake Paradise* (锈湖：天堂岛), split into the ten plagues.
Plague I (血灾 / Blood) is the first playable chapter. **This file is the binding contract** between
modules: modules are written in parallel by different people, so every module must export exactly
the names below. The game-design source of truth (story, map, puzzles, exact solutions, visual specs
with hex colours) is `../_analysis/plague1_design.md` — read it; reference frames are in
`../_analysis/frames/f_NNNN.jpg` (NNNN = seconds/2 + 1, zero-padded) and contact sheets in
`../_analysis/sheets/s_00..s_23.jpg` (4×4 grid, 32 s per sheet, yellow mm:ss stamps).

Already written (do not rewrite, extend only if truly needed): `src/core/tween.js`,
`src/art/materials.js`, `src/art/layout.js`, `src/art/props.js`, `src/chapters/index.js`,
`src/chapters/plague1/{index,items,text}.js` (+ stub `beach/forest/lake.js` to be replaced),
`dev/viewer.html`, `dev/viewer.js`, `dev/shot.py`, `vendor/three/**`.

## Tech

- Plain ES modules, **no build step**. Three.js r170 vendored: `three` → `./vendor/three/three.module.js`,
  `three/addons/` → `./vendor/three/addons/` (import map in every HTML page).
- Served over HTTP from the project root (`python -m http.server 8080`). `dev/shot.py` starts its own server.
- **No external assets**: every texture is drawn on a `<canvas>`, every model is built from Three.js
  primitives / Lathe / Extrude / Tube geometry, every sound is synthesized with WebAudio.
- Target 60 fps on a mid laptop iGPU: < ~400 draw calls in any view (use `InstancedMesh` for forests,
  logs, grass), one 2048 shadow map max. Dispose nothing per frame; no per-frame allocations in hot loops.
- First-person game, like the original: **Jakob is the camera** (he only appears in the intro rowing
  shot and as a reflection in the font).

## Visual style (Rusty Lake look, translated to 3D)

- **Landscape = painterly realism**: pale misty sky, layered blue-grey mountains with snow,
  yellow-green meadows and dark conifer bands on the far shore, grey-silver mirror-like misty lake.
  Low contrast, desaturated. `flat()` / standard materials + canvas textures, **no outlines**.
- **Characters & props = flat cartoon with thick black ink outlines**: `toon()` materials (3-step
  gradient) + `OutlineEffect`. Faces painted on canvas textures (heavy-lidded tired eyes, dark
  under-eye lines, heavy brows). Proportions slightly cartoonish (big heads ≈ 1/5.5 of height).
- Forest interior is almost greyscale: towering straight trunks with light/dark vertical stripes.
- Screen overlay (CSS): rounded-corner dark vignette (old TV/photo frame), slow floating white dust
  motes, subtle film grain. Colour appears only in blood, wood, gold, leaves, shrimp.
- Blood: `#8a1c1c` deep, `#a3282a` fresh, `#5e1414` dark, `#a85a5a` pinkish stain on the lake.

## Directory layout

```
index.html                 import map, <canvas id="game">, <div id="ui">, loads src/main.js
styles.css                 overlay styling (inventory, arrows, text band, bubbles, menu, vignette, grain, inspector, letter)
src/main.js                boot: Engine → buildWorld → initContext → menu → chapter.setup/start
src/core/engine.js         Engine
src/core/tween.js          ✔ written: Ease, tick, bindClock, animate, tween, wait, clearAll
src/core/state.js          state
src/core/views.js          views
src/core/hotspots.js       hotspots
src/core/items.js          items
src/core/ui.js             ui
src/core/audio.js          audio
src/core/context.js        ctx, initContext
src/core/debug.js          window.RLP
src/art/materials.js       ✔ written: PALETTE, toon, flat, unlit, noOutline, canvasTexture, rng, shade, tex.*, textTexture
src/art/layout.js          ✔ written: LAKE_Y, GROUND_Y, ISLAND_OUTLINE, PALISADE, SHED_FENCE, shedLineZ, P (positions), SETS, onIsland, shoreDistance
src/art/sky.js             sky dome, painted panorama backdrop (mountains/far shore), fog, lights
src/art/lake.js            lake water shader with blood (island ring, pool, full lake)
src/art/island.js          terrain, beach, palisade, shed fence (plank wall shore to shore), dock steps, rocks, forest, trees, bamboo clump leaves, thorns, tower
src/art/buildings.js       house exterior, shed wall, temple exterior; interior stage sets (house_int, temple_int, memory)
src/art/world.js           buildWorld(engine) → World
src/art/characters.js      makeCharacter(id), makeAnimal(kind), makeIntroBoat()；动物面具、山羊、开场小船，CHAR_KIT
src/art/cast.js            全部人物（第二版，真实身高、蒙皮衣物）：David / Jakob / Gerard / Nicholas / Margaret / Caroline / Ida / Elizabeth / 灵魂及章节变体
src/art/human.js           人物身体工具：bodyDims、makeHuman、torsoSkin / limbSkin / skirtSkin、head、hands、shoes、feltHat、lifeIdle、playKeys
src/art/charkit.js         公共底层：材质缓存、手绘贴图、几何体、脸部绘制、骨架（Bone）与 IK、蒙皮权重、放样曲面
src/art/props.js           ✔ written: makeProp(id) dispatcher over the three files below
src/art/props_beach.js     FACTORIES for beach props + beach items
src/art/props_inner.js     FACTORIES for forest / house props + their items
src/art/props_lake.js      FACTORIES for lake / temple props + black cube
src/chapters/index.js      CHAPTERS (10 plagues; only plague1 implemented)
src/chapters/plague1/index.js   chapter object: setup/start/sync/walkthrough (composes the parts)
src/chapters/plague1/text.js    all Chinese strings for the chapter (see §Text)
src/chapters/plague1/items.js   items.define(...) for every plague-1 item
src/chapters/plague1/beach.js   intro → overview → beach → gate open
src/chapters/plague1/forest.js  forest path → clearing → pump → house → owl → shed door
src/chapters/plague1/lake.js    soul → lakeshore → coffin → memory → temple → ending
dev/viewer.html|js         ✔ standalone art viewer (see §Dev tools)
dev/minitool/              小红书小工具打包：build.py（esbuild 打成 game.js；默认输出声音版 dist-audio/，--release 去调试状态条，--legacy 旧版）+ rotate.js（竖屏转 90° 和坐标换算）+ audio_out.js（iPhone 出声线路）+ compat.js / css_compat.py（Chrome 61 兼容）+ test_minitool.py / audio_check.py / compat_check.py，见 docs/ai/context/*xiaohongshu-minitool*.md
dev/shot.py                ✔ headless screenshot helper (Playwright + SwiftShader)
tests/playtest.py          full autoplay test + per-view screenshots
docs/impl_<module>.md      each module's author documents what they actually implemented (see below)
```

**Every module author must write `docs/impl_<module>.md`** (e.g. `docs/impl_props_inner.md`):
exported functions, each object's methods with signatures, named child objects usable as hotspot
targets, local dimensions, and a *recommended close-up camera pose* (offset from the object's
origin in its local frame + target) for every interactive object. Chapter authors rely on this.

## Core contracts

### `src/core/tween.js` (written)
`Ease`, `tick(dt)`, `bindClock(engine)`, `animate(ms, fn(k), ease)`, `tween(obj, to, ms, ease)`
(one level of nesting: `tween(mesh, { position: { y: 2 } })`), `wait(ms)`, `clearAll()`.
All durations are game-milliseconds and scale with `engine.timeScale`. **Never use `setTimeout` /
`setInterval` / `requestAnimationFrame` for gameplay timing** — use these, or `update(dt, t)` hooks.

### `src/core/engine.js`
```js
export class Engine {
  constructor(canvas)
  renderer; scene; camera /*PerspectiveCamera, near .05 far 4000*/; outline /*OutlineEffect*/;
  timeScale = 1; elapsed /*game seconds*/;
  onUpdate(fn /*(dt, t) game-seconds*/) → unsubscribe()
  start()
}
```
`outline.render(scene, camera)` each frame, resize-aware,
`SRGBColorSpace`, `NeutralToneMapping`, PCFSoft shadows. dt clamped to ≤ 0.05 s before scaling.
像素比：电脑最高 2，手机 / 平板（`pointer: coarse`）最高 1.75。动态分辨率 `engine.autoQuality`：每满
90 帧或 2 秒统计一次，超过一半的帧慢于 26 ms 就把像素比降 0.25（电脑最低 1，手机最低 0.75，只降不升）；
`navigator.webdriver`（自动化测试）下关闭。`engine.setPixelRatio(pr)` 可手动设置。

### `src/core/state.js`
```js
export const state
state.chapter; state.flags /*{}*/; state.inventory /*item ids, max 6*/; state.selected; state.view; state.achievements /*[]*/
state.flag(key) → value ; state.setFlag(key, value = true)
state.has(itemId) ; state.give(itemId) ; state.take(itemId) ; state.select(itemIdOrNull)
state.replace(oldId, newId)        // keep slot position (jug ⇄ jug_blood)
state.achieve(id) → boolean (true if newly unlocked)
state.on(evt, fn) → off ; state.emit(evt, data)   // 'inventory' 'flag' 'select' 'view' 'achievement' 'reset'
state.save() ; state.load(chapterId) → boolean ; state.reset(chapterId)
```
localStorage key `rlp3d.save.<chapter>` (try/catch everything). Used items are removed and later
items move up (no holes).

### `src/core/views.js`
```js
export const views
views.init(engine) ; views.registerZone(zoneId, group)   // only the active zone group is visible
views.define(spec) ; views.get(id) ; views.current ; views.all()
views.go(id, { instant = false, duration, fade, teleport = false } = {}) → Promise
views.back() → Promise ; views.refreshArrows()
views.freeMode ; views.isOpen(id) ; views.addRoamGate((x, z, state) => blocked) → remove()
```
```js
spec = {
  id: 'beach_mid', zone: 'exterior',
  cam: { pos: [x,y,z], target: [x,y,z], fov: 45 } | (world) => ({ pos, target, fov }),
  back:  'viewId' | null | (state) => id|null,      // ▼ arrow, bottom centre（固定镜头里也可按 S / ↓）
  left / right: 'viewId' | null | fn,               // ◀ ▶ arrows at screen edges（只在固定镜头显示）
  up:   'viewId' | null | fn,                       // ▲ forward arrow
  upAt: [x,y,z] | null,                             // optional world point where the ▲ is drawn (on the path); default bottom-centre above ▼
  look: 0.12,                                       // 固定镜头的鼠标环视幅度（弧度），省略时特写 0.12、其它 0.14
  closeup: false,                                   // true → transition uses a quick fade (0.25 s) like the original
  fixed: false,                                     // true → 室外但不漫游（总览）
  onEnter: async (ctx) => {}, onExit: async (ctx) => {}
}
```
两类视图：室外、非 closeup、非 fixed 的是**开放视图**，进入后自由漫游（WASD 走动，Shift 跑），
视图本身只作为出生机位 / 脚本与测试的传送目标，不显示方向箭头；总览、室内布景和谜题特写是
**固定镜头**，位置不动，▼ 箭头或 S / ↓ 返回。

鼠标视角不锁定指针：以左侧游戏画布中心为中立点，指针在中心死区内不转，移向画布边缘时朝该方向
转、越靠边越快（漫游时是角速度，水平无上限，可 360° 连续转身；固定镜头只小幅偏转并自动回正）。
指针在画布外（物品栏）或离开窗口时视角不动。只有 `pointerType === 'mouse'` 的指针参与靠边转向。

### `src/core/touch.js`（触屏）
```js
touch.init(engine, { roaming: () => views.freeMode, onActivate: () => views.dropPointer() })
touch.active          // 触屏界面（#stage.touch）：最近一次操作是手指 / 触控笔；鼠标真正移动时切回
touch.stick           // { x 向右, y 向前 }（-1..1），views 每帧读取驱动走动，推到底奔跑
touch.takeLook()      // 取走拖动视角的像素位移；漫游时划过整个画面宽度约转 195°
touch.looking ; touch.SLOP   // 12 px：手指移动超过它才算拖动，否则算轻点（交给 hotspots）
```
漫游时画面左侧 42% 内按下 = 摇杆（底座出现在按下处），其它位置 = 转视角；固定镜头里拖动只小幅
环视、松手回正。hotspots 按指针分别记录按下位置，所以推摇杆的同时另一根手指可以轻点。
触屏界面下物品栏可以直接点（规则同数字键），按钮 / 箭头放大，显示全屏按钮；手机竖屏
（`orientation: portrait` + `pointer: coarse` + 宽度 < 700px）显示“横过来”提示。

Transitions: 漫游中脚本 / 测试切到另一个开放视图 → 直线畅通就滑行（≈900 ms），隔着墙或树就黑场
切换；进出特写或跨区域 → fade to black 250–300 ms, snap, fade in；从特写 / 室内返回开放视图时恢复
进入前的漫游位置与朝向（`teleport: true` 时改用该视图机位，`RLP.goto` 和 autoplay 都这样用）。
漫游碰撞：`layout.js` 岛屿轮廓 + `world.colliders`（树干、房屋、神殿、塔、栅栏、小屋木墙、小屋两侧围墙、小船）+
章节用 `addRoamGate` 注册的门禁（天堂门、小屋门）。天堂门栅栏（`PALISADE`）两头伸进湖里；小屋两侧的木板围墙
（`SHED_FENCE`，折线，北面是灵魂小径和湖区）从小屋和石屋一直连到东西两岸，小屋门是去湖区的唯一通道，
小屋门禁沿同一条线（`shedLineZ(x)`）判断。漫游位置不写入存档。

### `src/core/hotspots.js`
```js
export const hotspots
hotspots.init(engine) ; hotspots.define(spec) ; hotspots.get(id) ; hotspots.list(viewId = state.view)
hotspots.makeProxy(w, h, d, pos = [0,0,0], parent?) → invisible pickable Mesh (also visible in ?debug=1)
hotspots.click(id) → Promise    // simulate a click exactly like the mouse (honours state.selected)
```
```js
spec = {
  id, views: ['viewId', ...], object: Object3D,       // all child meshes are raycast targets
  when: (state) => true,                                 // enabled predicate
  cursor: 'pointer' | 'zoom' | 'grab' | 'talk' | 'use',
  goto: 'viewId',                                        // click with no item → views.go(goto)
  onClick: async (ctx) => {},                            // click with no item (after goto, if both)
  onItem: { itemId: async (ctx) => {} },                 // click while that item is selected
  onWrongItem: async (ctx, itemId) => {}                 // default: ui.shakeSelected(); state.select(null)
}
```
Raycast only hotspots enabled in the current view; nearest hit wins; ignore while `ui.locked`.
漫游时改为开放所有挂在开放视图上的热点（`free: false` 可排除），仍要经过射线、可见性、`when`
条件，并且只拾取 24 m 以内的物体；只挂在总览或特写上的热点漫游时不生效。点击取鼠标所在位置，
按下后移动超过 10 px 不算点击。
After any handler: `views.refreshArrows()` and `state.save()`.

### `src/core/items.js`
```js
export const items
items.init(engine)    // offscreen renderer for icons (transparent bg, outlined)
items.define({ id, name: { zh, en }, model: () => Object3D, icon?: { rot: [x,y,z], scale: 1, offset: [x,y,z] },
               onInspectClick?: async (ctx, partName) => {} })
items.recipe(a, b, async (ctx) => {})     // combine (order-agnostic)
items.get(id) ; items.icon(id) → dataURL (cached) ; items.combine(a, b) → Promise<boolean>
```

### `src/core/ui.js`
```js
export const ui
ui.init(engine)
ui.locked ; ui.lock() ; ui.unlock()
ui.say(text, { ms = 3200, kind = 'line' | 'item' | 'hint' | 'thought' } = {}) → Promise   // top-centre band, queued
ui.thought(anchor /*Object3D*/, iconItemId | null, { ms = 2600, offset = [0,0.35,0], draw } = {}) → Promise
          // black rounded comic bubble with white-line item icon + 3 dots towards the head;
          // `draw(ctx2d, w, h)` may draw a custom icon instead of an item
ui.fade(opacity 0..1, ms = 300) → Promise ; ui.flash(color = '#fff', ms = 400) → Promise
ui.filmFlicker(ms = 900) → Promise          // old-film effect: desaturate, scratches, jitter, grain burst
ui.title(lines /*['第一灾','血灾']*/, ms = 3000) → Promise   // big chapter title, fades in/out
ui.narrate(lines[], { msPer = 3200 }) → Promise               // intro narration lines at top
ui.toast({ id, zh, en })                                        // achievement: chalk-line icon + label, fades
ui.doc({ pages: [{ html, translations?: [zh lines] }] }) → Promise   // letter reader; click a line to show its translation at top
ui.inspect(itemId) → Promise                // item inspector overlay (drag to rotate, click parts)
ui.shakeSelected()
ui.renderInventory()                        // auto-bound to state events
ui.setArrows({ left, right, up, down, upScreen /*{x,y}|null*/ }, onClick(dir))   // used by views
ui.menu.show(chapters) ; ui.menu.hide() ; ui.ending({ zh, en }) → Promise
```
Inventory: **6** square beige slots in a dark vertical strip on the right, double white inner frame,
icons may overflow the slot. 电脑上物品栏只用键盘（槽位不接收鼠标，右下角标着键位；触屏界面下
改为直接点槽位，规则相同）：数字键 1–6 选中
对应槽位（slot glows white, item name appears to the left of the slot）；再按同一个键取消；已选中
一件时按另一个数字键 = `items.combine`（配方不对时两个槽位一起抖动）；快速连按两次同一个键 =
`ui.inspect`。Esc 打开暂停菜单 / 关闭信件与检视器。Picking up an item: icon flies to the slot, name
shown at top ~1.8 s.

### `src/core/audio.js`
```js
export const audio
audio.init()          // on first user gesture (menu click)
audio.ambience('lake' | 'forest' | 'interior' | 'temple' | 'memory' | 'none')
audio.music('intro' | 'plague' | 'ending' | 'none')     // sparse piano + low strings, synthesized
audio.sfx(name)       // 'click','pickup','cut','chop','splash','reel','cast','door','creak','gate',
                      // 'bell','drink','pour','squish','juicer','wing','screw','nail','lid','page',
                      // 'achievement','stinger','wrong','combine','unlock','bolt','goat','heartbeat',
                      // 'whoosh','hum','holy','flicker','bubble','rustle','hatch'
audio.setVolume(v) ; audio.mute(bool)
```

### `src/core/context.js`
```js
export const ctx = {
  engine, world, state, views, hotspots, items, ui, audio, THREE,
  tween, animate, wait, Ease,
  chars: {}, props: {},               // instances registered by the chapter (by id)
  go: (viewId, opts) => views.go(viewId, opts),
  give: async (id) => {},             // state.give + pickup sfx + ui.say(item name, {kind:'item'})
  take(id), replace(oldId, newId), flag(k), setFlag(k, v = true),
  achieve: (id) => {},                // state.achieve + ui.toast(ACHIEVEMENTS[id]) if new
  cutscene: async (fn) => {},         // ui.lock(); try { await fn(ctx) } finally { ui.unlock(); views.refreshArrows(); state.save() }
};
export function initContext({ engine, world }) → ctx
```

### `src/core/debug.js` — `window.RLP`
```js
RLP.ready ; RLP.state ; RLP.ctx ; RLP.errors /*captured window errors + unhandled rejections*/
RLP.timeScale = n
RLP.start(chapterNumber = 1, { skipIntro = false, fresh = true }) → Promise
RLP.goto(viewId) → Promise ; RLP.click(hotspotId) → Promise ; RLP.select(itemId)
RLP.use(itemId, hotspotId) → Promise ; RLP.combine(a, b) → Promise ; RLP.inspectClick(itemId, part) → Promise
RLP.hotspots() → [{ id, enabled }] for the current view ; RLP.views() → all view ids
RLP.autoplay({ stepDelay = 30, steps = chapter.walkthrough, shots = false } = {}) → Promise<{ ok, steps, failedStep, error, log }>
          // `steps` lets a part be tested alone, e.g. RLP.autoplay({ steps: forestModule.walkthrough })
RLP.chapter          // the loaded chapter module (default export)
RLP.drawCalls()      // renderer.info.render.calls of the last frame
```
URL flags: `?autotest=1` (no menu; RLP.ready after boot, nothing started), `?debug=1` (show hotspot
proxies, log clicks), `?chapter=1&skipIntro=1&view=beach_mid` (dev jump; starts fresh unless `&keep=1`),
`&flags=gate_open,owl_level=3,rod=hook` (set flags before `chapter.sync`), `&give=machete,jug,leech`
(put items in the inventory) — lets each chapter part be tested in isolation.
Boot order in main.js: Engine → buildWorld → initContext → load chapter module → `chapter.setup(ctx)`
→ (menu or dev jump) → apply `flags`/`give` → `chapter.sync(ctx)` → `chapter.start(ctx, {skipIntro})`
or `views.go(view)`. `beach.js` additionally exports `intro(ctx)` (full intro cutscene ending on
`overview`) and `skipIntro(ctx)` (put the world into the post-intro state instantly).
`autoplay` executes the chapter walkthrough only through these public paths — never by setting
flags directly — so a passing autoplay proves the puzzle chain is completable by a player.

## Art contracts

### `src/art/world.js`
```js
export function buildWorld(engine) → World
World = {
  root,                                    // added to engine.scene by buildWorld
  zones: { exterior, house_int, temple_int, memory },   // THREE.Group each; main.js registers them with views
  anchors: Map<string, Object3D>,          // exterior anchors created from layout.P, + interior set anchors
  anchor(name) → Object3D                  // throws with the list of known names if missing
  lake: { setBlood(amount01, { ms } = {}) → Promise, setPool(visible), mesh, material },
        // amount 0 = clean grey lake; 0.3 = irregular blood ring hugging the island shore (plague-1
        // default, as in the video); 1 = the whole lake blood red. Pool = separate pool at P.bloodPool.
  setFog(density01, { ms } = {}) → Promise // 0 clear, 1 thick white intro fog
  setTimeOfDay?(name)                      // optional, later chapters
  update(dt, t)                            // water animation, swaying leaves, dust, etc.
}
```
Interior sets are built by `buildings.js` at `SETS.<zone>.origin` and expose anchors named
`house_int.chair`, `house_int.table`, `house_int.photo`, `house_int.portrait`, `house_int.cabinet`,
`house_int.door`, `house_int.center`, `temple_int.font`, `temple_int.holder`, `temple_int.windowL`,
`temple_int.windowR`, `temple_int.center`, `memory.coffin`, `memory.family0..4` (left → right),
`memory.frame`, `memory.center`. Exterior anchors use the `layout.P` key names (`gate`, `bambooCane`,
`margaret`, `pump`, `owlTotem`, `shedDoor`, `temple`, `bloodPool`, ...) plus building anchors
`house.door`, `temple.door`, `temple.window`, `shed.doorway`.
Anchors are empty `Object3D`s positioned (and rotated) where the chapter should place a prop or
character; chapters add props as children of the right zone group at the anchor's world transform.

`sky.js` exports `buildSky(scene) → { group, setFog, update }`; `lake.js` exports `buildLake() →
lake object above`; `island.js` exports `buildIsland() → { group, update }`; `buildings.js` exports
`buildBuildings() → { exterior: Group, sets: { house_int, temple_int, memory }, anchors: Map }`.

### `src/art/characters.js`
```js
export function makeCharacter(id) → CharacterRig
export function makeAnimal(kind /*'goat'*/) → CharacterRig
export function makeIntroBoat() → { root, update(dt, t), row(bool) }   // rowboat + small rowing Jakob for the intro
CharacterRig = {
  id, root /*Group: feet at y=0, faces +Z*/,
  parts: { head, torso, armL, armR, handL, handR, legL, legR, hat? },   // pivot Groups
  headTop /*Object3D above the head for thought bubbles*/,
  play(anim) /*'idle' | 'talk' | 'none' | character-specific*/, update(dt, t),
  setMask(maskId | null)  // 'boar' 'pheasant' 'deer' 'rabbit' 'pigeon'
  ...character-specific async methods (below), all accept { instant } to jump to the end state
}
```
Character ids and required behaviours (see design doc §3 for looks):
- `david` — on the rock, hands in pockets, smirk. `setRod(stage)` stage ∈ `'none' | 'stick' | 'line' |
  'hook' | 'worm'` (adds visible rod parts; he holds the stick upright in front); `castAndCatch()` →
  Promise (raise rod overhead and lean back ~2.5 s, cast line far out, wait ~3.5 s, reel in with a
  shrimp dangling); `showShrimp(bool)`. Named children: `david_body`, `david_hook`, `david_shrimp`.
- `margaret` — very old grandmother seated on a grey 3-legged stool (stool included), headscarf,
  hands together. `setNose(stage)` stage ∈ `'none'|'peek'|'stay'|'pull1'|'pull2'|'out'` (a dark red
  leech sliding out of her nostril; 'peek' pokes out and retracts), `holdLeech(bool)` (leech pinched
  in her fingers beside her face), `setExpression('neutral'|'pain')`. Children: `margaret_nose`, `margaret_leech`.
- `nicholas` — father seated at the table on a high-backed carved chair (chair NOT included: prop
  `high_chair`), black tailcoat, white jabot, holding a wine glass (`glass` = `makeProp('wine_glass')`
  from props_inner, attached to his right hand). `drink()` → Promise (raise glass, tilt head, slow
  drink ~5 s, lower; afterwards the glass shows the leech), `pointAtPlate()` pose,
  `hideGlass()`. Children: `nicholas_body`, `nicholas_glass`.
- `soul` — Caroline's corrupted soul: tall black fuzzy silhouette, long robe shape, round spiky head,
  two glowing white round eyes. `vanish()` → Promise (flicker out). Child: `soul_body`.
- `jakob` — used for the font reflection (head & shoulders, short auburn hair, open-collar shirt).
- `gerard_boar`, `elizabeth_pheasant`, `nicholas_deer`, `david_rabbit`, `margaret_pigeon` — the five
  masked family members of the memory vision (design doc §3 last rows; reference frames 700–715):
  boar (hands in pockets, mask string tied at the back), pheasant girl (white throat bib, Peter Pan
  collar, sash bow), deer in a wrap robe holding the cube up beside his head with the other hand on
  his chest (bell sleeves hang straight down), rabbit (shirt with rolled sleeves, open waistcoat,
  boots), pigeon grandmother (headscarf, shawl, apron, hands clasped). Masks and clothes are smooth
  lofts (`spineLoft` / `ringLoft` in characters.js) with painted fur / feather textures.
  `nicholas_deer.raiseCube()` → Promise lifts the black cube overhead (child `memory_cube`),
  `burstCube()` → Promise (black particles spray upwards). The memory stage also holds a closed
  coffin in front of them (`memory.coffin` anchor).
- `goat` (makeAnimal) — white goat with long curved horns, beard; idle chewing / bleat.
  `drink()` → Promise (head down into bucket ~4 s, head up, tongue out), `tongueLeech(bool)`,
  `flinch()` (for the machete — unharmed). Children: `goat_body`, `goat_leech`.

### Props — `makeProp(id)` (see `src/art/props.js`)
Every factory returns an `Object3D` with origin on the ground (or at the hanging point) and methods
attached **directly on the object**. Every state-changing method returns a Promise, accepts
`{ instant: true }` as last arg (used by `sync()` after loading a save), and uses `animate/tween/wait`.
Inventory item models double as icons (rendered by `items.icon`) → readable at 96 px from a 3/4 view.

`props_beach.js` FACTORIES:
- items: `machete` (ochre handle #daab5f with 2 rivets, long pale blade), `hook` (black J/question-mark
  hook with eye), `line` (wooden spool wound with black line, curly loose end), `stick` (thin pale bamboo
  pole with 2–3 dark nodes, ~2.4 m), `worm` (grey-purple segmented S-shaped worm), `shrimp` (bright
  orange-red curled shrimp with long feelers).
- `paradise_gate` — two tall posts, cross beam with carved sign `PARADISE`, double plank doors
  (#997c5c) opening inwards (north). Left door has an upper-left sliding hatch and a lower-right
  sliding hatch (square panels). Behind the upper hatch: Gerard's eyes (grey-white skin, orange-brown
  heavy brows, grey eye bags); behind the lower hatch: dark hole, Gerard's pale hand can extend palm-up.
  Methods: `openHatch('up'|'low')`, `closeHatch('up'|'low')`, `extendHand()`, `handTake(obj)` (place
  obj in palm, fingers close, hand retracts), `openDoors()`. Children: `hatch_up`, `hatch_low`,
  `gerard_eyes`, `hatch_low_hole`, `gerard_hand`, `gate_doors`, `eyes_anchor` (bubble anchor).
- `bamboo_clump` (5–6 leafy canes) ; `bamboo_cane` (the single tall leafless cane): `wobble()`,
  `cut()` (falls to the right, disappears, short stump remains). Children: `cane`, `stump`.
- `spiky_fruit` — rust-red gourd/sea-cucumber shape with dark ridges and black spikes, small mouth
  ring on the left. `chop(n)` n=1..5 progressively split open with red juice; at 5 a worm crawls out
  onto the sand (`showWorm(bool)`). Children: `fruit_body`, `fruit_worm`.
- `david_rock` — grey rounded boulder (#403f3d) sticking out of the water.
- `rowboat` — grey-white wooden rowboat (#8e887f), plank floor, 3 thwarts. Slots (empty Object3Ds):
  `slot_machete` (rear thwart), `slot_hook` (middle thwart), `slot_box` (under middle thwart),
  `slot_box_floor` (on the floor boards where the box slides to).
- `bolt_box` — small pinkish-brown wooden box (#b28c81) with two front doors, two horizontal pale
  bolts each with a little upright pin through a U-staple. `slideBolt('top'|'bottom')`, `openDoors()`,
  `hideLine()`. Children: `bolt_top`, `bolt_bottom`, `box_doors`, `box_envelope`, `box_line`.
- `dock_steps` may be built by island.js instead (it is scenery).

`props_inner.js` FACTORIES:
- items: `leech` (dark maroon segmented crescent worm, lighter ring underside), `jug` (clear glass
  pitcher, round belly, narrow neck, flared spouted mouth, loop handle, white foot), `jug_blood` (same,
  filled with dark red), `key` (brass skeleton key: ring bow, long shaft, square bit).
- `pump` — cast-iron hand pump (#3c3c3c) with spout to the left and long curved handle to the right,
  a pale round stone dish on the ground under the spout. `pumpOnce({ filling })` (handle up then slowly
  down, thin bright-red stream; if `filling` the jug on the dish fills to the brim), `setJug(null |
  'empty' | 'full')`. Children: `pump_handle`, `pump_dish`, `pump_jug`, `pump_stream`.
- `bucket` — light-brown wooden bucket with two iron hoops. `setFill(0..1)`. Child: `bucket_body`.
- `stool` — not needed (Margaret includes hers).
- `owl_totem` — 1.6 m carved wooden owl (#ab9063) with angry brows, concentric eyes, beak that opens
  to show a grey mouth with sharp teeth; square body; vertical glass tube on the chest held by three
  claw-like wooden straps (3 tick marks → 4 levels); two long horizontal plank wings each carved
  with an ↑ arrow; round stump base. Methods: `setLeech(bool)` (leech lying on the lower jaw),
  `flap({ crush })` (wings up to shoulder height; if crush: beak closes, red trickle down the tube,
  level +1; wings down, beak re-opens), `setLevel(n 0..4)`, `showKey(bool)` (golden key in the open
  beak). Children: `owl_mouth`, `owl_wing_l`, `owl_wing_r`, `owl_tube`, `owl_key`.
- `dining_table` — round table with white floor-length tablecloth with vertical folds.
- `plate_prawn` — white plate with a whole orange-red prawn. `split()` (head and body come apart,
  a leech wriggles out of the neck onto the plate), `hideLeech()`. Children: `prawn`, `plate_leech`.
- `high_chair` — brown carved high-backed chair.
- `wine_glass` — clear stemmed wine glass. `setFill(0..1)`, `showLeech(bool)`. Child: `glass_leech`.
- `cabinet` — small dark-brown cabinet, four short legs, overhanging top, two doors each with a
  vertical red-brown bolt that starts pushed up into the top. `slideBolt('l'|'r')` (slides down),
  `openDoors()` (doors vanish revealing the dark interior with the glass jug on the bottom shelf),
  `hideJug()`. Children: `cab_bolt_l`, `cab_bolt_r`, `cab_doors`, `cab_jug`.
- `family_photo` — wide gilded frame on a string from a nail, sepia photo painted on canvas (left →
  right: big man in a vest, white-haired old woman seated holding a baby, red-haired little girl,
  boy with short auburn hair in a white shirt, woman in a striped bonnet and long brown dress, man in
  a long dark coat), plaque `the eilander family`. Children: `photo_jakob` (pickable region on the boy).
- `portrait_caroline` — smaller gilded frame, Caroline in a pale-blue/cream/ochre striped bonnet with
  ear flaps, ochre square-necked bodice, pale blue sleeves, grey background; plaque `CAROLINE EILANDER`.
- `shed_door` — pale grey plank double door with a copper-pink horizontal bolt (ring handle on the
  left end) through a U-staple, brass padlock with ornate keyhole plate. `unlock()` (padlock drops
  away), `slideBolt()`, `open()` (doors swing outward). Children: `padlock`, `shed_bolt`, `shed_doors`.

`props_lake.js` FACTORIES:
- items: `black_cube` (matte black rounded cube ~12 cm).
- `coffin` — classic hexagonal coffin (narrow head, shoulders at ~30 %, tapering to a flat foot),
  pale beige-brown wood #c4b69b, inner border line on the lid, black latin cross near the head,
  `Caroline Eilander` in black script along the shoulder line, six copper-rust nail heads (head
  corners ×2, shoulders ×2, foot corners ×2; nail_4 starts bent up). Inside: marbled red-ochre
  lining #b8563c, a black rounded cube on the left-centre, a faint hand-drawn symbol on the right
  (triangle with a vertical line through the apex extending below the base).
  Methods: `rise()` (bursts head-first diagonally out of the blood, falls back and floats),
  `pullNail(i 1..6)` (bend up 0.3 s then pull out leaving a small dark hole), `slideLid()`,
  `takeCube()`, `bob(bool)`. Children: `coffin_lid`, `nail_1`..`nail_6`, `coffin_cube`, `coffin_symbol`.
- `floating_cube` — black cube hovering, slowly rotating and bobbing (`setVisible`).
- `blood_tendril` — thin red strand that rises from the pool, writhes and sinks (looping via update).
- `font` — octagonal white stone font with a rim of pale-brown stones and an inner black ring; liquid
  surface shader pulsing slowly between dark red and dark grey; an arched niche on its front
  (child anchor `font_niche` where `plague_painting` is mounted). `ripple(u, v)`, `showReflection()`
  (red drops burst, Jakob's translucent face fades in), `ignite()` (white-gold light rays and glowing
  cloud burst from the basin, keeps pulsing). Children: `font_liquid`, `font_niche`.
- `winged_holder` — gold (#c9a13b) compact box with a horizontal seam, pair of golden feathered wings,
  two chain links up to the rope, small toothed grille at the bottom, black ink outline. `open()`
  (top/bottom slide apart revealing a dark olive square socket), `close()`, `insertCube()` (warm
  flash, cube fills the socket), `lower(distance)` (descends along the rope into the font).
  Children: `holder_body`, `holder_socket`, `holder_rope`.
- `plague_painting` — arched oil painting (canvas-painted, white multi-arch frame): sky with a locust
  and a fly, full moon upper right, purple-grey mountains, lake with a red-roofed cottage and white ice
  floes, conifer band, meadow with a dead black-and-white cow (lower left), a woman in a red cloak
  running with a black smoke column of insects behind her, an old man in a green robe kneeling, a
  black cube in the centre, a red blood stream winding from the forest edge across the meadow, two
  green frogs lower right. `glowCube()` (cube becomes a glowing white cube), `purify()` (beam from
  the cube to the stream source, white puff, stream fades upstream→downstream to grey-brown water),
  `frameFrogs()` (white rectangle draws itself around the two frogs). Children: `painting_cube`,
  `painting_frogs`.

## Chapter contracts

```js
// src/chapters/plague1/index.js
export default {
  id: 'plague1', number: 1, title: { zh: '血灾', en: 'Blood' }, label: { zh: '第一灾', en: 'Plague I' },
  async setup(ctx) {},   // items.js defineItems(ctx); beach/forest/lake setup(ctx): place props/chars, define views+hotspots
  async start(ctx, { skipIntro }) {},   // intro cutscene (beach.js) → views.go('overview')
  sync(ctx) {},          // after loading a save: put every prop/char into the state implied by flags (instant)
  walkthrough: [...beach.walkthrough, ...forest.walkthrough, ...lake.walkthrough],
  completeFlag: 'plague1_complete',
};
// each part: export async function setup(ctx); export function sync(ctx); export const walkthrough = [...]
// walkthrough steps: { go } | { click } | { use, on } | { combine: [a,b] } | { inspect, part } | { wait } |
//                    { expectFlag } | { expectItem } | { repeat: n, step: {...} }
```

### View ids (owner part in brackets)
- beach: `overview`, `beach_left`, `beach_mid`, `beach_right`, `david`, `bamboo`, `fruit`, `gate_door`, `boat`, `bolt_box`
- forest: `forest_path`, `clearing_left`, `clearing_right`, `margaret`, `goat`, `pump_left`, `pump_right`,
  `pump`, `house`, `house_right`, `owl`, `house_int`, `plate`, `father`, `family_photo`, `portrait`, `cabinet`, `shed_door`
- lake: `soul_path`, `lakeshore`, `blood_pool`, `coffin`, `memory`, `temple_int`, `font`, `holder`, `painting`
- Cross-part links: `beach_mid` ▲ / click open gate → `forest_path` (when `gate_open`); `forest_path` ▼ → `beach_mid`;
  `shed_door` after opening → `soul_path` (auto); `soul_path` ▼ → `house_right`.

### Flags (owner part; others may only read)
- beach: `box_out`, `bolt_top`, `bolt_bottom`, `box_open`, `letter_read`, `machete_taken`, `hook_taken`,
  `line_taken`, `bamboo_cut`, `fruit_chops` (0..5), `worm_taken`, `rod` ('none'|'stick'|'line'|'hook'|'worm'),
  `shrimp_caught`, `shrimp_taken`, `hatch_up`, `hatch_low`, `hand_out`, `gate_open`, `intro_done`
- forest: `nose` (0..6), `margaret_leech_taken`, `prawn_split`, `prawn_leech_taken`, `father_asked`,
  `cab_bolt_l`, `cab_bolt_r`, `cabinet_open`, `jug_taken`, `jug_on_pump` (null|'empty'|'full'),
  `glass_filled`, `father_drank`, `father_leech_taken`, `bucket_filled`, `goat_drank`, `goat_leech_taken`,
  `owl_leech` (bool), `owl_level` (0..4), `key_taken`, `padlock_open`, `shed_bolt`, `shed_open`
- lake: `soul_lines` (0..2), `soul_gone`, `coffin_risen`, `nail_1..nail_6`, `lid_open`, `cube_floating`,
  `memory_seen`, `cube_taken`, `holder_open`, `cube_inserted`, `holder_closed`, `holder_lowered`,
  `reflection_seen`, `painting_lit`, `stream_purified`, `frogs_framed`, `plague1_complete`
- Achievements (state.achievements ids): `welcome_to_paradise`, `the_eilander_family`, `save_the_goat`,
  `its_me`, `the_first_symbol` — labels in `text.js` `ACHIEVEMENTS`.

### Items (ids → Chinese label)
`machete` 弯刀 · `hook` 鱼钩 · `line` 线 · `stick` 木棍 · `worm` 虫子 · `shrimp` 虾 ·
`leech` 水蛭 (all four leeches share the id `leech`; inventory may hold several — state.inventory is a
list, `has('leech')` true if ≥1, `take('leech')` removes one) · `jug` 壶 · `jug_blood` 装有血的壶 ·
`key` 钥匙 · `black_cube` 黑方块

## Text (Chinese, our own wording — `src/chapters/plague1/text.js`)
```js
export const T = {
  narration: ['我还记得回到天堂岛的那一天……', '那座小岛，是我的家人世代栖居的地方。', '自从收到母亲的死讯，',
              '那些早已模糊的记忆，竟一点点清晰起来。', '天堂岛刚刚出现在眼前，', '我就仿佛感到，母亲的气息依然萦绕在身旁。',
              '她给了我那么多回忆——我无论如何也无法忘记。'],
  chapter: ['第一灾', '血灾'],
  hintRoam: 'WASD 走动 · 鼠标移向画面边缘转身', hintBack: '点击向下的箭头或按 S 返回', hintBolt: '点击插销把它拉开',
  hintTranslate: '点击文字来翻译', hintUseItem: '按数字键选中物品，再点场景使用；依次按两个数字键可合成',
  letter: { en: ['April 22nd, 1796', 'My dear son,', 'It grieves me to tell you that your mother has passed away.',
                 'Please return to Paradise as soon as you can — we need you now more than ever.', 'Your father'],
            zh: ['1796年4月22日', '我亲爱的儿子：', '我很难过地告诉你，你的母亲已经离世了。', '请尽快回到天堂岛，我们现在比任何时候都更需要你。', '你的父亲'] },
  david: '哥哥，你终于回来了。',
  margaret: ['孩子，能再见到你真好。', '你母亲的事……我很难过。'],
  fatherAsk: '儿子，帮我个忙，给我弄点喝的来。',
  fatherAfter: ['自从你母亲走后，锈湖就一直被痛苦笼罩着……', '她一直在祈祷你能回来。帮帮我们吧，儿子。'],
  portraitThought: '母亲……到底发生了什么？',
  soul: ['只有把我的记忆带回锈湖……', '……锈湖才会停止流血。'],
  reflection: '这是……我。',
  memory: '请收下我们的献祭，指引我们吧。',
  ending: { zh: '第一灾 · 完', en: 'Plague I — complete' },
};
export const ACHIEVEMENTS = {
  welcome_to_paradise: { zh: '欢迎来到天堂岛', en: 'Welcome to Paradise' },
  the_eilander_family: { zh: '艾兰德一家', en: 'The Eilander Family' },
  save_the_goat: { zh: '拯救山羊', en: 'Save the Goat' },
  its_me: { zh: '这是我', en: "It's Me!" },
  the_first_symbol: { zh: '第一个符号', en: 'The First Symbol' },
};
```

## Dev tools
- `dev/viewer.html?prop=owl_totem&hud=0` (also `&mod=props_inner`, `?char=david&anim=idle`,
  `?animal=goat`, `?world=1&zone=exterior&cam=px,py,pz,tx,ty,tz&fov=40`, `&call=flap:true;setLevel:3`,
  `&advance=1.5`, `&freeze=1`). `window.VIEW` exposes `{ scene, camera, obj, world, rig, advance(sec), call(name,...), render() }`.
- `python dev/shot.py "<url relative to project root>" out.png [--size 1280x720] [--js "async body"] [--wait s]`
  — headless Chromium + SwiftShader WebGL, starts its own server on a random port, prints console errors,
  exit code 1 on errors. Use it to *look at your work* (Read the PNG) — iterate until it matches the
  reference frames. Put screenshots under `dev/shots/<module>/`.
