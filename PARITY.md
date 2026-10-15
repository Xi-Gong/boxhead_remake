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

## 5. 有意偏差登记（`src/game/deviations.ts`，共 19 条：下面 14 条 + v0.1.2 新增 3 条见 §8 + v0.1.3 新增 1 条见 §9 + v0.1.7 新增 1 条 GAME_CURSOR_HIDE 见文末 v0.1.7 段）

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
| 虚拟局域网 | 实测每方向 ~2-4KB/s（JSON 帧 + 心跳），带宽不是瓶颈；v0.1.7 `start.inputDelay = computeInputDelay(最近≤20个心跳RTT样本, gameSpeed)` = `clamp(ceil((最差RTT/2+35)/tickMs),1,8)`（单程+裕量、按最差样本留抖动余量、随游戏速度缩放 tick 数），60-100ms 虚拟局域网落在 2-3 档（v0.1.4 全 RTT 公式落在 3-4 档）；输入帧采样提前一个 tick（见文末 v0.1.7 段）；帧修剪窗随延迟 `t-(D+3)` |
| 信标/发现 | beacon 增加 `players:1|2`（`decodeBeacon` 对旧信标默认 1）；主机有 peer 时自动广播 2/2，列表据此置灰 |
| 输入识别（GAMEPAD_INPUT 增量） | 引擎层透传 `Gamepad.id`；手柄→玩家指派表默认按系统顺序自动分配，`swapAssignment()` 互换（DOM 徽标点击手柄芯片触发）；`status()` 暴露在线/名称/最近活动/生效玩家。新 `local/InputBadge.ts`：左下角 DOM 徽标 KEYBOARD/PAD 1/PAD 2 芯片（在线亮起、最近使用的设备绿框高亮、`→P1/→P2` 归属角标、无手柄时"按任意键连接"提示、4s 无操作淡化、仅芯片可点击）——DOM-only 不碰画布基线；大厅房间视图显示"YOUR INPUTS: …" |

测试新增/更新：`tests/sim/lansetup.test.ts`（选人屏：主机接线与镜像、客机只读、相位回落）、
`tests/sim/lanlobby.test.ts`（重做为入口/房间两视图 + READY 门控）、`tests/sim/netlockstep.test.ts`
（charP1 施加/还原、inputDelay 预充/发送/修剪、forfeit via 链）、`tests/unit/game/netProtocol.test.ts`
（beacon players、裸 lobby 帧、ready/setup/inputDelay 帧）、`tests/unit/game/gamepad.test.ts`
（在线/名称/指派互换/活动戳）。打包双实例 E2E `tests/sim/playtest.net.mjs` 按新流程重做（L7）。

**v0.1.5 热修复（真实键盘输入）**：v0.1.4 用户实测发现 App 内无法键入任何字符（LAN IP 输入框与结算名字框
两处）。根因在引擎平台层：`Pointer.ts` 的 pointerdown 对每次点击 `preventDefault()` 并把焦点强拉回画布
（DOM 输入框永远拿不到焦点），且 `Keyboard.ts` 对所有字符键 `preventDefault()`。修复：点击/键盘事件的目标是
DOM 文本控件（INPUT/TEXTAREA/contentEditable）时整组放行——不抢焦点、不 preventDefault、不喂给游戏键
（画布上的 SWF 输入文本域路径不受影响，本就经 `engine.focus + keyInput` 工作）。回归测试
`tests/sim/playtest.typing.mjs` 用**真实键盘事件**（`page.keyboard.type`，此前 E2E 的 `page.fill` 绕过了真实
键盘路径，正是漏测原因）驱动打包 exe 验证两处输入；另加 `tests/sim/playtest.lanui.mjs`（IP 输入框在 4 种
窗口纵横比下贴合逻辑矩形 + 房间视图显隐 + YOUR ADDRESS 行）。输入框补 `box-sizing:border-box`。

**v0.1.6 热修复（黑框残留）**：用户实测发现输入过 IP 后返回主菜单，**黑色 IP 输入框残留在主菜单上**
（压住 INSTRUCTIONS 菜单项）。根因：屏系统换屏时走 `removeMovieClip()`（CScreen_Transition），**从不调用
`CScreen.Dispose()`**——挂在 Dispose 里的 DOM 清理是死代码（v0.1.3 起如此），还连带泄漏 onUi 订阅与
1s 轮询定时器（发现监听永不停止）。修复：引擎 `markRemoved` 按 Flash 语义在移除子树时触发 `onUnload`
（DisplayObject.ts，try/catch 包裹）；`CScreen_LanLobby`/`CScreen_LanSetup` 把 DOM 输入框/定时器/订阅清理
挂到 `onUnload`（Dispose 保留兜底）。回归：`playtest.lanui.mjs` 新增"输入 IP → BACK TO MENU → 输入框必须
从 DOM 移除 + 重进大厅恰好一个输入框、离开后为零"断言。

