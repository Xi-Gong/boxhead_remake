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
- **联机合作独立成长**：两人各自计分、永久升级与强化武器；顶部两侧显示等级和经验，中间显示波次及剩余敌人数。
- **恶魔补给**：蓝色护甲箱与军绿弹药箱各有辨识。护甲叠在绿色血条上，先承伤，减少后露出血量；拾取不补血，也不影响正常回血。弹药箱补满所有已有武器。
- **四档生存难度**：调整刷怪节奏与敌人速度上限，保留原版敌人血量、伤害和每波总量，让成长与推进更有反馈。
- **合作武器箱**：阵亡玩家掉落武器与剩余弹药，可拾取恢复。

[完整功能说明](docs/features_zh_cn.md) · [平衡与性能验收](docs/verification/v0.2.8/README.md)

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
