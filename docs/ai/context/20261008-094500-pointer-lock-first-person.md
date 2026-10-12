# Pointer Lock 第一人称相机

## 术语

本次相机方案采用 `Pointer Lock API`（鼠标指针锁定）和 `First-Person Camera`（第一人称相机）。这是 Minecraft、第一人称射击游戏和许多 3D RPG 常用的鼠标视角模型。

## 实现

- 删除拖拽累计旋转逻辑，不再使用按住鼠标拖动来改变镜头。
- 点击左侧游戏画布后请求 Pointer Lock，浏览器将鼠标隐藏并锁定在画布中心。
- 使用 `movementX/movementY` 读取相对鼠标位移，持续更新 yaw/pitch；鼠标本身不离开屏幕中心。
- Pointer Lock 期间自由模式仍可通过画布点击触发热点，室外热点不再触发旧的拖拽切换视图。
- Esc 或进入室内/特写时退出 Pointer Lock。
