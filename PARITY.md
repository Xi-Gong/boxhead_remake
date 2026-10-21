# 僵尸危机3（Boxhead: 2Play Rooms）复刻一比一核对报告 — v0.1.1

> 基准：`assets/boxhead_2play_rooms.swf`（原版 SWF，sha256 `34ff145d…`，见 `tools/paths.ts`；早期版本曾以
> `assets/僵尸危机/僵尸危机3.swf` 与 `assets/boxhead_series/boxhead4/boxhead2play.swf` 为镜像基准，两者字节
> 一致，v0.2.0 起这些镜像目录已从仓库删除）。原版事实来源：反编译 AS2 + `boxhead2play.fla`（XFL zip）内脚本流
> （v0.2.0 起已删除，可由 SWF 经 ffdec 随时还原，见 `assets/README.md`；核对期间的事实已沉淀于本报告与测试）。
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

## 12. v0.2.0 素材独立 + Retry 落败波次重开（2026-10-15）

两项改动：**资产层独立**与 **WAVE_CHECKPOINT_RETRY 兜底补全**（后者是对既有 deviation #15 语义的补全，不新增编号）。

| 项 | 行为 |
|---|---|
| 提取产物入库 | `public/assets/`（library.json、xsi.json、29 位图、31 音效、manifest.json，约 6.6MB）自 v0.2.0 起提交进仓库，新增 `.gitattributes`（`public/assets/** -text` + 二进制类型）保证任意克隆字节稳定；标准构建**完全不读 SWF**（manifest 有效即跳过，SWF 缺场时信任其记录的 sha） |
| 重新提取 | 仅当提取器变化时发生，只需仓库内的 1.9MB 原版 SWF（registerClass 映射从 SWF 的 DoInitActions 字节码恢复，不依赖 FLA）；SWF 缺失时清晰报错 |
| 资产清理 | 删除与复刻无关的 ~107MB（全系列 SWF 镜像、中文版合集、五代反编译、ClassicResources 音频、梦魇解密器、4 个未引用放映器）；FLA/AS2/音频参照交叉验证测试 `skipIf` 优雅降级，新增常开门禁：committed MP3 帧同步头 + 提交产物与全新提取逐字节全等（含 manifest） |
| Retry 兜底 | 无检查点时（START WAVE 起始波推进前死亡、CONTINUE 后推进前死亡）RETRY 从**本局实际起始波**重开（InitFinished 落定后记录；复用 START_WAVE 起始头机制：静默 `__set__mLevel` + anchorInterp 阶梯倍率，clamp 100），不再落回原版难度基准波；分数/武器仍按重试语义重置。难度基准开局**逐位不变**（起始波=基准，装订为无操作）；DM 胜利屏与 net 对局（RETRY 本就隐藏）保持原版行为 |

测试：`tests/sim/startWave.test.ts`（T1 波 20 开局→波 20 死→RETRY→波 20/倍率 30/梯队武器/分数归零、T2 难度 1+波 5 降级不回撤、T3 经真实菜单无泄漏）、`tests/sim/resume.test.ts` T4（CONTINUE→立即死→RETRY→存档波次）、`tests/unit/swf/media.test.ts`（提交资产完整性 + 全量重提取字节全等）、既有 flow/soak/weaponCrate 钉全部保持。

## 13. v0.2.1 LAN 收尾：游戏结束 Retry + 流畅度（2026-10-16）

两项用户反馈修复：**LAN 游戏结束后的死房间**与 **60ms 级链路手感不如本地**。全部为 LAN_MULTIPLAYER 内的
显示/传输层改动（`netActive()` 门控，离线行为逐字节不变），**不新增 deviation 编号**；audio-identity 金丝雀
（双端 PlaySound 有序序列全等）与全部锁步哈希测试在预测开启下复证 RNG/音频中立。

### 13.1 游戏结束 Retry + 房间解卡

| 项 | 行为 |
|---|---|
| 根因修复 | 自然结束（coop 全灭 / DM 击杀上限）此前从不把 `NetSession.phase` 置 `'ended'`（仅认输/超时路径会），`markBackInLobby()` 永不生效 → 房间渲染成"对局中"变体（START/READY/CLOSE 全隐藏，只剩双方旧 READY 徽章），只能退房重建。现在 net RunWorld 包装器在 `mCompleteState` 置位的那一拍（双端确定性同拍）幂等标记 `'ended'` |
| Debrief RETRY | 联机结算屏 RETRY 不再隐藏：任一方点击 → host 主导协同重开（新 `'retry'` 协议消息，host 端 `startRetry`）；语义与本地 v0.2.0 完全一致：有 netCheckpoint → 从检查点续局；无（首波推进前/DM 前 1500 tick 死亡）→ 从本局起始波（= 失败波次）重开新局。附带修复：DM 胜利屏 RETRY 此前从未被 net 门控（潜在单侧重开 desync），现走同一协同路径 |
| 房间条 | 无检查点时房间显示 `GAME OVER - RETRY AVAILABLE` + `RETRY AT WAVE n`（host 可点），有检查点仍为 RESUME GAME |
| 相位机 | 会话内第二局（客户端由 NetSession 直接消费 start）此前 bridge 相位卡 `'setup'` → 房间空白；任何通往 `'ended'` 的路径现在都会自动把 bridge 释放回 `'lobby'`（含已在房间内的场景） |
| desync | 校验和失配此前永久冻结双方（overlay 承诺回大厅但无代码执行）；3 秒宽限后双端独立弃局回房（分歧后检查点可能再次分歧，fresh-RETRY 条是安全出口） |

### 13.2 流畅度（60ms 级链路"像本地"）

| 层 | 行为 |
|---|---|
| L1 有界失速追赶 | 此前迟到一帧 = 永久丢一个 40ms 时间片（25fps 节律上可见的洞）。现在瞬态迟到把刚消耗的时间片退还、同拍重试（帧帽临时升 2）；**令牌桶**限制总额：持续错相在 ~3 次失速后耗尽 120ms 信用，改为让出时间片直至双方相位重锁（旧版的跳拍本是锁步唯一的相位自愈机制），40ms/s 回充使锁后偶发抖动仍不可见 |
| L2 输入延迟统计 | `computeInputDelay` 由 worst-of-20 改 p90：大厅里采样数分钟，单个 START 前心跳尖峰不再给整局 +1~2 D（小窗口仍等价 max，全部既有 pin 不变） |
| L3 本机玩家显示预测 | afterTick 时本机未来 D-1 拍输入帧**已采样在册**（线上等的永远只是对端）——据此在本机前推 D-1 拍：与权威"为该拍做出的预测"和解（>1 格快照纠正、小偏差半量缓动、完全一致则采纳），移动数学逐位复刻（原始输入增量→朝向、KeepDistance 19/13 系绳、真实 Collide_Map 墙体滑动 0.85 半径；**不**复刻 Collide_Mapwho 互推——它写模拟态，其误差恰由和解吸收）。仅在绘制层生效：玩家 Draw 包装器换入/换出 mPosition/mAngle；相机仅在 Process_Tracking（绘制期）对追踪锚加偏（checksum 只覆盖分数/物体数/玩家位置+生命）。stall 期间影子随世界冻结；reconnect/desync 相位整体停用 |
| 测试钩子 | `--boxhead-net-delay=<ms>`（主进程单向延迟全部 TCP 发送，UDP beacon 不受影响）→ 本地双实例回放真实链路等级：30ms 单向得 D=2、60ms 得 D=3 |

测试：`tests/sim/netlockstep.test.ts` 新增——自然全灭→双端 `'ended'`、retryStart 无检查点→起始波/有检查点→续局、进程内第二局相位同步、host 响应 `'retry'`、desync 3s 弃局回房、netStallRewind 边界、迟到一拍零时间片损失+欠账钳制、p90 去离群、令牌桶边界、影子领先 D-1 拍且 sim 追及、强制跳变快照纠正、stall 冻结影子、覆盖门控。打包 QA：`tests/sim/playtest.netretry.mjs`（自然死亡→Debrief RETRY 可见→EXIT→房间可操作→进程内第二局→client 按 RETRY→双端重开，全真实用户流程）与 `tests/sim/playtest.netsmooth.mjs [delayMs]`（D 一致、20s 操控窗持续失速≈0、tick/分数全等、rAF 探针：shadow 一拍内(6-7ms)响应而 sim 滞后 D 拍；30ms 与 60ms 双档通过）；关键画面经 zai 视觉 MCP 核验（结算 RETRY 可见、房间 RETRY AT WAVE 1/START 可点、重开对局干净）。

## 14. v0.2.2 动态多分辨率视口 + 新增 UI 原版风格化（2026-10-16）

两项用户需求：**宽窗口/全屏下战斗视野随之增大**（而非等比放大留黑边），与**新增界面完全融入原版视觉语言**
（替换旧深灰底板），间距体系化并天然适配任意分辨率。新增 deviation **DYNAMIC_VIEWPORT**（渲染层）；UI 改版
不新增编号（这些界面对原版本就不存在，属 SAVE_QUIT_RESUME / LAN_MULTIPLAYER / START_WAVE_SELECTOR /
GAMEPAD_INPUT 既有偏差的视觉演进），风格 token 皆取自原版美术实测。

### 14.1 DYNAMIC_VIEWPORT（渲染层，4:3 时逐字节不变）

| 层 | 行为 |
|---|---|
| 舞台 | 画布铺满任意窗口形状；逻辑舞台 = cw/s × ch/s（s = min(cw/640, ch/480)）——限制维恰好 640/480 像素精确，另一维延伸，舞台永不小于 640x480（小窗口自动缩到装得下为准）。`Presenter.computeFill` 纯函数（原 `computeFit` 移除） |
| 根布局 | 引擎每帧 `applyStageLayout`：根时间轴的遮罩层（帧 62 char 4，clipDepth 4）拉伸至全舞台（拾取的遮罩命中同步放宽）；其余**时间轴放置的**内容子级差分平移 `((W-640)/2,(H-480)/2)` 居中——菜单/大厅/设置/暂停等 640x480 原版画面居中、两侧纯黑。运行时挂载的根子级（XSI 缓存等）不受影响（按时间轴深度集判定） |
| 世界视野 | `CWorld.Init` 包装覆写 `mScreenSize` 为活舞台 → bmDraw/DM 分屏几何按真实窗口分配；世界剪辑 `_x/_y` 反向偏移 → 世界坐标 = 舞台坐标，画面铺满全窗（看得更多，缩放比例不变）。窗口 resize 中对局：bmDraw/mSplitScreen 在下一次未暂停的 Draw 惰性重分配（同深度换挂 BitmapData 后释放旧的） |
| 地图外 | 视图某维 > 地图 − 64px 时原 `CMath.Range` 夹持反转 → `Process_Tracking` 最外层包装（装于 NetScope 相机偏置**之外**，只修反转维、不扰预测）改为该维居中 `r=(area−w)/2`；既有 clampCopy / `world−mDrawPosition` 数学天然自洽：地面裁剪、物体落位、两侧露舞台纯黑。非 DM bmDraw 仅在可能露边时每帧清黑（DM 本就清透明）。18 图中 5 张小于 1280x960 某维——居中+黑域为既定用户决策 |
| 暂停 | 保持宽视野：暂停画面平移居中（SAVE & QUIT 为其子级随行）+ 包装绘制的侧带按原版 shape 21 实测配色（#993300@80% 盖 y<65.75、黑@85% 其下）铺满中央 640x480 之外的整个舞台——暂停观感与原版一致、只是更宽 |
| 过渡 | `CScreen_Transition` 首帧快照静态尺寸临时设为活舞台、入屏剪辑子级临时平移居中（`BitmapData.draw` 无矩阵=恒等、忽略源自身 _x，但渲染子级变换）、快照容器反向偏移 → 交叉淡化覆盖全窗 |
| 输入 | 鼠标拾取本就变换感知（`pickIn/$hitGlobal`，遮罩参与命中）——居中偏移零成本生效；手柄虚拟光标活动范围改为活舞台（菜单居中于其上）；LAN IP 框/IME 通道 DOM 胶水改 `contentToClient`（内容空间 → client），DebriefName 用 root 空间 bounds 本就正确不动 |
| Electron | 窗口不再锁 4:3（`aspectLockedBounds` 及其单测移除），保留最小 640x480、F11/Alt+Enter、初始 1280x960 |
| 确定性 | 全部渲染态（mScreenSize/相机/bmDraw 不入校验和）；LAN 两端窗口形状不同各自正确。无 presenter 的 headless 全恒等 |
| 金样 | 视觉套件固定 4:3 视口（640x480 / 1280x960）→ 舞台恰为 640x480，逐字节不变（`tests/visual` 零重拍） |

### 14.2 新增 UI 原版风格化（UiStyle 共享模块 + 逐界面）

共享层 `src/game/local/UiStyle.ts`：token 全部实测自原版（菜单项 ARMTB `#333333` + DropShadow(5°,45,5,black,0.18)、
signature 红 `#ef1304`、选项 pill 家族 `#f5f5f3`/`#d8d8d8`/`#1f1f1f`、选项窗口选中洗 `#e60000`@35%、间距
GAP=8/ROW_H=30/MENU_STEP=33）；构建器 `menuTextItem`（裸文字菜单项，`_Contents` 结构兼容 Register_Button
原版翻转）、`pillButton`（胶囊 + 悬停洗 + 字色翻红）、`panelCard`（新合成 sprite 9005 = 原版选项窗口
mcLock #274 + 白面板 #317 原样复用，即高分表同款窗框）；内嵌 SWF 字体。

| 界面 | 改版 |
|---|---|
| 主菜单 CONTINUE / LAN GAME | 深灰底板 → 与原版四项同款裸文字（30 号、同字体/色/投影、33px 节奏续列），原版 alpha50→100+抖动翻转原生生效 |
| 暂停 SAVE & QUIT | 深灰底板 → 原版 QUIT 的红色文字按钮语言（Calibri 26 `#ff0000`，悬停 `#fe5f5f`），居中于 QUIT 正下方 |
| START WAVE 选择器 | 深色方块 → 原版选择控件语言：白胶囊数值板（#f5f5f3/#1f1f1f）+ 左右白底描边三角箭头（#6b6b6b 描边）+ 悬停 `#e60000`@35% 洗 |
| LAN 大厅（ENTRY/ROOM/重试条） | 全屏散排 → 原版选项窗口面板卡（9005）承载：signature 红分区标题、白 pill 按钮、发现行为白 pill 行（满员/游戏中灰显 `#b0b0b0` 不可洗）、READY/START 主操作常驻选中洗、状态行/输入摘要居面板；IP 输入 DOM 同步白 pill + Calibri |
| LAN 设置屏 | 值板（MODE/DIFFICULTY/FRAGS/WAVE）→ 白 pill；BACK/LEAVE pill、START GAME 主操作常驻洗；WAITING 文字统一 INK（两种旧绿 #007000/#00ff00 淘汰） |
| 视觉验证 | 全部改版面经 zai 视觉 MCP 核验（对照原版 gallery 渲染）：主菜单四项+CONTINUE 同构、暂停红色按钮、波次器控件语言、大厅面板/两栏/pill 统一，逐项通过（见 `generated/reports/vis/`） |

测试：`tests/e2e/ui.browser.mjs` 新增 **viewport** 组（18 项：853x480 舞台数学、菜单黑带像素采样、room-1
地图居中 x=−74.5、两侧黑域像素采样、暂停带、竖屏 640x889 重分配与上下黑域、DM 分屏 0.667 缩放自适
应）；platform 组改填充断言（原 4:3 断言更新）；`lib.mjs` 拆 stage/content 双坐标空间（`centreOf` 恒为
root 空间）；`saveStore.test.ts` fit→fill 单测重写；aspect 锁单测移除。全套 vitest 1199 通过、e2e 178/178。

## 15. v0.2.3 独立镜头 + Desync 即返 + 暂停同步 + 回滚基建 + 四个 bug 修复（2026-10-17）

用户双机实测反馈的七项修复。新增 deviation 两条（`SPAWN_SOLID_FILTER`、`COOP_DEATH_WEAPON_CRATE_SOLID_RELOCATE`）;
独立镜头/拴绳解除、暂停同步、回滚属 `LAN_MULTIPLAYER` 语义演进，Desync 即返/难度值板/红箱贴墙为 bug 修复，均不新增编号。

### 15.1 独立镜头（拴绳解除 + 相机只跟本地玩家）

| 项 | 行为 |
|---|---|
| 拴绳 | LAN Coop 下 `KeepDistance`（19×13 格双人系绳）no-op、玩家复活扫描 `Spawn_ValidPosition_WithinPlayerScope` 恒真（两者必须成对——只解拴绳不解范围，P2 远离后复活扫描全灭即永久卡死）。单机合作保持原版。 |
| 相机 | `TrackThing` 包装：net coop 下忽略远端玩家的跟踪贡献 → 每端 `mTrackPosition` 只锚定本地玩家（渲染态、不入校验和，DYNAMIC_VIEWPORT 先例）。玩家走到地图边缘仍受原版地图夹持。DM 分屏本就独立，不动。 |
| 验收 | 打包双实机：房间 11 走向分离 22 格，双端锚点 0.000 格锁定各自玩家；视觉 MCP 核验双端截图（远端玩家出屏、地图无虚空）。 |

### 15.2 Desync 立即回大厅（原为永久冻结）

根因两条：收到 `desync` 消息的一端从不设 `desyncAt`（弃局计时 NaN 比较恒假→永久冻结）；帧断供+心跳存活时无停滞看门狗（WAITING 永挂）。修复：消息补设 `desyncAt`；`DESYNC_RETURN_MS` 3000→600；新增 `STALL_DESYNC_MS`(5s) 停滞看门狗（对端世界构建期豁免——重连冷启动 ~5-8s）；大厅横幅 "CONNECTION DESYNCED - RETURNED TO LOBBY"。打包实测注入 desync：双端 2.8s 内落大厅+横幅。

### 15.3 暂停双方同步显示

新 `{t:'pause'}/{t:'unpause'}` 消息（TCP 与输入帧同链路保序）：任一方按 P 双端同拍进入 `netPaused` 并挂上**原版 PAUSED!/QUIT?/UPGRADE LIST 覆盖层**（此前仅暂停端可见，对端只冻结）；任意一方可继续；QUIT 双端都接判负。打包实测：主机暂停→双端覆盖层、客户端继续→双端恢复。暂停期间心跳不停、掉线走既有重连。

### 15.4 回滚 netcode 基建（已就绪、默认待命）

GGPO 式预测+回滚全链路落地：`WorldSnap.ts`（逐拍全量世界快照引擎——own-prop 图序列化 + 原型分派（生产 bundle 类名被 minify，名称分派全灭，实测发现）、含 RNG/导航静态/nVD 方向缓存/mDrawPosition/NorSlot；离线混沌往返测试逐位相等）、`Rollback.ts`（预测簿记/纠错重放/确认前沿/声音队列）、协议 `rollback` 标志 + `PREDICT_MAX_LAG_TICKS`。**实测结论：真实异步链路上深度 1-8 都在第 2-4 个校验和拍出现微小持久态漂移（玩家 x 差 1-3/16 格）→ 深度 0 出厂**（基础设施保留、ring 门控关闭，一行常量可再启用）；稳态延迟由自适应 D 承担（每档比 v0.1.7 少 1 拍），v0.2.1 显示影子继续承担视觉即时（显示 12-31ms、sim 按设计滞后 D 拍）。30/60/100ms 单向三档打包实测全过：后半窗停帧 0-1、显示响应 ≤31ms、锁步/分数/音频双端全等。附带修复：预测期校验和挂起发送旧值（发送时取重算后的最新值）。

### 15.5 四个 bug 修复

| bug | 根因 | 修复 |
|---|---|---|
| 难度选择消失 | v0.2.2 restyle 控件改 `getNextHighestDepth` 分配，bDiff 恰落 SubScreen 素材的固定 depth 10 被顶掉 | ctor 先挂 SubScreen 再 Build（控件从 depth 11 起，永不碰撞）；lansetup 补 attached 断言；视觉 MCP 双端核验值板可见 |
| 出生嵌墙 | 房间 11 PATCHY 一个 P2 出生标记在 Slab 碰撞区内（原版数据缺陷），P2 出生扫描从不查 Solid → 种子依赖随机嵌墙后 PlayerCollide 永锁 | `Spawn_ValidateAll` 时剪除玩家出生表的 Solid 格条目（确定性、双端一致，登记 `SPAWN_SOLID_FILTER`）；新增 18 图 × Coop/DM × 4 种子全审计测试（spawnAudit，36 用例） |
| 死亡红箱偶尔不掉 | Coop 死亡武器箱复用原版"死亡格 StaticImpassable 则静默放弃"——被爆炸击退贴墙死即无箱 | `crateDropPosition` 螺旋搜索最近有效格生成（确定性，登记 `COOP_DEATH_WEAPON_CRATE_SOLID_RELOCATE`）；贴墙死掉箱测试 + netlockstep 双端一致 |

### 15.6 观测面

`__game.lan()` 增 rollback 计数器（predictions/corrections/replayedTicks/maxDepth/confirmLag/ringSize/desyncDetail）、`__setInfiniteLife`/`__forceDesync` QA 钩子；netsmooth 探针改测**显示位置**响应（影子在则 ≤1 拍+1 帧）并记录 sim 跟进时刻。

测试：`tests/sim/spawnAudit.test.ts`（36）、`rollback.snapshot.test.ts`（混沌往返+键序）、`rollback.book.test.ts`（簿记单元）、netlockstep 新增 rollback 组（T2/T6 子序列音频金丝雀、T3 窗口耗尽、T7-latch/DM、T8 声音咽喉）与 desync 消息路径/停滞看门狗/暂停双端/独立相机用例；`tests/sim/playtest.v023.mjs`（四项专项视觉验收）。全套 vitest 1244、e2e 178+28、打包 playtest lanui/typing/v012/net×4/netretry/netsmooth 30+60+100/v023、test:electron 42+6 全绿。

## 16. v0.2.4 按钮可见性修复 + 历史最高解锁 + 用户数据统一 ~/.boxhead（2026-10-17）

用户反馈三项：① v0.2.2 改版后 START WAVE 循环器按钮透明不可见；② 波次选择器改为进度解锁（默认第 1 波、上限为历史最高打到过的波次、跨次启动可选历史最高直入，联机以房主上限为准，旁标 BEST）；③ 所有用户游戏数据统一存放 `%USERPROFILE%\.boxhead` 便于管理备份。另按用户指令：GitHub Release Notes 一律英文（v0.2.3 的中文 notes 已整改）。

### 16.1 透明按钮回归（根因：AS2 绘图 alpha 是 0..100 百分比）

v0.2.2 改版把 CSS 习惯的 alpha 写法带进了引擎绘图 API（`alpha100To255`：`trunc(min(a,100)/100*255)`），`beginFill(color, 1)` → 2/255 ≈ 0.8% 不透明度 = 不可见，`35/100` → 0 = 从不渲染（`renderFill` 对 a≤0 早退）。新增 UI 里仅有的分数/数值 alpha 全部命中：

| 位置 | 原 | 修复 |
|---|---|---|
| UiStyle.ts WASH_ALPHA | `35/100`（悬停红晕从不显示） | `35` |
| UiStyle.ts pillBase ×2 | `beginFill(PILL_*, 1)`（所有药丸底板 alpha 2） | `100` |
| StartWaveUi.ts 箭头方块/三角 ×2 | `beginFill(*, 1)`（循环器只剩描边+浮字） | `100` |
| Viewport.ts 暂停上下遮罩 ×2 | `204/255`、`217/255`（宽窗口暂停带不可见） | `80`、`85` |

纯渲染修复（描边与文本本就不透明，测试的几何断言不经过像素故全绿）；LAN 大厅/设置的全部药丸底板、悬停反馈、宽屏暂停带随之恢复 v0.2.2 设计原貌。

### 16.2 历史最高解锁（`START_WAVE_SELECTOR` 修订，撤销 v0.1.9 "不持久化" 决定）

| 项 | 行为 |
|---|---|
| 记录 | `local/WaveUnlock.ts`：存档成员 `mMaxWaveReached`（Highscores/Resume 同款持久化：仅增长时写入、即时 `SaveData()` 落盘；每次读取直读存档不缓存，测试重置无需失效）。**进入即解锁**——局中波次推进（`__set__mLevel` 包装，与波次检查点同守卫）与开局即处于第 N 波（`InitFinished`，紧随 `recordRunStartWave`）都算"打到过"；单/双人本地与联机双端各自写各自存档（同步 localStorage 写、无 RNG/网络/校验和状态 → 锁步无感） |
| 上限 | 本地循环器在 [1..历史最高] 内回绕（新存档恒为 1，须从第一关打起）；`armStartWave` 保持 [1,100]（客机不知道房主上限，开局消息的波次双端权威）。LAN 设置界面波次盘按 `SetupSelection.maxWave`（新增可选字段，随既有 `{t:'setup'}` 镜像）回绕 = **房主上限**（波次本就房主独占操作，无需协议强制） |
| 展示 | 两处灰色 `BEST n` 小字：本地选关界面循环器右侧（stage ≈x182-252，与右箭头 9px 间距）；LAN 设置界面波次盘正下方 y420（盘 394-418 与底行 446 之间的空档），双端同显房主值 |
| 死斗 | 无波次，不记录、不显示、循环器本就不建 |

### 16.3 用户数据统一 `%USERPROFILE%\.boxhead`（新 deviation `USER_DATA_DIR`）

electron/main.ts：`BOXHEAD_USER_DATA`（QA/playtest，`BOXHEAD_DIST_DIR` 家族）指向精确目录（无迁移，测试要的就是所指内容）；否则 userData 恒为 `<用户主目录>/.boxhead`（便携版也不例外——v0.1.x 随 exe 存放的行为废止），首次运行且 `.boxhead/Local Storage` 不存在时从旧便携目录（`<PORTABLE_EXECUTABLE_DIR>/Boxhead2PlayRooms-data`）或旧 `%APPDATA%/Boxhead 2Play Rooms` 迁移 Local Storage（userData 里唯一属主内容，缓存/GPU/日志自建）。存档+设置=一个文件夹，便于管理备份。全部打包 playtest 改用 `BOXHEAD_USER_DATA` 隔离（v019/v020 为浏览器临时档案本就隔离，只补 unlock 种子）。附带：`--window-position=X,Y` 现在窗口**出生即定位**且以 `showInactive()` 显示（测试后台跑不再闪现/抢前台，CDP 注入输入无需 OS 焦点）；playtest 点击映射改走 presenter（DYNAMIC_VIEWPORT 非等比窗口下 /640,/480 直除会偏移——v0.12 CONTINUE 误点 LAN GAME 的根因）。

### 16.4 测试与视觉验收

`startWave.test.ts` 新增解锁组（新档钉在 1、区间内回绕、开局/推进记录且只增、无缓存直读、BEST 文案）+ 既有用例补种子；lansetup 补房主上限+双端 BEST 用例；netlockstep 波次开局补双端记录断言；e2e 新 `wave` 组（新档钉 1→种子 3→区间回绕+存档成员）；`playtest.v024.mjs`（打包三段：新档钉 1 / 种子 25 开局 LEVEL 25+局中推进落盘+**同目录重启 BEST 30 持久** / LAN 房主 30 双端 BEST 30+循环至 WAVE 3）；v019/v020 补 `__setWaveUnlock(100)` 种子行。v024 全部截图经 zai 视觉 MCP 核验（箭头可见、BEST 间距无重叠、LAN 盘下 BEST 对齐）。

测试：全套 vitest 1249、e2e ui 188+audio 28、test:electron 45+6、打包 playtest browser/v012/typing/lanui/net/netretry/netsmooth 30+60+100/v019/v020/v023/v024 全绿。

## 17. v0.2.5 全量视觉 QA 修复六项（2026-10-17）

