# 第一灾完整可玩化验证记录

## 本次实现

- 修正角色 rig 的挂载方式：`makeAnimal()` 和 `makeCharacter()` 返回 rig，场景节点统一使用 `.root`，并注册到核心逐帧更新器。
- 重做海滩流程：船上工具、竹棍和虫子、三次鱼竿组合、血湖捕虾、上下插销和手掌交互；未解锁大门时不能绕过机关进入森林。
- 补齐森林流程：玛格丽特鼻子互动、屋内盘虾取水蛭、柜门双插销取壶、水泵抽血、倒入桶、救山羊、父亲对白、猫头鹰四次喂食和小屋开门。
- 补齐湖区流程：灵魂对白、棺材六枚钉子、记忆场景、神殿内部道具分区、黑方块插入、喷泉倒影、翼盒下降、画作净化和青蛙收尾。
- 统一棺材钉子 API 的 1-based 编号，并让存档同步恢复关键动画状态。

## 验证证据

- `node --check src/chapters/plague1/{beach,forest,lake}.js` 通过。
- `python dev/shot.py "index.html?autotest=1" ... --js "RLP.timeScale=1000; return await RLP.autoplay({stepDelay:0,fast:true,stepTimeout:5000})"` 返回 `ok: true`、`steps: 76`、`failedStep: null`、`plague1_complete: true`。
- 关键画面截图：`dev/shots/plague1_boot3.png`、`dev/shots/plague1_beach_mid.png`、`dev/shots/plague1_coffin.png`、`dev/shots/plague1_restore.png`。
- 带完成旗标启动并跳转 `temple_int` 后，`RLP.info().zone` 为 `temple_int`，热点可见且 `RLP.errors` 为空。

## 已知限制

- 项目仍是无构建步骤的 ES module，需要通过 HTTP server 打开。
- Three.js 仍会输出 `toNonIndexed` 和 `flatShading` 两条库级 warning，不影响章节流程。
