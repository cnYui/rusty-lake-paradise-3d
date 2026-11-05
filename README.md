# Rusty Lake Paradise 3D

A faithful 3D fan remake of *Rusty Lake Paradise* (锈湖：天堂岛) built with Three.js. This is a first-person puzzle adventure game split into ten plagues, with **Plague I (Blood)** fully implemented.

## 🎮 Quick Start

### Running the Game

```bash
# Start a local HTTP server (required for ES modules)
python -m http.server 8080

# Or use Node.js
npx http-server -p 8080
```

Then open `http://localhost:8080` in your browser.

### 操作方式

开场先看到天堂岛的远景，点击天堂门进入海滩，此后室外全程自由漫游：

- **走动**：`W/A/S/D`（或方向键），按住 `Shift` 奔跑。
- **转身 / 抬头低头**：不锁定鼠标。以左侧游戏画面的中心为准，鼠标停在中间区域时视角不动；移向画面边缘就朝那个方向转，越靠边转得越快，可以连续转 360°。鼠标移到右侧物品栏或离开窗口时视角停止。
- **互动**：鼠标点击场景里的人物、道具和入口（离得太远时要先走近，最远约 24 m）。
- **物品栏（只用键盘）**：`1`–`9`、`0`、`-`、`=` 依次对应右侧槽位（超过 6 件时展开第二列）。按一次选中，再按同一个键取消；选中一件后按另一个数字键，两件物品合成（例如先按 `1` 再按 `2`）；快速连按两次同一个键查看物品。选中物品后点击场景即可使用。
- **房子里也能走动**：点房门进屋后同样用 `W/A/S/D` 走动、鼠标转身（墙和桌椅柜子挡路，顶着圆桌会沿桌边绕过去）；走回门口点门出去，回到进屋前站的位置。墙上的两幅画点一下会全屏放大，点任意处、▼ 或 `Esc`/`S`/`↓` 关闭。
- **特写**：点船、盘子（从正上方俯视）、父亲、棺材、神殿等会进入固定镜头的特写，点击底部 ▼ 或按 `S`/`↓` 返回，回到进入前站的位置。
- **`Esc`**：暂停菜单；打开信件或检视物品时用来关闭。

#### 手机 / 平板（触屏）

用手指操作时界面会自动切换成触屏版（再用鼠标时切回电脑版）：

- **走路**：在画面左侧按住拖动，摇杆出现在手指按下的位置；推得越远走得越快，推到底奔跑。
- **转身**：在画面其它位置拖动，向右拖向右转、向上拖抬头；松手再拖可以一直转。两根手指可以同时走和转。
- **互动**：轻点人物、道具和入口（手指几乎不动就抬起才算轻点）。
- **物品栏**：点一下选中，再点取消；选中一件后点另一件就合成；快速点两下查看物品。
- **返回**：点底部 ▼。右上角齿轮是暂停菜单，旁边是全屏按钮（浏览器支持时显示；安卓上点"开始"会自动全屏并锁定横屏）。
- 手机请**横屏**游玩，竖着拿时会提示横过来；平板竖屏也能玩（上下留黑边）。
- 帧率持续偏低时会自动逐级降低渲染分辨率。

### 公网部署

线上地址：**https://aaccx.pw/rusty-lake/**（www.aaccx.pw 同样可用）。更新线上版本只需在项目根目录运行：

```bash
bash dev/common/deploy_mac.sh
```

- 脚本经 SSH 把文件传到部署用的 MacBook，最后自动检查线上页面（主机、用户名和密钥路径是私有信息，只写在本地的 `dev/common/deploy_mac.sh` 里，不进公开仓库）。仓库里的 `dev/common/deploy_mac.example.sh` 是去掉私有信息的示例，用 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_KEY`、`DEPLOY_DIR` 环境变量指定部署目标。
- 链路：Cloudflare → Mac 上的 cloudflared 隧道（`~/.cloudflared/config.yml` 里 `^/rusty-lake(/.*)?$` 规则）→ nginx `127.0.0.1:8081`（`/opt/homebrew/etc/nginx/servers/yui-web-extras.conf`）。同域名下的主页和 Sub2API 走各自的规则，部署游戏不会影响它们。
- 每次部署生成一个新的 `v<时间戳>/` 资源目录（长期缓存），最后才替换入口 `index.html`（不缓存），所以不用手动清 Cloudflare 缓存；旧版本目录不会自动删除。
- Cloudflare 的 WAF 会拦截路径里带 `/vendor/` 的请求，所以线上 three.js 放在 `lib/three/`（脚本自动改写 importmap）。

### Dev Tools

```bash
# View individual props and characters
open http://localhost:8080/dev/common/viewer.html?prop=owl_totem

