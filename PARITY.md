# 僵尸危机3（Boxhead: 2Play Rooms）复刻一比一核对报告 — v0.1.1

> 基准：`assets/僵尸危机/僵尸危机3.swf`（sha256 与 `assets/boxhead_series/boxhead4/boxhead2play.swf` 完全一致，
> 即本项目复刻目标）。原版事实来源：`assets/projects/boxhead4/` 反编译 AS2 + `boxhead2play.fla`（XFL zip）内脚本流。
> 复刻事实来源：仓库根 `src/`。核对日期：2026-10-14，针对 tag `v0.1.1`（提交 `207e274`）。

## 总结论

**本地（离线）功能已一比一复刻。** 用户可见的差别全部是登记在案的有意偏差（在线/赞助功能本地化，
见 §5），无遗漏功能。原版本就不存在的系统（中途存档续关、跨局武器解锁、本地排行榜）复刻版同样没有——
那不是缺失，是忠实行为。

## 验证记录（v0.1.1 打 tag 前）

- `npm run typecheck`：3 个 tsconfig 全部通过。
- `npx vitest run`：**1076 通过 / 0 失败**（63 跳过，为需要 Flash Player/环境的 oracle 用例，历史一致）。
- tag：`v0.1.1`（附注标签）→ `207e274`，已推送 origin。

## 1. 游戏暂停 — 一比一 ✅

| 行为 | 原版证据 | 复刻证据 |
|---|---|---|
| P 键切换，不可改键 | `CInput.as:26`（KEY_PAUSE=P/80） | `src/game/CInput.ts:34` |
| 冻结整个模拟与绘制 | `World/CWorld.as:177-196`（Process/Draw 提前返回，mTick 不增） | `src/game/World/CWorld.ts:169-186` |
| 暂停画面：升级倍率清单 + 唯一 QUIT 按钮，再按 P 恢复 | `World/CHud.as:72-112` | `src/game/World/CHud.ts:53-88` |
| Quit 路由：单/协作战 → Debrief；死亡竞赛 → 选关 | `CMain.as:172-173` | `src/game/CMain.ts:180-182` |
| **暂停时声音不停**（`CSound.Pause/unPause` 在原版是无调用点的死代码） | `CSound.as:59-80,371-377`（全库+FLA 流零调用者） | `src/game/CSound.ts:72-88` 同样移植而无人调用 |
| 右键菜单打开时整个 50Hz 循环冻结（Flash 行为） | Flash 播放器固有行为 | `src/engine/platform/index.ts:76-79` + `Loop.ts:111-118` |

## 2. 存档 — 一比一 ✅

- 后端：原版 `SharedObject.getLocal("BXHD_2PLAY_6")`（`CSaveData.as:340`）→ 复刻 localStorage 键
  `SO:BXHD_2PLAY_6`（`src/engine/flash/SharedObject.ts:56-94`）；Electron portable 版把 userData 重定向到
  exe 旁（`electron/main.ts:7,25`），实现"绿色便携存档"。
- 写入时机：两边都是**每次改动立即 flush**（原版 `CSaveData.as:333-337`；复刻 `src/game/CSaveData.ts`
  每个 setter 立即 `SaveData()`→`flush()`）。
- 读取时机：启动即加载（原版 `CMain.as:18-19`；复刻 `src/game/CMain.ts:25-26`），仅显式水合
  Music/Sound/Detail，其余 getter 惰性取值——两边一致。
- 字段（两边一一对应，共约 24 个 + 复刻新增 mLocalHighscores）：mUsername、mMusicActive、mSoundActive、
  mDetail（画质）、mDifficulty、mGameSpeed、mDevils/Collisions/DamageActive、mGameAmount、
  mLevelIndex_{Single,Coop,DeathMatch}（各模式上次选中房间）、mPlayer1/2_CharacterIndex、
  mViewSide_DeathMatch、双方 14 个键位、mPlayCount。
- **原版没有的能力，复刻版同样没有（忠实）**：无中途续关/Continue（主菜单恒 4 个按钮，不随存档变化）、
  无跨局武器/升级持久化（58 项倍率升级只在单局内，`CUpgrades`）、无整局进度存档。
