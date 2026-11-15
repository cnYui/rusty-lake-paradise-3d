本批素材对应 2026 年 11 月 15 日的天堂岛原作参照重建。运行项目后打开本目录 index.html，可以筛选、旋转查看正式工厂并下载 GLB。这里有 54 个道具工厂的当前外观，涉及第三、五、六、七、八、九、十灾；不表示游戏全部道具都已重建。

models/ 保存由正式工厂导出的 GLB、PNG 缩略图、尺寸与 SHA256。羽毛拍按羽毛束、缠绳与木柄制作，蜗牛使用连续封闭壳体，双壳保留开合与收取状态。第六灾使用空心标本瓶、六层配药烧瓶、有机心脏与圆形发条心；工具、蔬果、曼陀林、灯笼和骨骼也在逐件清单中。第十灾木头猫头鹰按展开的木梁结构重建。

源码在 src/art/props_p*.js、reference_items.js、reference_furniture.js、reference_hearts.js、skulls.js 和 deer_skull_mesh.js。GLB 是默认状态的交换素材，材质转换为标准材质以便 Blender 等软件打开；游戏的卡通描边、动画、开合、配药、拾取等仍由工厂状态方法负责。p6_chest 导出的是附在病人身上的疹子与伤口机关，人体继续复用游戏人物模型。人物 rlpm 与贴图没有改动。

sculpt/ 保留共用鹿头骨的 Blender 源文件、交换 GLB 和构造骨面 source.json；运行时使用量化网格，质量结果在 verification/skull_mesh.json。对应离线建模流程随旅馆同批提交保存，骨面与源文件 SHA256 可直接核对。

scenes/ 是最新主线的实际游戏机位；发条心装入胸口的截图来自自动路线执行到装入步骤后的真实状态。verification/ 有七章自动路线、第六灾完整鼠标/键盘、读档与触屏模拟、第三灾四次真实点击和 GLB 重新载入结果；触屏模拟不代表实体手机验收。

原作参照来自 https://www.bilibili.com/video/BV1bo4y1y7fm/ 的 P01..P10 完整实况与 https://www.rustylake.com/walkthroughs/rusty-lake-paradise/ 。references/P01..P10.jpg 和 P06_hearts.jpg 是用于核对的抽帧，原视频不入库。原作角色与设计归 Rusty Lake；本目录记录项目重建来源，不另授予原作权利。

导出：python dev/common/export_remodel_models.py --project paradise。重新载入：python dev/common/verify_exported_models.py。构建审阅页：python dev/common/build_remodel_review.py。GLTFExporter 和验收用 GLTFLoader 来自 Three.js r170 官方文件，与本项目的版本一致；许可在 vendor/three/LICENSE。