# Headless screenshot capture (requires Python + Playwright)
python dev/common/shot.py "index.html?chapter=1&view=beach_mid" screenshot.png

# Auto-play test (runs the complete walkthrough)
open http://localhost:8080?autotest=1
# Then in browser console: RLP.autoplay()
```

## 🗺️ Game Structure

### Plague I: Blood (第一灾 · 血灾)

**Story**: Jakob returns to Paradise Island after his mother's death, finding the lake turned to blood. He must solve puzzles across three areas to purify the stream and complete the first plague.

**Sections**:
1. **Beach** - 打开船上的插销盒，制作鱼竿，捕虾并用虾打开天堂门
2. **Forest** - 与玛格丽特互动，点开盘中的虾取出水蛭，取得水壶，在水泵灌血，把血倒进木桶给山羊喝、倒进父亲的酒杯，四条水蛭喂猫头鹰取得钥匙并打开小屋
3. **Lake** - 与灵魂对话，拆开棺材取得黑方块，进入记忆，完成神殿水盆净化

**自动流程**：91 个可复现步骤，从总览开始直到结尾旗标 `plague1_complete`。

## 🛠️ Development

### Architecture

- **No build step**: Plain ES modules loaded directly
- **No external assets**: All textures drawn on canvas, models built from Three.js primitives
- **Three.js r170** vendored in `vendor/three/`
- **Target**: 60 fps on mid-range laptop iGPU

### Module Structure

```
src/
├── main.js              # Boot sequence
├── core/                # Engine, state, views, hotspots, items, UI, audio
│   ├── engine.js
│   ├── state.js
│   ├── views.js
│   ├── touch.js         # 触屏：虚拟摇杆、拖动转视角、触屏界面切换
│   ├── hotspots.js
│   ├── items.js
│   ├── ui.js
│   ├── audio.js
│   ├── tween.js
│   ├── context.js
│   └── debug.js
├── art/                 # Visual assets
│   ├── materials.js     # Toon shader, palette, textures
│   ├── layout.js        # World positions (single source of truth)
│   ├── sky.js
│   ├── lake.js
│   ├── island.js
│   ├── buildings.js
│   ├── characters.js
│   ├── props.js         # Props dispatcher
│   ├── props_beach.js
│   ├── props_inner.js
│   ├── props_lake.js
│   └── world.js
└── chapters/
    ├── index.js
    └── plague1/
        ├── index.js     # Chapter orchestration
        ├── text.js      # All Chinese strings
        ├── items.js     # Item definitions
        ├── beach.js     # ✅ Beach section (intro, beach puzzles)
        ├── forest.js    # ✅ Forest section (family, leeches, owl)
        └── lake.js      # ✅ Lake section (soul, coffin, temple, ending)