**v0.1.7 手感四连修（用户双机实测反馈）**：

1. **游戏内隐藏光标**（偏差 `GAME_CURSOR_HIDE`，deviations 18→19 条）：原版任何时候都显示系统箭头；本版
   `State_RunWorld` 运行中（未暂停）隐藏（`scope.ts` 包 `CMain.SetState` + `CHud.Pause`，走引擎自带
   `Mouse.hide/show` → 平台层每帧写 `cursor:none`），暂停菜单与所有非世界屏恢复；右键菜单元素自带
   `cursor:default` 不受影响。测试 `tests/sim/cursor.test.ts`。
2. **局内 PING 实时刷新**：心跳其实每秒都在更新 `session.rttMs`，但 v0.1.4 的 overlay 只在"状态变化"时
   同步——稳定对局中数字冻结在开局值。修复：`NetSession` 在 playing 相位收到 `hb` 即触发
   `onStateChange`（bridge 已挂 overlay 同步）；游戏结束后不再触发（否则大厅里每秒重闪 RUN OVER 条）。
   局内 ping 角标同时改为仅对局中显示（大厅房间视图有自己的 PING 行）。
3. **卡顿（60-100ms 虚拟局域网）三管齐下**：(a) 输入帧索引提前一个 tick——`afterTick` 里采样帧定为
   `t-1+D`（原 `t+D`，即"下一 tick+D"），对端只需在 D tick 内收到（单程线缆时间），两端对称位移、
   模拟不变，净省 40ms；(b) 定档改抖动感知（见上表虚拟局域网行）；(c) **修复 resume/重连丢 inputDelay
   的真 bug**——客机已有 session 时收到的 `start` 不透传 `msg.inputDelay`（重置为 1 而主机保持 3-4 → 主机
   真 bug**——客机已有 session 时收到的 `start` 不透传 `msg.inputDelay`（重置为 1 而主机保持 3-4 → 主机
   每 tick 微卡），`onHello` 重发的 `start` 也缺该字段；两处补齐。另：**stall（等待对方）此前从不通知
   UI**（`stallReason` 变化不触发任何重渲），现在经 `stall()` 在变化时触发 `onStateChange`，overlay 有
   150ms 宽限期（`STALL_GRACE_MS`，`stallStripDue` 纯函数）——微失步不再闪"WAITING"横幅。
4. **手柄摇杆方向**：引擎层量化从"每轴独立 |axis|>0.35"改为径向 40%/30% 起动/保持滞回 + 均匀 8 扇区
   （±22.5°，与推杆幅度无关）+ 4° 角度粘滞（`STICK_ENGAGE/STICK_RELEASE/STICK_STICKY_DEG`，
   `engine/platform/Gamepad.ts quantizeStick`）。旧行为的病灶：方向扇区随幅度变形（半推时斜向几乎不可
   触发、 cardinal 却有 ±44°）、松杆回中两轴先后过阈闪斜向。`PadDirs` 接口不变，键盘路径与 d-pad、
   菜单模拟光标（仍用 `STICK_DEADZONE` 每轴）零改动。测试 `tests/unit/platform/gamepad.test.ts`。

**v0.1.8 三连修（用户手柄实测反馈：游戏中光标滑出 / 结算名字打不进 / SEND SCORE 疑似无效）**：

1. **手柄"虚拟光标"滑入游戏画面**：那不是系统光标——是手柄菜单导航用的白色三角箭头（DOM div），
   `poll()` 里**不分游戏状态**地显示，推杆即滑入对局、停手 3 秒消失（用户截图里红桶上的"白色播放
   三角"就是它）。修复：按 `Mouse._visible` 门控（`game/local/Gamepad.ts`），与系统光标同语义——
   菜单/暂停显示、`State_RunWorld` 隐藏。另加 `Presenter` 在窗口 focus/blur/resize 时**主动重写**
   `cursor`（Windows 全屏切换/焦点丢失会原生重置光标，而 `setCursor` 去重 + 右键菜单暂停渲染期间
   不会自愈）。测试 `tests/sim/gamepad.test.ts`（FakeEl DOM 垫片）+ `tests/unit/platform/presenter.test.ts`。