- `mPlayCount`：原版 boxhead4 全部 `.as` 与 FLA 脚本流中**零自增点**（前作 boxhead3 在
  `CScreen_SelectWorld.as:57` 有，2Play Rooms 删掉了）；复刻版同样从不递增，并有保真断言
  `tests/sim/ui_save.test.ts:69`。属两边一致的死字段。

## 3. 排行榜 — 有意替代（原版仅在线）

- 原版：只在 Debrief 提交 CMG 在线榜（`External/CHighscore_Submit.as:95-131`，POST
  scores.crazymonkeygames.com），无本地表；资格=devils/collisions/damage 全开（`CScreen_Debrief.as:52-55`）。
- 复刻：本地每房间×模式（Single/Coop）top-10，存进游戏存档 `mLocalHighscores`
  （`src/game/local/Highscores.ts`），资格规则原样保留（`CScreen_Debrief.ts:52-54`），
  新条目红色高亮、提交后按钮禁用（对应原版在线提交成功后的行为）。偏差登记 `LOCAL_HIGHSCORES`。

## 4. 其余本地功能对照（均一比一）

| 功能 | 状态 | 备注 |
|---|---|---|
| 主菜单 4 按钮 + 悬停效果 | ✅ | Instructions 改为本地页（偏差 `LOCAL_INSTRUCTIONS`），布局不变 |
| 模式：单人/合作/死亡竞赛 | ✅ | 状态机路由同构（`CMain.ts`） |
| 18 房间选择 + 各模式记忆上次房间 | ✅ | 锁房规则被 `HOSTED_ON_CMG_TRUE` 中和（见 §5） |
| 角色选择（P1 恒选、P2 合作/竞速可选） | ✅ | 4 帧左右切换，持久化角色索引 |
| 选项窗：难度 4 档/速度/三开关/局数 + Reset | ✅ | `CScreen_SelectWorld.ts:176-248`，即时持久化 |
| 键位重绑 + 非法键提示 + Esc 取消 + Reset | ✅ | `CScreen_SelectWorld.ts:275-393` |
| 右键菜单 Sound/Music/Quality | ✅ | `CContextMenu.ts:28-58`，即时持久化；另加 Render 2x/1x（新增项） |
| Debrief：分数/随机遗言/名字输入/Retry/Exit | ✅ | 名字存 mUsername；死亡竞赛提交恒禁用（同原版） |
| 键位默认：P1 方向键+`/`，P2 WASD+Space，单人附加 1-0 直选与 Space 开火 | ✅ | `CSaveData` 默认值两边一致 |
| 50Hz 仿真节拍 | ✅ | 任意刷新率下 tick 一致（偏差 `CMAIN_FRAMETIME` 用调度时刻代替墙钟，消除抖动） |

## 5. 有意偏差登记（`src/game/deviations.ts`，共 18 条：下面 14 条 + v0.1.2 新增 3 条见 §8 + v0.1.3 新增 1 条见 §9）

**用户可见（在线/赞助功能本地化，6 条）**：
`NO_NETWORK`（getURL/LoadVars 全空转，不联网）、`SCOPE_HIDDEN_PROMOS`（隐藏赞助/交叉推广链接）、
`SCOPE_INTRO_NO_CMG_LOGO`（片头只留 Sean Cooper logo，不可点）、`HOSTED_ON_CMG_TRUE`（站点锁恒真→
全房间解锁；原版 2007-10 后任何日期本就自算为真，仅去掉系统时钟依赖）、`LOCAL_INSTRUCTIONS`
（说明书→本地页面，动态反映当前键位）、`LOCAL_HIGHSCORES`（在线榜→本地 top-10，§3）。

**引擎内部/无可观察差异（8 条）**：`DECAL_MASK_1X`（贴花蒙版 1x 省内存）、`NAV_BUDGET_TEST_HOOK`
（仅测试用导航预算开关）、`XSI_PAINT_ORDER_PINNED`（XSI 绘制顺序固定）、`CMAIN_FRAMETIME`、
`XSI_DATA_FROM_JSON`（4.6MB DoAction 改为离线求值的 xsi.json，同数据同顺序）、
`UPGRADE_NUMERIC_NEWWEAPON`（跳过原版对数值调 NewWeapon 的无害 no-op，避免 JS 抛错）、
`PRELOADED_ASSETS`（资源预载，LOADING 条仅剩原版 ≥0.5s 最短显示）、`LOW_QUALITY_VECTOR_AA`
（LOW 画质下矢量仍抗锯齿；游戏侧 LOW 效果全部复刻）。

