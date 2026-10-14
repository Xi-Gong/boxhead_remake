# Boxhead: 2Play Rooms（僵尸危机3）— 1:1 现代复刻版

## 仓库布局

```
./                项目代码(TypeScript/Electron 复刻:src/ tools/ tests/ electron/ ...)
assets/           代码之外的全部资产
  boxhead_2play_rooms.swf   原版游戏 SWF(提取管线的数据源)
  projects/                反编译 AS2 源与 FLA(逻辑参照,assets/projects/boxhead4 为本作)
  flash_player/            对照测量用的历代 Flash Player(含 FP28/8)
  ClassicResources/        音频参照
  boxhead_series/          系列旧作收集
  僵尸危机/                 相关资料
  tools/                   仓库级辅助工具(BoxheadNightmareDecrypter)
```

代码与资产的路径关系集中在 `tools/paths.ts` 与 `tools/oracle/*`(flash_player)。

本项目把 2007 年的 Flash 游戏 **Boxhead: 2Play Rooms**（作者 Sean Cooper，CMG 赞助）从原始 SWF 逆向分析后，
用 **TypeScript + Canvas2D + Electron** 一比一复刻。支持单人、双人合作（Cooperative）和双人对战（Death Match，分屏）。

- 游戏逻辑：把原版 114 个 ActionScript 2 类**逐文件移植**为 TypeScript（`src/game/`），数值、状态机、时序和原版的小怪癖全部保留。
- 美术、字体、音效：构建时由自写的 SWF 解析器从原版 `boxhead_2play_rooms.swf` 直接提取（不需要 Java / ffdec），
  矢量图形在运行时按 2 倍分辨率光栅化，画面更清晰但布局、碰撞、时序与原版完全一致。
- 混淆处理：原 SWF 做了控制流平坦化混淆，ffdec 反编译结果有大量错误；本项目自写了 AVM1 反混淆反汇编器，
  所有可疑代码都按真实字节码还原（源码里的 `[BC]` 注释指向对应字节码偏移）。
- 对照测量：用仓库里的真 Flash Player 运行注入探针的 SWF，实测 for..in 顺序、排序、滤镜像素、坐标精度等细节，
  结果作为测试金标准（`tests/goldens/flash/`）。

> 仅供学习研究。原版游戏版权归 Sean Cooper 所有；本仓库不包含任何提取出的素材，素材在本机构建时从原版 SWF 生成。

## 运行

### 方式一：Windows 便携版 exe（推荐）
```bash
npm install
npm run dist          # 生成 release/Boxhead 2Play Rooms-<版本>-portable.exe
```
双击 `release/` 下的 exe 即可游玩（单文件，无需安装）。存档保存在 exe 同目录的 `Boxhead2PlayRooms-data/`。
首次打包需要联网下载 Electron 打包工具；如果下载失败，在命令前加 `NODE_USE_ENV_PROXY=1`（让 Node 使用系统代理）。
未签名的 exe 首次运行可能出现 SmartScreen 提示，选择“仍要运行”。

### 方式二：浏览器
```bash
npm install
npm run dev           # 首次会自动从 SWF 提取素材，然后打开 http://localhost:5173/
```

## 操作

| 动作 | 玩家 1 | 玩家 2 |
|---|---|---|
| 移动 | 方向键 ↑ ↓ ← → | W S A D |
| 射击 | `/`（单人模式下空格也可射击） | 空格 |
| 下一把武器 | `.` | E |
| 上一把武器 | `,` | Q |
| 直接选武器（仅单人） | 数字键 1–0 | — |

- `P` 暂停（暂停界面显示已解锁的升级列表）。
- 键位可以在选关界面的 “Controls” 窗口里改（与原版相同）。同一键盘双人时，部分键盘同时按下多键会有“鬼键”限制，属于硬件问题。
- `F11` 或 `Alt+Enter` 切换全屏；右键菜单可开关声音、切换画质，以及切换渲染清晰度（2x / 1x）。

