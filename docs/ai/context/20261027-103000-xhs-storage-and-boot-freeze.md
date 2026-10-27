# 2026-10-27 小红书 V1.0.14 驳回排查：存档改用 Storage API、启动期着色器 / 画布卡顿（新包未上传）

## 起因
- 小红书小工具「锈湖·天堂岛」V1.0.14 被驳回：“小工具功能缺陷，可能是页面按钮无法点击，重点排查页面功能完整性”（V1.0.10、V1.0.11 同样原因，V1.0.9 通过）。另有玩家反馈“无法保存进度”。
- 用户提到的是“第五灾没过审”。**结论：V1.0.14 包里没有第五灾**——`build.py` 把第五灾的 `load` 置空（菜单显示“敬请期待”），包内 `game.js` 搜不到 `p5_skin` / `p5_table` 等第五灾代码，只有注册表和模型表里的 id；V1.0.14 是第一到第四灾 + 暂停面板“保存进度”按钮。所以没有在小工具包里跑第五灾。

## 基线
- V1.0.14 是直接从主目录工作区打的包（见 `20261026-110000-xhs-and-233-save-package.md`），用到的启动加速、`build.py` / `rotate.js` / `minitool.css` 补丁、第四灾 crab_board、第五灾 3D 重做等都没提交。
- 这次在 worktree `D:\CodeWorkSpace\rusty-lake-paradise-3d-xhsfix`、分支 `fix/xhs-storage-and-boot-freeze` 上做：第一个提交 `4fc793b` 原样收录这些工作区源码（不含测试截图、dist、zip）。从它 `git archive` 打出的 `game.js` 与 V1.0.14 **逐字节相同**（1,751,756 字节），后面的修复都基于它。主目录的未提交改动没有动。

## 根因（实测）
测量脚本 `dev/minitool/measure_longtasks.py`（新）：容器 CSP、390×844 竖屏、触摸、DPR 2、无头 Chromium + SwiftShader、CDP CPU 降速 3×，记录长任务、菜单出现时间、菜单出现后 N 秒真实触摸“成就”到面板出现的时间。
1. **着色器**：`build.py` 补丁里先 `renderer.compileAsync(exterior)`——SwiftShader（以及很多没有 `KHR_parallel_shader_compile` 的 WebView）里它等于一次性同步编译整个室外；接着 `__RLP_WARM` 只预热室外、最后整体渲染一次把室内 / 阴影 / 倒影变体全部同步编译。three 在程序第一次使用时的同步查询（`getUniforms` → `onFirstUse`）要等 GPU 进程链接完，主线程被卡 5~12 s。
2. **2D 画布**：`materials.js` 的 `canvasTexture` 等用默认 `getContext('2d')` 建的是 GPU 加速画布，大量绘制推迟到第一次上传贴图时在 GPU 进程里光栅化：插桩看到世界建好后的第一个 fence 等了 16.4 s（前面只链接了一个很简单的 SkyDome 程序）。这段时间主线程虽然空闲，点击也送不进页面。
3. `sky.js` 的 `makeRing` 一口气画 6 张 2048×1024 全景画布：3~4.5 s 长任务（V1.0.14 里也有）。
4. 存档只用 localStorage；小红书文档说容器不保证它可用 / 持久，应优先用 `window.xhs.miniTool` 的 Storage API（客户端 ≥ 9.46.0）。

## 改了什么（只改 `dev/minitool/`，网页版源码不动）
- `storage_xhs.js`（新，在 `game.js` 之前加载）：`window.__RLP_STORE`，和 localStorage 一样的同步接口。
  - 接管所有 `rlp3d.*` 键，例外 `rlp3d.boot`（rotate.js 的重载计数，必须同步）、`rlp3d.probe`、`rlp3d.wip`、`rlp3d.unlock`。
  - 可用条件：`window.xhs.miniTool` 的 4 个存储方法都是函数，且 `Math.floor(buildVersion/1000) ≥ 9460`（先读 `launchOptions.miniToolEnv.buildVersion`，没有再 `getLaunchOptions()`）；`window.xhs` 晚注入最多等 0.3 s。
  - 键名编码成只含字母数字下划线（非字母数字字符写成 `_` + 两位十六进制，`rlp3d.save.plague1` → `rlp3d_2esave_2eplague1`），`data` 是 `JSON.stringify(原始字符串)`。
  - 启动时 `getStorageInfo` + 并行 `getStorage` 读进内存；**整个初始化最多 1.5 s、单次调用最多 1.2 s**，超时 / 出错就按 localStorage 降级，`ready` 一定 resolve。
  - 每次启动和 localStorage 合并（老玩家存档不丢）：`rlp3d.save.*` 取 `savedAt` 新的，`rlp3d.profile` 的 `ach` / `cleared` 取并集（同一 id 保留较早的非 0 时间），`rlp3d.last` / `settings` / `achievements` 以 Storage 为准、没有才导入；localStorage 里的旧值保留作兜底。
  - 运行期：读内存；写内存 + 同步写一份 localStorage + 300 ms 合并后按 key 串行 `setStorage`；失败记 `failures`、`ok()` 变 false、键留着下次重试；切后台 / `pagehide` 立即写。