发布前对 v0.2.4 做全量后台验证（门禁 + ~60 用户表面 zai 视觉走查 + 专项探针，证据 `generated/reports/v025-qa/`），发现并修复 6 个 remake 层 bug；另有 4 条视觉疑点经几何/代码复核推翻（过渡"孤岛"= authored 态自身黑边、合作开局帧 label 时差、DM"缺 frags 选择器"、HUD 误读），多组"异常"核实为原版 parity（Debrief 无 epitaph——原版屏本无该文本框、DM winner 无比分、新档默认 9/18 = 移植默认 `_LevelIndex_Single:8`、暂停/重连横幅下 HUD 浮字 = 移植绘制序等，台账见 bugs.md）。

### 17.1 LAN desync 返回大厅：世界拆除（S2，`LAN_MULTIPLAYER` 修订）

v0.2.3 的"desync 即返大厅"只切了状态机：`State_LanLobby` 处理器仅 `Process_Screen`，而 `DeleteWorld()` 只由 `State_Debrief*` 调用 → 世界剪辑永不拆除、一直画在大厅面板之上（探针实测 6s 仍在、面板不可见，玩家视角软锁）。修复：`State_LanLobby` 处理器补 `if (this.mcWorld) this.DeleteWorld()`（与 `State_NetEnd`/`State_SaveQuitMenu` 同型——过渡完成前 DeleteWorld 自身 no-op，逐帧状态处理器重试）。`playtest.v023.mjs` D 段补断言：返回大厅后双端 `!mcWorld` 且 RUN OVER 结束 pill 已被自身 2.5s 计时隐藏。

### 17.2 弹窗层级：cycler 让位（S3，`START_WAVE_SELECTOR` 修订）

运行时创建的 cycler 在 AS2 深度上必然高于 SWF 原生内容（`getNextHighestDepth` > 全部 authored 深度），v0.2.2 后一直以全亮压在 Options/Controls 弹窗上、遮住弹窗左下内容（输入锁定本身有效）。修复：包装四个 `Window{Options,Controls}_{Open,Close}`（窗口 `_visible` 的仅有关点），弹窗开启期间 `mcStartWave._visible = false`。

### 17.3 暂停列表与 SAVE & QUIT 重叠（S3，`SAVE_QUIT_RESUME` 修订）

红字 SAVE & QUIT 固定 `_y=452`，而解锁 ≥64 项时移植的三列列表延伸越过该槽（三张截图独立复现：默认窗 + 两种宽窗）。修复：Pause 包装实测本帧 `upgrade_*` 行底边（`列起点+行数*17`，同一父空间），`_y = max(452, 底边+12)` 仍居中同轴。

### 17.4 说明页页脚重排 + 徽章让位（S4，`GAMEPAD_INPUT` 修订）

旧页脚三行 y432/448/464：GAMEPAD/SAVING 行与左下输入徽章条（DOM，窗口底 y≈449-470）叠字，LAN 行越 480 底边被裁；武器行 y392/414 也与页脚相触。修复：武器行收紧 y390/410；三行文案各缩到 560px 单行（11px Calibri 不换行）置 y436/450/464；说明页期间徽章隐藏（`setBadgeHidden`，静态阅读页徽章纯噪音，其余屏幕照常）。

### 17.5 手柄光标边角钳制（S4，`GAMEPAD_INPUT` 修订）

光标锚点可钳到 `sb.w/sb.h` = 14×14 箭头盒完全出画（持续满偏摇杆 ~8s 即"消失"；DOM 探针实测钉在 (960,720)）。修复：钳到 `sb.w-14 / sb.h-14`（修复后实测 (939,699) 全可见）。

### 17.6 同机双实例发现错误文案（S4，`LAN_MULTIPLAYER` 修订）

同机第二个实例绑定固定发现端口 47630 必失败，大厅红字直显 `bind EADDRINUSE 0.0.0.0:47630`（真机 LAN 不受影响，每机各绑）。修复：EADDRINUSE 特判为 `another game on this machine listens - join by IP`（49 字符，适配 330px 状态字段；首版 84 字符文案两端被裁，已缩短）。附带结论：loopback 双实例永远无法验证发现列表行渲染（残留风险，文字断言已覆盖行构造逻辑）。

### 17.7 测试与视觉验收

修复全部走 wrapper/平台层（src/game/ported 文件零改动）；v023 补 desync 拆除断言（RED 于 v0.2.4 复现、GREEN 于修复版通过）；六项修复面全部重拍并经 zai 视觉复核确认（desync 后 GAME ROOM 面板完整可见、两弹窗 cycler 隐藏、SAVE & QUIT 低于列表留 8-10px 净空、说明页页脚三行完整+徽章隐藏、光标 (939,699) 边界内、EADDRINUSE 友好文案）；随后按发布门禁全量复跑（typecheck/vitest/e2e/playtest 全家桶/test:electron）。

## 18. v0.2.6 全面审计与界面纠正（2026-10-18）

### 18.1 LAN 独立行动的显示预测

审计发现 v0.2.3 已在真实模拟中解除合作距离限制，但显示预测仍执行原版 19×13 格拴绳；玩家远离队友时预测停止前推，产生输入延迟和追赶抖动。删除预测中的旧限制，仍保留墙体碰撞和模拟状态隔离。新增真实游戏回归先在旧代码失败，修复后检查两轴继续预测且权威位置不变；离线合作限制由既有回归保留。

### 18.2 暂停中的失步退出

暂停分支原先先于失步超时处理直接返回，导致已暂停的 LAN 对局收到 desync 后永远停在世界中。暂停只阻止正常对局推进，不能阻止失步拆除；回归在旧代码保持 State_RunWorld，修复后确认进入大厅、世界已拆除、session ended。

### 18.3 手柄分配按钮恢复真实点击

输入徽章刷新 cssText 时清除了 pointer-events:auto，且平台指针桥将 DOM 按钮的按下捕获到舞台，导致点击不能到达按钮。保留按钮点击属性，DOM 按钮/输入/选择控件拥有自身指针事件；释放徽章时清除手柄引用。新增浏览器回归用真实点击在合作选关交换 P1→P2→P1，旧版先复现 pointer-events:none，修复后完整通过。

### 18.4 LAN 双键位短按锁存

输入采样使用短路 OR，第一套键位按住时不会消费第二套键位的短按锁存，松开后可能多发一拍开火/切枪。现在两套锁存都消费后再合并，仍保留任一键位操作本机玩家的功能。回归在旧版捕获残留 mPressed，修复后确认松开无额外输入。

### 18.5 代码依赖清理与可复用审计

新增 tools/audit-code.mjs，记录所有已跟踪 TS/MJS 模块的导入、注册、动态访问与生命周期标记，并检查相对 v0.2.5 的移植文件变化。首轮覆盖 404 模块、117 个移植标记文件零改动。已核实旧 buildMenuButton 在 v0.2.2 被替代、全库无调用，删除旧实现及其导入；清理其他无用导入，修正偏差登记指向。类型检查与菜单/大厅/设置/显示列表 41 项回归通过。原版未使用类、资源、工具入口和回滚设施均保留。

### 18.6 主循环中位数窗口优化

FrameScheduler 原先每次查询刷新间隔都复制并排序 9 项采样。改为固定窗口原地有序维护，保留相同中位数、刷新率自适应、暂停重置及丢弃积压语义。tests/browser/benchmark-scheduler.mjs 对照 v0.2.5 实际实现，在含 30/60/144Hz、重复时间、抖动、长间隔与重置的 240000 个采样上逐项核对调度时间、间隔及上限；全部相同。三轮微基准中位耗时 71.59ms→7.44ms（该调度路径约 9.6 倍），每次有效 rAF 消除一次临时排序数组；这不是整游戏 FPS 倍率。9 项调度回归通过。

### 18.7 LAN 会话内存有界与释放

审计发现非回滚会话每拍仍分配 tickMeta 且永不清理，双方校验和表也随对局时长持续增长。仅在回滚模式记录逐拍元数据；校验和保留两个校验周期或更长回滚窗口，覆盖锁步可达的迟到比较。dispose 释放帧表、校验和、回滚瞬态及快照上下文，保留续局参数和检查点。600 拍回归旧版失败，修复后 metadata=0、每端校验和≤3，dispose 瞬态归零；锁步/声音/回滚共45项通过。

### 18.8 主菜单协调排版

保留原有顺序与所有入口，按实际可见条目以30px节奏排列，CONTINUE缺席时LAN自动收起空位。新增项移除重白描边，阴影移到与原画相同的父级，避免悬停后样式永久改变；点击框不再相互覆盖。六入口菜单在640×480、960×720、1280×720和640×889逐页截图核验；菜单35项浏览器检查、14项模拟/手柄回归通过。新增受控LAN浏览器验收也覆盖空列表/可加入/满员/进行中发现行。

### 18.9 波次工具栏协调

START WAVE 与 OPTIONS/CONTROLS 在同一基线；BEST 移到数值下方，方框箭头改为原版白色描边三角语言，统一共享柔和阴影。进度、循环、真实点击和弹窗避让保持。20项波次模拟/单元回归、58项波次/选项/改键浏览器检查通过，并检查实际截图。

### 18.10 暂停及对战视口动态缩放修复

真实截图暴露暂停后竖窗→横窗时覆盖层残留旧偏移、旧位图尺寸导致升级列表裁切。暂停布局现在在进入和 resize 时同步，冻结位图仅居中复制到新尺寸、不推进模拟；边带颜色跟随真正的居中标题带。另修正 Death Match 只改窗口高度时分屏纵向偏移未更新。浏览器回归旧版在204.5px残留偏移失败，修复后三种比例下位移、位图尺寸及冻结tick全正确，并验证对战高度单独变化的居中。截图逐页复核。

### 18.11 暂停操作固定在顶部

单机/本地合作的 QUIT 与 SAVE & QUIT 按原版红字语言并排置于顶部操作区，像素核对后对齐字形基线，保持各自独立命中区域。升级列表无需为新增按钮让位，删除按列表底部放置按钮的旧扫描。LAN仍只显示原版退出并接判负。6项存档模拟回归、真实保存退出→主菜单→继续完整往返及两种比例截图/几何核验通过。

### 18.12 LAN 大厅与设置页协调

大厅按左建房、右发现/IP加入分区，房间操作与状态分层，禁用按钮不再有可点击的悬停反馈。设置标签居中对齐数值，去掉与原版目标说明冲突的小Logo；新增控件集中到独立图层，避免切换模式后原版遮罩深度遮住文字及难度按钮。10项大厅/设置模拟回归、真实键盘IP加入、房间就绪、主客机设置镜像、切换模式后像素与真实点击检查通过；同步更新既有打包验收坐标，全部入口和协议不变。

### 18.13 输入徽章与网络提示协调

输入徽章改为原版浅色胶囊、红色活动边线，游戏中用半透明深底；高度18px且固定在底边4px，避开设置页底部按钮，游戏内收起连接说明。网络等待/重连提示移至HUD标题带下方，统一Calibri与柔和圆角，长错误文案可换行。真实点击分配双向回归、8项手柄与3项提示回归、类型检查和LAN/暂停截图检查通过。

### 18.14 Electron 后台验收保护

平台smoke原来会显示并激活测试窗口。新增仅由命令行启用的透明、不可聚焦QA窗口入口，正常启动行为不变；窗口保持在原显示器，避开屏外多DPI边框计算异常。保留原尺寸、音频、键鼠、全屏快捷键、存储迁移及协议断言，并增加不聚焦/透明断言，46/46通过。原生全屏的透明窗口截图可能挂起，仅该截图改由浏览器视口像素门禁覆盖；真实全屏状态、内容尺寸和快捷键仍全部验证。

### 18.15 共享样式清理与类型门禁加强

清除全库静态/动态访问均无使用的5个旧样式token，合并说明页重复滤镜构造到共享实现并保持原滤镜顺序/参数，修正文档中旧波次布局描述。引擎/共享合约和Node工具开启noUnusedLocals/noUnusedParameters检查，原版移植层保留其机械对应。类型检查、30项菜单/波次/手柄回归通过；资源、原版类与回滚设施均保留。

### 18.16 退出LAN时取消过期异步结果

审计复现点击返回后迟到的connect成功/失败仍把桥接状态改回房间或错误；旧请求还可覆盖新加入请求，迟到的地址/发现结果会复活旧页面状态。为加入、建房和离开设置操作代次，并在每个await返回处核对；连接已被wire消息推进时也不再倒退到lobby。5项旧版全失败的回归现全通过，连同大厅/设置15项及类型检查通过。

### 18.17 LAN 传输待完成资源取消

真实socket回归复现shutdown后待完成bind/handshake重新建立监听与peer，以及未发hello的入站连接残留。主进程增加host代次、共享并发建房promise、连接取消/扫描代次及待握手socket所有权；握手限时1500ms，成功后仍按原样关闭超时。发现bind期间停止会结束等待promise且不再启动清理定时器。16项真实协议/连接/重连/释放回归及类型检查通过，wire格式不变。

### 18.18 房间就绪提示修正

截图发现客机已经加入时主机顶部仍显示HOSTING/waiting to join。hello进入房间时清除旧建房文案，由房间状态生成未就绪/双方就绪提示。新增回归旧版失败，11项桥接/大厅回归及类型检查通过。

### 18.19 新增界面全比例视觉门禁

为主菜单、LAN空列表/发现/等待/未就绪/主机合作/对战/客机设置和暂停9类界面，各采集640×480、960×720、1280×720、640×889及DPR2，共45个场景。DPR backing store断言、切换模式后文字像素、真实点击/键盘、保存继续往返全部通过；说明页、排行榜、原版选项与窗口另由188项UI门禁覆盖。采用已批准的直接截图审阅+像素/几何/真实交互方式。

### 18.20 实际便携启动器验收

新增portable.electron.mjs直接启动NSIS单文件exe，通过独立CDP端口连接其子进程（Playwright Electron启动无法取得启动器未转发的inspector stderr）。校验实际解压目录asar版本，使用隔离存档，真实点击进入游戏、保存退出、继续及31声音健康检查。v0.2.5原始发布包基线提取与v0.2.6便携流程均通过；新增优化后最终包将再次运行同一门禁。

### 18.21 FlashType字符覆盖检查缓存

暂停CPU采样定位到缓存文字每帧仍逐字符调用$font/fontCodeMap检查覆盖。按不可变layout对象与Library身份缓存覆盖结果，WeakMap不延长已移除TextField生命周期；文本/格式/password/embedFonts/layout变化或库切换自动失效。新增回归旧版重复扫描失败，修复后缓存帧0次字体查询；CJK缺字仍完整回退。53项文字/滤镜/FlashType黄金回归、完整1265项Vitest及类型检查通过。实际函数微基准20000次变更等价，240000调用三轮中位65.67→3.65ms（约18倍，仅覆盖检查路径）；整游戏新对照另记录。

### 18.22 测试代码死项清理

全面unused审计进一步删除未调用的旧rollback flushVia模拟实现及其私有字段、无用类型/值导入和只读临时变量；保留有副作用的createHeadlessGame调用，给接口桩的有意忽略参数加下划线。所有断言和用例仍保留。148项相关回归通过；全项目noUnused额外扫描现只剩受移植契约保护的原版文件告警，引擎/工具的强制门禁保持通过。

### 18.23 历史真实点击脚本坐标修正

v024打包验收暴露脚本把getBounds得到的舞台坐标再次加内容居中偏移，旧矩形箭头掩盖了偏差，新三角形箭头真实点击落空。仅修正stageClick转换，保留全部选25/启动25/保存最高波次/重启/主客机镜像断言，重新完整通过。其余历史脚本同步30px主菜单节奏与暂停顶部QUIT坐标；browser三模式、v012、typing、v019、v020、lanui、v023、v024均通过。

### 18.24 真实UDP发现覆盖

增加单独的主机广播/客机发现真实socket验收，接收实际beacon后TCP加入，确认playing/players=2状态更新；该路径不依赖受控发现列表。17项协议/传输用例全部通过。双实例UI共用一机UDP端口的限制仍如实记录，不能等同两台物理电脑的硬件验收。

### 18.25 重连验收进程清理修正

完整net脚本重连后用const C2遮蔽外层变量，finally因此无法关闭重启的客机。改为赋值外层句柄，保持全部重连/续局/判负断言；完整真实双实例流程通过，正常/异常结束均可清理所启动进程。

### 18.26 可复现性能验收工具

生产构建性能probe支持固定seed/独立GAME_URL、p50/p95、CDP Task/Script CPU、JS heap、采样分配与GC、缓存/显示对象/已释放位图引用计数，并增加60次刷怪和暂停场景；页面错误及失效位图引用直接使采样失败。LAN真实TCP稳态/重连脚本复用采样器，保留原有全部断言和真实输入，支持原始v0.2.5基线asar。生产probe六轮、基线/候选30ms及候选完整重连首轮已验证；最终三轮结果另汇总到审计报告。

### 18.27 开发/打包玩法脚本后台保护

通用playtest的Electron路径原来仍会显示窗口，现两种路径统一使用透明不可聚焦QA入口；开发路径读取刚构建的dist，避免generated/qa-dist陈旧。开发与打包版三模式的游玩/暂停/结算/重试全部通过，未删断言。开发版保留既有Electron CSP通知（每进程1条）；打包版0警告，均0脚本/控制台错误。LAN重试门禁同时通过。

### 18.28 三轮生产构建性能证据归档

基线/候选交替各3轮，同机生产构建与固定seed182026。暂停p50中位1.6→1.3ms、p95 2.7→2.2ms（约19%改善）；普通对局p95 1.7→1.7、高负载1.8→1.7ms。采样分配中位691.5→665.4MB、GC总时长93.9→79.0ms，含相同仪器开销，不把某时刻heap变化当固定内存占用下降。所有阶段失效位图挂接数0；完整JSON、两项微基准和方法归档docs/verification/v0.2.6，LAN矩阵另补。

### 18.29 三轮LAN稳态证据归档

真实TCP注入30ms单向延迟，基线/候选交替各3轮，固定初始随机源和输入。host帧p95中位1.8→1.7ms、client1.8→1.9ms，波动范围相交，不宣称整体LAN加速；CPU总量host1552→1499ms、client1554→1559ms（20秒窗口）。六轮均锁步/声音/操作延迟合格，双端已释放位图挂接数全部0。完整数字采样（含逐帧数组）归档docs/verification/v0.2.6，完整日志仍留本机generated。

### 18.30 实际v0.2.5存档兼容验收

新增saveCompatibility.electron.mjs，使用正式v0.2.5的原始asar生成存档，关闭旧进程后让最终v0.2.6读取同一个隔离目录。真实SAVE & QUIT→CONTINUE往返保留version2快照、最高波次7、改键70、分数1234、血量137、Uzi弹药17及房间身份；全部断言通过。测试目录限定在generated，用户存档未被读取或改动。

### 18.31 三轮重连与延迟档位证据归档

基线/候选交替各3轮真实双实例完整net流程全部通过，涵盖检查点传输、重启客机、倒计时、波次/分数/输入延迟、判负、续局及30秒超时。重连阶段host帧p95中位均1.0ms，CPU1367→1373ms，阶段时长约21.8→21.9秒；资源失效位图挂接数均0。额外60/100ms单向延迟全部通过；100ms时host/client显示响应25/6ms、模拟跟进183/165ms。纠正脚本遗留的“D固定1/模拟立即响应”注释与日志，所有原断言不变。数值原始采样/中位数归档docs/verification/v0.2.6，LAN协调开启、预测深度仍0，不宣称模拟延迟消失或整体LAN加速。

### 18.32 v0.2.6发布验收

最终完整门禁：三套类型检查通过，Vitest1266通过/71既有skip（无新增skip或删除断言），UI188/188、audio28/28、新增表面45截图、三模式浏览器/开发Electron/打包Electron、全部历史专项playtest、真实UDP/TCP/重试/三轮重连/30+60+100ms、Electron46/46+打包6/6、实际最终便携启动器及真实旧存档兼容全部通过。117个原版移植文件相对v0.2.5零改动；动态注册、资源、回滚实验设施、存档version2与wire格式保留。

应用和锁文件根版本统一0.2.6；先构建再仓库外打包，asar代码/manifest与当前构建逐字节核对。exe大小101612312字节、SHA256 e501c19a41f5e9010fa63c7675f1a998370ce56105980cb8dc7768e6083a0680；最终单文件exe真实保存继续/声音通过，并按惯例归档。详细范围、修复前后、功能矩阵、性能方法/原始数据及限制见docs/audits/AUDIT_v0.2.6.md和docs/verification/v0.2.6。

## 19. v0.2.7 联机体验重构

### 19.1 旧连接回调隔离

真实连接被替换后，旧 socket 的迟到 close/error 和 data 回调仍会操作当前 peer，可能再次关闭新连接或把旧会话消息交给游戏。为每个已绑定回调校验 peer 身份，endPeer 也校验预期连接；同批消息处理中若会话改变则停止转发。新增回归在修复前失败，修复后通过。三套类型检查、协议/真实 UDP-TCP/桥接 24 项及既有锁步/快照/回滚 45 项通过；localhost 测试首次受沙箱 EACCES 限制，原断言在允许联网的环境重跑通过。此缺陷已确认，但尚不能归因为用户报告的周期性短暂停顿。

### 19.2 回滚分支快照与导航状态修复

新增真正启用深度6的独立模拟测试，迟到1/2/4 tick、连续160 tick的转向/射击在旧实现均与参考轨迹分歧。快照改为每拍输入执行前捕获，首次预测也可恢复；纠正后清除并重建后续分支快照。地图空格也保存导航nID/nDist，保留undefined而非强制置零，修复回滚后怪物寻路改变。远端预测按目标tick之前最新输入而非收包顺序选择。快照共享引用表改为每槽独立，淘汰/纠正/重置时释放该槽持有的地面副本。

新回归包括所有存活实体（含弹体/特效）的未量化位置、方向、生命、状态、动作计数、动画帧以及RNG和分数；仅去掉CMap.Draw写入且模拟从不读取的Drawn位。三档恢复与无预测参考相等；另有乱序输入预测边界回归。锁步/快照/回滚共49项和三套类型检查通过。仍未改变生产预测深度，尚需完整状态校验、真实异步链路及打包门禁，不能据此宣称已完成回滚上线。

### 19.3 预测模拟使用tick时间

寻路虽使用确定性工作预算，Nav_Update仍读取getTimer作为导航时间戳，重放时实际时钟已经前进。新增同步、可嵌套且异常安全的模拟计时作用域；开启预测时真实执行和重放的world.Process统一读取会话tick时间，平台/enterFrame时钟不变，离线及当前深度0兼容路径不变。新增作用域回归，并将真实预测测试扩展为导航时钟/扫描状态也必须一致；43项相关测试与三套类型检查通过。

### 19.4 零额外输入缓冲的显式回滚模式

新增可选start.netcode=rollback-v2（大厅尚未默认启用），本机输入在tick执行前提交，使用短按锁存且不等待远端；窗口按速度限制约240ms，历史保留16 tick以覆盖快速模式。实时/重放共享world.Process路径，预测结算等待确认，波次检查点与解锁记录在确认前沿提交，旧锁步路径保留。新测试验证角色0/1均在缺少远端下一帧时响应本机操作，1/2/4 tick迟到的纠正结果一致；8项真实预测、39项旧锁步测试及三套类型检查通过。声音即时反馈、完整状态摘要、传输协商和发布验收仍在后续阶段。

### 19.5 预测声音事件与去重

新模式在样本高级播放入口截获声音，早于停止旧声道/改声像，避免重放影响正在播放的声音。武器Update标记玩家来源，局部枪声在预测执行后播放；其他事件待确认，稳定tick/来源/样本/序号身份避免纠正及确认时重复播放。确认账本独立于预测播放并滚动清理；不要求两端实际播放时刻或错误预测声音相同，按本次用户明确选择验证确认事件身份/顺序一致。

真实游戏验证角色0/1缺少远端输入时移动、射击且枪声启动；三档连续回滚的确认事件数量/顺序摘要与参考相等（断言实际产生超过10个事件）。1000tick账本清理、错误预测撤销/去重单元测试通过；10项事件/预测、39项旧锁步及类型检查通过。

### 19.6 未量化的玩法状态分段校验

新模式checksum增加full分段摘要：全部实体（含弹体/特效）的有序属性、地图格、实体集合、导航、升级、输入槽、RNG/分配器及结算状态。不可变绘制资源以语义标识表示，XSI动画用稳定动画键和模拟帧/结束状态；排除已核实仅用于绘制的Drawn/mVisible/动画绘制缓存与本地控制器引用。既有wire字段保留，新增可选full；生成摘要不复制地面位图。新模式开局重置导航缓存与碰撞访问戳，消除进程上一局残留。

真实预测测试新增全分段相等断言；额外测试检测弹体1e-9位移、RNG、导航和属性顺序变化，且Drawn变化不构成玩法分歧。51项相关测试、三套类型检查通过；发布前仍需不同绘制节奏的独立进程验证。

### 19.7 独立进程异步回滚门禁

新增双子进程真实游戏模拟测试（隔离进程全局RNG），双方使用不同的移动/射击输入，输入异步延后2-6个enterFrame交付，客机额外执行两次Draw。300tick内持续触发预测和纠正，在线校验不分歧，最终全部玩法分段与确认事件摘要相等；三套类型检查通过。此测试是进程间故障调度，不冒充真实UDP/TCP或打包画面验收。

### 19.8 模拟与显示刷新分离（显式新模式）

平台增加仅用于显示的rAF回调，保持50Hz enterFrame与原模拟频率；新模式局部玩家在相邻tick间按碰撞约束显示外推，其他实体在相邻状态之间插值，纠正偏移短时衰减。位置引用在绘制后恢复，不写回模拟；镜头独立平滑。抖动、亮度与浮动HUD动画每个模拟tick最多推进一次，额外绘制不加速它们。完整玩法摘要排除浮动分数精灵（不是nTotalScore），保留真实分数/死亡数。

60/120/144Hz调度回归确认每个显示帧绘制且每秒仍50次enterFrame；真实游戏几何回归确认显示位置连续变化、实体位置引用恢复且完整玩法摘要不变。异步双进程与迟到回滚9项、显示/调度13项及三套类型检查通过。大厅默认模式尚未切换，实际截图/性能与打包门禁待后续完成，未声称现有发布版已提高帧率。

### 19.9 慢连接重试竞争

重连每秒触发connect，而主进程connect会取消上次未完成的连接；单端口等待可达1.5秒，扫描多端口更长，旧代码因此可以不断打断自己的重连。新增回归将连接保持pending四秒，旧实现调用四次（测试失败）；修复为同一重连代次至多一个pending连接，完成后才允许下次定时重试，并拒绝过期代次。七项bridge回归及三套类型检查通过。这解释慢链路恢复反复中断的一个确认缺陷，并非未经实测就断言是用户所有闪断的唯一原因。

### 19.10 可选UDP冗余输入快路

同一TCP连接通过可选input-path交换UDP端口/随机令牌；显式rollback-v2开局由主进程分配独立epoch。输入即时发送并每40ms重送最近8tick，包体上限1200字节；接收验证来源IP/端口、令牌、局代次和7bit输入，去重且有界保留。TCP仍发送可靠输入副本和全部控制/校验信息；UDP不可用或绑定失败直接使用TCP，不增加连接失败条件。连接关闭同时释放UDP，异步bind/延迟发送拒绝过期生命周期。

真实localhost测试明确屏蔽TCP输入写入后仍经UDP收到操作，再关闭UDP验证TCP回退；另测重传去重、旧局拒绝、错误令牌及bind期间关闭。21项UDP/TCP回归与类型检查通过。当前生产大厅尚未启用新模式；不将localhost结果冒充虚拟局域网丢包实测。

### 19.11 大厅能力协商与模式贯穿

hello显式声明rollback-v2能力，主机仅在验收开关与客机能力均具备时选择新模式（开关暂默认关闭），缺能力保持既有锁步。修复首次客机launch、重试、续局和重连start遗漏netcode的路径。新增能力有/无与首次客机启动回归；10项bridge、独立进程回滚及类型检查通过。