### 手柄（v0.1.2 新增，标准映射）

| 动作 | 手柄 |
|---|---|
| 移动 | 左摇杆 / 十字键（8 方向，同键盘语义） |
| 射击 | RT、LT 或 A（按住） |
| 换武器 | RB（下一把）/ LB（上一把） |
| 暂停 | START |
| 菜单/暂停界面 | 左摇杆或十字键移动虚拟光标，A 点击；物理鼠标一动即交还 |

- 手柄 1 = 玩家 1，手柄 2 = 玩家 2（单人模式下手柄 2 也控制玩家 1）；可与键盘混用，改键后自动跟随。
- **输入徽标（v0.1.4）**：窗口左下角常驻 `KEYBOARD / PAD 1 / PAD 2` 芯片——亮起=已识别，绿色描边=刚刚使用的设备，
  手柄芯片上的 `→P1/→P2` 标出它操控谁（单人模式两只都显示 →P1）。**点击手柄芯片可互换两人的手柄归属**（手柄按
  系统枚举顺序自动分配，插反了点一下即可，不用重插）。没有手柄时会提示“按手柄任意键连接”（浏览器需按一次键
  才会识别手柄）。徽标 4 秒无操作自动淡化，不影响游戏点击。

### 存档与重试（v0.1.2 新增）

- 暂停界面 **SAVE & QUIT**：把本局进度（波次、分数、倍数、武器弹药、油桶/假墙/地雷状态）存进存档并回主菜单。
- 主菜单 **CONTINUE**：仅在有存档时出现，从存档波次重新开始（当前波重刷，波中怪物的位置不保留）。
- 死亡后 **RETRY**：从本波开局的检查点重试（分数/武器/倍数回到进波那一刻），不再从房间头清零。
- 单槽位：开新局或本局死亡即清空；存档仍与原版一样随身携带（exe 旁目录）。

### 局域网联机（v0.1.3 新增，v0.1.4 重构流程，仅便携版 exe）

- **流程（v0.1.4）**：主菜单 **LAN GAME** → ① 一台电脑 **CREATE ROOM** 建房（房间视图会显示双方状态与本机输入），
  另一台在 **JOIN A ROOM** 列表里点对方的房间加入（`名字 · 1/2 · WAITING`；满员或游戏中会置灰），列表搜不到时
  在下方输入对方 IPv4（支持 `192.168.1.5` 或带端口）点 **JOIN**；② 客机点 **READY**，主机看到双方就绪后点
  **START**；③ 双方进入**传统双人选人界面**——**由房主统一选择**模式（合作/死亡竞赛）、两人角色、地图（18 关）、
  难度与击杀数，客机同步镜像显示“等待房主”，房主点 **START GAME** 后双端开局。主机 = 玩家 1，客机 = 玩家 2。
- **手柄即插即用**：两台电脑各接各的手柄即可（本机任意键位/手柄都操控本地玩家）；左下角输入徽标和房间视图的
  “YOUR INPUTS”行可随时确认双方手柄已被识别，点徽标上的手柄芯片可互换归属。
- **断线读秒（v0.1.4）**：掉线后双方冻结，屏幕显示**每秒递减的 30 秒倒计时**，客机自动重连（首次立即重试）；
  重连成功从检查点（合作每波开始、死亡竞赛每约 60 秒）无缝继续；**倒计时归零后本局结束并回到主菜单**（联机局
  无持久存档，内存检查点保留），之后再进 LAN GAME 房间仍可 **RESUME GAME** 从检查点续局；主动在暂停菜单认输
  则照常进入结算画面。
- **虚拟局域网优化（v0.1.4）**：实测联机流量每方向仅约 2–4 KB/s（对 1–2 MB/s 的虚拟局域网带宽有几百倍余量），
  瓶颈在延迟——开局时主机按实测往返延迟自动提高锁步输入缓冲（约 60ms 延迟 → 2 tick，真实局域网保持 1 tick 不变），
  高延迟联机不再卡帧“等待对方”。