2. **结算名字框完全打不进字（中文输入法）**：画布 SWF 输入域的引擎键盘路径**完全丢弃 IME 输入**
   （`Player.keyInput` 只插 `e.key.length===1` 的裸键；zh-CN 输入法下字符经组字窗口送达，一个字都
   进不去——v0.1.5 的修复只救了 DOM 控件，画布域在自动化里用 `page.keyboard.type`（裸 ASCII）
   验证"通过"，真实输入法路径从未被覆盖）。修复（偏差 `DEBRIEF_NAME_IME_INPUT`，deviations 19→21
   条）：字段上盖一层**全透明 DOM 输入框**作打字/焦点/IME 通道（LAN IP 框模式：`onResize` 贴合、
   `onUnload` 清理），画布继续渲染文字与光标（`engine.focus/caretIndex` 随 DOM 选区同步），每次
   `input` 事件同步 `el.value → mUsername.text`（组字期间也触发——实时预览）；先
   `setNewTextFormat(getTextFormat())` 快照格式再赋值，字距/字号不变；`DisableSubmitScore` 同时
   禁用 DOM 框；手柄 A 键对 DOM 文本控件原生聚焦（合成引擎点击打不了字）；SEND SCORE 点在占位符
   上时聚焦名字框（仍不提交，原版语义）。配套引擎修复 `EMBEDDED_FONT_CJK_FALLBACK`：嵌入字体缺字
   的码点 advance 由 0 改为设备字体测量、绘制走设备字体栈（高分表行同样受益）、FlashType 编辑域含
   缺字时整域回落轮廓渲染（纯拉丁域保持逐像素 FlashType 不变）。**SEND SCORE 本就有功能**（本地
   房间×模式前十，`scope.ts` → `Highscores.ts`），名字打不进时按原版语义静默无效，故"看着没反应"。
   顺带修一个由此发现的真 bug：`Pointer.ts` 挂在舞台上的 `selectstart` preventDefault 会**取消
   DOM 输入框内的 Ctrl+A / 双击选词**（LAN IP 框同病），目标为文本控件时放行。测试
   `tests/sim/debriefName.test.ts`、e2e（CDP `Input.imeSetComposition` 组字实时同步 +
   `insertText` 提交 `'王roy'`）；`playtest.typing.mjs` 补 IME 提交探针并改为**离屏**运行、
   失败置非零退出码——**此后 typing 是发版必跑门禁**（v0.1.7 漏跑正是本次翻车原因）。

## 10. v0.1.9 新增（超越原版，2026-10-15）

两项用户需求（偏差登记 21 → 23 条，`src/game/deviations.ts`）：**协作死亡武器箱**与**起始波次选择**。

### 10.1 协作死亡武器箱（`COOP_DEATH_WEAPON_CRATE`）

| 项 | 行为 |
|---|---|
| 触发 | Coop 模式玩家死亡（`CWorld.LogKill` 的 scope 包装，模拟内部执行）在死亡格生成一个箱子 |
| 内容 | 死亡者背包全部**已激活且还有弹药**的非手枪武器，弹药为死亡瞬间的实际剩余量（全空不掉箱） |
| 外观/拾取 | 完全复用原版 `Object.Pickup` 红色补给箱：同美术、同走踏拾取、同音效、单次拾取即消失（用户决策：不新画） |
| 死亡者本人 | 重生后拾取 = 精确恢复（含自动从手枪切回死亡时所持武器） |
| 队友 | 取两者较优：缺失武器直接满弹匣获得；已有武器弹药/容量取 max（拾取永不变弱） |
| 时效 | 永久存在直到被拾取；存档/读档（RESUME_VERSION 1→2，旧单存档槽作废）、波次检查点、LAN 断线重连/续局均保留（按 placed 对象序列化） |
| 模式门控 | 仅 Coop：单人死亡即结算（检查点 RETRY 本就恢复背包），Death Match 保持原版随机补给掉落 |
| 确定性 | 在双方锁步模拟内生成，无 RNG/计时器，netlockstep 逐 tick 哈希验证一致 |

已知取舍：死亡箱与随机补给外观相同（用户明确接受——混乱战场中"见到红箱就走上去"本身即原版直觉）。

### 10.2 起始波次选择（`START_WAVE_SELECTOR`）