### 19.12 回滚暂停共同边界

新模式暂停由主机协调freeze/ready/commit，两端先冻结各自当前head，再推进较落后一端至双方head最大值，等待确认与纠正完成后显示暂停；任一端可恢复。这样不回退已确认副作用，也不会让两端停在不同预测tick。过期ready不能重新激活已取消暂停。独立进程300tick测试新增主机暂停/客机恢复，断言暂停时tick相同，恢复后完整玩法/确认声音一致。4项协调/跨进程、40项既有锁步/显示回归及类型检查通过。

### 19.13 短时断线保留世界恢复

新模式重连先交换局次/seed/head/缺失输入前沿，双方历史仍覆盖时补发输入并保留当前世界、回滚环和确认账本；新连接重新分配UDP epoch。暂停状态重新协调共同边界。缺历史、局次不符或客机已重启时明确拒绝，再发送原检查点和完整模式参数进行兼容恢复。

双进程测试新增中断/重连，逐帧断言world对象未被重建，最终完整状态与确认声音相等；客机无会话拒绝与主机检查点回退另有回归。3项异步生命周期、20项bridge/真实预测及类型检查通过；真实虚拟网卡与打包长跑仍是后续门禁。

### 19.14 等待/断线/失步分类与单调计时

主进程链路watchdog、渲染层重连倒计时/等待/失步退出使用performance.now单调时钟；心跳RTT由发送进程按单调时间计算后提供给渲染层。断线事件携带静默时长、TCP待发送量、UDP接收/拒绝计数；会话保留最近128条状态诊断（tick/确认前沿/原因）。新模式输入耗尽500ms后请求补发，6秒等待不再假称checksum失步，30秒未恢复按连接超时结束；旧模式历史行为保留。

新增系统时钟跳变不触发断线、输入等待补发与有界超时回归。30项真实预测/套接字、42项既有锁步/跨进程及三套类型检查通过。诊断记录区分传输断线和输入停顿，尚不能替代用户虚拟局域网现场日志。

### 19.15 永久贴花确认提交

审查确认旧快照每tick复制地面，但超过4MiB时直接跳过，预测错误的永久血迹/焦痕因此不可纠正。新模式在原随机取样之后截获QRender_Mask，将所选帧、方向、坐标和资源引用作为可重建事件记录，确认后仅落图一次；不再复制地面快照，原版/旧模式快照行为保持。声音与贴花账本分开。

新增错误预测贴花被替换、确认位置只落图一次的回归；真实迟到与双进程测试新增贴花确认摘要相等。6项贴花/快照/跨进程、13项实际回滚及三套类型检查通过。位图复制减少尚未折算为未经测量的帧率收益。

### 19.16 属性顺序恢复与跨进程故障矩阵

扩展至14组独立进程场景：0/30/60/100/200ms RTT、20/50ms抖动、1/3%主副本延迟替代、500ms断流、暂停/重连、三档速度全10种武器及DeathMatch低画质。包含重复输入、不同Draw次数，并对自然死亡要求双方同tick结束且无desync；这些是确定性故障调度，非真实网络耗时基准。

新矩阵在快速全武器第250tick稳定捕获仅things摘要分歧，原始快照证实值相同但mNewCell/Process插入顺序不同。根因为restoreOwnProps只重新赋值，不能恢复预测删除/重加后的枚举顺序；修复为仅当顺序不符时保存可复用绘制实例、删除再按快照顺序重建属性。保留完整顺序校验，未排序摘要掩盖错误。新增直接顺序回归；14组跨进程及真实回滚/快照共27项、三套类型检查通过。

### 19.17 DeathMatch周期检查点确认

补齐新模式DeathMatch每1500tick的检查点：实时与重放都在同一模拟步捕获暂存，只有确认前沿经过后提交，保留原有周期续局能力。新增1550tick独立进程测试，断言双方检查点准确到1500tick且完整状态/声音/贴花一致；类型检查通过。

### 19.18 打包新模式验收入口与测量

QA可显式选择旧/新模式，输出显示位置、诊断、确认声音账本及暂停共同tick校验。帧耗时采样补计enterFrame之外的world.Draw，另存真实呈现间隔，避免高刷新渲染漏计成本。现代回滚按预测窗口与重放上界验收，旧模式原纠正次数断言保留；现代操作探针必须实际执行，不能跳过。实际构建/asar校验后，两份离屏exe在30ms单向延迟下通过20秒窗口、零后半段等待、共同暂停完整玩法/声音一致与音频健康门禁；单轮显示/模拟探针13ms和6ms，仅作为功能证据，不作为三轮性能结论。

截图采用直接图片检查（未使用zai），并结合实际菜单点击、键盘暂停/恢复及已有显示几何回归：人物、怪物、武器/血条、ping及暂停层正常。证据归档generated/reports/netcode/packaged-60ms-trial。三套类型检查及完整build通过，发布门禁和重复性能比较继续进行。

### 19.19 三轮同构建交替比较

修正操作探针：怪物推挤会造成无关位移，核心指标改为按键至本机NetSlot实际应用；保留位移时间为辅助，不将其当输入因果证据。加入CDP分配采样及强制回收前后堆数据，原始帧工作耗时/呈现间隔全部保留。tests/e2e/net-compare.mjs串行交替三轮旧/新模式，记录同一asar SHA、CPU、窗口/画布和选择配置，可复用已完成的同构建有效轮次。

60ms RTT、固定种子、相同20秒左右移动脚本、1624x1258画布、原半自动手枪保持按下（因此这是移动负载，不冒充密集战斗基准），三轮中位数：

| 指标 | 旧模式主机/客机 | 新模式主机/客机 |
|---|---|---|
| 按键至输入应用 | 110 / 94ms | 16 / 33ms |
| 实际呈现 | 50.0 / 50.0Hz | 120.4 / 120.4Hz |
| 每帧工作p50 | 0.50 / 0.60ms | 1.30 / 1.30ms |
| 每帧工作p95 | 2.50 / 2.40ms | 2.80 / 2.60ms |
| 主线程忙碌比例 | 9.0 / 9.0% | 22.7 / 21.7% |
| 回收后JS堆 | 27.4 / 27.5MiB | 34.4 / 33.6MiB |
| 估计分配速率（采样） | 3.1 / 3.1MiB/s | 43.6 / 32.6MiB/s |

新模式每轮共同暂停完整玩法/确认声音一致，后半段无等待。收益是本机输入不再等待远端与高刷新呈现；回滚和更多绘制有明确CPU/分配成本，不宣称整体渲染更省。完整六轮原始数据、机器/build标识和summary.json位于generated/reports/netcode/compare-60ms；这些是候选构建的受控移动测量，不替代真实虚拟网卡或持续战斗/长跑门禁。

### 19.20 回滚提前终局时截断预测未来

迟到输入重放若提前触发终局，立即在真实终局 tick 停止；同步截断后续 tick 元数据、待确认声音/贴图和校验发送队列，并把虚拟时钟停在实际 head。新增先预测五帧、后在第二帧确认死亡的失败复现，修复后通过；live/process 共 26 项回归及全部 typecheck 通过。

### 19.21 打包战斗与真实连接恢复验收

netsmooth 增加可选反复射击（半自动手枪需释放再按下）、真实 closePeer 连接中断和恢复后 world 对象身份检查；现代模式在共同确认暂停点比较完整状态/声音事件，避免比较不同预测 head 的即时分数。60ms RTT 的真实 TCP/UDP 打包双端 20 秒战斗通过，双方 0 stall，82/77 次有界修正，恢复均保留原世界，确认状态及声音一致。长时间验收分配采样间隔单独改为 4MiB，短性能比较仍保持 32KiB，报告明确记录配置。

### 19.22 候选版默认协商回滚

候选大厅默认启用能力协商：双端具备 rollback-v2 时采用零额外输入缓冲；缺少能力仍保留原锁步路径。桥接回归直接断言生产默认值，不再依赖 QA 手工打开开关。11 项桥接测试和三套类型检查通过；README、deviations 与 AGENTS 更新确认边界、预测声音和显示插值契约。此提交仅使后续最终打包门禁覆盖默认入口，发布仍等待长跑及完整发行验收完成。

### 19.23 实际便携启动与旧存档验收

便携/存档兼容脚本从 package.json 读取当前版本并分版本归档，不再硬编码 0.2.6。真实 0.2.7 NSIS 单文件启动器（唯一 CDP 端口、隐藏不可聚焦、隔离存档）通过游玩、保存继续与 31 项声音解码。发布版 0.2.5 生成的 version2 存档在 0.2.7 保留房间、分数1234、血量137、Uzi弹药17、最高波次7与射击改键70。

首轮旧存档测试在恢复后的普通模拟已经回血时读到137.2667；修正测试夹具为暂停时写入固定值、真实恢复钩子结束且首个模拟tick之前读取，保留全部精确断言，重跑通过。未修改存档或回血逻辑。长跑进度日志改读已有worldTick字段，避免仅日志显示undefined。

### 19.24 长跑发现的模拟进度偏差

首个候选在60ms RTT连续30分钟通过：后半段0/0等待、15859条确认声音身份/顺序一致、共同暂停完整玩法一致、真实断线保留世界恢复，结束输入应用22/2ms，回收后JS堆约34MiB。原始报告位于generated/reports/netcode/soak-60ms；这是尚未加入下面追赶修复的候选，不能冒充最终构建长跑。

报告同时显示一端长期落后约3-4tick，导致领先端大量预测而另一端几乎不预测。新增200ms渲染缺口的双进程复现，旧实现到第220帧仍差4tick；另测预先收到未来输入，旧实现一秒仍只运行25tick而不能消除已知落后。现代路径复用既有120ms初始、每秒40ms补充的追赶预算，仅当收到的连续输入证明对端已到本端下一tick时回收一个时间片，最多每enterFrame两tick，暂停/终局不追赶，恢复后降回原cap。两项失败复现修复后通过，全部真实回滚/独立进程/旧锁步67项及三套类型检查通过。

旧100ms长测在约3分钟时主动通过自身隔离CDP端点退出；其关闭页面报告是主动取消，不计为通过。随后用户明确要求缩短测试、尽快使用，因此不再追加两档30分钟长跑与新一轮六次性能比较。最终追赶修复有失败复现与回归覆盖，但不声称最终构建经过30分钟长测。

### 19.25 结束会话释放追赶调度

补齐原有临时mFrameCap=2的生命周期：自然结束、判负与dispose仅在本会话仍为active时恢复普通cap=1，避免联机追赶设置残留到后续菜单/离线玩法。三种结束路径新增回归在修复前均失败，修复后通过；真实回滚/旧锁步54项与三套类型检查通过。

### 19.26 检查点重启重置输入时钟

最终双端重启验收发现：客机进程重启、传入检查点后世界恢复成功，但第50tick完整校验仅slots分组不同，双方正确退出到大厅。主机会话复用NetSlot，保留旧按键的时间戳和pressTick，而新客机从零开始；Renew仅清标志，不能重置时钟。每次重建游戏时原位重置全部NetSlot，与重置后的虚拟时钟一致，历史补帧保留世界的路径不受影响。新增检查点重启回归修复前失败、修复后通过，相关55项及三套类型检查通过。

### 19.27 最终打包重启恢复验收

旧测试在模拟tick之外强行切波，现代确认门禁正确拒绝把它记录为已确认检查点。测试改在目标tick执行之前注入一次同样的切波，并等待检查点确认；没有放松生产确认条件。补充恢复后世界退出时的完整双方诊断，定位了19.26的输入槽残留。

修复后最终打包双端完整通过：建房/输入IP/准备/角色镜像、零输入缓冲、双方31项声音、客户端进程退出及递减倒计时、重启传输检查点保留第2波、恢复后双方运行到425tick、暂停认输/双方结算、再次续局、30秒超时返回主菜单。最终renderer与main逐字节核对asar一致，报告归档generated/reports/v027。

## 20. v0.2.8 联机成长、恶魔补给与生存平衡

最终版本在双方协商支持后启用联机个人分数、永久等级、原版武器强化和四档PvE平衡。僵尸1经验、恶魔5经验，升级需求从5经验起、每10级增加5经验，125级封顶；最后一击得分乘本次升级前等级。顶部两侧显示个人分数、等级和经验，中间显示波次及两类剩余敌人数，头顶不显示等级。失败重试恢复本关开局成长与库存；选关新开按已清前波的平分经验模型和难度下限配给基础等级，分数及余量经验清零。恶魔概率掉落独立护甲/弹药箱，蓝甲覆盖原绿血，先甲后血，拾取不回血且原回血逻辑不变。成长、护甲和库存参与回滚及可选检查点扩展，旧能力组合保持原规则。

以下分项按实施顺序保留方案演进和失败证据；初期头顶LV与固定5经验方案已由20.8/20.14替换，最终发版验收见20.25。

核心验证：个人成长13项、桥接13项、既有选关16项/恢复6项/锁步39项通过；新增独立进程回归在100ms RTT+20ms抖动、真实预测纠正与历史恢复后，双方完整玩法摘要、个人成长、确认声音与贴图相等。首次测试夹具仅扣血未进入原版死亡状态，未实际产生击杀，已改为在模拟tick内执行原版State_Dying，不降低成长断言。

### 20.1 个人HUD与成长反馈

初期方案：顶部固定P1/P2个人分数、等级及5点经验条，中间WAVE关卡；头顶LV置于原武器/血条上方，贴边时将标识约束在顶部信息带下方。复用原嵌入字体、白字黑描边与绿色血条语言，浅底小圆角、12px外边距、独立210px玩家区。升级仅显示700ms的LEVEL UP!，无计时器/频闪/长弹窗。确认态数据驱动显示，绘制不修改玩法；暂停页分列两人的等级与各武器有效强化，取代共享倍率清单；ping移至信息带下方。

头显/布局回归2项及相关UI/成长共27项通过；无头Chrome实际点击进入联机，受控传输和视觉夹具验证5次原版死亡记账带来500分/LV2，随后查看15位分数、125级、三位关卡和满级强化清单。640×480/960×720/1280×720/640×889的几何与文本宽度断言、截图直接逐图复核通过（本次未使用zai）；证据generated/reports/v028/growth-ui。开局无敌闪烁会连同原版头显一起隐藏，截图夹具关闭闪烁后复核真实头顶间距。真实候选asar与dist renderer/main逐字节一致；30ms单向延迟下双exe战斗、原世界断线恢复、共同确认玩法/声音与本机输入响应通过，证据generated/reports/v028/combat-30ms。

### 20.2 大量爆炸的事件编号二次方开销

用户要求重新核查早期大量油桶/炸弹/手雷/地雷连爆的卡顿或炸房。新增32/64/128/256根混合爆炸物、125级强化的独立双进程回归，真实预测纠正后完整玩法、个人成长、声音与贴图一致，且断言实际爆炸峰值达到根数量。真实Canvas诊断在256根时派生1072个活动爆炸，未崩溃或掉房，但曾出现156ms呈现间隔；CPU profile同时看到快照、GC、绘制和事件扫描，不能把历史炸房全归为单一根因。

确认的缺陷是EventJournal.record逐项filter此前事件，突发成本O(N²)。改为每tick按冒号结束的前缀累计序号，保留包括kind前缀碰撞在内的原startsWith身份语义、回滚重建、音效去重及确认顺序。三轮交替同进程、预热、GC后测量：2000/4000/8000项记录中位95.84/387.53/1583.58ms降至1.51/2.58/6.98ms，确认hash逐档全等，确认后无保留事件。这是事件记账微基准，不冒充整局性能；新计数索引有短期内存成本，整体分配/内存仍待最终门禁。原始数据generated/reports/v028/events-paired.json；浏览器诊断与profile位于explosions-before和explosions-profile-before。事件身份、完整回滚/快照/独立进程共43项及三套类型检查通过，未更改原版移植文件或削减爆炸。

### 20.3 连爆热路径的数组枚举

256根连爆CPU profile显示forIn位于热点。稠密数组此前同时逐索引建字符串列表，再Object.keys和正则扫描，产生重复枚举与临时数组。仅对拥有完整自有索引、无附加命名属性的数组复用Object.keys结果；稀疏、非枚举、继承索引和命名属性均保留原回退，AS2顺序配置仍统一生效。新增边界覆盖、Flash oracle与爆炸/独立进程共482项和三套类型检查通过；原移植文件不改，伤害遍历顺序不变。三轮交替微基准与整体压力数据分别归档，不用微基准替代游戏帧性能。

### 20.4 连爆快照的稳定原始值复用

真实双exe每100tick触发256根混合连爆，20秒内4次以上、峰值1072活动爆炸，确认玩法/声音和断线恢复均通过，但主客最坏工作帧98/86ms、呈现间隔199/167ms，故未按“无明显卡顿”放行。profile中的captureValue/captureOwnProps及GC促使继续检查快照分配。

快照现在按对象WeakMap缓存未变化的原始值属性对，只跨快照复用不可变数据；位置/数组/对象/函数及共享身份索引仍逐槽捕获，own-property顺序和空导航单元不变。变化时创建新属性对，不回写旧快照；删除重插、undefined、旧快照不变及恢复新增回归。41项快照/回滚/独立双进程通过。最终帧、分配与回收后内存结果以重新构建后的整包验证为准。

### 20.5 爆炸显示插值分配

绘制历史直接收集位置，避免中间filter/map数组；静止爆炸的Draw仅读位置，位置与前后历史完全相同才免建临时位置。会移动的爆炸继续原插值；集束弹壳复用WeakMap持有的仅显示位置，每次绘制重写坐标并在finally恢复模拟位置和mP别名。未跳帧、删特效或改动模拟。新增静止/移动爆炸、弹壳多次插值和异常恢复断言；显示与21组独立进程（含四档混合爆炸和全武器）共22项、三套类型检查通过。整体压力性能仍以新构建测量为准。

### 20.6 快照方法名查找缓存

进一步profile仍显示captureValue为热点。按实例原型和函数WeakMap缓存方法名，每次命中仍用原描述符解析确认函数相同；方法删除、替换或重命名则重新扫描。保存格式、函数token与恢复逻辑保持。新增原型方法替换/改名失效回归；快照、真实回滚与独立进程42项及三套类型检查通过。同一1928对象场景、预热20次、GC后串行交替三轮，每轮100次捕获中位413.23ms→327.33ms，逐轮完整JSON相等；tools/benchmark-snapshot.mjs与generated/reports/v028/snapshot-methods-paired.json保留复现。曾尝试值对象token缓存，实测变慢，已撤回。

显示优化后的真实256根连爆仍有83ms响应失败；改为4MiB稀疏分配采样后，单轮恢复测试通过14/39ms，但另一个比较轮次仍有68ms失败，故不把分析器当唯一原因，也未放宽60ms断言。所有失败报告保留，整体性能门禁继续。

### 20.7 压力与界面验收夹具

补充场景桶连爆归属：场景桶归触发玩家，玩家放置桶仍归放置者，各取对应强化，14项成长回归通过。HUD截图新增MAX及3/5经验条实际绿色像素检查，四种窗口尺寸和真实点击通过。混合爆炸夹具在125级显式给双方相同全武器库存，避免旧版原升级遍历与新个人成长初始化方式不同导致基准负载不同。

真实TCP/UDP压力脚本可每100tick持续注入256根混合爆炸，维持原延迟、同步、资源和断线恢复断言；分配采样间隔可显式配置并写入报告。交替比较脚本固定双方相同4MiB采样、build SHA、种子、分辨率、预热和输入，保存原始帧/内存数据。候选任何轮失败即停止；基线性能失败可保存为对照但明确标注，不把失败当通过。最终结论仍须对应最终构建的全部轮次与长跑。

### 20.8 等级仅保留顶部显示

用户更新要求不再在角色头顶显示等级。移除头顶LV与其WeakMap，仅顶部两栏显示个人等级、分数、经验；保留原武器/弹药与血条，并按实际ammo边界避让顶部信息带，避免靠上玩家武器文字和关卡栏重叠。2项HUD回归、三套类型检查、完整build通过；无头Chrome真实菜单点击、四种窗口几何、经验条像素及无头顶等级断言通过，截图重新直接复核。旧界面的比较在第二轮候选启动时主动取消，不能算完成三轮；新界面将重新打包验收。

### 20.9 HUD稳定布局避免重复失效

顶部位置仅在逻辑宽度变化时重设，经验条仅在等级或经验变化时改比例；原头显仅实际需要避让才重复赋坐标，避免高刷新下无效变换使祖先显示版本不断失效。升级提示仍按700ms显示时钟更新。HUD回归、三套类型检查、build与Chrome四尺寸/真实点击/像素门禁通过，不以减少赋值次数直接声称整局性能收益。

### 20.10 当前波次两类敌人剩余数量

按用户新增要求，中间信息带扩为172px三列：普通ZOMBIE / WAVE / 红色DEVIL；640px最小宽度仍保持左右玩家区210px、外边12px、分区间距12px。三列10px标题同基线，关卡22px突出、敌人数18px分色，505/25及三位关卡均无挤压。

直接读取原版Level.Zombie_TotalCount / Devil_TotalCount，这是含待刷敌人的本波剩余总数，不误用并发上限Zombie_Count或当前存活数；原LogKill分别扣减。每模拟tick暂存显示副本，只有确认前沿提交时与关卡、成长同时更新，不增加线协议或模拟字段、不扫描怪物集合。实际普通/红色击杀、重复尸体、刷出不改总数、回滚与重试恢复、确认态不泄露预测值新增覆盖；四项计数/HUD与21组独立进程（双方确认计数相等）通过，三套类型检查和build通过。Chrome真实菜单/原死亡路径验证10→5与25→24分别扣数，四尺寸几何/像素通过，截图直接复核（未用zai）。为新需求主动取消旧界面的性能比较，最终新构建继续执行发行门禁。

### 20.11 恶魔补给、护甲及双色血条

单人、本地合作及双方支持 armor-ammo-v1 的联机合作，恶魔死亡使用一次种子随机判定：20%护甲箱、20%弹药箱、60%原补给。护甲上限100，拾取补满但绝不恢复生命；实际命中伤害先扣护甲、溢出扣血，保留原命中返回值、击退及眩晕。回血仍由原版 State_PlayerControl 执行，未被护甲接管；无/满/部分/空护甲及再次拾取的逐tick恢复量与原公式相同。弹药箱按拾取者各自升级后的容量补满所有已拥有武器，包括零弹药武器；不授予未解锁武器，不切枪、不改生命和护甲。死亡重生清除护甲，当前关卡检查点与可选version2字段保存护甲，旧存档缺省为0；短时掉落箱与原掉落补给一样不进入持久存档。

按用户最终要求，蓝色护甲填充叠在原生命填充上，隐藏复制的背景以露出下方实际血量，沿用原版从右向左的填充方向、外框和遮罩。护甲满时遮住血量，部分护甲可同时看到蓝色与剩余生命颜色，耗尽后只显示原血条。无额外头顶等级或文字。护甲箱使用蓝灰外壳/盾牌，弹药箱使用军绿外壳/黄铜弹药，保留原立体阴影及黑描边，加金属包角/铆钉；每Library每类仅烘焙一次，正常绘制不增加实时滤镜。

护甲/回血6项、弹药3项、能力协商15项及独立双进程22项共46项通过；后者含100ms RTT+20ms抖动、预测纠正和断线历史恢复下真实护甲/弹药拾取、恶魔掉落与完整确认状态/声音/贴图一致。旧能力不添加护甲字段或新随机调用。三套类型检查/build通过。无头Chrome真实键盘走过拾取、实际伤害100→60→20→0、溢出后生命77、全背包补弹通过；四尺寸9张截图直接复核，满护甲只有蓝色像素，部分护甲同时有蓝色/绿色像素且位置遵循原填充方向。证据 generated/reports/v028/supplies-ui；本次未使用zai。最初像素夹具误以为原填充从左向右，依据截图及原几何改正断言，玩法未改动。

### 20.12 同颜色区间内的护甲缩放修正

逐图复核发现100→60护甲仍显示满蓝条，原着色使用 ColorTransform 会按Flash语义接管该填充的时间轴变换；跌入另一颜色区间更换shape后才更新，因此只测20%像素不足以发现问题。改为填充shape专属颜色滤镜，仍使用原时间轴缩放，不改引擎/原版。新增100→60→45的宽度断言和60%蓝像素应缩至满值75%以下且露出绿色的真实Canvas回归；6项护甲回归、三套类型检查/build、9张截图及像素检查通过。低护甲与满护甲之间的显示现在连续对应实际值。

### 20.13 透明边缘精灵的等价单次绘制

最新真实双exe256根混合连爆报告 performance-supplies/1-candidate 中，确认玩法/事件一致、无掉房，但输入探针110ms未通过，因此仍不放行。CPU调用栈 cpu-supplies 显示 drawImage 占主要工作时间；其中亚像素平移为保留Flash覆盖边缘会把一个位图拆成最多9次绘制。

引擎对反复使用且版本未变的小型透明位图，仅在第8次命中时检查完整设备像素外边缘；四边alpha均为0时，边缘覆盖绘制必不产生像素，按原最近采样及半像素取舍规则只画一次相同内部。仅同倍率、纯平移、normal、不透明度1、无暂存变色的单画布源启用；其他路径不变。WeakMap只存版本与资格，修改任意像素失效，不保留像素副本；一次性/频繁变化的目标不读回。原版文件不改、爆炸数量/帧/伤害/声音不变。

浏览器1568个1x/2x相位、负坐标、半透明内部、alpha、平滑、裁剪及边缘变更组合逐设备像素相等；预热后两次绘制共2次blit（原分段路径各9次）。既有Canvas/Flash引擎265项全部通过、三套类型检查/build通过。整体双端性能收益仍待此新构建三轮比较，不以调用数替代帧数据。

### 20.14 四档PvE对抗平衡

按最新需求，单人/本地合作/具备协商能力的联机合作采用独立难度曲线：Beginner/Intermediate/Expert/Nightmare 普通僵尸同时上限40/44/48/56，恶魔2/3/4/5；原LOW画质40上限仍生效。刷怪间隔随波次渐缩、恶魔随难度更快补场，速度上限分档；每波总击杀数、敌人100/1000生命与50伤害、原攻击模式和武器升级表不变。恶魔并发不超过其本波预算，避免早期并发上限大于总数。第一波速度仍1.1，保持原入门时序；本地连杀成长机制保留，不增回血或护甲来源。

联机个人成长升级需求为5×(1+floor((等级-1)/10))，前期保持快速反馈，中后期延长升级跨度，僵尸1经验/恶魔5经验和125上限保留。新选关从此前各波两人平均击杀的同一曲线计算基础等级、授予对应已有武器，分数/余经验清零，并保留难度起步等级下限；失败重试恢复检查点。波1/10/20/35/50开局模型等级1/22/46/84/122；离散50%击杀份额模型满级点由原波19延至波50，30%/70%份额为波65/43。这是模型，不宣称人类胜率。20%护甲/20%弹药/60%原箱和100护甲保留，回血完全独立。LAN须同时支持pve-balance-v1、personal-growth-v1、armor-ammo-v1，旧能力不更改曲线或字段；Death Match不变。

tools/balance-audit.mjs 保存400条波次配置、三种击杀份额、真实武器属性及四难度×三种子×单人/合作24次正常按键bot诊断，均无脚本错误/硬不变量异常；不把bot结果当人类乐趣或通关率。13项平衡/选择低波次保留难度下限、18项能力协商、26组独立双进程（含四难度补给/预测纠正/历史恢复/合法死亡结算）及14项旧成长回归通过。原规则精确断言改为明确classicWaves夹具保留，另测新曲线实际刷怪与LOW/HIGH上限；未删断言/加跳过。成绩页测试改用真实子弹/死亡记账产生分数，避免把固定bot在新时序下是否瞄准当作提交成绩前提。新经验条39/65、MAX、四尺寸几何/像素与暂停双列截图直接复核通过；起初读取到700ms升级提示，改为等提示自然结束后断言，不改提示时长。证据 docs/verification/v0.2.8/balance.json 和 generated/reports/v028/balance-ui；完整发行门禁继续。