- `build.py`（只在小红书包里，口袋方舟包不带）：`state.js` 的 `lsGet / lsSet / lsDel / storageOk / wipeAll / migrateLegacy` 改走 `window.__RLP_STORE`，`storageOk()` 返回 `__RLP_STORE.ok()`（暂停面板“保存进度”、菜单的“不能保存”提示随之如实反映）；`audio.js` 的音量设置在存储就绪后再读一次；`main.js` 在读档案 / 画菜单之前 `await __RLP_STORE.ready`（最多 1.5 s）；设置面板说明改成“保存在小红书里（不支持时保存在这台设备上）”。
- 启动卡顿：
  - 删掉一次性同步编译的 `compileAsync`。
  - `rotate.js` 的 `__RLP_WARM`：每个 zone 单独可见（灯数和实际游戏一致），按材质逐组处理：先 `renderer.compile(物体)` 只发起链接，再用 WebGL2 `fenceSync` + `setTimeout` 轮询 `getSyncParameter`（不阻塞）等 GPU 进程做完，然后只显示这一组渲染一次，把阴影深度和水面倒影变体也编出来，再让出主线程。没有 `fenceSync` 时退回原来的同步做法。
  - 8 处大画布（`materials.js` canvasTexture、`props_inner.js`、`props_lake.js` ×3、`buildings.js`、`props_p3_grove.js` ×2）改 `willReadFrequently`，走 CPU 光栅化。
  - `makeRing` 改成 async，每张全景画布之间让出一帧。

## 前后数字（CPU 降速 3×、SwiftShader，各 4 次，点“成就”分别在菜单出现后 1 / 6 / 12 / 20 s）
| | V1.0.14（`dist-ch1234-save-20261026-release`） | 新包 |
| --- | --- | --- |
| 菜单出现 | 0.8~2.1 s | 0.75~0.83 s |
| RLP.ready | 31~43 s | 21.6~25.3 s |
| 最长长任务 | 9.5~12.5 s | 1.3~1.5 s（章节 setup） |
| 超过 1 s 的长任务 | 5~8 个，共 18.5~31.5 s | 1 个（就是上面这个） |
| 着色器程序 | 93 | 113（多出来的是室内 zone / 阴影 / 倒影变体，以前要等进了那个区域才卡一下编译） |
| 点“成就”→ 面板（脚本计时） | 0.28~2.4 s，取决于点的时候有没有撞上那几段长任务 | 0.31~3.5 s（见下） |

脚本计时包含两次 `page.evaluate` 的排队。另加了页内事件插桩：页面收到 `click` 后 10 ms 内面板就出现；剩下的延迟是点击排在当时正在跑的那段任务后面——世界搭建阶段每段 0.6~0.8 s，章节 setup 有一段 1.3~1.5 s。V1.0.14 撞上的是 9~12 s 的任务。

## 验收
- `node --test dev/plague*/test_plague*.mjs`：45/45。
- `python dev/common/test_progress_browser.py`：74/74。
- `python dev/minitool/test_storage_xhs.py`（新，模拟 `window.xhs.miniTool` 的 Promise 版 API：版本边界 / 同步异步取版本 / SDK 晚注入 / 键编码 / data 格式 / 例外键 / 挂起超时降级 / 迟到结果不采用 / setStorage 失败兜底与恢复 / 首次迁移与合并 / 游戏里从 xhs 读档、清空 localStorage 后重载仍读得到 / 没有 xhs 时行为不变 / 全失败时“保存进度”提示不说已保存）：开发包 39/39；正式包 39/39。
- `test_minitool.py`（正式包，容器 CSP + 竖屏旋转 + 真实触摸 + 无参数首页菜单 + 自动通关 + 慢设备启动 + localStorage 不可用）：108/108。

## 新包
- `upload/xhs-minitool/rusty-lake-minitool-ch1234-xhsstore-20261027-release.zip`：从提交 `bb5eaa6` 的 `git archive` 构建，7 个文件（多了 `storage_xhs.js`），593,687 字节，SHA256 `5594b6ac848c5ba53c6a89ad21ce651d6f1a305d046685d7d92da6f38d9e4b9b`。**未上传、未提交审核。**

## 还不确定
- 审核环境到底是真机还是模拟器、有没有 `KHR_parallel_shader_compile`，都不知道；SwiftShader 只是“慢 GPU”的代理，真机数字未测。
- 章节 setup（第一灾 forest / lake 的建模）还有一段 1.3~1.5 s 的同步任务，没拆：要拆就得改章节源码，按约定这次没动。
- 小红书 Storage API 只在模拟环境里测过，真机 / 平台模拟器没验证；key 编码是保守做法（文档没写允许的字符）。
- 存储初始化超时降级到 localStorage 的那一次，写入只进 localStorage；下次启动会按 `savedAt` / 并集合并回去，但“重新开始”或“重置进度”如果正好发生在降级的那一次，小红书存储里的旧档会在下次启动被合并回来。

## 提交（2026-10-27 15:50）
- 用户让我用 Chrome 插件上传；打开创作者中心时「锈湖 天堂岛」已经是 **V1.0.15 审核中**（提交时间 2026-10-27 15:50:07），用户确认是自己刚提交的。我没有上传、没有撤回、没有点发布。历史版本：1.0.15 审核中、1.0.14 未通过、1.0.13 生效中、1.0.12、1.0.11 未通过。审核结果以后台为准。
