# 开放世界相机与初始进度

## 需求

保留远处天堂岛总览和点击门后的拉近过程；拉近完成后使用完整自由相机。鼠标移动直接改变第一人称视角，点击热点或室外区域切换不应把相机拉回旧固定机位；刷新后从初始进度开始。

## 实现

- `src/core/views.js`：室外普通视图之间切换时保留漫游相机位置和 yaw/pitch；仅进入室内、谜题特写或其他非开放世界区域时退出漫游并使用固定镜头。
- `src/core/views.js`：鼠标移动直接按左侧游戏画布像素增量累计 yaw/pitch，不要求按住鼠标，水平旋转无角度上限。
- `src/core/main.js`：启动时清除旧章节存档与成就，避免旧版固定视角状态继续生效。
- WASD/Shift 仍受岛屿边界和天堂门禁约束。

## 验证

- `node --check src/core/views.js`
- `node --check src/main.js`
- `node --check src/core/state.js`