## 6. 遗留事项

- 无功能级缺口。视觉残留（非功能）：LOW 画质矢量抗锯齿（上条）、XSI 怪物 2.3–3.2% 亚像素 AA 相位差
  （boot 栅格化所致，已文档化不追）。
- 63 个 vitest 用例跳过：需 Flash Player oracle 环境，历史一致，不阻塞发布。

## 7. 全量功能普查（第二轮，2026-10-14）— 逐子系统对照

方法：类文件名 diff（114/114 全映射）+ 两侧功能普查（原版 AS2/FLA 全量 vs 复刻 src/game 全量）逐项对数。

| 子系统 | 原版 | 复刻 | 结论 |
|---|---|---|---|
| AS2 类 | 114 个 | 114 个同名 TS，一个不缺（另 12 个基础设施文件） | ✅ |
| 生物 | 3 种（玩家/僵尸/恶魔，无变体） | 同 | ✅ |
| 武器 | 10 可用 + 2 未启用（Devastator/SmartBomb）；解锁倍率 x5/x10/x15/x20/x30/x40/x50/x55/x70 | 同表 | ✅ |
| 弹体 | 6 在用 + 4 未启用（Laser/DLaser/HomingMissile/Devastator） | 同 | ✅ |
| 物件/拾取 | 6 在用 + 2 桩；掉落规则（每第 5 次连杀掉/恶魔必掉/DM 死亡掉）、重生 30s/10s(DM) | 同 | ✅ |
| 特效 | 8 在用；血迹/焦痕走 CMap_Decal | 同 | ✅ |
| 作用器 | 5（Bullet/Explosion/ZombieAttack/DevilAttack/FireBall） | 同 | ✅ |
| 升级 | 58 项 x3..x125；暂停界面 3 列清单（绿 New/25% 未激活） | 同 | ✅ |
| 状态机 | 12 态（含空 State_Instructions、mCompleteState 5 值） | 同（Instructions 被本地页复用=偏差） | ✅ |
| 屏幕/交互 | 全部按钮/箭头/窗口/悬停特效/覆盖件（SelectWorld 430 行逐件核） | 全部接线；推广/URL 类按偏差隐藏 | ✅ |
| 房间 | 18 个命名房间、预制作库精灵、_Size 缩放（至 BIG ONE 2784×2784） | 同 | ✅ |
| 地图 | CMap 族：BFS 流场 3ms 预算、碰撞/占格/贴花子系统 | 同 | ✅ |
| 刷怪 | 僵尸上限 60/40(LOW)、恶魔空闲计数×10、±19/±13 玩家视域、点位校验 | 同 | ✅ |
| 难度 | 预磨 等级1/10/20/35 × 倍率1/10/30/50，DM x200 | 同 | ✅ |
| HUD | 12 位分数/倍率倒数弧/x倍率/弹药/生命/四级消息/DM 击杀面板+换边/飘分 | 同 | ✅ |
| 音频 | 26 样本 + 4 通道环境音（按在场僵尸数分桶：0停/1/≤2/≤4/≤8/9+ → 声道0/1/1/2/3/3、音量30/30/40/60/80/100、频率150/150/150/150/60/1）；**无音乐**（Music 开关两边均为摆设） | 同（怪癖保真） | ✅ |
| 帧脚本 | 根时间轴 7 段（版本串/右键菜单/站点锁/加载条0.5s/2s停留/幕布淡入）+ 精灵脚本 + 14 个库按钮 handler | 全部移植；sprite 246 剪辑动作跳过（隐藏推广）；755 号 4.6MB 脚本走 xsi.json 偏差 | ✅ |
| 画质/LOW | 无亮度闪光/无飘分/无尸体淡出/僵尸上限40/HUD copyPixels | 同（矢量 AA 差异已登记 LOW_QUALITY_VECTOR_AA） | ✅ |
| 杂项 | 屏震(0,30)阻尼×0.5、亮度闪光衰减0.2/帧、10-tick 位图转场+投影、右键菜单、无自定义光标、玩家回复/无敌闪烁/复活重置武器 | 同 | ✅ |