平衡后的全量回归初跑1382项通过、1项合作流程失败：主动bot在新节奏下超过原4000tick仍存活，原“必须双亡”断言未满足。复活检查后增加双方明确停止射击的终局阶段，保留原死亡/人数/结算断言，10项流程重跑通过；不削弱原断言。三套类型检查与完整build通过，最终整包全量回归仍需重跑。

### 20.15 校验临时图的原始值叶节点复用

三轮 performance-clear-border 的主客输入均通过（主机最坏15ms/客机41ms），p95中位10.7/10.5→9.7/9.7ms，但主机每轮最坏工作帧中位102.8→111.8ms未通过，故没有发布。新平衡构建的帧分解进一步出现112ms输入失败；最慢一帧绘制4.8ms、模拟24.9ms、enterFrame106.7ms，剩余主要在快照/回滚/校验，不能仅靠减少绘制调用认定已解决。

StateDigest对全为有限数字/字符串/布尔/null的原始值叶数组，仍先登记原有alias/ref编号，再直接复用不可变输入交给原JSON.stringify，免建第二份叶数组。非有限数、undefined、空洞、循环、特殊asset/xsi/mcanim/obj和自带toJSON均走原转换；原hash字节、字段与顺序不变。保留92c1f5d的原算法测试夹具，新增Unicode/转义/别名/循环/空洞/特殊token全等断言。相同1928对象快照、预热5次、GC后三轮交替每轮30次，中位365.26→344.82ms；这是校验微基准，不替代整局门禁。50项校验/快照/真实回滚/独立双进程与三套类型检查/build通过。

曾尝试直接流式哈希，约慢2.3倍，已撤回；快照函数token复用没有明确耗时收益，也未保留。原始失败/尝试数据仍在 generated/reports/v028。性能工具记录每帧模拟/绘制/enterFrame分解并标注metricsVersion2，防止跨采样配置复用旧结果。

### 20.16 快照原始值字典叶复用

快照中升级表条目等纯原始值字典此前每拍创建dict、属性对和undefined token。改为按源对象WeakMap缓存，仅当own-key长度/顺序及每个原始值Object.is全部相同才复用完整叶token；变化即新建，不写旧槽。仍逐槽登记原对象alias，含对象/函数/共享索引的字典完全走原递归，原owner函数解析与mControls语义保留。验证时已读取的前缀及首个变化值用于后续捕获，getter按原顺序只读一次。字段、快照JSON和共享格式不变。

同一1928对象、预热20次、GC后串行交替三轮，每轮100次捕获：未采样耗时中位342.84→337.18ms，幅度很小，不据此宣称整体帧收益；32KiB分配栈采样（包含已GC对象）分配量中位约907.7→797.4MiB/100次，减少约12.1%，逐轮完整JSON相等。原始数据 snapshot-dict-leaves-paired.json / snapshot-dict-leaves-alloc.json。先尝试逐字段Map缓存略慢，已改为逐叶验证；早前函数token复用也未保留。整体长帧、内存与真实双端性能继续用新构建验证。

48项快照/真实回滚/独立双进程与三套类型检查/build通过；新增回归覆盖整叶复用、数据改变/重排、getter次数、非原始值回退、mControls仍按原格式捕获、共享别名恢复及旧槽不变。

### 20.17 双端性能采样的GC屏障

复核工具发现顺序结束host/client时，host的采样后强制GC仍落在client计时窗口内，会污染客机长帧与分配数据。增加幂等freeze：先停止双方帧/分配采样、恢复测量包装，再分别做窗口外GC；报告记录sampleEndedAt/collectionStartedAt并严格断言任何GC都晚于双端结束。netsmooth和普通net双端采样统一使用屏障，比较配置升级metricsVersion3，旧结果不复用。生命周期回归与脚本语法检查通过，真实包门禁继续验证。

performance-balanced-dicts三轮候选中前两轮输入42/34与54/55ms通过，第三轮180/45ms未通过；本次测量工具修正不把这个输入失败归因于GC，也不放宽60ms门槛。此前数据保留为失败/诊断证据，最终比较必须重新按统一配置运行。

### 20.18 已知不透明地面遮罩省略中间合成

爆炸确认调用栈中QRender_Mask/copyMasked累计约占20秒窗口的0.76–0.83秒，属于确认时的集中开销。alphaOnly遮罩完整paletteMap时复用本来已经读出的像素，记录16设备像素分块的保守全不透明标记；copyMasked仅当覆盖分块全部为255、版本一致且缩放为1/2倍时走原copyPlain。半透明/透明、修改后未重建、其他缩放与自引用目标保持原路径。不在爆炸时增加GPU像素读取，不减少焦痕/声音/事件，不改变模拟与确认顺序。

新增3074组逐设备像素对比（1250次快路径），覆盖1/2倍源/目标/遮罩、canvas/分块、透明/不透明目标、合成/覆盖、边界裁剪、遮罩修改失效与重建、2048像素处理块，结果与无缓存的相同遮罩逐字节一致；既有265项浏览器引擎检查通过。最终真实打包双端峰值收益另行测量，不把像素等价测试当作性能结论。


### 20.19 遮罩优化候选三轮匹配性能比较

相同Windows 11/Core 5 220H、默认2倍渲染、约120Hz、同种子/输入/分辨率、独立存档，v0.2.7与新包串行交替三轮。每轮3秒预热、20秒测量，30ms单向延迟，100tick一批256个满强化混合爆炸根；4MiB稀疏分配采样，双端freeze后才窗口外GC。候选asar为9b8ede74c2dc783901a733c1b69a8e631e432183c81be809178b703ab4667841。

双方p95中位10.6/10.2→8.3/9.0ms；逐轮最大work中位115.0/108.6→86.5/58.3ms，最大间隔中位154.7/148.2→87.3/72.1ms；估计分配113.69/115.21→85.86/88.06MB/s，GC后堆36.67/36.76→33.01/35.28MB；三轮最慢输入95/95→39/26ms，候选三轮均通过60ms原门槛。CPU busy约不变，新增HUD对象/滤镜像素略增；仍有超过刷新周期的长帧，不宣称绝对零卡顿或所有硬件同收益。旧版三轮响应失败72/95/95ms原样保留，不当成通过。

候选全部比较门禁通过，共同确认玩法/事件一致；原始逐帧/分配报告位于generated/reports/v028/performance-opaque-masks，逐轮标量、构建hash和中位数据收录docs/verification/v0.2.8/performance.json。完整Vitest最终1386项通过、71项既有跳过；其他发布门禁与持续联机长测继续执行。

### 20.20 初始文字像素与历史夹具适配

补充双方初始分数相同时P2身份、分数、等级及经验的实际文字像素断言，新旧成长路径均通过。一次截图预览被误判为右侧裁切，独立探针与原PNG逐像素计数证明初始文字一直完整，没有据此修改生产渲染器。

历史v019原4.2秒不少于10只的截图窗口不再适用已批准的Beginner出怪节奏；保留原数量断言，等待6.2秒实得12只。仅镜头/导航夹具开局前启用原版免伤开关，拍完关闭再执行真实死亡箱测试，全部原等级/武器/弹药断言保留。正常生命的战斗另有24次平衡诊断与流程测试。历史v023在绘制结束后读取被现代presentation恢复的临时lTrackPosition，更新为实际相机与本机玩家地图裁剪视口的几何比较，保留一格门槛与旧协议锚点分支；双方误差0.031/0.000格，同步暂停/恢复、强制失步返大厅均通过。

### 20.21 ping避让按实际显示缩放更新

新增HUD曾把DOM ping固定在58 CSS像素，而960x720窗口的HUD底边实际为75 CSS像素，产生重叠。新增失败复现后，改用已有Presenter.logicalToClient映射逻辑y=50，并保持8 CSS像素间隔；订阅Presenter.onResize，无新心跳时也立即更新。只保存布尔显示状态与可释放的订阅，不持有会话/世界引用；reset释放订阅，旧玩法位置与终局隐藏保留。

四尺寸新旧成长UI、4项overlay单元、三套类型检查/build与真实打包双端完整联机通过；后者包含检查点/进程重启恢复、共同tick426、认输、再次续局及30秒超时回主菜单。旧net门禁仅查固定top=8的位置，改按真实ping内容查找，布局由多尺寸几何断言单独严格约束。失败复现和修复后数据见docs/verification/v0.2.8/ping-layout.json。新asar为e624507c89cc7935254858e7d1fa37b2a020cb9232620e0c6309f8c525b949c1；20.19数据属于修复前候选，新包性能另行三轮比较。

### 20.22 连续渲染缺口的有界调度债务

e624候选完成三轮短时匹配比较，但600秒、60ms单向延迟、每100tick触发256根混合爆炸的长测未通过：客机后半段新增30次等待。到480秒已越过门槛，随后附加的诊断采样不计为无干扰性能数据；未发生崩溃，不冒充最终共同tick一致性和断线恢复通过。

独立双进程新增每秒200ms渲染缺口，旧调度在第199帧仍相差4tick，复现失败。原版ProcessFrames先消费全部时间再限帧，连续缺口超过每秒40ms信用补充时会持续丢时间。现代LAN包装器仅在已收到对端未来输入证明本端落后时，保留最多3个真正被限帧丢弃的时间片；每enterFrame仍最多2tick，暂停屏障、终局、非本会话世界和旧路径不启用。未改移植类、预测窗口、输入延迟、RNG或通信格式。新增反复缺口回归与长缺口债务上限/暂停/结束检查通过；27组独立双进程完整玩法、确认声音和贴图一致，既有39项锁步与17项真实回滚通过，三套类型检查通过。新包真实长测和最终发行门禁仍待完成。

### 20.23 根目录、说明文档与发行文案整理

根目录保留主入口、主配置、双语README、AGENTS/CLAUDE协作入口与PARITY变更记录；工程约定移至docs/CONVENTIONS.md，两份历史审计移至docs/audits，三份辅助TypeScript配置移至config。更新当前引用与npm类型检查入口，历史标签的Release链接保持原目标。通过TypeScript配置解析器逐项比较，迁移前三套编译选项及完整检查文件集合与迁移后完全相同。

双语README保留原有标题、徽章、操作表和素材声明，缩短介绍与功能描述；详细玩法单独整理到docs/features.md和features_zh_cn.md，新增docs/README.md索引。五张4:3截图统一width=640，在较窄屏幕按比例缩小；本地Markdown链接和素材路径检查通过。双语桌面1024px/手机390px离线预览共4组通过，5张图均等宽且无横向溢出，直接截图复核后补齐图片居中和段落间距；这是本地预览而非GitHub页面截图，几何记录见docs/verification/v0.2.8/readme-layout.json。三套实际类型检查通过。发行说明参考v0.2.4/v0.2.5的主题标题、表情分节、简短要点和变更对比链接，保持英文。

### 20.24 按用户要求采用实用延迟门槛

最终08d0构建的三轮交替比较中，帧耗时p95、连爆尾峰、分配、CPU、回收后堆和位图引用门禁均通过；原相对输入比较因主机单次最坏46ms高于基线32ms+5ms而失败，原summary另存summary-strict-history.json。补充自由相位及观察到tick后0/10/20/30ms五点采样，发现旧版76/139ms、新版一次65ms；该新版报告按原60ms门槛失败并保留。后续CPU诊断两轮分别42/49ms、34次采样最大45/58ms，带分析器的数据只作定位，不混入正式三轮性能结果；没有据未复现的65ms峰值继续改动原游戏或削减效果。

用户随后明确要求“性能测试不要过度严苛，能满足良好的延迟标准即可”。据此普通场景仍要求显示及现代模拟响应不超过60ms；256根混合连爆压力允许不超过100ms的偶发峰值，取消以三次不同按键相位的32ms/46ms差异单独判退化。正确性、长期等待、恢复、帧p95、尾峰、CPU/分配/内存和资源断言不变。对完全相同的三轮原始数据重新评估，最终候选主客最坏46/40ms、所有门禁通过；没有重复耗时对照、改写原始失败或把65ms称为原60ms标准通过。额外相位采样保留为可选诊断，正式结果明确标注采样方式与实用门槛。

### 20.25 最终发行验收

最终asar与实际单文件便携包解压后的asar均为08d0c020f540ca30a5e9e462d7377ffcfe56c61ab031e5e3f87eec2ae5a4fb27，包内0.2.8及main/preload/renderer构建文件逐字节核对。全套27项发行门禁通过：Vitest 1389项通过、71项原有跳过，UI188/188、音频28/28、遮罩像素3074组、引擎浏览器265项，以及成长/补给多尺寸、输入设备、宽高比、三种玩法浏览器/Electron/打包、v012/v019/v020/v023/v024、文字输入、大厅、联机重试/进程重启续局/30秒超时、原生Electron及打包窗口/全屏和实际v0.2.5存档兼容。未新增跳过项；代码审计457模块、117原移植模块、changedPorts为空。直接截图、像素/几何与真实点击复核，未使用zai；假手柄不冒充实体设备验证。

最终构建三轮交替比较，主/客p95工作帧11.1/12.0→9.4/9.1ms，最大工作帧的逐轮中位136.9/140.0→84.6/86.5ms，最大呈现间隔中位216.1/237.8→94.1/94.0ms；估算分配117.29/116.73→89.32/82.46MB/s，GC后堆36.95/36.59→33.13/32.92MB。CPU主机约+4.6%、客机约-2.3%，不是整体CPU下降；HUD对象和滤镜缓存面积略增。普通60ms单向链路下响应14/29ms；30/100ms单向链路的256根连爆响应9/29、6/21ms，均真实断线并保留原世界恢复。相同最终asar的600秒60ms单向连爆长测后半段仅1/0次等待，峰值1072爆炸，共同tick14963完整玩法及408192条确认声音身份/顺序相等，响应22/20ms；最终重建asar不变，复用此已通过长测。旧失败数据、原相对输入失败和65ms超出原60ms的采样均保留，采用用户要求的普通60ms/极端连爆100ms实用门槛，不声称零卡顿。

实际NSIS单文件exe的游戏、保存继续及音频通过；exe为101626157字节，SHA256为2341c22f2063b0379461d957b6be32aabcfd367fc178d7fddb4f2c6e9559d249。公开标量、方法、限制、门禁与制品校验见docs/verification/v0.2.8，英文Release Notes按主题标题、少量表情、简短要点、PARITY与完整对比链接整理。

## 21. v0.2.9 开发与验证

### 21.1 双角色响应诊断

确认房主与客机都通过submitLocalInput、NetSlot和NetPresentation执行本机输入，rollback-v2额外输入延迟均为0；未发现需要给房主增加等待的角色差异。增加默认关闭、最多2048条的会话诊断，记录键盘事件、采样、NetSlot应用、每tick首次绘制的位置/镜头、声音呈现、等待原因及重放耗时；不进入世界、RNG、存档、通信或校验。`window.__game.__responseTrace(true/false)`控制并清空采样，无参数读取。测试脚本`BOXHEAD_RESPONSE_TRACE=1`仅作诊断，性能比较默认不开启；`BOXHEAD_CLIENT_FIRST=1`交换采样顺序，并允许0ms链路基线。

两角色本机显示/位置恢复回归、下一tick本机移动/开火与声音诊断通过；三套类型检查通过。29组独立双进程回归通过，新增房主/客机分别单次及反复渲染缺口，保留相同确认tick的完整玩法、声音与贴图身份顺序断言；含0/30/60/100/200ms RTT、抖动、恢复及混合连爆。诊断容量/关闭释放测试通过。此处是代码及模拟回归证据，真实双端毫秒响应与打包性能留待最终候选测量，不将RTT测试冒充单向延迟实测。

### 21.2 确认后独立飘分

原CHud.mScores进入回滚快照，且每次Draw按固定步长移动，额外显示帧克隆后又恢复旧位置；复现了位置倒退/停顿。新增个人成长飘分独立事件日志，在击杀确认后播放一次；动画、字形位图和900ms显示时钟存于HUD的WeakMap，不进入回滚或校验。原分数计算、掉落及RNG顺序保持，旧LAN路径保留。终点读取对应P1/P2分数文本在世界中的真实边界，缩放时重新计算；暂停冻结，离开世界释放位图，LOW画质不新增飘分。同一金额的并发字形共享位图，最后一条完成即释放。

两角色回滚前后位置不倒退、确认前不播放、重放去重、暂停3秒、缩放、900ms结束及LOW回归通过；14项成长与29组独立双进程一致性回归通过，三套类型检查和build通过。当前构建无头Chrome经真实点击进入联机，640x480、960x720、1280x720、640x889四尺寸均记录218条绘制采样，验证两个目标、800～1000ms显示跨度、逐帧不倒退及实际字形/描边像素。直接复核四张截图，未使用zai。浏览器测试发现初始弧线终点轻微回摆，改为单调平滑路径后通过全部断言。证据脚本为tests/e2e/floating-scores.browser.mjs，标量归档见docs/verification/v0.2.9/floating-scores.json。

### 21.3 音频启动与故障恢复

首次AudioContext构造失败时旧代码尚未启动watchdog，交互处理器还会移除自身，导致某些启动全程无声。现在创建前即启动恢复调度，失败保留下一次交互重试，Electron启动主动resume。所有resume入口共享一次尝试，挂起的底层请求不会被每个调用者重复提交；重建有并发保护，旧上下文事件、解码和resume完成通过上下文身份及代数隔离。关闭/长期挂起、连续3次节点失败、预期播放期间运行时钟3秒不前进会重建音频图及样本；保留静音选择、完成旧声音以释放mPlaying，不补播积压音效。首次恢复前的静音声音也会结束，避免墙钟切换至AudioContext时钟后永远等不到完成。

30项音频单元测试通过，含8项新增故障/时钟/并发回归；三套类型检查及build通过。当前构建无头Chrome音频门禁49/49通过：原启动、下载重试、失败样本修复、suspend、close保留；新增首次构造持续失败后恢复、解码拒绝、连续节点失败、伪装running但实际停钟及resume拒绝。5种注入均无需重新载入页面，并从真实WebAudio输出图的Analyser测得非零波形峰值0.8395；这是数字音频输出证据，不冒充实体扬声器试听。归档见docs/verification/v0.2.9/audio.json。

### 21.4 房间设置与合作队友穿透

等待房间和开局页共用原画风设置面板，房主可修改难度、速度、恶魔、玩家碰撞、友伤及死亡竞赛胜利条件；客机同步只读。数字0/1及布尔存档开关统一解析，修复0被默认值误认为开启。运行中拒绝修改，续局沿用原start配置。新增可选lobby选择字段兼容旧消息；合作队友穿透单独协商team-pass-v1，不改变旧能力含义。本地合作关闭友伤同样启用；玩家所属直线命中查询临时排除玩家受击标记，恢复原属性，保留几何、次序、RNG及移动碰撞。恶魔火球正常命中玩家，死亡竞赛与旧端保留原行为。

30项大厅/设置/bridge回归、6项射线/穿透/敌人命中回归及30组独立双进程通过；新增场景含关闭友伤、武器、纠正及恢复，完整确认玩法/声音/贴图一致。三套类型检查和build通过。无头Chrome真实点击验证等待房间→设置页状态保留、弹层阻挡背后开始按钮、IP加入及客机不可编辑；四窗口尺寸的7个值/按钮均通过文字宽度与可见像素检查。直接复核6张截图，未使用zai。证据docs/verification/v0.2.9/room-settings.json；受控传输仅验证UI，真实网络由独立双进程与最终打包门禁覆盖。

### 21.5 波次文本输入与完整字符校验

单人/本地合作及联机房主使用文本输入＋左右箭头，客机只读同步；保留最高解锁提示和重入默认第1波。共享校验器只接受去首尾空白后的完整ASCII十进制数字串，允许前导零并规范化，范围1～房主/本地最高解锁（最多100）。空值、中文/全角、部分数字、小数、符号、指数、十六进制、内部空白及越界均拒绝，不采用parseInt或静默钳制。原始多行粘贴另存用于校验，避免浏览器自动移除换行把非法文本变成合法数字。

Enter、失焦、开始和箭头共用提交，Esc恢复上次合法值；非法时原画风模态说明原因和范围，阻止本次操作，保留草稿，关闭后聚焦全选。组合输入期间不提交。透明原生输入承接键盘/剪贴板/IME，画布保留嵌入字体；Presenter定位，隐藏/卸载释放DOM、弹层及订阅，串接清理。网络只发送整数，bridge再次以房主存档上限核对开局；原有程序选关接口兼容。

65项校验/选关/大厅/开局回归、三套类型检查及build通过。当前构建Chrome真实鼠标和keyboard.type（非fill）覆盖合法边界、规范化、剪贴板和多行粘贴、所有非法类别、超长数字、Enter/Esc/失焦/开始/箭头、CDP输入法组合、弹层挡点击及快捷键、关闭后草稿全选；本地合作实际从第20波开局。四种尺寸覆盖单人/合作/房主/客机，输入几何与文字像素检查通过；三次返回菜单验证输入及Presenter订阅无残留。直接复核画面，未使用zai；CDP组合事件不冒充实体输入法人工操作。证据脚本tests/e2e/wave-input.browser.mjs及docs/verification/v0.2.9/wave-input.json；历史v024断言保留同步/封顶要求，改点右箭头并读取纯数字字段。

### 21.6 爆炸整屏闪光减弱

按用户补充要求，火箭、手雷、油桶、地雷及炸药包共用的整屏亮度滤镜改为原强度8%，峰值RGB偏移204→16.32。只缩放Process_Brightness新返回的显示矩阵，mBrightness本身和原0.8/0.6/0.4/0.2/0衰减序列不变；爆炸动画、伤害/范围、摇屏、声音、焦痕及随机调用保留。连续爆炸仍重置原衰减，但不叠加更强提亮；共用的入场闪光也柔化，LOW仍完全跳过。先试20%和10%，浅色地面仍有明显增亮，实际像素对比后采用8%，没有移除爆炸本体。

41项效果/选项回归、三套类型检查和build通过；新增滤镜偏移、原状态/时长以及50次重置峰值检查，原伤害、火球、连锁、声音/焦痕断言保留。包装器引入后的30组独立双进程确认玩法/声音/贴图回归通过。Chrome真实点击进入游戏，再由原武器/物体爆炸路径构造火箭、手雷、油桶、地雷、炸药包及12发混合爆炸，在相同冻结场景比较无提亮、恢复原滤镜和新滤镜的实际像素。新提亮的平均增幅小于原增幅45%，六组通过；单发火箭测量区域近纯白像素236215→1128，混合爆炸233443→2857。直接复核原/新截图，火焰轮廓和地面细节保留，未使用zai。这是局部视觉测量，不是整局性能或医学安全结论；证据docs/verification/v0.2.9/explosion-flash.json。

### 21.7 本地永久成长与旧档迁移

单人和本地合作复用联机个人击杀、得分、经验和武器强化：僵尸1 XP、恶魔5 XP，升级需求按每10级增加5 XP，最高125级；得分使用本次升级前等级。单人显示一个个人面板，合作显示两个，暂停页显示各自强化；本地直接读取模拟结果，联机继续读取确认态。选关按此前波次可获得经验计算，单人全额、合作平分，并保留原难度下限。共享镜头与操作保持，死亡竞赛仍用原倍率。

version2旧档先按原顺序恢复，再一次性转换：等级取波次/难度模型、旧倍率和已拥有武器最低等级的最大值，余量XP清零；单人旧总分全归P1，双人平分且奇数归P1。保留当前生命、护盾、库存和实际弹药，不额外解锁或补弹；已有成长直接恢复。修复成长档恢复时全局倍率只读导致循环不前进的风险；初始化及恢复后记录本地重试检查点。原倍率、原飘分和Flash效果基准通过显式classicGrowth夹具保留全部原断言；实际游玩和浸泡测试默认走新成长，按个人等级检查武器。

新增14项成长/迁移回归，覆盖真实旧档保存→重启→继续→新档再保存继续、重试、选关、独立归属、上限、伤血盾/库存/弹药保留和单/双HUD。三套类型检查和build通过；完整Vitest在允许localhost环境下113个文件、1451项通过，71项既有条件跳过保持，未新增跳过。第一次沙箱网络EACCES被记录，允许网络后原断言全部通过。Chrome真实鼠标/键盘覆盖两模式×四尺寸，16张HUD/暂停截图、文本描边像素、面板几何、正确飘分目标以及实际SAVE & QUIT / CONTINUE通过；直接复核画面，未使用zai。归档docs/verification/v0.2.9/local-growth.json，原始日志位于generated/reports/v029/growth-vitest-permitted.log。

### 21.8 随等级增长的生命、护盾与受击韧性

现代PvE的生命和护盾上限统一为200＋4×(等级−1)，1/50/125级为200/396/696；活着升级只增加生命上限差额，护盾不补充。新开局满对应生命，旧档及继续游戏只更新上限并保留当前血盾。合作复生保留等级，恢复满生命并清空护盾；原自然回血公式逐字保留。护盾值的存档、吸伤和蓝色生命条覆盖均使用个人上限，650点等高护盾不再被旧100上限截断。

僵尸及恶魔火球命中前有盾时，该击（含破盾）照常扣盾和溢出扣血，但保留控制状态、方向、移动及受击前计时，不进入原僵直/击退及其血迹/受击动画初始化；同一affector批次的后续命中重新判盾。致死保护命中在批次结束后进入原死亡路径，避免PlayerControl没有死亡检查而继续行动。同步调用范围的WeakMap保护退出即清理，mutable生命/护盾仍在原玩家快照和校验中。survival-v1单独协商且依赖成长与补给；旧端仍保留200生命、100护盾及原受击反应，死亡竞赛不变。

17项新增回归覆盖1/50/125级、升级差额、旧档不补血、破盾/同tick后续伤害、致死、无敌/友军武器反应、持续移动射击、自然回血、复生和高护盾保存/回滚；相关112项通过，含31组独立双进程玩法/声音/贴图一致性以及能力组合。三套类型检查与build通过。完整Vitest有1471项通过，唯一旧版复生200生命断言明确启用classicGrowth夹具后，该文件16项及新版17项一并通过；71项既有条件跳过未增加。完整日志与夹具复核日志分别保留于generated/reports/v029/survival-vitest.log、survival-fixtures.log，最终发行候选仍需统一重跑全部门禁。

Chrome旧100护盾和新第20波380护盾两条真实键盘走过箱子的路径均通过；满量、60%、20%、耗尽及溢出伤害均核对，四种窗口尺寸的蓝/绿像素和原生命条几何通过。直接复核截图，未使用zai，归档docs/verification/v0.2.9/survival.json。

### 21.9 永久三色补给与定时红箱

现代PvE恶魔只掉一个护盾、弹药或医疗箱，一次种子随机调用三等分；稳定身份随存档、检查点与回滚保留，跨波次不消失，不做数量清理。护盾/弹药/医疗分别只补对应个人状态；满状态玩家跳过，死亡玩家不能领取，同格多个玩家按原枚举顺序找到首个有效领取者，只消耗一次。医疗箱基于原资源库位图缓存绘制鲜绿外壳、白十字、金属包角，保留透视、黑边与阴影层次。

普通红箱一次随机抽取：10%护盾、10%弹药、10%医疗，70%原已有武器候选顺序和权重，移除旧回血项，不额外解锁、不补体力；对应状态满或奖池为空仍消费，不重抽。固定红箱24秒重生，新增随机红箱每20模拟秒单人1个/合作2个，同时最多3/6个，寿命45秒；原击杀普通红箱寿命不变。按当前地形进行确定性可达搜索，排除边界、墙体、障碍、箱子（含暂时隐藏的固定箱）、玩家脚下及怪物占用，无合法位置不消耗随机数；暂停不走计时。

