# Boxhead: 2Play Rooms — 1:1 现代复刻

![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Electron](https://img.shields.io/badge/app-Electron-9feaf9?logo=electron&logoColor=black)
![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen)

[English README click here](README.md)

## 简介

把 2007 年的 Flash 经典 **Boxhead: 2Play Rooms**（作者 Sean Cooper）从原始 SWF 逆向后用
**TypeScript + Canvas2D + Electron** 一比一复刻：数值、状态机、时序、画面布局乃至原版的小怪癖都完全保留，
同时带来 2 倍分辨率光栅化、本地存档、手柄和局域网联机。

![主菜单](assets/readme/menu.png)

- **逐类移植**：原版 114 个 ActionScript 2 类逐文件移植为 TypeScript（`src/game/`），源码里的 `[BC]` 注释可回溯到 SWF 字节码偏移。
- **自写反混淆器**：原 SWF 做过控制流平坦化混淆，ffdec 反编译结果错误百出——本项目自写 AVM1 反汇编器，所有可疑代码按真实字节码还原。
- **原汁原味**：美术、字体、音效由本项目自研提取器直接从原版 SWF 提取（无需 Java / ffdec），并且**已提交进仓库**——标准构建完全不碰 SWF。仓库内真 Flash Player 跑注入探针实测 for..in 顺序、滤镜像素等细节，作为测试金标准。

![对局](assets/readme/gameplay.png)

## 快速开始

**Windows 便携版（推荐）**

```bash
npm install
npm run dist        # 生成 release/Boxhead 2Play Rooms-<版本>-portable.exe
```

双击单文件 exe 即可游玩（存档在 exe 旁的 `Boxhead2PlayRooms-data/`）。首次打包需联网下载工具链，
失败时在命令前加 `NODE_USE_ENV_PROXY=1`；未签名 exe 首跑的 SmartScreen 提示选"仍要运行"。

**浏览器**

```bash
npm install
npm run dev         # http://localhost:5173/
```

## 操作

| 动作 | 玩家 1 | 玩家 2 |
|---|---|---|
| 移动 | 方向键 | W A S D |
| 射击 | `/`（单人也可空格） | 空格 |
| 换武器 | `.` / `,` | E / Q |
| 选武器（仅单人） | 数字键 1–0 | — |

`P` 暂停，`F11` 全屏，右键菜单可调声音 / 画质 / 渲染清晰度。全程支持手柄（摇杆移动、RT/A 射击、START 暂停），
键位可在选关界面改。

## 超越原版的功能

![协作死亡武器箱](assets/readme/coop-crate.png)

- **存档与重试**：暂停界面 **SAVE & QUIT** 随时存档退出，主菜单 **CONTINUE** 从存档波次续玩；死亡后 **RETRY** 从失败波次重开（有检查点用波次开局检查点，没有则回到本局起始波；分数/武器按原版重试语义重置）。
- **协作死亡武器箱**：Coop 里玩家死亡时原地掉落红箱，内含其背包全部武器与实际剩余弹药；本人拾取精确还原，队友拾取取两者较优。
- **起始波次选择**：选关界面 `START WAVE` 循环器可选 1–100 波开局，按原版难度锚点配给"打到该波次应有的"武器与升级。
- **局域网联机**（仅便携版）：建房 + 自动发现或输 IP 加入，锁步校验的合作与对战模式，断线 30 秒自动重连 + 检查点无缝续局（每方向约 2–4 KB/s）。

全部 23 条偏差登记在 [`src/game/deviations.ts`](src/game/deviations.ts) 并收录于 [`PARITY.md`](PARITY.md)：
赞助商内容（CMG Logo、在线排行榜、外链）改为本地高分；任意刷新率下保持原版 50fps 逻辑。

## 开发

```bash
npm test             # 单元 + 无头模拟（含 Flash 实测金标准对比）
npm run typecheck
npm run build        # 渲染器构建（素材提取在有效时自动跳过）
npm run extract      # 从 assets/boxhead_2play_rooms.swf 重新生成 public/assets
```

布局：`src/engine/` Flash API 子集 + 显示列表播放器 + 平台层；`src/game/` 原版类移植；`tools/` SWF 提取与
AVM1 工具链；`tests/` 单元 / 模拟 / 真机 playtest；`assets/` 原版 SWF 与参考 Flash Player。工程规则见
`CONVENTIONS.md`；`gallery.html`（`npm run dev` 后访问）可浏览原版 SWF 的任意元件。

## 资产声明

***原版 Boxhead: 2Play Rooms © Sean Cooper（2007），Crazy Monkey Games 赞助。仓库内素材由原版 SWF 提取，
仅供学习研究，请勿商用。本复刻为爱好者项目，与原作者无隶属关系。***

## 联系

- 原作者：[seantcooper.com](https://www.seantcooper.com/)
- 问题与 PR：[github.com/Xi-Gong/boxhead_res](https://github.com/Xi-Gong/boxhead_res)
