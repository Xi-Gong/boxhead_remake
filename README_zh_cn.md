# Boxhead: 2Play Rooms — 1:1 现代复刻

![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Electron](https://img.shields.io/badge/app-Electron-9feaf9?logo=electron&logoColor=black)
![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen)

[English README click here](README.md)

## 简介

把 Sean Cooper 的 2007 年 Flash 经典 **Boxhead: 2Play Rooms** 用 **TypeScript + Canvas2D + Electron**
重新带到现代平台。逐类移植 AS2，保留原版美术、声音与游戏逻辑，加入 2 倍光栅化、存档、手柄和局域网联机。
有意调整的内容见 [PARITY.md](PARITY.md)。

<p align="center"><a href="assets/readme/menu.png"><img src="assets/readme/menu.png" alt="主菜单" width="640"></a></p>

## 快速开始

**Windows 便携版：** 在 [Releases](https://github.com/Xi-Gong/boxhead_remake/releases/latest) 下载单文件 exe，双击即可游玩。
**[v0.3.4正式版](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.3.4)** 新增 A/Y 长按绑定武器、空弹武器选择、独立附魔耐久与续航成长，修复护甲箱满补，并重做结算卡片和属性窗口。新版移除冲锋僵尸，适度强化原生恶魔 Boss。见[发行验证记录](docs/verification/v0.3.4/README.md)。
存档与设置统一保存在 `%USERPROFILE%\.boxhead`。

**从源码运行：**

```bash
npm install
npm run dev         # 浏览器：http://localhost:5173/
npm run dist        # Windows 便携版：release/Boxhead 2Play Rooms-<版本>-portable.exe
```

首次打包会下载工具链；需要代理时设置 `NODE_USE_ENV_PROXY=1`。

<p align="center"><a href="assets/readme/gameplay.png"><img src="assets/readme/gameplay.png" alt="新版战斗、A/Y 绑定、轻护甲与附魔耐久" width="640"></a></p>

## 操作

| 动作 | 玩家 1 | 玩家 2 |
|---|---|---|
| 移动 | 方向键 | W A S D |
| 射击 | `/`（单人也可空格） | 空格 |
| 换武器 | `.` / `,` | E / Q |
| 选武器（仅单人） | 数字键 1–0 | — |
| 结算时查看属性 | Tab（可改键） | R（可改键） |

`P` 暂停，`F11` 全屏，右键调整声音、画质和渲染清晰度。
手柄：摇杆/方向键移动，B/LT/RT 射击，LB/RB 换枪，START 暂停。现代 PvE 中短按 A/Y 切换绑定武器，长按 0.8 秒绑定/解绑当前武器；菜单和结算中 A 确认，X 仅在关卡结束时查看属性。本地双人同时查看两人，联机各自只查看本人、独立开关。

## 超越原版的功能

- **存档、续玩与重试**：继续已存对局、从失败波次重试，也可选择历史到达过的起始波次。
- **局域网合作与对战**：桌面版支持发现房间、输入 IP 加入、回滚预测和断线恢复。
- **限时无尽生存**：清完有限敌群可提前过关，也可存活到普通关80～105秒时限；每5关额外30秒，随进度出现1～3只Boss，各有一条紧凑头顶生命条，统一计入DEVIL。Boss关同时最多两只普通援军。
- **波间构筑与属性页**：原版漫画风纸面窗口、清晰大图标、收益和精确预览；无倒计时，双方确认 READY 后继续，击败全部 Boss 奖励翻倍。X 与实际键盘查看键始终有提示。
- **分段无限成长**：前期升级快，后期经验门槛逐级升高；125级后继续提升生命、护甲、武器伤害和携弹量；选关随历史进度突破100波，按地图时长配给基础等级与构筑。旧档保留已得成长和经验曲线，读档时立即采用新战斗规则。
- **原生敌群与 Boss**：普通关仅原版僵尸和火球小红；取消冲锋僵尸及额外 50% 掉箱。恶魔 Boss 移速/攻速/伤害适度提升，关闭恶魔时使用无冲锋技能的僵尸 Boss。
- **附魔耐久与续航成长**：伤害+15%、普通子弹额外贯穿一个目标。附魔按发射次数消耗耐久，空弹仍保留；紫箱补满耐久，普通补弹不恢复。紫色细条显示余量，等级与“附魔续航”卡片提升上限。
- **轻护甲与四类补给**：初始 160 血/40 甲、护甲初始为空，使用独立青色细条；每个护甲箱有效拾取后直接补满。医疗、护甲、附魔、弹药箱各25%，满状态留给队友。
- **操作与舒适度**：直接输入已解锁波次，房主可调整房间规则；减弱爆炸闪光，并自动恢复异常音频。
- **四档生存难度**：保留各档节奏、并发和速度限制，敌人随波次变强；普通关有限敌群提供提前清关目标，到时仍可生存过关，旧端保留其支持的关卡规则。
- **战斗美术精修**：五种持枪模型、暖色子弹、冷青轨道射线、分面火箭与对应附魔效果；Boss血条匹配保留的原有模型比例，玩家血条保持原设计。
- **补给与界面更稳定**：补弹保留武器箱继承容量，P1/P2确认拾取白字稳定等距，大厅条件按钮分行排布。
- **快捷武器与合作武器箱**：解锁后零弹也可切换并绑定；A/Y 标记显示快捷键，长按显示绑定/解绑进度。阵亡武器箱保留弹药及附魔耐久，合并不会叠加复制耐久。

[完整功能说明](docs/features_zh_cn.md) · [v0.3.4发行验证](docs/verification/v0.3.4/README.md) · [v0.3.2验证](docs/verification/v0.3.2/README.md)

<p align="center"><a href="assets/readme/upgrade-cards.png"><img src="assets/readme/upgrade-cards.png" alt="新版结算卡片、收益预览与属性查看按键" width="640"></a></p>

<p align="center"><a href="assets/readme/coop-stats.png"><img src="assets/readme/coop-stats.png" alt="本地双人共同查看 P1/P2 属性" width="640"></a></p>

<p align="center"><a href="assets/readme/boss.png"><img src="assets/readme/boss.png" alt="原生火球恶魔 Boss 与紧凑生命条" width="640"></a></p>

<p align="center"><a href="assets/readme/coop-crate.png"><img src="assets/readme/coop-crate.png" alt="合作武器回收" width="640"></a></p>

<p align="center"><a href="assets/readme/lan-growth.png"><img src="assets/readme/lan-growth.png" alt="联机 P2 独立查看本人属性，P1 已准备" width="640"></a></p>

<p align="center"><a href="assets/readme/devil-supplies.png"><img src="assets/readme/devil-supplies.png" alt="医疗、护甲、附魔和弹药四类补给" width="640"></a></p>

## 开发

```bash
npm test
npm run typecheck
npm run build
npm run extract      # 从原始 SWF 重新生成仓库中的素材
```

`src/engine/` 实现 Flash API，`src/game/` 保存原版移植，`tools/` 提供素材提取与 AVM1 工具。
标准构建直接使用仓库素材；开发服务器中的 `gallery.html` 可以浏览原版元件。
参见[工程约定](docs/CONVENTIONS.md)和[文档目录](docs/README.md)。

## 资产声明

***原版 Boxhead: 2Play Rooms © Sean Cooper（2007），Crazy Monkey Games 赞助。提取素材仅供学习研究，
请勿商用。本复刻为爱好者项目，与原作者无隶属关系。***

[原作者](https://www.seantcooper.com/) · [问题与 PR](https://github.com/Xi-Gong/boxhead_remake)