新增supply-crates-v2能力要求成长、旧补给及survival-v1，旧端原能力与随机调用保持，死亡竞赛不变。v2存档可选保存规则、投放计时、下一个身份、永久箱类型/位置及随机红箱剩余寿命/透明度；还原不抽奖、不拾取、不提前扣寿命。修复首次回归发现的新箱重建顺序反转，反复存读档保持原处理顺序。旧规则夹具继续逐条断言30秒/10秒重生。

17项新回归覆盖300种子单调用、三种收益、双人抢拾/死亡、10/10/10/70、权重/空奖池、200永久箱80秒与跨波次、单/双上限、暂停、18张地图、无位置、保存/重试/回滚。32组独立双进程完整确认玩法、声音、贴图通过，新增场景包含永久箱与定时投放、纠正、恢复；27项能力/bridge测试通过。完整Vitest1491项通过，两个原30秒测试明确启用经典夹具后连同新玩法60项通过，最终发行门禁再统一运行；原71项条件跳过保持。三套类型检查/build通过。

Chrome真实点击开局、四尺寸三色箱几何/像素、满医疗箱保留、实际键盘拾取三种箱、SAVE & QUIT/CONTINUE身份保留均通过。截图发现玩家名称遮挡医疗标记后，调整验证站位重新拍摄并直接复核；未使用zai。证据docs/verification/v0.2.9/supplies.json，原始日志位于generated/reports/v029/loot-*。

### 21.10 响应诊断兼容Window键盘事件

发行分项探针复现：启用响应追踪后，向Window派发KeyboardEvent会让诊断监听器对Window调用不存在的matches方法。现先判断Element再排除文本输入；真实键盘及Window合成事件都能记录输入阶段，默认关闭追踪的玩法无变化。三套类型检查/build及响应追踪单元通过，当前打包双端探针已记录input/sample/apply/display且不再出现该异常。该次完整探针仍因小地图镜头限位导致相机测量无移动而失败，保留日志；镜头分项改在大地图空地测量，完整发行门禁继续执行，不把此局部修复当作全套响应验收通过。

### 21.11 同构建离线与双端分项响应验收

最终候选asar d56222ff408fbdb5fb9e80f1e691e2df97bde99564cfd65877e57cd0c8bd8cf2，以相同种子、Room 18、双人角色、960×720内容区/DPR 1.5/1440×1080画布，串行测量离线合作三轮及十组实际独立Electron联机进程。0/30/60/100ms单向注入各交换启动和采样顺序；另有30ms＋0～20ms抖动/TCP回退/房主200ms停顿，以及100ms＋抖动/客机200ms停顿，两组都真实断线并在原世界恢复。每组共同确认tick的完整玩法摘要与确认事件一致，采样后半段等待均0/0。两角色移动、转向、射击、切枪、镜头及声音调度都通过60ms门槛；离线最慢38.3ms，联机分项最慢41.9ms，覆盖模拟周期的额外相位探针最慢42ms。

时间从渲染器输入事件起算，显示为首次完成Player.render，声音为真实AudioBufferSourceNode.start调用；切枪沿用原松键触发，从keyup起算。不是物理键盘、屏幕扫描或实体扬声器延迟，不声称网络零延迟。两端使用同一预测路径，未增加房主等待。诊断不改变模拟/RNG/校验；性能测量默认关闭追踪。

测试夹具使用从创建起透明且不可聚焦的窗口，先定位到同一显示器再设置内容尺寸，消除Windows离屏DPI及1像素尺寸误差，并断言两端实际尺寸。初始故障夹具在重连关闭socket后执行额外延迟UDP发送会卡住测试进程；已补充过期发送丢弃和其他异常记录，再完整通过矩阵。测试窗口及存档均隔离，历史失败/尺寸校准日志保留。原始数据generated/reports/v029/network，公开分项、相位及恢复证据docs/verification/v0.2.9/network.json。

### 21.12 竖屏黑边回归的HUD避让

完整发行界面检查187/188通过，唯一旧断言在720×1000竖屏的(360,10)要求纯黑；新增本地成长的波次/敌人面板正好覆盖该位置。直接截图与像素复核确认地图外黑边正常，调整为(360,100)/(360,900)，两点仍位于居中544高地图之外且避开HUD/输入标识，保留上下两点精确RGBA纯黑断言。viewport组18/18通过，宽屏、竖屏、实时缩放、暂停居中及死亡竞赛分屏断言全部保留；完整UI仍在后续发行门禁统一复跑。失败报告/截图和新坐标证据见docs/verification/v0.2.9/viewport-regression.json及generated/reports/v029/regressions。

### 21.13 实际便携版完整归档验证

重新build后在仓库外生成0.2.9单文件便携版，实际NSIS启动通过独立CDP端口连接，窗口从创建起隐藏且不可聚焦，存档隔离。原玩法、保存/继续、31个音频样本及running状态检查通过；新增完整提取asar的SHA256比对，并把preload加入逐字节运行文件检查。实际提取asar与已验证联机候选完全相同，均为d56222ff408fbdb5fb9e80f1e691e2df97bde99564cfd65877e57cd0c8bd8cf2。原始结果generated/reports/v029/portable/launch-0.2.9.json；完整发行门禁和性能仍继续执行，通过前不推送发行标签。

### 21.14 输入清理回归适配新增波次字段

旧added-ui测试要求从大厅进入客机设置页后所有text输入数量为零，新版设置页有一个只读波次输入，因此该旧断言失败。现在保留原大厅IP输入的ElementHandle，明确断言它已从DOM移除，同时断言设置页恰好一个Start wave且readOnly，没有多余输入；不是放宽清理要求。完整added-ui实际点击、四尺寸、DPR2、主菜单/大厅/房主/客机/暂停和存档继续通过，直接复核客机截图。原失败日志保留于generated/reports/v029/gates-from-ui/added-ui.log，通过日志位于gates-from-added-ui/added-ui.log。

### 21.15 版本与双语说明

package与lockfile根版本同步0.2.9，README及中英文功能说明更新个人成长、血盾、三类永久补给、红箱频率、波次文本、房间设置、飘分和音频恢复；死亡竞赛与旧能力协商规则单独说明。英文Release Notes已准备，发行标签仍等待全部门禁。离线Markdown预览检查中英文1024/390宽度无横向溢出、图片可加载及新验证链接，并直接复核截图；此为本地CSS预览，不冒充GitHub页面。证据readme-layout.json与artifact.json记录当前便携版，SHA256为7e35b68e9ae09b8f39e660b5105e7cd82683d940379e4dc3071c8e9729b8c68d，大小101633755字节。

### 21.16 联机测试端口隔离

用户开始游玩后要求暂停测试，已停止本轮测试服务，未停止玩家游戏。恢复工作后为实际Electron联机测试增加主进程专用socket端口映射：发现48630、TCP48631～48640，原扫描、广播、重连及UDP快速输入继续使用真实传输；游戏发行代码和模拟未改动。映射仅安装在测试创建的进程，避免扫描连接玩家正常47631房间；抖动夹具同步识别测试TCP范围。端口隔离不能消除CPU/GPU竞争，玩家要求暂停时仍须停止测试。

真实Node TCP/UDP端口及消息往返通过；打包双进程自然结束→房间重新开局→客机结算重试完整通过，双方世界均重建。七个调用脚本语法检查通过，原始证据generated/reports/v029/lan-isolation-netretry.log与.json。原端口上的十组响应矩阵证据仍对应其记录的旧测试脚本；后续性能测量双方统一采用隔离端口，不混淆两者脚本身份。

### 21.17 历史选关与重试门禁适配永久成长

v019旧浏览器断言仍按第25波原倍率36只期待六把武器，复现与新个人成长85级的十把武器不符。v019/v020保留原波次、倍率、旧武器顺序断言，旧构建可通过显式BOXHEAD_CLASSIC_GROWTH=1运行原六武器期望；现代默认额外断言个人85级、0 XP、0分及完整十武器顺序，没有全局关闭新成长。原经典成长单元夹具仍在完整Vitest中验证旧规则。

两个浏览器门禁均通过：第25波真实选关、敌人刷出、队友拾取死亡武器箱，以及不干预血量的自然死亡→实际点击重试，恢复85级/0 XP/0分、完整武器且新波次尚无敌人。旧失败报告保留在generated/reports/v029/regressions/v019-old-loadout.json，复验日志位于gates-from-v019/v019.log和v020.log。

### 21.18 完整功能发行门禁

35项功能门禁全部通过，均对应同一d56222ff…候选asar：完整Vitest 1493项通过、71项既有条件跳过未增加；位图/遮罩/引擎、UI 188/188、音频49/49、新增界面、三模式浏览器/桌面/打包游玩、历史选关/重试/输入/大厅/联机、Electron及打包烟雾、真实v0.2.5旧档继续和三轮离线响应。旧档原1234分、137生命、Uzi17发、最高波次7及开火键70均保留。

各段保留启动时源码哈希、用例日志SHA256及原失败记录；仅在运行时asar完全一致时复用之前通过的无关用例。三个历史测试失败分别为HUD覆盖旧黑边采样点、新波次输入取代全DOM零输入假设、旧选关武器数期望，已逐项修正并复验。实际便携版完整提取归档、玩法/存档/音频另见artifact.json，门禁汇总docs/verification/v0.2.9/gates.json。性能比较仍待独立串行完成，不以功能门禁替代性能证据。

### 21.19 响应夹具可重复性

离线响应夹具重复使用隔离目录时会记住上次地图，原“点一次左箭头”下一轮可能选到Room 17。夹具现明确清空自己的旧localStorage并断言实际Room 18，记录是否清除了已有测试档；不接触玩家存档。三轮均在已有测试档上重跑，通过两角色移动/转向/射击/切枪/镜头/声音调度60ms门槛。原十组联机对比使用的初始正确数据与功能门禁数据分别保留initial-matched-report.json和gate-matched-report.json，不被此次复测替换；追加证据offline-repeat.json。响应矩阵的脚本身份同时纳入端口隔离依赖，避免其变更后错误复用旧测量。

### 21.20 房间广播退出期间的主进程异常

用户截图报告sendBeacon定时器抛出Cannot read properties of undefined (reading 'send')。发送过程中重入stopHost的回归在旧代码复现同类异常：发送循环每个目标都重新读取可被清理的beaconSock。修复为捕获socket身份、逐目标检查是否仍属当前房间，定时器检查建房代次；退出先清空socket字段，再关闭socket及其他连接，过期发送完成/错误/监听回调均不影响新房间。UDP绑定后启用定向广播，发送回调、socket错误及同步异常统一接住，每个房间只报告一次发现错误，不终止仍可用的TCP联机。

六项模拟生命周期回归修改前全部失败，修改后全部通过；真实UDP发现、状态广播、TCP连接、退出重建及已有协议合计26项通过，三套类型检查通过。原始日志beacon-before.log、beacon-after.log、beacon-real-transport.log、beacon-typecheck.log保留在generated/reports/v029。此前已通过的候选二进制尚未包含此修复，最终发行必须重新build、打包并验证，不以旧便携版结果替代。

### 21.21 隐藏联机测试捕获主进程异常

原Electron默认主进程异常框不受隐藏游戏窗口约束，会显示到玩家桌面；原测试只监听渲染器错误，清理前写报告也可能漏掉退出期异常。联机测试公共隔离器现将主进程错误框转为完整stderr记录并以非零状态退出，测试报告记为失败；报告落盘移到实例清理后。只在测试创建的进程安装，不修改发行版全局异常行为、不吞掉失败。

实际打包Electron隐藏进程注入未捕获Error，确认捕获完整堆栈、退出码1、错误报告ok=false且不弹系统框；门禁自身只在这三个预期成立时通过。原始记录generated/reports/v029/main-error-guard。七个联机脚本及公共隔离器语法检查通过。该保护同样用于下一轮压力诊断，普通场景三轮通过及139ms爆炸压力失败原始数据继续保留。

### 21.22 柔化闪光恢复GPU快速路径

256同时爆炸＋200永久补给箱的正式压力比较发现新版房主响应139ms，超过100ms门槛，保留performance-initial-failed全量记录并停止发布。CPU采样显示双端getImageData与colorMatrixCPU占用明显：8%柔化产生16.32等小数偏移，不能进入原有整数亮度GPU合成路径，导致每次闪光整屏读回、CPU循环及额外分配。

本地闪光包装器现按原CPU路径的Float32系数及floor字节规则，将正偏移预先量化为16/12/8/4，保持0.8/0.6/0.4/0.2状态和时长不变；不修改通用滤镜或机械移植类。六组真实武器/连爆画面逐像素验证新GPU结果与之前16.32等CPU结果完全一致，并分别断言新路径零次、旧参考一次CPU滤镜调用。原强度参考直接恢复原亮度值，避免通过已取整值反推产生错误基线。直接复核火箭与连爆截图，25项效果回归、三套类型检查与build通过。

包含广播修复的新候选asar为0023e4962eac471f35be334223571278dc9e1c38136171d4b9d71f8e13d55db7；同等256连爆/200箱真实双端复验通过，房主/客机最慢输入及显示35/41ms、后半段等待0/0、确认玩法/事件相同，箱子保留200/200。此为修复后定向复验，三轮正式比较另行记录，不把单次测量当作性能结论。证据explosion-flash.json及generated/reports/v029/stress-profile、stress-gpu-fixed。

### 21.23 按办公负载要求停止重型验收

用户反馈测试使电脑变卡、影响办公，已终止重新开始的双实例性能协调器及其隔离游戏/GPU子进程，没有停止玩家游戏。当前普通场景前一轮完整通过，后续运行按用户中止记录，未开始新版极端场景正式三轮，不生成通过汇总。保留初次139ms失败、CPU诊断、修复后35/41ms定向通过和这次部分原始数据，不能合并冒充完成三轮比较。

重型比较脚本默认在启动任何子进程前拒绝执行，仅再次获得用户明确授权后才能启用；办公期间默认轻量串行检查，实际游戏验证限单实例、短时、低分辨率。新的广播及闪光修复均已提交推送，新便携版重新打包与最终发布仍待完成。原35项功能及十组网络结果属于初始候选，不能冒充后续修复候选的全套新验收。

### 21.24 经用户确认的轻量收尾与最终便携版

2026-10-19用户明确选择“轻量复核通过后发布（推荐）”：保留初始候选完整功能/网络验收，结合广播和闪光修复的定向回归，对最终构建轻量复核后发布；不再以三轮高负载比较作为此次发行门禁。中止记录和最初139ms失败均保留，不宣称三轮比较完成，也不宣称总体性能、分配或内存改善。最终报告分别标明初始d56222ff…与最终0023e496…构建身份，没有把旧矩阵改标为最终构建的新测试。

最终重新build与三套类型检查通过；完整Vitest采用一个worker、不并行文件、低优先级和最多两个逻辑核心，116个文件、1499项通过，71项既有条件跳过未增加。代码盘点491个模块，117个机械移植类相对v0.2.5均未改动。打包同样限制资源，并在仓库外完成；随后复制完整win-unpacked目录，保留exe中的asar完整性资源。

实际NSIS单文件启动通过唯一CDP端口连接，使用单实例、隐藏不可聚焦窗口、640×480/DPR1及隔离存档。测试支持独立输出目录以保留初始候选记录；实际鼠标开局、暂停保存退出、继续、31音频样本与running状态均通过，未出现脚本异常。完整提取asar及main/preload/全部运行束逐字节核对，asar仍为0023e4962eac471f35be334223571278dc9e1c38136171d4b9d71f8e13d55db7，与修复后定向双端复验的构建一致。直接复核最终截图，检查后测试进程全部退出。

最终Boxhead 2Play Rooms-0.2.9-portable.exe为101632861字节，SHA256为7ba5b3527d2524c7fc214947ce031fe30b37d780bfd7245079bf39674b15de26。公开证据docs/verification/v0.2.9/final-acceptance.json及artifact.json，原始日志与截图generated/reports/v029/final。英文Release Notes纳入广播异常修复及闪光GPU路径，并明确性能比较范围；最终标签和上传资产以该文件及校验值为准。


## 22. v0.3.0 开发记录

### 22.1 补给保留继承容量

复现了合作武器箱继承1200发容量后，单武器红箱重建将其降回100、全背包补弹遇升级重应用降回400的问题。现代补给先同步个人上限，资格查询保留实际弹量，补弹和单武器奖励保留两者较大的容量并补满；不改变持枪、库存和红箱10/10/10/70一次抽奖。新增reliable-supplies-v1独立协商，依赖现代补给，旧端保持原路径和随机调用。

5项新增回归覆盖两条失败复现、下一tick不回退、属性查询不补弹、血盾补满、保存恢复及新旧联机路径；另有29项bridge协商、3项补弹及17项现代补给回归通过，三套类型检查通过。此为开发期模拟验证，完整浏览器和打包发行门禁仍待最终候选统一完成。


### 22.2 确认态白字与独立显示队列

现代本地及rollback-v2白字改为HUD WeakMap中的三行显示队列，模拟不再产生会被回滚恢复位置/寿命的提示对象。每tick独立事件日志在确认后播放一次，纠正重演丢弃旧预测；160ms平滑让位、22px行距、3秒寿命和末500ms淡出使用显示时钟，暂停冻结，退出释放位图。拾取提示统一P1/P2，区分全背包和指定武器补弹，经典夹具及旧联机路径保留。

4项显示回归覆盖绘制频率、回滚不倒退、暂停/释放和确认去重，连同39项锁步、2项HUD、5项补给共50项通过；三套类型检查及build通过。Chrome四尺寸真实连续帧、边界、行距和白字像素检查通过，四张截图直接复核；未使用zai。首次250ms采样不足11帧，按本地25Hz延至750ms后通过，未改动画/断言。沙箱localhost受限后在允许网络下重跑。原现代补给真实键盘拾取、存档继续和四尺寸像素门禁亦通过。证据docs/verification/v0.3.0/hud-messages.json；最终打包及完整发行门禁待统一完成。


### 22.3 菜单间距与条件操作行

主菜单原按钮实际35.5px高却按30px排布，命中区域重叠；现保留原图形、_Contents和Register_Button，按真实边界缩放为24px高、36px中心距，六项均留12px间隔。大厅恢复/重试与设置并排，无恢复项时设置居中，主操作与返回独立分行。胶囊按钮文字字段不再以整按钮高度向下延伸，避免扩大命中区；所有位置仍在640x480内容坐标，DOM沿Presenter映射。历史测试的现版点击坐标随布局同步，保留显式旧版坐标路径。

20项既有菜单/存档回归及4项真实边界/无恢复/检查点/新重试组合检查通过。当前构建added-ui完整四尺寸及DPR2、实际鼠标/键盘、房主/客机设置、暂停保存继续通过；新增恢复场景实际经历开局、检查点、死亡、退出、设置及恢复，四尺寸按钮边距/文字像素通过，四张截图直接复核（未使用zai）。证据docs/verification/v0.3.0/menu-spacing.json。完整UI检查正对同一静态构建继续执行，最终发行门禁仍待最终候选统一完成。

22.3 后续完整界面验收：同一菜单候选静态构建的完整UI 188/188通过，覆盖说明、设置、改键、成绩输入/CJK、结算、右键菜单、窗口比例、暂停、DPR及持久化。结果与构建哈希已补入menu-spacing.json；后续玩法改动仍以最终发行候选重新验收。


### 22.4 无限成长与有界波次预算

新增endless-pve-v1，依赖既有成长、护盾、生存、现代补给及平衡能力；本地现代PvE启用，旧端与死亡竞赛不变。保留125级表，此后XP按每十级增加5需求，血盾上限每级加4、武器伤害每级加125级基值1%、有限容量每级增加max(1,ceil(基值0.5%))。继承的较高容量继续按级增加，升级仅补容量差额和存活生命差额，存档不额外补给。武器视图只缓存125级以内，投射物及放置物继承一次伤害；无限弹药按原生武器/升级属性判定，避免有限容量碰到999999变无限。

僵尸预算封顶200、恶魔10，保留四难度并发/速度/节奏及关闭恶魔设置。累计此前波次XP与参考等级用BigInt闭式求解，无逐波/逐级缓存；敌人血量与伤害持续增长。高伤害联机测试复现原击退将僵尸推出地图，现仅在新规则限制物理冲量到原爆炸0.3格上限，实际伤害不减。选关随历史最高波次扩展，高波次直接恢复，拒绝将无限存档载入旧规则世界。

13文件156项相关回归、新增关闭恶魔回归及10项无限套件通过；第1000波独立双进程240tick纠正/恢复用例通过，共同tick完整玩法校验、171声音事件和324贴图事件一致，未运行压力/性能测试。三套类型检查、build及代码盘点通过，117个机械端口未改。Chrome第1000000波四尺寸真实输入、选关/HUD/暂停边界和文字像素、保存继续通过，截图直接复核（未使用zai）。证据docs/verification/v0.3.0/endless-progress.json。期间审批服务容量不足导致的Git/浏览器命令均未执行，恢复后完成本项界面验收；最终发行门禁仍待最终候选。

### 22.5 裂骨冲锋者、余烬祭司与紫色附魔箱

enemy-variants-v1依赖无限PvE，替换原Zombies/Devil成功刷出的确定序号，不额外抽随机数或增加每波预算。冲锋者第8波起10%，每四波增1个百分点至25%，最多同时四只；生命1.6倍、基础分数200、所属大类1 XP。祭司第20波起20%，每五波增5个百分点至40%，最多一只；生命1.2倍、基础分数1500、所属大类5 XP。

冲锋者在2.5–6格可见目标前蓄力0.6秒，锁定方向、以最多0.24格/tick冲锋四格，首次命中玩家/障碍停止，造成普通攻击1.5倍伤害，恢复0.8秒后冷却六秒；受击打断。祭司保留清障行为，以锁定玩家位置的火印取代对人直线火球：七格视距、0.9秒预警、1.6秒燃烧、每0.4秒造成基础攻击30%伤害，最多四次；开始间隔至少五秒。每名存活玩家最多一枚，全场单人两处/合作四处，同周期重叠不叠加且墙体阻挡。死亡取消未点燃区域，已燃烧自然结束，换波清除，不阻碍清关。技能时钟、区域、子种序号和声音均接入现有模拟/确认路径。

按用户后续确认，祭司原30%双补给箱方案改为30%一个紫色附魔箱，剩余70%一个等概率护盾/弹药/医疗箱；先抽分支，仅普通补给分支再抽三分类型。两分支均必掉一个永久身份箱，狭窄处可与旧箱共格，独立领取/保存，不重复死亡抽奖。冲锋者独立50%普通红箱与连杀保底合并，同次最多一箱，沿用红箱寿命；基础敌人不变。

附魔作用于领取时手持武器的现有弹药，伤害+35%；普通子弹额外贯穿两个敌人，遇墙体/物件停止，轨道枪保留原无限敌人贯穿。爆炸穿过敌人遮挡，实体墙阻挡，半径边缘保留至少75%强化伤害；投射物、放置炸药及子爆炸只继承一次伤害。有限库存每发消耗一份附魔，霰弹枪全弹丸共用一次消耗；补弹/升级只增加普通弹药，原生无限弹药持续附魔。假墙不能消耗附魔箱。切枪、死亡武器箱、存档及回滚保存附魔余量，弹药文字、曳光与缓存爆炸帧呈紫色，满附魔/空弹/死亡玩家不能阻挡另一位有效领取者。

美术由原XSI独立派生几何与材质，未修改原资产。冲锋者具有不对称骨肩甲、锈铁护臂和破衣边；祭司有立体角冠、肩甲、腕饰与胸口熔纹。新面片跟随原身体分件、方向、光照和遮挡，保留脚底锚点；死亡姿态的角冠随躯干倾倒。加载时烘焙全部原朝向/动作及技能姿态，LOW仍有明确预警。输出两张全朝向动作联系表和8秒短动画，直接复核实际预警与燃烧画面（未使用zai）。

103项相关回归及后续33项新敌人/附魔定向检查通过，三套类型检查、build通过，机械端口117个均未改。两个独立进程在第20波240tick的纠正/恢复场景中覆盖蓄力、施法、掉落、附魔子弹和手雷，共同确认tick完整玩法、声音与贴图一致。Chrome四尺寸预警像素/几何、真实鼠标开局与键盘领取紫箱、紫色弹药文字像素通过；截图发现测试夹具漏填Z和暂停绘制未更新，已修正夹具并重新验收，未将初次失败记录作通过。证据docs/verification/v0.3.0/enemy-variants.json，完整发行与便携版门禁仍待最终候选。

### 22.6 同帧连续提示保持入场行距

附魔画面复核发现，连续两条及以上提示在同一帧生成时均从22px偏移开始，160ms内短暂重叠。新增回归在首帧稳定复现实际间距0px。现未显示过的同帧消息作为等距整体入场；已显示消息保留当前坐标，新消息从最末行下方22px加入，全部共同缓动，三行上限内入场不裁切。显示队列仍独立于模拟和回滚，暂停/寿命/确认去重不变。

21项相关回归、三套类型检查及build通过。Chrome四尺寸新增每帧分组检查，同帧四条输入仅保留三行，所有真实入场帧最小间距22px；普通提示文字像素、边界及单向平滑运动原断言均保留。八张普通/突发截图直接复核，未使用zai。证据补入docs/verification/v0.3.0/hud-messages.json；此项独立提交，不修改此前验收数据。

### 22.7 新敌人整体美术与特效二次打磨

按用户追加的整体完成度要求，冲锋者从原偏蓝衣身改为完整暗绿衣料、斜向皮带、骨质胸片和磨损下摆，肩甲增加贴合护甲底座、收边斜面及立体骨刺，护臂以皮革底层衔接锈铁和扣边。祭司改为深红/焦黑衣甲、带底座的立体渐细冠角、肩甲收边、分层护腕与沿真实躯干面展开的熔纹，避免大块金色件与原躯干割裂。躯干平涂材料同步清除对应纹理矩阵，消除材质与填充路径不匹配。

新增几何按投影后的正向面积选择实际可见面，剔除退化侧面；依据原XSI的45度倾角、原光照向量和面法线计算明暗，替换先前近似角度和固定面色。骨甲/冠角随各动作的身体轴转动，保持原脚底几何。预警与燃烧统一为熔金/暗红破印、进度弧和带内焰的曲线火苗；冲锋方向加入分段引导，全部仍用模拟tick，不增加RNG或伤害实体。

34项新敌人/附魔回归、三套类型检查和build通过。新增全朝向、全部基础与技能动作的脚底几何、面数组对齐、顶点/光照有限值及非退化新增面检查。联系表与放大细节表按实际冠角/死亡姿态边界自动排版，输出8秒短动画；直接复核新旧联系表、放大部件、四尺寸实战预警及LOW燃烧画面，原预警金色像素断言保留通过，未使用zai。证据docs/verification/v0.3.0/art-polish.json。此前已生成但未发布的便携包被本次美术修改取代，最终发行须重新构建打包。

### 22.8 0.3.0发行准备与轻量功能预检

包与lock根版本同步0.3.0，更新中英文README、功能说明及英文发行说明。美术最终候选重新build后在仓库外打包，完整复制win-unpacked并核对asar版本、main/preload、index及全部运行束逐字节一致；asar为534a8b131713ecafd5ef6aa4af8440bdbeb82ee8dac86c03cf3841cab0f2f829，便携EXE为101644422字节、SHA256为15c85bbf5525cd8e6e7517c87b0e23ecba26ada46ffab153b9d3255384192a08。此处仅为候选身份，尚未发布。

发行协调器使用单worker、文件串行Vitest，按用户办公限制明确排除四项mixed explosive burst压力场景，保留原测试及断言。历史联机功能检查关闭CPU/分配采样及强制GC；性能脚本原分支保留，功能门禁单独运行短时640x480、隔离端口/存档、透明不可聚焦窗口，按30/60/100ms逐组验收，比较共同确认tick完整玩法、声音与实际地板贴图提交身份。普通检查最多两个逻辑CPU，原生游戏检查最多四个，均低优先级；不运行性能基准或极端压力。

