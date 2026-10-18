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
