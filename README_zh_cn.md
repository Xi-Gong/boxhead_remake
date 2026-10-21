# Boxhead: 2Play Rooms — 1:1 现代复刻

![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Electron](https://img.shields.io/badge/app-Electron-9feaf9?logo=electron&logoColor=black)
![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen)

[English README click here](README.md)

## 简介

把 Sean Cooper 的 2007 年 Flash 经典 **Boxhead: 2Play Rooms** 用 **TypeScript + Canvas2D + Electron**
重新带到现代平台。逐类移植 AS2，保留原版美术、声音与游戏逻辑，加入 2 倍光栅化、存档、手柄和局域网联机。
有意调整的内容见 [PARITY.md](PARITY.md)。

<p align="center"><img src="assets/readme/menu.png" alt="主菜单" width="640"></p>

## 快速开始

**Windows 便携版：** 在 [Releases](https://github.com/Xi-Gong/boxhead_remake/releases/latest) 下载单文件 exe，双击即可游玩。
**[v0.3.3正式版](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.3.3)** 将PvE精简为原版僵尸、冲撞僵尸和原版火球小红，取消敌方护甲，调整玩家成长、附魔与补给选择，旧档立即迁移。完整结果见[发行验证记录](docs/verification/v0.3.3/README.md)，包含四档难度真实输入提前过关证据。
存档与设置统一保存在 `%USERPROFILE%\.boxhead`。

**从源码运行：**

```bash
npm install
npm run dev         # 浏览器：http://localhost:5173/
npm run dist        # Windows 便携版：release/Boxhead 2Play Rooms-<版本>-portable.exe
```

首次打包会下载工具链；需要代理时设置 `NODE_USE_ENV_PROXY=1`。

<p align="center"><img src="assets/readme/gameplay.png" alt="对局" width="640"></p>

## 操作

| 动作 | 玩家 1 | 玩家 2 |
|---|---|---|
| 移动 | 方向键 | W A S D |
| 射击 | `/`（单人也可空格） | 空格 |
| 换武器 | `.` / `,` | E / Q |
| 选武器（仅单人） | 数字键 1–0 | — |

`P` 暂停，`F11` 全屏，右键调整声音、画质和渲染清晰度。
全程支持手柄（摇杆移动、RT/A 射击、START 暂停），选关界面可以改键。

## 超越原版的功能

- **存档、续玩与重试**：继续已存对局、从失败波次重试，也可选择历史到达过的起始波次。
- **局域网合作与对战**：桌面版支持发现房间、输入 IP 加入、回滚预测和断线恢复。
- **限时无尽生存**：清完有限敌群可提前过关，也可存活到普通关80～105秒时限；每5关额外30秒，随进度出现1～3只Boss，各有一条紧凑头顶生命条，统一计入DEVIL。Boss关同时最多两只普通援军。
- **波间构筑**：每人从攻击、防御、功能三张卡中选择，再明确确认READY，无倒计时；击败全部Boss使本次奖励翻倍，本局强化累计。
- **分段无限成长**：前期升级快，后期经验门槛逐级升高；125级后继续提升生命、护甲、武器伤害和携弹量；选关随历史进度突破100波，按地图时长配给基础等级与构筑。旧档保留已得成长和经验曲线，读档时立即采用新战斗规则。
- **精简敌群**：只保留原版僵尸、预警冲撞僵尸和原版火球小红，Boss也仅冲撞型与小红；所有敌人取消护甲。玩家基础生命160、护甲容量60且初始为空，分别采用更低成长。
- **紫色附魔箱**：附魔当前手持武器，伤害+15%、普通子弹额外贯穿一个目标。弹药耗尽前，补弹、升级和切枪都保留附魔，弹药文字持续显示紫色；耗尽后再补弹不会恢复附魔。
- **四类恶魔补给**：医疗、护甲、附魔、弹药箱各25%，保留至有效拾取；普通红箱仅补给已解锁武器，地面仍定时补充随机红箱。
- **操作与舒适度**：直接输入已解锁波次，房主可调整房间规则；减弱爆炸闪光，并自动恢复异常音频。
- **四档生存难度**：保留各档节奏、并发和速度限制，敌人随波次变强；普通关有限敌群提供提前清关目标，到时仍可生存过关，旧端保留其支持的关卡规则。
- **战斗美术精修**：五种持枪模型、暖色子弹、冷青轨道射线、分面火箭与对应附魔效果；Boss血条匹配保留的原有模型比例，玩家血条保持原设计。
- **补给与界面更稳定**：补弹保留武器箱继承容量，P1/P2确认拾取白字稳定等距，大厅条件按钮分行排布。
- **合作武器箱**：阵亡玩家掉落武器与剩余弹药，可拾取恢复。

[完整功能说明](docs/features_zh_cn.md) · [v0.3.3发行验证](docs/verification/v0.3.3/README.md) · [v0.3.2验证](docs/verification/v0.3.2/README.md)

<p align="center"><img src="assets/readme/coop-crate.png" alt="合作武器回收" width="640"></p>

<p align="center"><img src="assets/readme/lan-growth.png" alt="联机合作独立成长" width="640"></p>

<p align="center"><img src="assets/readme/devil-supplies.png" alt="蓝色护甲箱与军绿弹药箱" width="640"></p>

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