30ms实际双端预检中，旧亲和性两个逻辑CPU的一次运行出现Windows音频设备错误，自动恢复后仍按严格控制台门禁判失败，保留原报告；扩大为四个逻辑CPU后相同包干净通过，音频均running、31/31解码、零恢复、零报错，不把资源限制推测写成已证实原因。新门禁观察bmFloor实际copyPixels确认贴图，确保贴图观察不止于预测调用。证据package-preflight.json及lan-audio-device-failure.json。完整最终功能门禁、实际单文件启动与GitHub发布仍待完成。

### 22.9 完整回归中的经典夹具与功能环境隔离

首轮串行完整功能Vitest为1563项通过、3项失败，保留generated/reports/v030/gates-before-fixture-and-animation原始记录。失败分别为旧关闭恶魔表的undefined断言运行于新显式零预算、旧选关测试仍将现代历史上限强制截到100，以及纯模拟采样器测试继承功能门禁环境后未进入其被测分支。保留原断言：关闭恶魔旧表使用classicWaves夹具，现代零预算继续由endless覆盖；选关分别验证经典100与现代1000的边界；采样器纯mock测试显式启用自己的被测分支，另加功能模式禁止打开CDP的回归。不改变实际玩法或启动性能采样。

四文件53项定向回归与三套类型检查通过。原独立双进程功能场景全部通过，四项爆炸压力按办公限制仍由命令行排除，71项既有条件跳过未增加。完整发行门禁将在后续动画序列修复及新候选打包后重跑。

### 22.10 新敌人原生动作时间线完整性

动作复核发现派生XSI未保留mFrameSequence：原五张行走关键帧应按0/1/2/3/4/3/2/1播放八帧，被截成五帧会在循环处跳动；六帧技能直接对四张攻击帧取模，也会中途重新开始。新增回归先复现5对8失败。现基础动作独立复制原播放序列，由原加载器复用回程帧；冲锋展开原八帧节奏，有限的预警/施法/恢复按完整动作进度顺序取样，伙伴/重映射几何同步使用对应原始帧。原资产与机械端口不变。

35项新敌人/附魔回归、三套类型检查及build通过，全基础动作帧数、原序列独立身份、回程复用、全部朝向脚底与技能末帧均验证。Chrome重新输出完整联系表、放大动作表和八秒固定朝向短动画，有限动作预览不再人为循环；四尺寸预警像素/边界、实际燃烧与LOW检查通过，直接复核两张放大动作表及实战LOW截图。证据animation-continuity.json。先前未发布的534a8b…包由本次修复取代，最终门禁使用重新打包的运行文件。

### 22.11 技能收尾姿态在真实tick中可见

进一步逐tick检查复现预警/施法/恢复都只显示到第4帧即离开，六帧中的末帧5虽然已烘焙却未实际显示。原因是阶段结束前将进度乘以frameCount-1后取整永远达不到末帧。现按阶段总tick分配全部帧槽，末帧在原结束时间前显示；不改变0.6/0.9/0.8秒阶段长度、伤害或冷却。三项新增回归修改前均失败，修改后检查真实状态方法的完整单调帧序列与末帧可见性通过。

38项定向回归、三套类型检查、build及Chrome四尺寸预警/燃烧/LOW通过，动作联系表和短动画重新生成，序列修复前后的原始记录分别归档。证据追加于animation-continuity.json；已生成但未发行的动画候选再次被本项取代，最终包须包含本次进度修复。

### 22.12 历史联机夹具的真实输入、模拟阶段与清理

最终9075cf6d…运行包在首轮v023手动IP fill等待可编辑状态时一次超时；仅加诊断重跑即通过，未将首轮原因宣称为已证实。历史脚本改为真实鼠标聚焦和键盘输入，检查可见、实际文本及焦点；功能窗口从创建起透明不可聚焦，正常显示器位置与640x480游戏视口避免离屏DPI尺寸异常。原生窗口缩放仍使用真实setContentSize，新增实际视口尺寸断言，保留原输入框几何与清理要求。

netretry第二次强制全员死亡曾一次未进入结算，诊断重跑通过。旧夹具直接修改双方各自预测头，无法保证重演保留；现把原有死亡状态注入放入共同未来tick的模拟集合处理阶段，每次回滚重演仍在同tick执行，并记录实际触发tick。原两次自然结算、返回房间、进程内重新开局、客机发起重试及双方重建断言均保留；不把该次失败原因写成已证实的产品缺陷。共同tick夹具定向及门禁复验连续通过。

真实传输门禁的最后恢复按钮仍点击旧居中坐标，截图明确显示新版并排按钮在左侧，现现代分支经Presenter点击真实边界中心，旧版坐标分支保留。另修正测试内部const H/C遮蔽外层清理句柄，finally等待自有实例关闭后才写报告；完整传输再次复验通过，隔离QA游戏/GPU子进程检查剩余零个。五项相关门禁、六文件语法检查、三套类型检查均通过。全部改动仅在QA脚本，发行代码与asar未变。

原输入、结算及坐标失败记录保留于generated/reports/v030，公开摘要lan-fixture.json。此前通过用例仅在同一9075cf6d…asar下复用，各段保留启动源码哈希与日志身份；完整功能Vitest1572项通过、71项既有条件跳过及四项办公限制排除明确区分。完整42项功能门禁各部分已通过，实际NSIS单文件启动、最终证据归档与发布继续执行。

### 22.13 最终功能门禁与实际便携版

最终0.3.0包的42项功能门禁全部通过，覆盖1572项Vitest功能测试、位图/遮罩/引擎、UI188/188、音频49/49、全部新增功能、历史浏览器/桌面/打包三模式、选关/重试/输入/大厅/重连及平台烟雾。71项既有条件跳过保持，四项mixed explosive burst压力用例按办公限制明确排除。30/60/100ms三组独立双实例短时功能验收均在共同确认tick比较完整玩法校验、声音顺序摘要与实际地板贴图身份，附魔射击均观察到，音频running、31/31解码且无失败样本。未运行玩法/联机性能基准或极端压力，不宣称性能提升；引擎功能烟雾自带的小型绘制计时原样保留，未作对比结论。

真实0.2.5版本产生的v2旧档继续到0.3.0，保留1234分、137血、Uzi17发、最高波次7和开火键70。三套类型检查与最终盘点通过，511模块、117个机械移植类相对0.2.5均未改。实际NSIS单文件以独立CDP端口启动，隐藏不可聚焦、640x480/DPR1、隔离存档，真实鼠标开局/保存退出/继续与31音效running通过；完整提取asar及main/preload/index和全部运行束逐字节核验，和功能验收的9075cf6d39a1cd5eda0da197ce61968216ba4092bbb8e03ab06155ac42bc9f05一致。直接复核最终便携版、条件大厅、设置/说明/成绩、竖屏、白字、附魔箱/弹药/爆炸和新敌人截图，未使用zai。

最终Boxhead 2Play Rooms-0.3.0-portable.exe为101725973字节，SHA256为efa75ea69c61135eec646e06795b2930c84b6f43181d9d86ab27e616e57e8983。证据final-acceptance.json、gates.json及artifact.json明确各段源码身份、相同运行包、旧失败与复验；不将不同候选数据冒充最终包的新测试。英文发行说明及中英文README已同步。完成证据归档后在该最终提交创建annotated v0.3.0并上传同一便携EXE与SHA256清单。

EXE与验证证据已复制到本机boxhead-exe-archive，ZIP共536条文件逐项SHA256核验通过，压缩包SHA256为5999e92e5ca8e1e5290c1dcf92ddede34d5b295e757ddff569e1015f136fe286。归档排除隔离浏览器缓存和用户数据，保留失败记录、日志、截图、动作短片及复现脚本；archive.json作为压缩包外部校验记录保存。全部自有游戏子进程退出，预览服务已停止。发行标签与上传资产以该最终提交和EXE校验值为准。

## 23. v0.3.0-rc2 — 附魔随武器保留

### 23.1 持续附魔与补弹

按用户要求，仅把紫箱从附魔现有弹药改为附魔领取时手持武器；领取本身不补弹。只要武器尚未耗尽，红箱全弹药奖励、红箱单武器奖励、Devil弹药箱、升级和内部AddWeapon重建都保留附魔，新增弹药同样强化。最后一发及其全部弹丸/子爆炸仍附魔，耗尽立即清除武器标记，之后补弹或重新获得同类武器不恢复附魔。祭司掉率、RNG调用、伤害和穿透不变，原生无限弹药与假墙规则保持。

新增可选persistent-enchantment-v1，依赖enemy-variants-v1；双方支持才协商启用，缺少能力不能恢复新规则检查点。旧能力仍保持有限附魔余量，classicEnchantment夹具明确保留旧断言并同时验证现代规则。v2存档与死亡武器箱可选保存附魔标记；旧档仍有附魔余量且有弹药的武器转换为持续附魔，不赠送弹药，已耗尽附魔的不恢复。死亡箱与拾取者任一有效来源的附魔合并保留。回滚自动保存武器自有标记，不修改原快照结构。

三条补给新回归修改前失败，修改后12文件200项定向回归、三套类型检查和build通过；代码盘点512模块、117个机械端口均未改。新增重演夹具使用模拟tick时钟，完整玩法摘要比较包括导航状态。Chrome单实例640×480真实鼠标/键盘领取、补弹后超过原附魔余量射击、95发保存继续、最后一发与耗尽后普通补弹均通过。紫色弹药文字103像素及几何边界通过，直接复核紫色/普通两张截图，未使用zai。localhost沙箱拒绝及沙箱服务不可达的两次环境失败保留；许可网络下当前构建通过。证据generated/reports/v030-rc2；最终rc2版本包与发行记录在后续完成。

本次采用用户明确选择的轻量定向验收，不运行完整发行门禁、双实例联机、性能基准或压力测试，不以旧版验收冒充本版结果。

### 23.2 rc1改标与rc2便携包验收

按用户确认，原v0.3.0发行改标为v0.3.0-rc1预发布，annotated标签指向原提交7d8673d。保留同一Release及两个原资产的ID、文件名、大小和SHA256；旧EXE内嵌版本仍为0.3.0，历史验证JSON不重写。核验完成后撤下旧v0.3.0标签，最新稳定版恢复v0.2.9。改标回执docs/verification/v0.3.0-rc1/redesignation.json。

包和lock根版本同步0.3.0-rc2，重新build后在独立仓库外目录打包，再暂存win-unpacked逐字节核对运行文件。EXE为101644773字节、SHA256为99a961e903bb8ab204b24872b7dd3afd0fc01e8c89f8e9aef813e995cce02035；完整asar为a29c6d2ec25c89bd9118ccaaf5b4ebf1039b297622848d4f745d01ec72e1cd6f。实际NSIS单文件以独立CDP端口启动，640×480/DPR1、隔离存档、隐藏不可聚焦；真实输入附魔、补弹后连续强化、95发保存继续、耗尽后普通补弹和31音效running通过。实际解包asar与暂存包完全一致，内嵌版本确认为0.3.0-rc2。直接复核两张便携版HUD截图，紫色文字103像素及边界检查通过，未使用zai。

首轮Chrome验收运行于改版本号前的功能构建；前后renderer同为main-Dl0IQ-dO.js，最终便携包独立重复验收，不将其表述为再次运行完整浏览器门禁。最终证据docs/verification/v0.3.0-rc2/acceptance.json、artifact.json记录范围和构建来源；本次自有游戏及预览进程均已清理。发行只创建rc2预发布，不创建v0.3.1。

EXE已复制到本机boxhead-exe-archive，证据ZIP共37条文件逐项SHA256核验通过，ZIP校验值1556484cd742ae7680b1f24f7f679e0775ea55305e06aca0745c5457c1fbdcb4。归档排除隔离用户数据与缓存，archive.json作为ZIP外部回执保存。

## 24. v0.3.1 开发 — 限时关卡、强化与美术

### 24.1 限时普通关与持续补怪

新规则在本地扩展层实现，机械移植文件不变。单人与本地合作默认启用，现代LAN双方协商可选timed-waves-v1（依赖现代无尽成长规则）；旧端与classicTimedWaves夹具保留有限数量关卡。18张地图按实际格数分类：小地图1、2、4、8为3分钟，大地图14～18为5分钟，其余4分钟。选关展示时限，HUD显示模拟倒计时；LAN显示确认tick的时间与场上敌人数，不读取预测头。暂停、断线冻结不消耗关卡时间。

普通关持续补怪，保留难度与画质并发上限，取消旧总数耗尽推进；0.8/0.65/0.5/0.4秒基础间隔随波次减少，阶段系数1.15/1/0.85，最终不低于0.2秒。开局快速尝试首批，空场下一tick尝试，满员不累计补刷欠账。优先邻近可达入口，缺少入口时选择距所有存活玩家至少4格、距目标不超过8格的可达空地，0.8秒预警；落点被占或不可达时重选。到时直接清除敌人、弹体、爆炸与火印及待处理伤害，不走击杀收益路径，保留地图物件、装备与箱子。最后tick死亡优先判失败。

可选v2存档扩展和回滚图保存剩余tick、补怪计时及预警；旧档迁移保留现有分数、玩家状态、装备和箱子，当前关重新计时；再次继续不重置。拒绝向缺少能力的世界降级载入。下一关检查点在清场后记录。

此阶段仅验收普通限时关；强化、Boss和新美术将各自提交并独立记录验证。完整门禁和正式发行尚未执行，不复用rc2的通过结果冒充v0.3.1验收。

轻量验证覆盖7文件83个定向用例（新增限时9项、既有成长/存档/界面与协商断言保留），三套类型检查及生产构建通过；代码盘点515模块、117个机械移植类均未改。Chrome单实例640×480真实鼠标选关、键盘移动与暂停通过，倒计时边界112×24且文字196个浅色像素；直接复核选关、实战和落地预警截图，未使用zai。首轮脚本误设默认地图为小地图的失败记录保留，显式选择地图后通过。最终此项构建main-BzQM2mf8.js重新完成同一短时检查。证据docs/verification/v0.3.1/timed-waves.json。

### 24.2 波间三选一与累计强化

每关结束清场后进入最多12秒的强化阶段，每名玩家三选一，全员确认立即继续。火力固定为默认项，另两项使用种子随机且不重复；无收益的急救和补弹不展示。新增火力+8%、最大生命+10%并补新增上限差额、最大护盾+10%但不回盾、有限弹药容量+15%并补差额、35%最大生命急救、已持有武器35%容量补弹。各次百分比按种类累加；翻倍奖励接口一次增加两份，不额外抽选。伤害仍在武器端确定，已发射弹体及放置装备保留原发射伤害。

阶段中跳过战斗集合与补给处理，自然回血、物件计时和补给投放冻结，世界同步tick与输入继续。鼠标卡片点击编码为既有7位输入；独立键位与手柄复用原方向、换枪和开火槽。入场保留按住状态并清除战斗锁存，必须释放原先按住的开火键；进入后短于tick的轻按使用锁存读取，避免丢失。确认态、候选项、倒计时、奖励波次与各玩家累计加成全部进入快照；LAN界面仅显示确认态，回滚重演不重复发奖。

新开高波次按此前关数均匀分配四种基础加成，不预授Boss击杀翻倍；保存、继续、检查点重试与复生保留构筑。v2可选waveDraft和武器扩容差额保存，拒绝缺少能力的世界载入。旧档迁移增加基础构筑与新上限，保留当前血盾弹药。实测发现未更新的新武器在高波次继续后会误补容量差额，现重建时先计算属性，恢复后统一校准并保持原弹量；旧高波次无补弹断言原样通过。原生命公式的难度起点断言移入明确classicWaveDraft夹具，现代强化覆盖独立测试。

轻量Chrome单实例640×480直接复核双人卡片与等待界面，真实鼠标/键盘独立确认、短按、超时默认、保存退出再继续通过；候选和P1确认保留，倒计时282→281 tick。面板610×360、六张卡片均在屏内，2579个浅色文字像素；未使用zai。首轮发现的短按丢失保留为失败记录并修复，假手柄仅验证映射，不代表实体设备。类型检查、构建与定向验证记录在docs/verification/v0.3.1/wave-draft.json；Boss、参考成长调整、美术、便携候选及重型门禁仍待后续。

### 24.3 每五关Boss与击杀奖励

可选boss-waves-v1依赖限时关卡和敌人变种；本地默认启用，旧LAN组合不启用，重连重新校验依赖。每5关一只Boss，裂骨暴君/余烬领主轮换；关闭恶魔时只用暴君。三种地图档位分别延长至4/5/6分钟，普通援军每2秒最多尝试一只，场上最多4只，满员不累计补刷。Boss使用同一可达入口或0.8秒落地预警机制，普通援军不转换为变种。初始生命6000×当前敌人成长×(1+0.25×此前Boss关数)，合作额外1.6倍，家族基准伤害1.5倍。

暴君半血后连续两次冲锋，各自完整预警并重新锁定方向；领主施放三处火印，半血前8秒、半血后6秒，沿用不叠伤的火印周期。普通非致死受击不打断进行中的技能，致死仍进入正常归属与死亡路径。击杀在整个战斗集合处理完成后结算，若尚有玩家生存则立即进入一次翻倍强化；到时存活为普通强化，最后tick全员死亡仍失败。Boss生命、方向、技能剩余帧、援军时钟及击杀标志进入快照和v2扩展；恢复重新绑定实体身份，回滚重演不重复奖励。LAN血条读取确认态。

同时修正限时关外层无尽波表切关时写回旧有限配额的问题：完成切关即将两类总配额置零，保留并发上限及旧规则夹具。5文件112项定向检查、三套类型检查、构建通过；117个机械移植类未改。单实例640×480浏览器真实选关、移动、暂停与奖励点击通过；Boss面板260×46、半血条732个填充像素，直接复核选关/血条/三火印/翻倍奖励截图。首轮浏览器脚本暂停后未重绘奖励界面的失败记录保留，修正测试设置后通过。本项验证Boss行为与UI，敌人/Boss新美术及参考成长另行提交，不计为已完成美术验收。证据docs/verification/v0.3.1/boss-waves.json。

后续暂停截图发现世界暂停后停止Draw，倒计时/Boss/强化覆盖层不能仅靠Draw中的可见性判断隐藏。现于CHud.Pause包装中立即隐藏这三层，恢复后正常绘制重开；新增暂停往返与强化暂停断言，Boss套件14项通过。单实例截图generated/reports/v031/timed-growth/run-1792466928465/selected-growth.png直接确认暂停菜单不再残留血条。该截图构建也包含随后单独提交的参考成长改动；原失败截图run-1792466805938保留。

### 24.4 按限时节奏重算参考成长

限时选关的参考经验按地图3/4/5分钟、难度、三个补怪阶段及恶魔开关估算，合作平均分配此前经验；保留实际击杀经验、武器解锁表和原难度起点下限。估算假设玩家持续清除补入的敌人，不把参考数量变成实际配额。Boss关只计每2秒援军，使用延长后的时间，不预授Boss击杀经验或强化翻倍。高波次基础强化仍均分此前关数；参考等级与实际存档等级分开，已有个人等级/经验及血盾弹药不因继续游戏而重算或补满。

累计只计算前100关；之后所有补怪间隔已稳定，以5关周期闭式计算尾部，BigInt保存经验整数再反解等级。每个世界只缓存当前关敌人成长，不积累随关数增长的缓存。旧无尽/成长/生存基准使用明确classicTimedWaves夹具，原断言保留，现代路径另测。初学者单人开恶魔第20关参考等级：小/中/大地图分别148/172/192；这是配置推导值，不是实测通关速度或平衡效果承诺。

9文件102项相关检查通过（含独立暂停修复后的14项Boss检查），覆盖18张实际选图、不同难度/恶魔/合作/Boss配置、前缀及周期边界、百万关和最大安全整数、存档不重算与无额外RNG。首轮选关夹具只更新预览导致选中地图不符，现同时设置真实选图并断言地图格数；生产逻辑未因此调整。三套类型检查、构建main-OMj8D8F8.js通过。短时单实例640×480真实键入第20关，暂停核对LV148、基础强化5/5/5/4和Boss时限6000tick，属性文本区域280×16含99个浅色字像素；直接截图复核，未用zai。首轮像素脚本误以全屏白字数量验证灰色属性字，现按属性区域和真实颜色检查，失败证据保留。详见docs/verification/v0.3.1/timed-growth.json。

### 24.5 五种持枪武器派生美术

新增加载期独立几何和材质：手枪金属套筒/深握把、UZI方形机匣/弹匣/短管、霰弹枪暖木护木与独立枪托、火箭筒橄榄绿筒身/金属箍/深色筒口、轨道枪长机身/双导轨/少量冷色嵌件。以原握持点和枪口锚点建立刚性坐标系，保持原动画标识、帧序列、角色分件遮挡顺序及完整XSI_Info；枪管出口中心仍为原始锚点。原始模型、四皮肤经典集合与classicWeaponArt夹具保留；派生集合和几何以资源身份WeakMap缓存，不逐帧重建，不修改全局光栅化、1倍/2倍设置或网络字段。

原版站立16方向、行走8方向映射到16种输入朝向，保留原映射及8帧往返。四皮肤1600个原生方向/帧锚点组合逐项一致，另按全部16输入朝向验证；面数据非退化、材质和边界有效，原素材不变。确定性对比从同一快照和模拟时钟重演移动/射击，全部8类摘要相同；最初跨本地时钟运行造成导航时间戳不同，已修正测试时钟，未屏蔽导航断言。最初测试误假设行走原生16方向，改为明确保留8→16映射。39项定向检查（美术/附魔/武器箱/手柄）与三套类型检查通过，构建main-IhoZDWhK.js，117个机械移植类未改。

短时单实例Chrome分别以1倍、2倍运行，640×480真实移动、换枪、普通与附魔射击；2倍补查五枪完整循环及受击转场短片。输出四皮肤全部朝向前后联系表、完整行走逐帧表、细节图、8秒动作WebM和实战对比，直接复核轮廓/遮挡/持枪/脚底及缓存皮肤，不用zai。最终2倍实战角色区域193像素不同；附魔保持原枪身结构。此项不代表便携候选或最终重型门禁通过。证据docs/verification/v0.3.1/weapon-art.json。用户追加子弹样式和轨迹精修，作为独立美术项继续实现。

### 24.6 子弹、弹道、火箭与枪口效果

按用户追加要求精修绘制层：普通子弹暖金亮芯、霰弹较细铜色轨迹、轨道枪冷青外缘/白芯，附魔统一紫边亮芯；火箭采用灰绿分面弹体、金属弹头、尾翼和短尾焰，枪口使用同色短促亮焰。浅地板上的边缘对比经实战截图调整；不增加全屏光晕或持续轨迹积累。火箭和枪口在原地图绘制位置立即合成，保留角色与掩体遮挡顺序。

弹道以快照已有位置、漂移量和寿命反解原命中线，绘制时抵消原版命中后的视觉漂移，保持起点/命中终点；不修改实际碰撞、伤害、射速、射程、散布、随机数或模拟字段。延迟霰弹在完成命中检测前不显示贯穿墙体的预备线；保留原两帧可见生命周期，末帧淡出。绘制缓存按资源/世界身份WeakMap保存，不新增网络字段；classicProjectileArt保留原版及旧附魔画法。

21项定向检查通过，覆盖16方向命中线、墙体终点、延迟弹、末帧淡出、几何宽度及完整模拟摘要不变，并保留持枪/附魔回归。三套类型检查与构建通过；首轮测试把普通弹误按轨道枪“只检测墙体”查询，修正夹具后保留终点断言。浏览器单实例640×480以真实按键发射五枪普通/附魔弹，输出方向表、细节图、动作短片与实战前后图；直接截图复核及枪口附近像素检查。测试首轮遗漏截图呈现等待，后续固定等待并将像素对比限定于枪口前方，失败记录保留；一次编译类型错误修复后的构建重新验收，旧构建结果不计为最终证据。详见docs/verification/v0.3.1/projectile-art.json；便携候选及重型门禁仍待后续。

### 24.7 冲锋者、祭司与双Boss派生美术

冲锋者使用暗绿破衣、灰白分层骨甲及锈铁护臂；裂骨暴君增加双肩重甲、前臂骨刺和背部骨棘。祭司采用深红焦黑面甲、分层冠甲和熔金裂纹；余烬领主增加胸前发光炉栅与更高冠甲，施法阶段炉芯提亮。护臂与炉栅贴合原分件表面，额外立体部件跟随相应肢体投影轴，包括倒地姿态；维持原光照与分件遮挡。仅在派生模型中剔除换材质后暴露的零面积不可见面，原素材和经典变种模型不变。

普通/Boss独立集合在加载期预烘焙，以资源身份缓存；完整保留原8帧行走往返、技能末帧、全部朝向映射、脚底和XSI_Info，不改变碰撞或技能时序。classicVariantArt保留上一版外观供比较。冲锋预警改为实际敌人/玩家半径之和的走廊，按原0.08格步长在静态障碍前截断；火印仍为真实1格半径，LOW下也绘制边界，地面特效位于人物与墙体下方。

40项定向检查（三套件）以及三套类型检查、生产构建main-CQkB8rej.js通过；117个机械移植类未改。1倍/2倍浏览器检查串行、单实例640×480，输出全部16输入朝向、每个逻辑动作帧、分动作表、细节图、约7秒动作WebM、实战前后与LOW预警图。通过Vite源服务导入经典美术夹具供工具比较，不向生产游戏添加调试入口；候选包另验生产构建。直接复核截图、模型边界、实际键盘移动/射击和预警像素，不使用zai。首轮场景保留旧火印导致数量不符、浮点相机坐标被误用为像素数组下标等失败均保留并修正测试；联系表按最大帧边界留白，避免高冠/倒地帧裁切。新材质遇到原始退化面时保留原非退化断言并修复派生几何。详见docs/verification/v0.3.1/enemy-art.json。

美术场景还发现首次移动前的祭司可能施法但尚未进入地图绘制表；本项通过显式静态摆放验收外观，该落地显形问题将单独复现、修复与提交，不以美术截图替代行为验证。

### 24.8 限时关落地敌人即时登记

新增回归真实复现：祭司初始化后可进入首次原地施法，但mCellID仍为undefined，所在地图格mObjects也没有该实体；直到首次移动才出现。原入口刷怪依赖移入地图的旧流程，新增近场落地不应继续使用这一显形时机。限时规则现在在两类敌人初始化完成后调用原mapwho.MoveThing登记一次，经典/旧端入口规则保持原样；不改机械移植文件或另建影子绘制表。

原复现先失败，修复后与限时18图、强化、Boss、变种美术合计62项定向检查通过；经典入口仍未提前登记的断言保留。三套类型检查和生产构建通过；短时浏览器直接检查首次施法第0帧已入地图且可见，不额外移动敌人。详见docs/verification/v0.3.1/timed-arrival.json。

### 24.9 v0.3.1便携候选与发行状态

包与锁文件版本已统一0.3.1，双语README/功能说明和英文Release Notes草稿覆盖稳定版v0.2.9以来的无尽成长、持续附魔、限时构筑、Boss与战斗美术。于版本更新后重新运行完整build（含三套类型检查），再在仓库外boxhead-build/v031-candidate打包；独立暂存release/v031-candidate/win-unpacked，避免覆盖旧解包目录。asar内版本、新能力、派生武器/敌人/弹体代码标记及原XSI/Library资源逐文件核验。最初检查脚本使用POSIX归档子路径，在Windows asar API失败，改为原生路径后通过；不是包内缺文件。

