# 口袋方舟 H5：第一、二、三灾包与移动端适配（2026-10-21）

## 起因

口袋方舟（233 乐园）创作者后台里，“锈湖天堂岛3D” v1.0.0（2026-10-14 提审，上传的是小红书小工具包）状态是“审核拒绝”：版本时间线只有“开发者提审 → 资源审核 → 游戏审核 → 审核失败（14:30:55）”，后台没有任何文字原因；官方人员口头反馈“移动端适配有问题”。验收依据是《通用低端机 H5 兼容要求》（Android 8 / Chrome 60 WebView、iOS Safari、PC Chrome、720px 级屏幕、窄屏、矮屏横屏、安全区、不许横向滚动、不许 UI 被裁切、不许坐标偏移、稳定运行优先于画质）。本次目标是“当前发布第一、二、三灾”。

## 判断（推测，原因没被平台证实）

上一版是小红书壳：`rotate.js` 假定容器永远竖屏，窗口是竖的就把画面转 90° 并改写 `MouseEvent` / `Touch` 的坐标读数和 `getBoundingClientRect`，还用 `minitool.css` 把游戏自带的竖屏旋转提示隐藏。放进本来就是横屏的口袋方舟 WebView 里，这些补丁没有用处、只增加风险；全项目也没有任何 safe-area 处理；标题菜单文字、章节按钮、齿轮这些按 em 算的按钮在 720px 宽屏幕上只有 24～38 CSS 像素。

## 改动

- `dev/minitool/build.py` 新增 `--ark`：等同声音版 `--release`（ES2017，两道闸门），输出 `dev/minitool/dist-ark-ch123/`，zip 默认 `upload/ark/rusty-lake-ark-ch123.zip`。章节：第一、二、三灾开放，第三灾在副本里去掉 `wip`、加 `requires: 'plague2'`，第四、五灾 `load` 置空；第三灾 `setup` 也分段让出一帧。不加 `--ark` 时输出与改动前逐字节相同（除 `rotate.js` 本身，见下）。
- `dev/minitool/rotate.js`：`window.__RLP_NOROT`（`ark_cfg.js` 设置）为真时不旋转、不改事件坐标和元素矩形读数，并把 `#rot` 的 safe-area padding 从可用宽高里扣掉；没设置时行为不变。
- `dev/minitool/ark.css`（新）：`#rot` 加 `constant()` / `env(safe-area-inset-*)` padding，html/body 不滚动，触屏界面用伪元素把菜单文字、章节按钮、齿轮、关闭叉、面板按钮的可点区域撑到至少 44×44 CSS 像素（外观不变）。包里去掉 `minitool.css` 的 `.rotate-hint { display: none !important; }`，竖屏由游戏自带的“请把手机横过来游玩”提示。
- `dev/minitool/compat.js`：补 `Object.fromEntries`（Chrome 73）。`cast.js` 模块顶层、第三灾的 `cast_p3.js`、`props_p3_placeholders.js`、`forest.js`、`grove.js`、`temple.js` 直接调用，Chrome 60 上没有它会在建世界时抛 TypeError。
- `dev/minitool/build.py`：删掉第四灾 `生与死的炼金术` 的“死→S”补丁——`29336f3` 之后这个字符串已不在 `plague4/text.js` 里，补丁的断言让 `build.py` 在任何模式下都跑不过；第四灾不进任何包。
- `dev/minitool/test_ark.py`（新）：ark 包的 Playwright 验收，见下。

## 验证

- `python dev/minitool/build.py --ark`：`es2017_check` [语法] 0 处，css [布局] 0 处，7 个文件 0.54 MB；`game.js` 含 `p3_grove`、不含 `p4_crab`；`index.html` 脚本顺序 compat → ark_cfg → rotate → audio_out → game。
- 非 ark 的 `--release` 前后对比：`audio_out.js` / `compat.js`（改前对比）/ `game.js` / `index.html` / `style.css` 逐字节相同，只有 `rotate.js` 不同。
- `MINITOOL_DIST=<dist> python dev/minitool/test_ark.py --full`（最严容器 CSP、SwiftShader）：横屏 720×360 / 640×360 / 812×375 / 1280×720 无滚动、不旋转、舞台与画布在视口内、无 CSP / 页面错误 / 请求失败 / 外部请求；刘海 padding 模拟（左右 44、底 21）下舞台在安全区内；竖屏 375×812 / 390×844 显示旋转提示；章节解锁（空档 / 通关第一灾 / 通关第一二灾 / `?unlock=1`）；真实触摸点菜单、进漫游、摇杆、转视角；重开章节监听器不增长；切后台再回来仍在渲染；第一、二、三灾 `RLP.autoplay()` 分别 91 / 160 / 267 步全部通过。
- 首轮测试发现标题菜单文字实际只有 24～46 px，这是上面 ark.css 点击区域那一条的来源。

## 没验证 / 风险

- 没有真机（Android 8 / iOS）验证，也没在口袋方舟的“游戏测试”里扫码测过；Chrome 60 是靠 es2017 闸门 + compat 垫片推断，没有真的在 Chrome 60 里跑。
- 平台没给文字原因，“适配问题”是否就是旋转壳 / 点击区域 / 安全区无法确认。
- 第三灾画面比第一、二灾重，低端机帧率未实测。

## 提审记录（口袋方舟后台）

- 1.0.1（2026-10-21 16:49 提审，包 `rusty-lake-ark-ch123-20261021.zip`，名称“锈湖天堂岛3D”）：17:42 “审核失败”，后台时间线没有任何文字原因。
- 1.0.2（2026-10-21 19:02 提审，**同一个 ZIP**，用户明确要求再提审一次）：游戏名称改为“锈湖天堂岛3D（玩家自制）”（二创 / 自制要写在名字里），更新记录写明玩家自制的同人二创、未获授权、程序化重制、免费无内购无广告；营收方式改成“无变现”（页面一直显示“有变现”但内购 / 广告都没勾，自相矛盾）。状态“审核中”，用户说会找审核老师快速过审。结果以后台为准，这里不记结果。
- 操作要点（Claude in Chrome）：ZIP 和截图的上传框没有现成的 `<input type=file>`，点上传框时组件才动态创建；先在页面里把 `HTMLInputElement.prototype.click` 改成“遇到 file 类型就挂到 body 并不弹对话框”，再 `find` 出这个 input 用 `file_upload` 传。截图 5 张 5 MB 上传时页面会卡几十秒、期间截图会超时，用脚本查 `img` 的 src 确认。“构建新版本”按钮在版本管理页；提审要点“提交审核”再点弹窗里的“确认提审”；成功后不要点“发布公告”。表单只存在页面里，标签页组一关就丢，但提审后的版本会留在版本列表。