| 项 | 行为 |
|---|---|
| 入口 | 单人/协作选关界面左下角 `START WAVE < N >` 循环器（绘制于原版隐藏的推广按钮空带）；LAN 设置界面 Coop 显示 `WAVE` 板（与 DM 的 `FRAGS` 板共用槽位，房主操作、客机镜像） |
| 取值 | 1..100 循环；**不持久化**——每次进入界面重置为 1（"不动就是从第一关开始"，用户决策） |
| 能力赋予 | 复用原版难度起步机制（`SetDifficulty` scope 包装）：静默 `__set__mLevel(N)` 后倍率**逐级**步进到锚点插值（波次→倍率 1→1、10→10、20→30、35→50，其间线性、35 之后按末段斜率 20/15、封顶 125=升级表最大阈值）——即"打到该波次应有的武器/升级"，满弹匣 |
| 覆盖关系 | 选定 N>1 时波次覆盖难度起步（可下调）；倍率只升不降（难度 3 + 波次 10 → LEVEL 10 但保持 x50）；Death Match 免疫；N=1 与原版逐位一致 |
| LAN | `wave` 随 `start` 消息（新局/续局/重连重发）在双端 tick 0 前同样施加；续局快照在其上重放（恒有 snap.wave ≥ 起始波次） |
| 排行榜 | 不变（仍按房间×模式计分资格；难度起步本就是原版允许的"抢跑"） |

测试：`tests/sim/weaponCrate.test.ts`（11 项）、`tests/unit/game/startWave.test.ts` + `tests/sim/startWave.test.ts`（锚点表 + 包装器 + UI）、`tests/sim/netlockstep.test.ts`（死亡掉箱锁步一致 + start.wave 双端）、`tests/sim/lansetup.test.ts`（WAVE 板）；浏览器视觉验收 `tests/sim/playtest.v019.mjs`（真实点击循环器 24 次→波次 25 开局 x36、死亡→箱子→队友拾取恢复 13/2 弹、DM 无循环器；截图经 zai 视觉 MCP 核验）。

## 11. v0.1.10 音频稳定性与 LAN 同步（2026-10-15）

用户真机反馈：单机（单人/双人）与 LAN 时**开局即无声**，一旦丢失无法恢复（需重启游戏、偶尔需重启电脑）。根因为三处"无恢复"设计叠加：单个 MP3 加载失败即整局永久静音（无重试）；AudioContext 构造失败是粘性闩锁；suspended/closed 无任何恢复路径（设备切换、音频服务抖动后无人 resume）。全部为平台层修复，**原版听感行为零改动**：

| 项 | 行为 |
|---|---|
| 加载自愈 | `preloadSounds` 保留原始字节（解码用副本，`decodeAudioData` 会 detach 入参）并重试失败项 x2（轮间退避）；仍失败的样本进入 failedIds——播放时按需后台重取（每 id 去重、≥5s 节流），下次播放即有声 |
| 上下文看门狗 | 1s 心跳（仅浏览器/Electron）：resume suspended/interrupted（单实例限流）；连续 5s 未恢复或已 closed → 整体重建（在播 voice 先**自然完成**使 CSound 闩锁正常清零；节点图重建；从保留字节重解码全部样本，零网络请求）。构造失败不再闩锁，每次调用重试 |
| 防爆 | `startVoice` 节点操作包 try/catch，异常退化为静默计时 voice（不再中断调用方 tick 脚本——LAN 单端异常即失同步的隐患）；unlock resume 补 rejection handler |
| 可观测 | `__game.audio()`（state/decoded/failed/voices/recoveries/muted）+ `audioCtl`（suspend/kill，验收用） |
| LAN 环境音门控 | 僵尸环境音改为跟随**模拟 tick**（`CWorld.Draw` 按 `mAmbienceTick != mTick` 门控 + 消耗渲染累加器）：本地 Draw 与 tick 严格 1:1（零本地听感变化）；net stall/暂停期间不再对冻结世界发声，双端环境音节奏与锁步模拟一致 |
| 保留原版行为 | 每样本单声道重触发切断、环境音样本 0 空档、暂停不静音、DM 分屏双绘计数——全部未动 |

登记决策：恢复机制在不出问题时不可见，**不新增 deviation 编号**；环境音门控并入 `LAN_MULTIPLAYER` 描述。测试：`tests/unit/platform/audio-recovery.test.ts`（11 例：重试/闩锁移除/静默退化/按需自愈/看门狗 resume/重建/闭态即重建/mute 保留/清扫节流）、`tests/e2e/audio.browser.mjs`（真 Chrome 真解码 28 项：启动 31/31、两类网络故障注入治愈、suspend 3s 恢复、kill 重建重解码）、`tests/sim/netlockstep.test.ts`（双端 PlaySound 有序序列全等 + stall 冻结期零新声音）、`tests/sim/fx_creatures_audio.test.ts`（本地"额外 Draw 为 no-op"节奏不变性）。