真实单文件exe以唯一CDP端口、隐藏窗口、640×480和隔离存档短时运行，菜单真实点击、移动/射击、存档继续与31段音频解码/运行状态通过；普通关结束真实点击三选一，第二关时间5999tick、火力1份存档继续后保持；中地图Boss总时限7500tick、生命6000，新Boss/枪械资源存在，击杀后恰好增加2份强化。实际解包asar SHA256与暂存包完全一致，运行文件与刚构建文件一致；直接复核强化/Boss/实战截图。源码盘点541模块、117机械移植类无修改。EXE约101.7MB，SHA256及全部证据索引见docs/verification/v0.3.1/candidate.json。

当前为候选交付，尚未创建v0.3.1标签或GitHub正式Release。用户要求的完整Vitest、浏览器UI/音频与既有玩法门禁、真实LAN、Electron及完整便携版门禁仍须另行明确授权；本节不宣称这些重型门禁已经通过，也不作性能提升结论。

### 24.10 Boss头顶生命显示

按用户追加要求，在每场Boss的头顶增加118×28像素生命面板，显示当前/最大生命及比例条，保留屏幕顶部的名称、总血条和奖励提示。数值较大时使用K/M/B/T，更高数值使用紧凑科学计数；非零残血向上取整，避免存活时显示0。以当前渲染帧的冠甲/骨甲上沿定位，留出指向标和空隙，随镜头及联机显示插值位置移动；屏幕横向边缘内收，镜头外隐藏。LAN生命及Boss身份读取已确认状态；没有新增模拟、存档或协议字段。

本地暂停立即隐藏，恢复重绘；联机暂停、强化阶段及击杀后隐藏。18项Boss定向检查（保留既有14项）通过，新增两种Boss头顶间距/相机跟随、暂停/离屏/击杀、极大数值、确认血量隔离和绘制前后完整模拟摘要一致。初轮摘要夹具误传活世界而非WorldSnap，修正夹具后保留断言；失败日志保留。三套类型检查、构建main-BYcI9ojS.js通过，117机械移植类无修改。

单实例、串行640×480浏览器在1倍/2倍及HIGH/LOW画质下通过真实菜单点击、移动和暂停输入，直接复核截图和血条/文字像素。暴君3000/6000半血条280像素，领主934.5K/1.25M血条415像素；面板下缘指向标与模型顶部保留间隙。初轮localhost沙箱访问限制保留失败报告，重启本次自有服务并允许本地网络后通过，不属于游戏失败。证据见docs/verification/v0.3.1/boss-health.json；重型门禁仍未获授权。

提交4307226后，以本次新构建在仓库外v031-boss-health重新打包；实际便携exe短时门禁再次通过，新增头顶3000/6000显示断言与截图复核，原存档继续、音频、限时强化及Boss翻倍奖励断言保留。asar逐文件匹配当前构建；新版候选EXE SHA256为e5af0cd6a33c14ee3c889952e0730fed155fa86f8900f309cb28bc6f0e968c31。旧候选归档保留，新候选另行归档，正式发布状态仍为待完整门禁授权。

### 24.11 精简Boss血条与内嵌关卡时钟

按用户最新调整，移除顶部Boss面板及独立倒计时条，每只Boss只保留头顶64×7圆角比例条，不显示具体数值；原确认血量、镜头跟随、暂停/离屏/击杀隐藏保持。倒计时内嵌现有172×46顶部统计面板的WAVE栏，不增高或占用额外游戏区域，关数按剩余空间缩放。18项Boss检查、三套类型检查、构建main-fz8lDlko.js通过；短时单实例640×480生产浏览器检查两Boss及LOW画质，真实移动/暂停、圆角条填充像素、时钟边界和无额外HUD层断言通过。直接复核run-1792472740565-2x/priest-low.png，证据保留在generated/reports/v031/compact-hud；旧数值血条证据仅代表此前候选，不作为当前外观。

### 24.12 递进多Boss关卡与DEVIL计数

新可选boss-encounters-v1依赖boss-waves-v1，避免改变旧能力的同步含义。本地默认启用；第5/10关1只、第15/20关2只、第25关起最多3只。混合关按首领类型交替配置，关闭普通恶魔时全部使用暴君；保留原家族技能与伤害基准。HUD将全部Boss归入DEVIL，底层原家族计数继续用于刷怪上限与技能；只读取至多3个首领成员，不扫描场景全部物件。普通援军总上限仍4只，修复未初始化援军被漏算后多补一只的边界。

每个成员保存独立生命、类型、槽位、实体身份和击杀状态；确认态复制深拷贝成员。每只可见Boss独立头顶血条，击杀一只只隐藏它自己的条。全部Boss死亡后才进入一次翻倍强化；部分击杀后超时仍为普通奖励，最后tick全员死亡优先。v2扩展拒绝缺少新能力的世界载入，多成员重建按保存槽位绑定新实体；旧单Boss存档完成当前原规模关卡，下一Boss关才使用新递进规则。

6文件124项定向检查通过，覆盖逐只击杀、4援军上限、混合/关闭恶魔、部分击杀/落地预警存档、成员深拷贝、回滚奖励去重、旧档及旧端协商，同时保留原Boss/变种/存档断言。原单Boss模拟使用classicBossEncounters夹具；不存在关闭现代功能来替代新路径验收。首轮4个失败含已修复援军计数缺陷，其余为测试初始强化/实体枚举顺序/旧档可升级的错误假设；记录保留。三套类型检查和构建main-L0mwFj92.js通过，117机械移植类未改。两个测试类型标注修正前的编译失败及误用旧构建的浏览器失败保留。

短时单实例640×480生产浏览器1倍/2倍、两种单Boss及三Boss场景、LOW画质通过真实输入、逐条填充像素、时钟栏边界、DEVIL计数和无重复层断言，直接复核three-bosses.png。2倍run-1792473132608使用计数扫描版本，随后改为至多3成员查询；最终1倍run-1792473217313验证main-L0mwFj92。场景首轮Dispose后残留实体影响统计，修正测试清理而非绕过计数断言。完整双端LAN门禁尚未运行，仍待授权。

最终运行代码提交069d865重新build后，在仓库外v031-encounters仅打一次候选包。实际便携单实例检查再次通过：头顶无数字比例条、DEVIL=1、WAVE内5:00、存档继续火力加成保持（存前5999tick，继续后实际推进1tick至5998）、音频和Boss奖励恰好翻倍。asar全体及运行文件逐一匹配当前构建；直接复核便携boss.png。源/配置/依赖/资源共316项建立输入SHA256，避免在输入相同的情况下重复构建打包。候选EXE SHA256为0137850ed8c7c6ce4a9552a406201e2c6f5bf6092319ea173212eada3869a245。

### 24.13 精简发布验收提案（待授权执行）

按用户要求评估重复步骤，提出四项门禁：全量Vitest及构建内三套类型检查一次；当前浏览器UI/音频与真实输入；一个隔离双端LAN组合验证确认tick/事件、Boss状态、断线恢复与自然结束/重试；一次原生打包smoke与实际便携exe检查。按版本重复运行v012～v024全场景改为风险覆盖表，保留历史脚本和断言，未执行项不称通过；不运行多延迟全矩阵性能基准或极端压力。不改变输入时复用已验证候选字节，代码/资源/依赖/构建配置有变则失效重建并重测受影响项。方案见docs/verification/v0.3.1/release-gates.md；原计划要求重型验收另行授权，因此本次没有运行全量测试或双端实例，也没有打标签或正式发布。

### 24.14 前快后慢的分段等级成长

按用户最新要求，新开现代单人/合作局使用tiered-growth-v1：1～10级每级2～5XP，11～30级6～15XP，31级起从20XP开始每级增加3XP；击杀才获得经验，拖到倒计时结束不发被动经验。5级UZI需累计9XP，10级霰弹枪需27XP，原武器解锁/升级位置保留。基础阶段每次升级生命/护盾上限+4；中阶+6并增加1%伤害/0.5%有限弹仓；高阶+10并增加2%伤害/1%有限弹仓。护盾不直接回满，生命/弹药只补新增上限差额。等级提示标示BASIC/ADVANCED/ELITE，波间三选一继续独立累计。

新规则以可选能力协商，保存成长标记与精确经验余数；缺能力世界在修改状态前拒绝新档。已有存档保持原曲线与已获得奖励，新开局才使用新曲线。高等级参考成长使用有界前缀与BigInt闭式/二分，不逐级重放。129项定向测试通过，覆盖新曲线/晚期奖励/真实击杀/存档及协商，旧成长断言保留在显式classicTieredGrowth夹具；三套类型检查与构建通过。首轮19处旧曲线假设失败及修正记录保留于generated/reports/v031/tiered-growth。

以640×480单实例LOW画质、原速实时键盘控制试玩第一关，不改血量/弹药/经验/刷怪或模拟时钟。新曲线约30秒8级、60秒12级；自动操作仍在围攻中死亡，不能据此声称时限合理或性能提升。原构建试跑也死亡，种子和操作调整不同，不用于定量对比。新增pacing-play.browser.mjs保留输入和逐5秒状态/截图证据；下一独立项继续验证可提前清完的普通关和Boss实战。当前便携候选仍为上一提交，不能作为本项新曲线的打包证据。

### 24.15 可提前清完的普通关

用户最新要求“努力能在时限内打光，不努力升级慢仍可拖到结束”取代此前无限补怪要求。新增可选clearable-waves-v1依赖限时关：普通关按地图/难度/合作人数配置有限敌群，仍快速开场、持续近场补怪，不恢复旧版长时间等待；预算约为满时限无阻碍刷怪量的65%，合作预算与刷怪速度乘1.35。ZOMBIE/DEVIL展示尚未击杀的总目标（含待刷），不增加HUD区域。全部击杀提前强化；未清完仍可存活至原3/4/5分钟上限过关，不发被动经验。Boss沿用独立目标与多1分钟时限。

落地预警预留预算，落地成功才计实际发出数量，不超刷或积欠补刷。目标、击杀和已刷数进入原快照图，回滚重复LogKill不重复计数/发奖。v2保存击杀/时间/预警；原存档不保存的普通活敌返回待刷预算，保存下来的活变种仍占预算。旧端拒绝新档；旧限时档当前关保留连续规则和参考曲线，下一普通关才启用目标。选关参考成长改为有限目标，保留有界高波次计算。暂停属性及说明页同步新成长/清关规则。

12文件193项定向检查、三套类型检查和生产构建通过，额外真实保存变种、回滚击杀身份和分段暂停属性断言通过。初轮构造期world.mUpgrades尚未赋值导致目标未初始化，改为使用当前upgrades实例；一次存档测试误选1000这个Boss关，改为1001普通关。失败记录保留，不移除旧断言。源盘点117机械移植类无变化。直接复核真实菜单点击、说明文字边界、暂停生命数值与截图像素；见generated/reports/v031/pacing/ui-1792475687132。

原速640×480单实例键盘试玩clear-controller4-active-w1-r0-1792475484495在171.695秒进入强化，152/152敌人全部击杀，剩190tick（7.6秒）、等级24、生命320。控制器未改模拟时间、战斗血弹/经验/刷怪，开场菜单/载入已消耗少量模拟时间；这是输入驱动的自动试玩，不是人工操作或跨种子性能对比。先前控制器过度停火/绕行的失败样本同样保留。该结果验证小图3分钟能主动清关，后续继续进行不射击和Boss实战，不以单图结果冒称全部地图实测。证据见docs/verification/v0.3.1/pacing.json。

### 24.16 实时对照试玩与强化期计数修正

单实例、640×480、LOW、原速真实键盘输入对照完成：主动清怪第一关171.695秒清完152只，等级24；完全不射击的clear-controller6-survive-w1-r0-1792476015557于179.439秒（开场菜单过渡已推进约0.6秒模拟）到达剩余0tick并进入强化，仍为1级/0XP/0分/0击杀、生命200。第5关小图暴君30136毫秒击杀，44级、剩5230/6000tick；第10关中图余烬领主55699毫秒击杀，63级、5分钟上限内完成。实战读取屏幕可见敌人/地图，控制器只发送键盘，不改战斗状态或模拟时间。此前过于保守或陷入围堵的失败样本均保留，包括不射击172秒死亡；改进的是工具的绕障路线，并未为通过试玩削弱游戏。

这些结果支持保留普通3/4/5分钟、Boss多1分钟作为生存上限；积极击杀获得明显成长并可提前结束，不射击仍需走位生存。未声称所有地图都完成了人工/实时通关，18图大小/时限仍由定向模拟覆盖。暴君最初有一次旧参考构筑6秒击杀，不能孤立用于按倍数增加血量；修正敌群参考成长后两种Boss均已实际完成，本次保留原6000起始生命公式。

截图复核发现超时清场后的强化界面仍显示未杀目标152，现仅在draft阶段将HUD敌人计数归零；击杀计数、经验和奖励保持原值，下一关正常展示新目标。32项清关/强化/多Boss回归通过，新增超时强化计数为0且成长不变的断言。第一份打包正在准备时发现此显示问题，标记为未验收并以修正后的新build重打；旧产物不作为当前候选证据。

本项最终代码提交30ef319重新build（含三套类型检查）后，在仓库外v031-pacing-final打包；包内70个运行文件逐一匹配当前dist，能力标记及派生美术前缀核验通过。完整动画集名在加载时组合，由真实便携运行再次核验。旧候选被校验器明确拒绝（缺当前renderer），保留负向检查日志，不冒充产品失败。当前实际便携单实例、隐藏640×480、隔离存档通过新成长/目标保存继续、超时强化HUD归零、真实卡片点击、音频31段、Boss头顶单条/DEVIL计数及一次翻倍奖励；直接复核draft.png与boss.png。保存6000tick，继续后自然推进至5999，成长标记/目标/击杀不变。新EXE SHA256为5a1619bdc30ced600593f848a8ccc996eadff9dec594040d498482da1749208c，asar为323e07745620b0c1e81b354bc03d44f3312094dca1fc1ea58c9c699b849e21b8。新输入指纹含402项代码/资源/依赖/构建工具文件，候选与实时试玩索引见candidate.json与pacing.json；完整重型门禁及正式标签/Release仍待新授权。

### 24.16 正式门禁授权与经典夹具复核

用户已明确授权执行精简完整门禁、直接修复失败并在全部通过后发布正式v0.3.1及Windows便携exe。首轮完整Vitest保留于generated/reports/v031/release-gates/vitest-1.log：1689通过、28失败、71既有条件跳过，另有2个localhost EACCES未处理错误；网络部分需在允许本地网络的环境重跑，不改断言规避。其余失败为旧基准规则身份不明确：经典波次并发/快照配额、无现代能力的联机参考局、旧复生和弹仓曲线现显式使用对应classic夹具；变种XP同时保留原五XP断言并新增阶梯曲线累计XP核验。现代18图浸泡继续启用新规则，物件寿命按战斗tick计算，排除同步但冻结物件的强化阶段；原60秒过关断言在额外经典限时夹具保留，现代关验证仍在战斗且时间未耗尽。修正后相关9文件112项全部通过；无机械移植或实际玩法修改，未新增跳过。

### 24.17 精简完整门禁 — 源码、浏览器与打包联机/原生

允许localhost访问后完整Vitest为133文件1719项通过、71项既有条件跳过，无未处理错误；包含34组独立进程模拟一致性场景。当前生产构建内三套类型检查通过，117个机械移植类未改，renderer仍为main-CTNg9n_N.js，候选asar内70个当前文件逐字节一致，运行输入指纹未变，按授权方案复用同字节候选。浏览器UI188/188、音频49/49通过，覆盖真实改键/射击、成绩及中文IME、设置持久化、宽/竖屏与高DPI、失焦松键、真实音频解码和故障恢复后的非零波形。直接复核截图与既有像素/几何断言，未使用zai。

同一隐藏640×480双端功能脚本扩展至多Boss、部分击杀、实际TCP断线恢复、双倍奖励和自然结束/客户端重试；隔离48630/48631～48640端口，在30ms单向延迟下比较共同确认tick完整八区摘要和有序声音/贴图身份。成功运行lan-4中实际发生回滚纠正，深度受6tick上限约束；双Boss各64×7单血条、无数字、DEVIL为2，部分击杀后为1；历史恢复不重建世界并保留剩余Boss半血；每人仅加2份火力，进入16关记录检查点，重试后仍为2份且时钟符合检查点后模拟tick。前三次失败全部保留：脚本误读底层家族计数、误以暂停观察时刻代替关卡起点检查点，以及预测阶段先于确认态卡片渲染的点击竞态。只修验收夹具/等待，未改玩法、移除断言或新增跳过。部分Boss的v2存档及能力降级由全量模拟回归覆盖，实际LAN验证历史恢复和下一关检查点。

新增单实例打包原生门禁7项通过：窗口/无菜单/隔离存档、沙箱preload、app协议MIME/404/目录穿越、真实输入/暂停、宽屏点击、原生F11/IPC/Alt+Enter及跨进程存档持久化。窗口从创建起透明且不可聚焦，全屏只验证原生状态和尺寸，不进行不稳定的透明全屏截图。浏览器与联机/原生串行，实际便携exe另作最后检查；本次自有5311预览已关闭。新脚本保留原历史入口和断言，未运行渲染压力或性能矩阵，不宣称性能改善。完整记录在generated/reports/v031/release-gates/。

### 24.18 v0.3.1正式发行门禁完成

实际Windows单文件便携exe再次独立通过：唯一CDP端口、隐藏640×480、隔离存档；解包asar SHA256为323e07745620b0c1e81b354bc03d44f3312094dca1fc1ea58c9c699b849e21b8，与暂存包完全一致。新分段成长/有限清关目标、普通关结束HUD归零、三选一真实点击、下一关构筑与剩余时间保存继续、Boss头顶64×7无数字血条/DEVIL 1/WAVE 5:00、恰好双倍强化、31段音频解码且运行均通过，直接复核本轮Boss和强化截图。当前构建70文件与asar逐字节相同，402项运行输入指纹为337bad4f03d9db93933cdcf9d15f0781a579a2ac6f2f740d59b5d790497cbcdd；门禁修正仅测试/文档，按授权复用既有同字节候选，不重复打包。

全部精简完整门禁已通过，符合正式发布条件。发行exe为Boxhead 2Play Rooms-0.3.1-portable.exe，101657484字节，SHA256为5a1619bdc30ced600593f848a8ccc996eadff9dec594040d498482da1749208c。双语README/功能说明、英文Release Notes和本记录同步，覆盖最新稳定v0.2.9以来变化。最终清单docs/verification/v0.3.1/release.json与release-gates.md明确通过项、复用依据、失败及未执行的历史重复脚本；原脚本/断言保留。枪械/敌人全朝向联系表、细节图、动作短片、实战对比和本轮截图/日志统一归档，见archive-release.json及SHA256SUMS。所有本次游戏/GPU进程和QA监听已清理，不涉及玩家存档或端口。后续按该最终内容建立annotated v0.3.1并发布GitHub正式版，上传exe和SHA256清单，再校验远端资产；不将性能矩阵遗漏表述为通过或性能改善。

## 25. v0.3.2 — 对抗、构筑与操作

### 25.1 手柄隐藏光标误确认

复现表明，手柄A在战斗中仍会产生隐藏光标的鼠标按下/松开事件，跨入强化界面后存在误点并锁为READY的路径。现将虚拟鼠标限于菜单和暂停界面；战斗及强化使用各玩家自己的开火/确认键，真实鼠标仍可选卡，不改变模拟输入或旧协议。

新增客户端角色两套键盘、手柄默认/交换归属及跨关持键回归。首轮复现期望0个鼠标事件、实际2个；修复后4套件27项通过，三套类型检查及生产构建main-D9jhRN5d.js通过。单实例隐藏Chrome实际键盘W/S、注入手柄上下/持键松开及双方确认通过，直接复核P2高亮截图。注入手柄只代表映射验证，不代表实体硬件；未执行真实双端联机。localhost沙箱拒绝及重启允许网络前超时的失败记录保留，不计游戏通过。此项关闭已确认的误确认路径，不宣称已覆盖所有键盘故障。实现、授权边界和证据见docs/verification/v0.3.2/README.md，浏览器记录generated/reports/v032/draft-input-1792502785409。

### 25.2 无倒计时，等待双方确认

新增可选draft-ready-v1，依赖原限时/强化能力，不重定义wave-draft-v1。新局强化不再递减时间或默认选火力，所有参与者明确确认后才发奖并推进；保留原先持有开火键必须释放的保护。待选状态和双方确认纳入原快照，旧端在改动世界前拒绝新待选档，原12秒断言由明确classicDraftReady夹具保留。旧档已处于强化时，保留候选和已确认玩家，转换为无限等待。

6文件115项定向检查通过，新增旧待选档迁移用例单套件4项再通过（合计覆盖116项）。最终三套类型检查及构建main-CUTuAiny.js通过。单实例隐藏Chrome实际P2选卡并确认后等待14秒，仍停在第1关且P1未确认，界面无倒计时/DEFAULT；P1随后确认才进第2关。直接复核ready-wait.png。真实双端网络验收尚未执行；详见generated/reports/v032/draft-input-1792503055472。

### 25.3 精修强化卡片与独立属性页

强化界面改为原风格浅灰/标志红，增加几何图标、当前值到奖励后数值预览和明确准备按钮。新等待规则下鼠标先选卡、再准备，命令仍在7位输入内，排队保留先选后确认顺序；旧端保留其原点击解释。各玩家可独立按Tab/R或手柄Y查看属性，查看时只过滤自己的采样输入，关闭后须释放原持有操作，另一玩家可继续选择。属性含血盾、经验、移速、当前枪伤害/射速/弹药、附魔及构筑来源；LAN从确认tick元数据读取，预测值不冒充已生效值。有限999999弹容量按规则身份判断，不误标无限。

属性页支持点击改键、拒绝战斗键冲突并持久化；默认键若与既有改键冲突会选空闲备用键。首轮定向测试发现原CInput实例保留Key监听导致重复切换，已仅让当前CMain.mInput处理额外UI键。初轮浏览器暴露按键名称引号和阴影覆盖浅色背景，均在最终构建前修正。相关6套件涉及28项通过（最终属性5项），三套类型检查及构建main-DCu7_ZgT.js通过。

单实例640×480真实选卡/准备、Tab/R、冲突改键到T、一方查看另一方选择、暂停隐藏、保存继续保留选择和准备、注入Y/A映射与关闭持键保护通过；960×540及480×720面板均在逻辑舞台内，直接复核各截图，浅色像素与红色像素断言通过。未使用zai，不宣称实体手柄或真实双端网络已验。证据generated/reports/v032/draft-stats-1792503830015，初轮失败目录保留。当前枪械/战斗数值尚待下一独立项调整。

### 25.4 武器、弹仓与旧局迁移

新增combat-pve-v2，双方完整支持限时、明确准备、阶梯成长、有限目标与变种才协商。新规则有限武器的原双/四倍容量改为+50%/+100%训练，原无限能力改为+125%；等级容量和每份强化8%先合并，再按2x/(2+x)递减，最终趋近原始容量3倍。手枪保持无限弹药，补给/死亡箱不再绕过新容量。每次属性查询保留当前弹量，仅升级新增容量差额可补，继续读档不补满。

常态25tick/s下最大射击周期分别至少5/3/10/13/10tick，对应手枪5、UZI约8.3、霰弹枪2.5、火箭约1.9、轨道枪2.5发/秒；保留原游戏速度对模拟频率的作用，不随速度重写原tick周期。原RapidFire改为30%速率训练并受各枪上限约束。霰弹枪/火箭基础周期18tick，轨道枪15tick；霰弹每弹丸伤害65%，超过30%射程后线性衰减至远端45%。发射时记录霰弹原点与射程，不依赖后续飘移贴图。火箭及子爆炸保留来源身份，仅直接自爆伤害乘15%，先于玩家护甲结算；其他爆炸不变。附魔仍在原发射路径缩放一次，耗尽、死亡箱和补给规则保留。

v2可选保存combat状态，旧档先保留当前波战斗，下一波激活并按新容量截断；等级/经验/已选构筑不丢失、不补满。能力不足在修改世界前拒绝新档。旧容量继承及每级必增弹仓断言移入对应明确classicCombat夹具，原断言不删，现代容量/射速/存档/伤害另测。

最终7套件142项通过，含实际武器Update连续250次的UZI开火计数、霰弹距离伤害回滚一致、自伤先盾、重复派生不补弹、旧档下一关迁移及能力依赖。三套类型检查和构建main-PYg_cxxA.js通过。单实例640×480准备10级场景后用真实移动/射击键发射四枪，记录霰弹33.15伤害、火箭/轨道18/15tick及有限库存，直接复核武器属性截图；这是功能夹具，不是正常成长试玩。最终属性流程再次通过并直接复核暂停摘要；证据generated/reports/v032/combat-weapons-1792504849878及draft-stats-1792504916898。兵种、敌方血盾与地图节奏仍待后续独立项，不宣称整体对抗性已验收。

### 25.5 多路线构筑与有限恢复

现代强化分别抽取攻击、防御和功能选项，共十种奖励；新增递减的射速、移动、穿甲和补给效率。已达射速/弹仓上限或无需恢复时不提供无效选项，预览实际派生前后值。选关起始构筑以固定八次分配计算，保留旧四属性夹具。穿甲在发射时锁定，爆炸后代及保存地雷保留原值；护甲在致死归属观察前消耗，不再生。

现代永久补给恢复40%上限并受效率加成，强化恢复35%；临时旧箱及旧端保留原全恢复语义，原断言由明确classicCombat夹具保留。最终相关6套件44项通过，附魔/护甲/弹药及武器定向检查另已通过；三套类型检查、构建main-CQIlV71F.js通过。单实例640×480实际鼠标选卡、Tab/R独立属性页、派生移动/射速/穿甲/补给和保存继续通过，直接复核new-cards.png与build-stats.png。此为预设候选功能验收，不冒充正常战斗；证据generated/reports/v032/build-choices-1792506039103。

### 25.6 连续短按不再漏选

新增回归复现P2连续两个短于一tick的下键：首轮第二次仍停在第2张卡，应到第3张。现代明确准备局将物理导航按下沿编码为104/105动作，相邻采样不要求空帧；按住不误重复，保留进入界面开火释放保护。键盘两套与LAN客户端角色覆盖，游戏战斗/旧端输入不变。4套件24项通过，扩展客户端用例再次通过；三套类型检查及构建main-CA9iVdWU.js通过。

### 25.7 原出生口与短局节奏

现代目标数与并发数为v0.3.1原值向下取40%，LOW上限16，噩梦HIGH上限22。按全图可达性筛选原出生口，轮换距离相近的入口；堵塞或太近则等待，取消玩家附近地面随机出生。刷怪9秒后休息3秒，无累计欠账爆发；Boss普通援军最多1只、3秒检查。远处逐格接近速度平滑提高，靠近后恢复本兵种战斗速度，不传送、不读镜头。

18图根据可走面积和主起点至出生口最短路，普通80～105秒、Boss增加30秒，菜单和局内共用派生结果。清完或存活均可结束，超时不发被动经验；参考起始等级按缩减目标重算。出生轮换、地图指标、时钟与目标纳入快照。旧局当前关不变、下关迁移。相关7套件71项、遭遇组33项及修正后受影响13项通过，原时限/地面出生断言保留经典夹具。浏览器暴露首次构造早于地图标记导致空指标，已在加载完成、恢复和成长初始化前刷新；失败记录保留，最终构建main-41p_ietm.js通过。

### 25.8 现有敌方生命、护甲与奖励

现代普通/冲锋僵尸生命×2.5，恶魔/祭司及现有Boss生命×2；普通僵尸移速×1.2、恶魔×1.12、变种×1.1。恶魔护甲为生命上限30%，Boss40%，消耗后不再生；穿甲按发射时值绕过部分吸收，吸收先于致死归属。新增细青色头顶护甲条，LAN仅使用确认tick护甲元数据；Boss原64×7血条保持。普通恶魔也保存剩余护甲，不因读档补满。

