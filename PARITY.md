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

## 5. 有意偏差登记（`src/game/deviations.ts`，共 14 条）

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