第二轮排查中核实过的疑点（**均为一致**）：
- 选项窗口说明文字：属库符号静态文本（boxhead4 无 tooltip 代码），由显示列表渲染器自动绘制；选项屏视觉差 0.88% 佐证。
- 转场时长：原版 alpha ±10/tick 至 ≥100 → 实际 **10 tick**；`mTransitionIn_Time=30` 变量不参与完成判定（CScreen_Transition.as:9,45-47）。复刻一致。
- FireBall_Held：原版 `.as` 与 FLA 流均**零调用点**（恶魔持球视觉经 DrawPrimitive `'Effect.FireBall'` 动画直绘）——两边都未启用，复刻标注正确。
- `_FPS` 部件按原样接线（`CMain.ts:45` `_root._FPS?.Update?.()`）；`_Debug` 经字节码确认不存在于发行版影片 → 按原样静默 no-op（`CMain.ts:54-55`）。

**复刻版新增（原版没有，属增益非缺失）**：本地排行榜（替在线）、本地说明书页、右键 Render 2x/1x、F11/Alt+Enter 全屏、"Click to start" 音频解锁覆盖层。

**最终结论：全部子系统一比一，未发现任何遗漏功能。** 差异仅剩 §5 的 14 条登记偏差。

## 8. v0.1.2 新增（超越原版，2026-10-14）

用户要求的三个增益功能，全部经 scope 包装器实现，不动 1:1 移植本体；偏差登记 14→17 条。

| 功能 | 行为 | 已知取舍 |
|---|---|---|
| **保存退出 / 继续**（`SAVE_QUIT_RESUME`） | 暂停界面新增 SAVE & QUIT 按钮（原版只有一个 QUIT）：把局内快照写进存档 `mResumeData`，回主菜单（不经 Debrief，避免分数重复提交）；主菜单在有续档时多出 CONTINUE（走原版 Register_Button 悬停效果），点击重建房间并恢复：当前波次（重刷，剩余刷怪预算延续）、分数、DM 击杀数、倍数/连杀链、玩家位置/生命/武器+弹药、场景物件（标记物件按坐标匹配覆写；玩家放置的油桶/假墙/地雷/炸药包按位置重建并保留击杀归属）、RNG 状态与 tick | 波中生物/弹体/特效不保留（波次重开）；地板血迹贴花恢复后为干净地板；屏震/亮度瞬态与摄像机平滑不保留；引爆中的地雷/炸药包恢复为待触发 |
| **死亡重试=波次检查点**（`WAVE_CHECKPOINT_RETRY`） | 每波开始（`__set__mLevel` 推进后，推进条件保证场上无怪）自动存内存检查点；死亡 → Debrief → RETRY 恢复进波那一刻的分数/武器/倍数，当前波重刷；无检查点（DM、首波前死亡）保持原版整房重开 | — |
| **手柄全程支持**（`GAMEPAD_INPUT`） | 每 rAF 轮询（Loop beforeTick，右键菜单冻结期间同样轮询但按住键全释放）；手柄 1→玩家 1、手柄 2→玩家 2（单人下手柄 2 也→玩家 1）；按 CInput 槽位**当前键码**翻译（改键自动跟随）；摇杆（0.35 死区+四方向旗标）或十字键=移动、RT/LT/A 按住=开火、RB/LB=换枪、START=暂停；菜单用虚拟光标（逻辑坐标，与渲染倍率无关）+A 点击（走引擎原版按钮拾取），物理鼠标优先；首个手柄按键可关闭 "Click to start" 覆盖层 | 浏览器里手柄操作不能代替音频解锁手势（Electron 无此问题）；固定映射，无改绑 UI |