普通/冲锋/恶魔/祭司击杀经验分别2/4/10/12，Boss50；主动击杀补偿更少、更耐打的目标，超时仍无经验。参考成长用普通家族最低收益重算，不假定击杀Boss。首轮4个旧生命/XP精确断言失败保留，原断言改用明确classicCombat夹具，另测现代实际致死与经验余数。相关首轮73项通过，修正后4套件36项全部通过，三套类型检查及生产构建main-DiuD5wS0.js通过。

### 25.9 疾行与臃肿僵尸

第3/6关起以原成功出生序号替换疾行/臃肿僵尸，不增加目标或额外随机调用，每类同时最多2只。疾行具较低生命、更快移动，在视线通畅时绕侧；臃肿具两倍现代普通生命、较慢步速和70基础重击。重击先锁定方向预警0.8秒，范围2.2格扇形，命中后恢复1.2秒再冷却，走出范围/侧后或障碍可躲避。

新增独立深灰绑带/伤口与宽躯干围裙/重腕造型，加载期烘焙，保留原脚、XSI信息、逻辑回程和经典美术；普通伤害与死亡反应仍可打断。新种类、预警方向/剩余tick/恢复状态保存并精确回滚。4套件34项通过，三套类型检查和构建main-9S_PNEEg.js通过，117移植类未改。单实例生产版生成两种全动作16朝向联系表并检查几何/像素，直接复核details、brute-actions及warning，证据generated/reports/v032/combat-roster-1792507566256；属于美术/预警夹具，正常推进试玩仍待全兵种完成。

### 25.10 随机玩家外形持枪僵尸

第8关起原僵尸序号可替换持枪型，同时最多2只。读取种子状态和成功序号派生4种玩家皮肤及手枪/UZI/霰弹枪，不额外推进随机数；四皮肤保留识别元素并加伤口/异色眼，所有武器和方向在加载时烘焙。225基础生命、独立慢步速、3击杀经验；先锁定方向预警0.6秒，手枪单发、UZI三连、霰弹三扇，随后恢复和冷却。

新增橙色实体慢弹，以不超过0.08格步长检测墙/物件和活玩家，不打友方僵尸，不沿目标追踪；可侧移躲避。沿原枪口锚点发射，瞄准虚线显示范围/散布，保留正常受击中断。皮肤、枪支、瞄准/连发状态保存；飞行子弹用原泛型快照精确回滚。4套件38项通过，三套类型检查/构建main-C34_1AJU.js通过；生产单实例4皮肤×3枪×16朝向联系表、瞄准和子弹截图复核通过，证据generated/reports/v032/gunner-1792507918163。普通流程实战仍待两类恶魔完成。

### 25.11 屠夫、猎手与新Boss

第12/18关原恶魔名额可替换屠夫/猎手，各最多1只；基础生命2600/2100，护甲780/630，击杀经验14/12。屠夫预警1秒后锁向劈砍并恢复1.5秒；猎手预警0.9秒后发射间隙扇弹，再恢复。第15/20关起新增对应Boss，四家族轮换与原1～3成员规模并存；Boss屠夫多一次旋向重劈、猎手多一轮错开扇弹，追加攻击均重新预警0.7秒。关闭恶魔仍全暴君，Boss击杀70经验、清完仍恰好双倍强化。

新金属围裙/刃腕与青色猎手护甲、独立王冠Boss形态在加载时烘焙，保留原脚/锚点/动作回程。每个成员独立保存护甲和连招，技能期间Boss吸收伤害后仍正常致死。旧端存档不凭空加入未拥有的现代字段。相关6套件52项通过；最终持久化/美术修正后4套件42项通过，三套类型检查及生产构建通过。首轮测试的实体枚举顺序、未初始化受击队列及伪子弹缺坐标失败保留；仅修夹具。生产截图首轮相机未跟随导致像素门禁失败，修正相机夹具；同时直接复核修正刀刃挂点。最终4形态全动作16朝向/警示/64×7血条与青色护甲像素通过并直接复核，证据generated/reports/v032/demons-1792508530048，未声称普通实战已验。

### 25.12 全新可见模型，保留动作骨架

用户明确要求全新建模，取代此前以原僵尸改色/加装的方案。五类新敌人及两种Boss形态的头、躯干、上臂、前臂、手与靴全部重建面与材质，不保留原可见网格/贴图；只沿用动作骨架、XSI信息及功能锚点。疾行采用瘦长面罩/背罐，臃肿采用宽腹/獠齿/不对称重拳，屠夫采用厚甲/栅面盔/刃腕，猎手采用棱形面罩/长角/分段护甲。持枪型重做僵尸躯体，四皮肤用头具、配色和服装特征保持角色识别，枪口和现有枪械造型保留。

旧派生美术脚形/回程断言保留在明确legacy入口，不以旧模型替代新模型验收。新增检查证明每个可见部位都是新面、材质为新网格材质、全动作/朝向有限、骨架信息和枪口一致；4套件22项通过，三套类型检查及构建main-CpivMMMS.js通过。首轮新脚锚点测试误比较玩家Alternate1重映射与基础脚，修正为实际骨架来源；未改锚点。生产复核修正反向绘面遮住细节，以及新比例颈/肩衔接，所有改动在提交前完成。

### 25.13 实玩修正进场与基础移动

真实按键首轮实玩暴露低级敌人绕障碍抵达过慢。普通/变体/恶魔设置 .06/.075/.08 单格速度下限；距离超过四格且视线被墙阻挡时提高逐格接近速度，接战后回落。实际速度仍按家族区分，保存的速度不被临时接近值改写。两组回归共 8 项通过，含遮挡/通视比较。

当前构建真实 90 秒首波实玩完成：11 次击杀、等级 8、剩余生命约 130/228；没有改写战斗数值、刷怪、时间或经验。控制器只发键盘输入，其局限与早期失败均保留；后续噩梦与双人验收另记。

### 25.14 补给提示准确性

噩梦 Boss 实玩截图发现部分恢复补给仍显示 All ammo restored，容易误解为全满。现代部分补给改为 Ammo/Health/Armor replenished；旧版全满补给保持原提示。仅更正界面文字，三项类型检查通过，最终生产截图门禁复核。

### 25.15 堵死恶魔专用口不再造成空关

全量测试在第7/14张地图复现：所有恶魔专用口的下一格被固定物件堵塞，待出生Boss阻挡后续成员和援军，60秒无敌人。专用口不可达时，恶魔改用可达且安全的原僵尸入口，不新增落点、不改障碍、不在玩家身边刷新。原12项机器人浸泡断言不变并全部通过，另有两图Boss全部入场回归；相关三套共17项通过。

### 25.16 完整简化门禁与发行产物

按用户最新授权完成完整简化门禁：1784项Vitest通过、0失败、71项原有环境/可选跳过，三项类型检查及生产构建通过；117个机械移植文件无改动。浏览器UI 188/188、音频54/54。首波、本地双人自然90秒及噩梦第20关自然120秒均以实际键盘输入跑过，保留失败和控制器局限，不把注入击杀场景当成实玩。

最终单文件EXE实际启动并核对完整asar与当前代码，保存继续、属性页、新模型、护甲、翻倍奖励均通过。隐藏原生七组检查覆盖协议、窗口、真实操作、全屏及进程重启存档；真实隐藏联机覆盖完整确认态/声音/贴花、Boss护甲、P2两套键盘上下、独立属性页、单方确认等待14秒、TCP恢复及客户端重试，奖励无重复。最后补验上下四键的完整场景再次通过。未测物理手柄、远程机器链路或性能收益。

发行文件 `Boxhead 2Play Rooms-0.3.2-portable.exe` 为101669486字节，SHA256 `2b7763970c0ff026ef617baf8c55d27c5a4bc588ee41af0eeddd1c3e947e01ac`。完整记录见 `docs/verification/v0.3.2/README.md`；旧版本脚本保留，按简化门禁由当前组合验收覆盖，不冒充逐个执行。

## 26. v0.3.3：精简对抗

### 26.1 独立协商的精简敌群与四类补给

新增 combat-pve-v3，本地默认启用，联机只在双方支持且具备原完整依赖时协商；旧端仍为 combat-pve-v2。普通敌群仅原版僵尸、冲撞型及原版火球小红，Boss仅冲撞/小红，保留1～3成员与关闭恶魔的全冲撞规则。新规则取消实际敌方护甲和护甲条，不补偿生命；原版移植、其他模型、旧端机制和断言保留。补上无变种标记/无护甲小红Boss的存档捕获与恢复条件。

红箱全部沿用已有武器奖池和权重，不提前解锁；小红死亡一次种子随机抽取医疗/护甲/附魔/弹药，各25%，身份和永久箱有效拾取规则保留。五项新模拟回归与77项LAN桥接（含新旧协商及不兼容重连）和8项旧恶魔回归共90项通过；旧敌方护甲/普通兵种/持枪型16项亦通过。首次失败保留：旧恶魔夹具未显式选v2，以及新出生夹具触及真实有限预算；修正夹具而未删断言。后续成长、迁移与实玩仍待完成。

### 26.2 更薄的护甲与有限附魔增益

v3生命/护甲基础上限160/60，基础、进阶、精英阶段逐级分别+2/+3/+4与+1/+2/+3，波间生命+8%、护甲+6%。保持原回血、初始空甲及升级生命差额恢复，不补盾。附魔伤害1.15倍，普通子弹最多命中两个敌人，取消额外爆炸边缘增伤；弹药耗尽和持续标记语义保留。新构筑退出穿甲，七种永久属性循环分配起始点数。旧v2伤害/穿透/十种奖励测试改为显式旧规则夹具，断言保留。

生命/护甲预览读取实际派生函数，属性页与暂停摘要共用真实上限；新属性页不再显示无效穿甲，附魔显示+15%。四套件55项通过（含薄盾第二次50伤害时破盾并溢出扣血、两目标与墙体碰撞、普通爆炸边缘衰减），三项类型检查及生产构建main-DNkWRJn0.js通过。单实例640×480生产浏览器真实Tab、选卡/准备点击、暂停及几何文本检查通过，cards/stats/pause三图直接复核，证据generated/reports/v033/ui-1792547498400。最初沙箱localhost访问失败保留，换用许可网络的自有预览服务后通过；此为界面夹具，不是平衡实玩证据。

### 26.3 有限目标与实际时限一致

v3普通关目标改用地图实际80～105秒时限，保持40%系数和难度/双人倍率；参考经验使用同一预算，Boss仍不假定击杀奖励。敌方成长缓存增加精简规则维度，防止同一世界迁移后复用旧规则结果。Boss普通援军并发2只、3秒检查，Boss名额独立，旧v2保持1只；无多成员能力的v3也不能绕过援军上限。

三套件13项通过，覆盖18图×4难度的实际时限预算、原入口与小红Boss抵达、两只原版援军，以及超高关参考经验闭式计算；旧18图/回滚/入口回归保留在明确v2夹具。提前清场仅完成规则回归，正常键鼠实玩仍待后续验收。

### 26.4 精简对局不预烘焙退出的模型

生产UI开局门禁停在State_LoadingWorld且无脚本异常，检查发现v3仍会经原GetCollection包装链烘焙所有已退出的兵种。增加配置级判定，仅v3跳过疾行、臃肿、四皮肤持枪、祭司、屠夫和猎手及其Boss预烘焙；原生和冲撞美术保留。旧v2、经典路径及显式美术函数保留完整加载能力。两项加载路径回归与两项全新网格原有回归通过，三套类型检查及生产构建通过；这里只确认避免不需要的烘焙，不宣称性能测量收益。浏览器加载和Boss条门禁继续验证，原失败证据保留。

### 26.5 紧凑Boss生命条

v3冲撞Boss44×5、小红Boss40×5逻辑像素，距当前动画顶部4像素，保留深底、填充和细高光，无数字；旧规则仍64×7。玩家原生命/护甲条不改。旧Boss显示/暂停/确认态/多成员29项通过，三项类型检查和构建通过。生产浏览器真实选关、选卡、Tab、暂停及三Boss满/半/10%血量的几何和像素门禁通过，bosses.png直接复核；证据generated/reports/v033/ui-1792548377485。

先前失败包括加载等待过短及移动夹具后仍保留旧相机跟踪位置，使Boss被夹在屏幕顶端；保留失败报告，等待完整加载、初始化夹具跟踪位置后原间距/填充断言通过，没有放宽产品血条检查。此为显示夹具，平衡实玩仍单独执行。

### 26.6 旧档立即转换，重复读取不再折算

本地或已协商v3的旧档在重建时立即启用v3；未协商v3的旧端路径保留。旧穿甲点数转火力、待选卡同步替换；退出兵种按家族转换为原版僵尸/小红，保留剩余生命比例和Boss槽，移除旧技能、火区和敌方护甲。玩家以原档生命/护甲比例结算新上限，死亡/空甲不恢复，分数、经验、库存和附魔标记保留。已放置附魔爆炸物只折算一次1.15/1.35倍率。

已有倒计时保留，有限目标按完成比例与重建存活敌人协调；尚未出生的旧地面警示归还预算，后续从原入口进入。没有计时机制的旧档初始化新时限。迁移函数不抽随机数、不修改来源存档；v3标记避免重复转换，旧v2读取v3在任何修改前拒绝。三套件20项及三项类型检查通过，包含生命/护甲/构筑/库存、旧四兵种、Boss重连、无计时旧档、死亡状态、原档不变、随机状态一致和新版重复读档精确恢复。

### 26.7 首轮代码审查清除无效热路径

对本次改动及包装链检查后，v3跳过退出兵种的三处每帧实体扫描（重击、持枪瞄准、屠夫/猎手警示），保留旧规则绘制；附魔爆炸在v3恢复普通衰减时直接走原伤害路径，不再重复计算仅旧额外增伤所需的距离。没有引入模拟缓存、随机调用或壁钟。相关四套件30项、三项类型检查通过；静态清点600模块、117机械移植文件无修改。属于避免已确认无效工作，不宣称基准性能收益；最终实玩/发行前仍复核最后候选。

### 26.8 旧规则切换时仍在加载期准备模型

复核发现CMain早期按本地v3配置预载，而旧LAN能力或经典夹具在之后才生效；因此必须在世界InitLists中按最终配置补齐完整旧美术，再由原InitCleanUp烘焙，避免首只旧兵种出现时才补载。恢复加载测试直接检查旧局已具备全部模型，移除先前夹具内手动调用GetCollection的补偿。新/旧加载、普通兵种及77项LAN桥接合计84项通过，三项类型检查通过。首次全量检查在改运行时代码前主动停止，记录generated/reports/v033/full-first-interrupted.json，不记为全量通过；修复后重跑。

### 26.9 全量首轮失败归因与历史夹具

串行全量第二轮1877项中1790通过、16失败、71项原有环境/可选跳过，报告generated/reports/v033/full-second.json。7项为原200生命/100护甲、三类掉落、下一关迁移断言仍使用新的v3默认值；为对应历史用例显式选classicSimplifiedCombat，保留全部原断言，现代v3仍由独立回归覆盖，不全局关闭。五套件70项全部通过。

其余9项localhost传输失败包含明确EACCES，为沙箱网络限制；原断言在许可网络环境下两套件22项全部通过，没有改协议实现或添加跳过。后续最终全量必须在许可网络环境执行，不能将本次失败报告当成通过。

### 26.10 候选调用链审查

再次逐段复核协商、加载、成长、补给、附魔发射、出生/计时、确认态显示、保存与重建调用链。v3属性快照不再计算和分配已退出的穿甲预览；旧v2预览保留。已放置附魔物的迁移倍率与正式伤害共用常量，避免后续数值改动漏改迁移。三项类型检查、成长/迁移/构筑三套件21项通过，保留旧规则断言；补齐偏差登记的完整范围。未据此宣称性能提升。

### 26.11 真实输入控制器与失败留档

平衡实玩只通过真实键鼠控制战斗，不改生命、库存、出生、击杀或倒计时；菜单选关历史仅在隔离QA上下文中设置。控制器修正真实枪口锚点、冲撞横闪、火球避让、升级火箭的伤害相关安全半径、已拥有武器实际试选后的延迟升级属性和真实射程，所有变更均只在QA脚本。新增逐次武器/伤害/破盾/邻近箱消失记录，保留每轮控制器源码与哈希；不将自动控制结果当成人类胜率。

最初初级两局死亡，随后一局26/27只超时，修正退避后27/27只提前14.44秒；初级第5关Boss提前14.52秒。中级第2关33只僵尸与2只小红全清，提前11.64秒，第5关Boss提前32.44秒。此前中级/专家及噩梦35/36关的死亡、超时样本全部保留，未因控制器失败直接削弱产品数值。选关值1沿用原版难度起点（1/10/20/35）；误把它当高难度普通第1关的夹具不计入通过，新增实际开局波次断言，普通关改用明确选关2。专家/噩梦与最终发行门禁仍在继续。

### 26.12 血条路径缓存与最终外观复核

候选审查确认Boss条在每次显示帧都重建相同底框、填充与高光路径。改用以条形clip为键的WeakMap，仅在尺寸、种类或生命比例变化时重画，位置仍逐帧更新；不写入世界、敌人或快照，无手动清理生命周期。Boss显示/多成员及精简战斗三套件39项、三项类型检查和0.3.3生产构建main-1zov2wvB.js通过。

generated/reports/v033/final-ui-cache生产版真实选卡、准备、Tab与暂停通过；44/40×5尺寸、4像素间距、满/半/10%填充的像素和几何检查通过，四张截图直接复核。缓存只确认避免已知重复工作，不宣称基准性能收益。

### 26.13 四档提前完成证据与发行验收组合

专家第2关41只僵尸与2只小红全清、第5关Boss提前击败；噩梦第2关52只僵尸与3只小红全清（剩4.60秒），第5关冲撞Boss及第10关小红Boss亦提前击败。连同26.11的初级/中级，四档普通关和Boss均有自然提前完成证据，噩梦使用4242、1337、9001三种开机种子。记录与严格汇总在generated/reports/v033/pacing及pacing-summary.json；以result的击杀/倒计时判定，不把超时或误选关当提前完成。

噩梦第35关三Boss有两只击败、最后小红剩2014/90000总生命时超时，第36关样本死亡；补测及控制器失败保留，不以此宣称所有关卡必能提前通关或推算人类胜率。已确认的产品数值未因这些自动控制结果另行削弱。

发行脚本复用已验证的v3生产界面检查到实际便携版；隐藏LAN组合复用原确认态/声音/贴花、真实重连、双人选卡及重试流程，新增v3协商、无敌方护甲及44/40×5条形检查，旧v032默认行为保留。四个脚本语法检查和生产UI检查通过，打包后的实际便携/LAN与最终全量门禁随后执行，不在此记为已通过。

### 26.14 最后构建的输入复核

main-1zov2wvB.js上增加健康时短暂返击普通追兵的QA输入策略后，初级普通关再次27/27全清（余3.56秒），第5关Boss再次提前击败；只更改控制输入，没有产品数值变化。噩梦35关同种开机种子的另一路真实输入仍超时，剩23723.82总生命，未计为提前完成。所有失败/超时和逐轮控制器源码保留，汇总依据实际result而非最后一个5秒采样。四档规定场景与三种噩梦开机种子覆盖成立，额外高波次不宣称全部可由此控制器提前完成。候选产品代码冻结，随后执行最终全量与发行产物门禁。

### 26.15 全量通过与展示夹具计数修正

bd0a278候选全量在许可网络环境串行执行，148套件通过、1806项通过、0失败、71项原有跳过，记录generated/reports/v033/full-before-stock-fix.json。回滚、旧能力、18图、新迁移与真实localhost传输断言保留；后续审查修复后必须重跑最终全量。

直接截图复核发现三Boss准备场景只显示DEVIL 2：夹具直接构造敌人，绕过了原CWorld.Spawn负责的原生小红计数，产品真实出生路径正常。为夹具补齐家族计数并增加HUD必须为3的断言；语法检查及生产UI像素/几何/真实点击全部通过，generated/reports/v033/final-ui-counts的三Boss截图直接复核。未修改产品出生或计数实现，实际便携与LAN后续复用这一修正夹具。

### 26.16 审查复现旧库存在下一帧被截断

合法旧规则125级满弹匣UZI的820发在读档时保留，但两帧后因现代容量收敛降为201发，回归先失败于generated/reports/v033/ammo-regression-before.json。统一v3弹药结算：容量限制补充量，既有超额库存保持可用且有限；覆盖武器Update、供应同步查询、部分/完整补给、强化与死亡武器箱。红箱把超额库存按满弹匣权重处理，避免负权重。旧v2仍用原截断公式，原断言改为显式旧能力夹具保留。

七套件48项通过，新增回归检查820发跨更新/补给/箱子/重复读档不丢失、发射正常扣减，以及999999发仍逐发消耗并遵守原射速上限。首次修补又暴露补给查询内的截断和旧v2夹具未显式选择，失败留存ammo-regression-incomplete.json；补齐后ammo-regression-after.json全部通过。没有新快照字段、随机调用或普通新局数值变化；重新执行类型/构建及最终全量与发行门禁，前次全量不替代本次结果。

三项类型检查与0.3.3生产构建main-aEZJ6C-F.js通过，后续门禁使用该修复后的代码。

### 26.17 历史浏览器入口与v3夹具

修复后最终全量148套件通过、1807项通过、0失败、71项原有跳过（1878总计），记录full-final.json。main-aEZJ6C-F.js的完整浏览器UI 188/188、音频恢复及实际波形54/54通过，原断言保留；截图直接复核卡片、属性、Boss、暂停及菜单/选项/CJK输入/宽屏。

历史browser三种模式实际移动/射击、暂停、退出与重试均通过。v019首次失败来自旧夹具仍期待第25关85级、十武器和十只普通敌人；v3按实际时限起始61级、九武器及三Boss/两援军，游戏表现符合已确认规则。保留旧等级85、旧武器表和非Boss十敌人的断言，另按协商规则检查v3，重跑通过全部Boss入场及13发UZI/2发霰弹的真实死亡箱回收。v020被动死亡、真实RETRY也恢复第25关61级、相同成长/九武器且分数为0。失败原件与通过记录在source-gates-20261021-124202和source-gates-20261021-124652；只调整验收夹具和串行640×480画面，不修改产品数值。

### 26.18 实际便携与历史打包入口

重新build后外部生成dir与portable，隔离暂存到release/v033-final，不覆盖旧解压版。asar内70个构建文件7423582字节逐字节一致，包/锁文件/PE均为0.3.3；实际便携NSIS启动、31音效、存档继续、v3卡片/属性/Boss血条像素与几何通过，完整解包asar哈希一致。Electron 46/46、打包协议6/6及隐藏原生七组检查（含重启存档、真实输入和全屏无焦点）全部通过。截图直接复核，记录packaged-gates-20261021-125220。

历史打包v012、typing、lanui、v023、v024、net、netretry与browser三模式全部串行通过，记录packaged-gates-20261021-125542；真实输入/IME、尺寸适配、独立镜头、暂停、失步清理、选关历史、TCP重连和超时、双方死亡后第二局与客户端RETRY原断言保留。只增加可选BOXHEAD_QA_EXE路径、从创建即隐藏/不可聚焦及640×480输入游玩。v012首次固定左右摆动20秒后正常死亡，故未到达保存路径；失败留档。保存流程专用场景改用原版初始化无限生命开关，保持实际按键/点击和保存断言，与四档无战斗状态改写的平衡证据分开。另修复字符串屏幕坐标传给Electron.setPosition的类型错误。LAN使用独立48630/48631..48640端口及先于大厅的错误框失败守卫，功能模式禁用性能/分配剖析，未运行极端压力或多实例性能基准。

### 26.19 最终v3联机与产物核对

隐藏640×480、单向30ms的v3功能对局全部通过：共同确认帧的完整游戏摘要、已确认声音/贴花身份及附魔发射一致；协商combat-pve-v3，两Boss均无护甲且44×5/40×5血条、DEVIL 2正确。实际TCP断开重连保留部分击败、存活成员生命、强化与同一世界；客户端W/S及上下箭头、独立Tab/R面板和14秒单方就绪等待通过。同步死亡夹具只结算一次双倍选择，全部死亡正常进入结算，真实客户端RETRY恢复第16关检查点且不重复奖励。截图直接复核，错误数0，报告在packaged-gates-20261021-125542/lan-v033，清理所属进程后才写通过记录。

运行时265个跟踪源文件指纹426203a45692016f910544fb05f6734afde3ded439d66c0e71cea171abc97831，与打包前冻结代码一致；后续只提交QA与文档。便携EXE为101671515字节，SHA256 405dc84d399cfbb79377e1516ffe3a4262cef054fef691b8f174f735f8e6fe67；完整asar SHA256 c57c860055f819a34d069428fd7199c7223c63363198887f6822323c30d6e5df。最终复跑全量门禁后发布v0.3.3标签、英文Release Notes及便携EXE，再下载核对哈希。详见docs/verification/v0.3.3/README.md。

### 26.20 正式发布与下载复核

最终候选dc02412995cd98398a52b61d477047f846d94d9d上三项类型检查及全量再次通过：148套件、1807通过、0失败、71项原有跳过，1878总计，full-tag.json留档。发布前release-readiness.json统一核对全部浏览器/历史入口/原生/实际便携/LAN报告与三份EXE哈希后，创建并推送该提交的注释标签v0.3.3，发布英文GitHub Release及便携EXE。

实际上传附件Boxhead.2Play.Rooms-0.3.3-portable.exe重新下载后仍为101671515字节、PE版本0.3.3，SHA256与验收EXE及GitHub digest同为405dc84d399cfbb79377e1516ffe3a4262cef054fef691b8f174f735f8e6fe67。公开附件身份及验证摘要保存在docs/verification/v0.3.3/publication.json；本次追加只记录发布结果，游戏源代码、构建字节及标签不再修改。

### 26.21 Release说明表情风格

按用户要求，为最近三个正式版v0.3.1、v0.3.2、v0.3.3的主题和分节标题补上适量表情，沿用此前说明的风格并继续使用英文。只增加标题表情，功能文字、数值、验证范围、链接及附件保持一致；v0.3.1补存既有在线说明作为本地来源，AGENTS.md记录此后沿用的标题风格。发布前保存在线原件，逐项反向移除新增前缀核对正文一致，发布后再核对在线说明及附件身份/大小/哈希。

## 27. v0.3.4：快捷武器与结算构筑

### 27.1 易碎护甲与满补箱

独立协商 fragile-armor-v1：基础护甲为等级基础血量的25%，奖励每点增加6%，并受实际血量40%上限约束。初始160血/40甲，护甲箱不受补给效率影响直接补满；成长和复活不额外补甲。满甲/死亡者不消耗永久箱且不阻挡有效队友。青色细条独立绘于原血条下方，保持血量显示。旧v3存档护甲按旧上限比例迁移一次，零甲保持零；旧能力与显式夹具保持原曲线和部分补充语义。新增实际补满、预览/上限、50伤害溢出、几何及重复迁移回归。

### 27.2 仅结算查看属性

手柄X替换此前Y入口，仅关卡结束选择奖励期间有效，不打开战斗属性窗口或触发暂停。单人查看本人，本地双人任一玩家同时开关P1/P2，联机各自只开关自己的属性；队友选择与准备不受影响。界面显示X及实际Tab/R或自定义键。一个手柄采样批次的双X请求合并一次，键盘采样亦合并；打开屏蔽对应选择输入，关闭等待持键释放，不改变准备状态和模拟快照。当前CInput实例守卫保留。新增战斗禁用、共同开关、双手柄同按及释放保护回归。

### 27.3 空弹武器可选

独立协商 empty-weapons-v1，通过选择期间临时限定的资格包装复用原版数字键与前后切换逻辑；所有已解锁武器零弹也可选，未解锁仍不可选。空弹Update保持当前武器、停止发射并清理旧开火边沿，不生成弹丸或补弹；合法补给后恢复正常发射。存档保留空弹手持选择，旧能力仍跳过空枪并自动回手枪。新增循环/数字键、无发射、存档与旧能力回归。