- 对战双方必须运行同一构建版本；首次联机 Windows 防火墙可能弹窗，允许访问专用网络即可。
- 联机中暂停会同时冻住双方（对方画面显示等待）；联机局不使用 SAVE & QUIT / RETRY（不允许单方重开）。

## 模式与玩法（与原版一致）
- **Single Play**：单人闯关，击杀僵尸/恶魔累积倍数（multiplier），倍数达到阈值解锁新武器与升级（UZI ×5、霰弹 ×10、油桶 ×15、
  手雷 ×20、假墙 ×30、地雷 ×40、火箭 ×50、遥控炸药 ×55、磁轨炮 ×70……共 58 项）。
- **Cooperative**：两人同屏合作，共享分数与升级，两人距离受限，倒下后在队友附近复活，两人都倒下才结束。
- **Death Match**：两人分屏对战，无怪物，开局解锁全部武器但只有手枪有弹药，先被击杀指定次数（5/10/20/50）的一方落败。
- 18 个房间（BOXY … BIG ONE），选项：难度、速度、恶魔开关、碰撞、友伤、对战局数——全部与原版相同。

## 与原版的差异（全部登记在 `src/game/deviations.ts`）
- 去掉了赞助商相关内容：CMG Logo、More Games、YouTube 预告、系列游戏推广按钮、外部链接、在线排行榜与统计上报。
- 主菜单 “Instructions” 改为本地说明页（原版会跳转到网站）。
- 高分改为本地保存（每个房间 × 模式前 10 名），沿用原版的计分资格规则（恶魔、碰撞、友伤全开才记录）。
- 所有房间默认解锁（原版在赞助商站点以外会锁定部分房间；现在原版的站点锁已因日期自动解除，效果相同）。
- 帧计时使用调度的 enterFrame 时间，在任何刷新率的显示器上都与原版 50fps/25Hz 逻辑一致。
- 画面默认按 2 倍分辨率光栅化（可在右键菜单切回 1x 原版像素）。

## 开发
```bash
npm run extract       # SWF -> public/assets（library.json、xsi.json、位图、音效）
npm run disasm        # 反混淆反汇编所有 AVM1 脚本 -> generated/disasm/、generated/reports/hotspots.md
npm test              # 单元测试 + 无头模拟（含 Flash 实测金标准对比）
npm run typecheck
npm run build         # 浏览器构建 + Electron 主进程
npm run dist          # 便携 exe；npm run dist:dir 生成免安装目录
```
- `gallery.html`（`npm run dev` 后访问 `/gallery.html`）：浏览 SWF 中的任意元件/帧。
- `CONVENTIONS.md`：工程结构、各模块职责与 AS2 → TS 移植规则。

### 目录结构
| 路径 | 内容 |
|---|---|
| `tools/swf/` | 自写 SWF 解析器：形状（双面填充重建）、变形形状、时间轴、字体/文本、按钮、位图、音效 |
| `tools/avm1/`、`tools/disasm.ts` | AVM1 反混淆反汇编/反编译器、registerClass 提取 |
| `tools/xsi/` | 角色 XSI 多边形数据（4.6MB 脚本）求值导出为 `xsi.json` |
| `tools/oracle/` | 对照测量：AVM1 汇编器/小编译器、SWF 写出器、真 Flash Player 探针运行器 |
| `src/engine/flash/` | Flash API 子集：geom、BitmapData（含大图分块）、滤镜（与 Flash 算法一致）、Graphics、AS2 语义 |
| `src/engine/swf/` | 显示列表播放器：MovieClip/时间轴/文本/按钮/遮罩/滤镜/鼠标 |
| `src/engine/platform/` | 键盘、鼠标、WebAudio 音效、50Hz 帧循环、画面缩放、右键菜单、存档 |
| `src/game/` | 原版 AS2 类的逐文件移植（`packages.ts` 保留原版的点号包名） |
| `electron/` | Electron 主进程（`app://` 协议、4:3 窗口、全屏、便携存档目录） |