实现要点（供后续维护）：快照恢复复用游戏自身路径——波次经 `__set__mLevel` 逐级重放、倍数经
`__set__mMultiplier` 逐级爬升（每一档的升级在跨过的索引上自然激活）、玩家用 `Move()` 传送（State_Respawn
同款）；恢复期间静音 HUD 消息并抑制检查点钩子重捕获。测试：`tests/sim/resume.test.ts`（快照往返、
死亡→RETRY、SAVE&QUIT→模拟重启→CONTINUE、恢复世界与继续世界逐点一致的轨迹对比）、
`tests/sim/gamepad.test.ts` + `tests/unit/platform/gamepad.test.ts`。注意：引擎 RNG 是**进程级单例**，
同进程两个活游戏共享随机流（测试必须串行驱动）。

**0.1.1 → 0.1.2 视觉差异（预期，已重拍基线）**：暂停画面底部多一个 SAVE & QUIT 按钮（三幕
paused/dm-paused/paused-low）；有续档时主菜单多一个 CONTINUE 项（无续档时与原版一致）；说明书页底部
两行新增说明。其余画面不变。

## 9. v0.1.3 新增：局域网联机（2026-10-14）

原版 2P 仅同键盘；本版加入两台电脑的合作/死亡竞赛（偏差 `LAN_MULTIPLAYER`，deviations 17→18 条）。
网码为**锁帧同步**：两端各跑同一份确定性仿真（同种子 RNG），每 tick 只交换本地玩家的 7 位输入位图，
不传输世界状态。

| 方面 | 行为 |
|---|---|
| 传输 | 主进程 UDP 广播发现（逐网卡定向广播 + 127.0.0.1 单播）+ 手动 IPv4 兜底；TCP 长度前缀 JSON、1s 心跳、3.5s 判死；版本（含 Chromium 版）不一致拒绝 |
| 输入 | 联机中两名玩家的输入槽都换成位图驱动的 NetSlot：远端玩家对本地键盘免疫，本地玩家也走位图 → 两端锁存/时间戳完全一致；**本机任意一套键位（方向键或 WASD）与任一手柄都操控本地玩家** |
| 确定性 | 手雷蓄力改用每 tick 虚拟输入时钟（±1 tick 量化，登记偏差）；导航 BFS 用确定性格数预算（NAV_BUDGET_TEST_HOOK 生产启用，会话结束还原）；主机配置（难度/速度/三开关/局数/画质/P2 角色）同步覆盖客机并在此后还原；每 50 tick 交换校验和，失配即双端报告回大厅 |
| 暂停 | 联机中暂停键由网络层接管（暂停方停止发帧 → 对端自动冻结显示等待），恢复即双方继续；暂停界面 QUIT=判负退出 |
| 检查点/断线 | 合作每波开始、DM 每 1500 tick 双端同 tick 各存一份相同快照（复用 v0.1.2 快照格式与已知损失）；掉线冻结 30s 自动重连，成功则从检查点重建继续；超时判负（DM 对方胜/合作结算），回大厅后可 RESUME GAME 从检查点续局 |
| 与 v0.1.2 的交互 | 联机局不显示 SAVE & QUIT、隐藏 Debrief RETRY、不动单机 CONTINUE 存档；联机合作局分数仍可提交本地榜（与同键盘合作一致） |

测试：`tests/sim/netlockstep.test.ts`（顺序双世界锁帧重放逐 tick 哈希相等——顺序重放在同位图下与交错锁帧
等价；门控冻结/恢复；手雷确定性；DM 检查点两次重建一致；P2 键盘 E/Q 切枪钉住）、
`tests/sim/lanlobby.test.ts`（大厅屏）、`tests/unit/game/netProtocol.test.ts`（帧/信标/看门狗/真实 localhost
socket 全流程：中继、版本拒绝、busy、失联重入、端口扫描）。
注意：引擎 RNG 为进程级单例，两"端"只能顺序驱动（测试方法即由此而来）。

### 9.1 v0.1.4 联机界面与流程重构（2026-10-14）

v0.1.3 的大厅把建房/加入/设置混在一屏（加入列表与主机控件重叠、IP 输入框随窗口比例漂移不可见），且开局由
主机单方面决定。v0.1.4 重构为"房间 → 准备 → 房主选人"三段式，并补齐输入识别显示。游戏内仿真零改动
（lockstep/检查点/续局机制不变），全部变更在 `local/Net/*`、`scope.ts` 与手柄层。

