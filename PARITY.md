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