```

### Key Contracts

**Views**: Define camera positions and navigation arrows
```javascript
// 室外开放视图：进入后自由漫游，cam 是出生机位，方向箭头不显示
views.define({
  id: 'beach_mid',
  zone: 'exterior',
  cam: { pos: [0, 1.7, 44], target: [0, 2, 38], fov: 50 },
  back: 'overview',
  left: 'beach_left',
  right: 'beach_right',
  up: 'forest_path',
});
// 固定镜头（特写 / 室内 / fixed: true 的总览）：位置不动，鼠标小幅环视，▼ 或 S 返回
views.define({ id: 'boat_close', closeup: true, cam: { pos, target }, back: 'beach_right', look: 0.12 });
// 章节门禁：返回 true 的位置漫游时不能进入
views.addRoamGate((x, z) => !state.flag('gate_unlocked') && z < 40.6);
// 可以走动的室内：视图标 roam: true，再给这个区域定义走动范围（墙内侧边界 + 家具碰撞）
views.define({ id: 'house_int', zone: 'house_int', roam: true, cam: { pos: [300, 1.65, 2.3], target: [300, 1.3, -1.5] }, back: 'house_clearing' });
views.defineRoamArea('house_int', { bounds: [297.7, -1.6, 302.3, 3.0], circles: [[299.68, -0.82, 0.62]], boxes: [[300.78, -1.59, 301.62, -1.09]], eye: 1.65 });
// 全屏放大查看一张图（墙上的画）：从物体在屏幕上的位置放大，关闭时 resolve
await ui.viewImage(photo.snapshot(), { title: '艾兰德一家', from: photo });
```

**Hotspots**: Interactive objects with click handlers
```javascript
hotspots.define({
  id: 'gate_hand',
  views: ['gate_door'],
  object: gate.getObjectByName('hand'),
  cursor: 'pointer',
  onClick: async (ctx) => {
    await gate.handOut();
    ctx.setFlag('hand_out');
  },
});
```

**State Management**: Flags track puzzle progress, inventory holds items
```javascript
state.flag('gate_open');           // Read a flag
ctx.setFlag('gate_open', true);    // Set a flag
state.has('machete');               // Check inventory
ctx.give('machete');                // Add item (with pickup animation)
ctx.take('machete');                // Remove item
```

## 🧪 Testing

### URL Flags for Development

```
?autotest=1              # Boots without menu, ready for RLP.autoplay()
?debug=1                 # Show hotspot proxy boxes, log all clicks
?chapter=1&view=pump_clearing     # Jump directly to a view
&skipIntro=1             # Skip the rowing intro
&keep=1                  # Keep save state (don't reset)
&flags=gate_open,owl_level=3,rod=hook
&give=machete,jug,leech  # Start with items
```

### Debug Console (window.RLP)

```javascript
// Navigation
RLP.goto('beach_mid')              // 开放视图：把玩家放到该视图的机位
RLP.roamTo([0, 2, 45], [0, 1, 40]) // 漫游中把玩家放到某处并看向目标
RLP.key('1')                       // 模拟按键（键盘路径与玩家相同），可带 { hold: ms }
RLP.click('gate_hand')
RLP.use('shrimp', 'gate_shrimp')
RLP.combine('stick', 'line')

// Inspection
RLP.hotspots()           // List enabled hotspots in current view
RLP.views()              // All view IDs
RLP.state                // Current game state
RLP.drawCalls()          // Renderer stats