| 方面 | 行为 |
|---|---|
| 大厅 | 两个互不重叠的视图：入口（CREATE ROOM / 自动发现列表 `名字·人数/2·状态`（满员与游戏中置灰）+ 校验后的 IPv4(:端口) 手动输入，DOM 输入框经 `Presenter.logicalToClient + onResize` 贴合画布）与房间（双方 READY 徽标、心跳实测 PING、本机输入摘要、客机 READY/LEAVE、主机 START/CLOSE；结束局有检查点时显示 RESUME GAME）。进入大厅即自动发现（2s 重试自愈 UDP 端口冲突），去掉手动 REFRESH |
| 准备/开局 | 新消息 `{t:'ready'}`（客机→主机）与 `{t:'setup', sel}`（主机→客机）：主机 START 需客机已连接**且** READY；双方进入**网络选人屏**（新合成符号 9004 + 原版 `SubScreen_Coop/DeathMatch` 素材原样嵌入，观感=传统选人界面）——**主机统一改**模式/双角色（`SetupSelection.charP1/charP2`，纯外观）/18 关/难度/击杀数，每次变更镜像到客机（只读 + WAITING FOR HOST 横幅）；主机 START GAME 用该选择开局（`GameConfig` 新增必填 `charP1`，客机 `applyConfig` 写入并在 dispose 还原——v0.1.3 缺 P1 角色同步）。主机 BACK 发裸 `{t:'lobby'}` 双方回房间 |
| 断线 | 30s 重连倒计时**每秒读秒**（500ms 定时器每拍重渲 overlay/大厅状态，v0.1.3 只渲染一次冻结在 30）；重连样式改为醒目红条；客机重连改为**每秒重试**（v0.1.3 为 2s；不做立即重试——优雅退出同样触发掉线事件，立即重连会在退出途中 hello 主机引发无意义的检查点重建）。`leave` 增加 `via:'timeout'|'concede'`：**超时判负双端回主菜单**（`State_RunWorld` 包装改道 `State_NetEnd`，savequit 同款；联机无持久存档，内存检查点保留供续局），主动认输（暂停 QUIT）仍走 Debrief/Winner |
| 虚拟局域网 | 实测每方向 ~2-4KB/s（JSON 帧 + 心跳），带宽不是瓶颈；`start.inputDelay = clamp(ceil((RTT+25)/40),1,4)` 由主机按大厅期心跳 RTT 决定随开局下发（真局域网 <5ms 仍为 1 tick 不变），高延迟虚拟局域网消除"等待对方"卡帧；帧修剪窗随延迟 `t-(D+3)` |
| 信标/发现 | beacon 增加 `players:1|2`（`decodeBeacon` 对旧信标默认 1）；主机有 peer 时自动广播 2/2，列表据此置灰 |
| 输入识别（GAMEPAD_INPUT 增量） | 引擎层透传 `Gamepad.id`；手柄→玩家指派表默认按系统顺序自动分配，`swapAssignment()` 互换（DOM 徽标点击手柄芯片触发）；`status()` 暴露在线/名称/最近活动/生效玩家。新 `local/InputBadge.ts`：左下角 DOM 徽标 KEYBOARD/PAD 1/PAD 2 芯片（在线亮起、最近使用的设备绿框高亮、`→P1/→P2` 归属角标、无手柄时"按任意键连接"提示、4s 无操作淡化、仅芯片可点击）——DOM-only 不碰画布基线；大厅房间视图显示"YOUR INPUTS: …" |

测试新增/更新：`tests/sim/lansetup.test.ts`（选人屏：主机接线与镜像、客机只读、相位回落）、
`tests/sim/lanlobby.test.ts`（重做为入口/房间两视图 + READY 门控）、`tests/sim/netlockstep.test.ts`
（charP1 施加/还原、inputDelay 预充/发送/修剪、forfeit via 链）、`tests/unit/game/netProtocol.test.ts`
（beacon players、裸 lobby 帧、ready/setup/inputDelay 帧）、`tests/unit/game/gamepad.test.ts`
（在线/名称/指派互换/活动戳）。打包双实例 E2E `tests/sim/playtest.net.mjs` 按新流程重做（L7）。