// Automation
RLP.autoplay()           // Run the full 80-step walkthrough
RLP.autoplay({ stepDelay: 50, shots: true })  // With screenshots
```

### Walkthrough Steps

Each chapter part exports a `walkthrough` array. Steps can be:
```javascript
{ go: 'viewId' }                    // Navigate to view
{ click: 'hotspotId' }              // Click hotspot
{ use: 'itemId', on: 'hotspotId' } // Use item on hotspot
{ combine: ['itemA', 'itemB'] }    // Combine items
{ inspect: 'itemId', part: 'name' }// Inspect item part
{ expectFlag: 'flagName' }         // Assert flag is set
{ expectItem: 'itemId' }           // Assert item in inventory
{ wait: 500 }                      // Wait milliseconds
```

## 🎨 Visual Style

### Landscape
- **Painterly realism**: Pale misty sky, layered blue-grey mountains, yellow-green meadows, grey-silver lake
- **Materials**: `flat()` and standard materials with canvas textures
- **Low contrast**, desaturated palette

### Characters & Props
- **Flat cartoon** with thick black ink outlines
- **Materials**: `toon()` with 3-step gradient + `OutlineEffect`
- **Faces**: Canvas-painted with heavy-lidded eyes, dark under-eye lines
- **Proportions**: Slightly cartoonish, big heads ≈ 1/5.5 height

### Color Palette
```javascript
PALETTE = {
  blood: '#8a1c1c',        // Deep blood
  bloodFresh: '#a3282a',   // Fresh blood
  bloodDark: '#5e1414',    // Dark blood
  bloodStain: '#a85a5a',   // Pinkish lake stain
  // ... see src/art/materials.js for full palette
}
```

## 📝 Implementation Status

### ✅ Completed
- Core engine (rendering, camera, outline effect)
- State management (flags, inventory, save/load)
- View system (navigation, transitions, arrows)
- Hotspot system (raycasting, interactions)
- Item system (models, icons, inspector, recipes)
- UI system (text bands, inventory, fade, menus, achievements)
- Audio system (ambience, music, SFX synthesis)
- 电脑 / 手机双端操作：电脑鼠标靠边转向 + WASD + 数字键物品栏；触屏虚拟摇杆 + 拖动转视角 + 点选物品栏、全屏、动态分辨率
- Art modules (sky, lake, island, buildings, characters, all props)
- Chapter: Plague I complete (beach, forest, lake sections)
- Full 80-step automated walkthrough

### 🚧 Future Work
- Plagues II-X (nine more chapters)
- Additional polish: particle effects, more ambient sounds
- Performance optimization for lower-end devices
- 手机竖屏专用布局（目前手机竖屏提示横过来）
- Achievements system expansion

## 🎯 Puzzle Solutions (Spoilers)

<details>
<summary>Beach Section</summary>

1. Go to boat → open bolt box (click both bolts)
2. Take machete, hook, line
3. Go to bamboo → cut with machete → get stick
4. Go to fruit → chop 5 times with machete → get worm
5. Combine: stick + line → 系着线的竹竿；+ hook → 鱼竿；+ worm → 挂好鱼饵的鱼竿（物品栏里是同一格，图标逐步变化）
6. Select the baited rod and click the lake in front of the beach → catch shrimp (the rod is used up)
7. Pick up shrimp from blood pool
8. Go to gate → pull hand out → open upper hatch → open lower hatch
9. Use shrimp on lower hatch → gate opens

</details>

<details>
<summary>Forest Section</summary>

1. Talk to Margaret → click nose 6 times → get leech
2. Enter the house (walk around inside) → click the two paintings to view them full screen
3. Click the plate → top-down close-up → click the prawn: it splits and a leech crawls out → click the leech
4. Cabinet: slide both bolts → open → take jug
5. Go to pump → use jug on pump → it fills with blood and comes back as "jug of blood" (no jug left on the pump)
6. Go to the goat → use jug of blood on the wooden bucket next to it → goat drinks, a leech sticks to its tongue → click the goat to take it (the empty jug stays in the inventory)
7. Refill the jug at the pump → back in the house use jug of blood on the father → he drinks from his glass → click the leech left in the glass (empty jug stays)
8. Go to owl totem → feed 4 leeches → get key
9. Go to shed door → use key on padlock → slide bolt → open doors (the soul behind it only appears after the shed is open)

</details>

<details>
<summary>Lake Section</summary>

1. Talk to soul twice → soul vanishes
2. Go to blood pool → click to summon coffin → click again to enter the coffin close-up
3. Click all 6 nails in the close-up → coffin opens → take black cube
4. Click coffin to enter memory vision → view scene → exit
5. Go to lakeshore → click temple door
6. Enter temple → go to holder → open wings
7. Insert black cube → close wings
8. Go to font → click water → see reflection
9. Go back to holder → click to lower it
10. Go to painting → click to light it → lake purifies
11. Click frogs → frame them → ending sequence

</details>

## 📄 License

Fan project for educational purposes. Original *Rusty Lake Paradise* © Rusty Lake.

## 🙏 Credits

- **Original Game**: Rusty Lake
- **3D Recreation**: Built with Three.js r170
- **Engine Architecture**: ES modules, no build step, canvas-only textures
- **Implementation**: All gameplay logic, puzzles, and interactions

---

**Last Updated**: 2026-10-07
**Status**: Plague I complete, playable end-to-end
