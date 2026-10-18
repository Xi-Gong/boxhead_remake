# v0.2.6 审计与验收记录

基线：v0.2.5（7ce3aef）。本次范围包括引擎、原版移植、扩展、Electron、资源工具、测试与发布配置。已完成下列审计、修复和门禁；未发现阻止发布的功能回归、确定性变化、音画损失或稳定性能退化。每个独立修复/功能均先验证、单独提交并立即推送 main，完整记录见[分步提交](docs/verification/v0.2.6/commits.md)。

## 范围与安全删除依据

`node tools/audit-code.mjs` 生成逐模块台账，最终[413模块清单](docs/verification/v0.2.6/code-inventory.json)记录路径、导入、动态访问、注册与生命周期标记。首轮404模块，最终src194、Electron5、工具72、测试142；新增项主要为回归/验收工具。这是依赖清单与边界检查，结合下列人工审阅、失败复现和运行证据使用，不能单独证明代码无用，也不是全程序形式化证明。

117个 `// Port of` 文件相对v0.2.5零改动。保留全部原版类、字符串linkage、packages/allClasses注册、事件与原型包装、资源和预测深度为0的回滚设施。删除旧buildMenuButton前核实新menuTextItem已替代、全库无静态/字符串/注册/回调访问；删除的5个样式token及导入也逐个核对全库引用。原版unused参数/局部变量继续保留机械对应；引擎/共享合约及Node工具现在强制检查未使用变量和参数。

## 分模块台账

| 模块与入口 | 核查范围、结论和处置 | 证据 |
| --- | --- | --- |
| engine/flash、avm1、swf | 数值/枚举/RNG、时间线/动态注册、对象深度、遮罩、文字、位图alpha与滤镜缓存；未以无直接引用删除动态依赖 | AS2/Flash goldens、displayList、buttonsMasksSounds、textAndMouse、bitmap/filter及浏览器引擎用例 |
| engine/platform/Loop | 50Hz EF/25Hz世界时序、刷新率中位数、暂停及积压丢弃；改为9项有序窗口，消除每rAF复制排序 | 9项Loop回归；240000采样逐项等价；3轮微基准 |
| platform输入/音频/存储 | 键盘/DOM指针捕获、手柄分配与虚拟光标、失焦释放、声音解码恢复、SharedObject持久化 | 修复DOM按钮被stage指针捕获；真实点击、全套UI/音频及平台smoke |
| game原版World/Map/Thing/Weapon/Upgrades | 三模式、18图刷怪与玩家出生、碰撞伤害、死亡复活、弹药与升级、波次/分数、结算重试 | spawnAudit、weapons/affects/player/upgrades、规则与长期soak；不改原版时序/RNG/枚举顺序 |
| scope、Resume、StartWave、WaveUnlock、WeaponCrate | 入口包装顺序、原版解锁与选项、检查点/旧快照、保存继续、死亡箱拾取 | resume/startWave/weaponCrate、v012/v019/v020/v024及UI持久化；保留存档version2及所有字段 |
| Viewport与菜单/暂停 | 内容/舞台/DOM坐标、resize时冻结位图、分屏、标题与升级列表、命中框与图层 | 修复暂停竖横切换残留与DM高度变更；真实几何/像素/点击和多比例截图 |
| LAN NetSession/Predict/NetScope | 本地输入闩锁、确定性、声音顺序、暂停/失步、长局帧表/校验表、检查点/重连/重试 | 修复旧协作牵引预测、双键位闩锁、暂停失步退出；逐拍metadata/校验和有界与dispose释放；netlockstep/rollback |
| LAN bridge/Lobby/Setup/overlay | 建房发现/IP输入、准备与镜像、退出/异步竞态、UI订阅/DOM释放、错误/等待状态 | 退出后过期Promise不能复活房间；原版遮罩深度与新增控件隔离；房间状态文案修正；受控发现分支+真实网络分别验收 |
| Electron main/preload/lan | IPC隔离、协议路径/MIME、窗口/全屏、用户存档迁移、TCP/UDP/定时器释放 | 已修复尚未完成的bind/connect取消、共享并发建房、握手限时与socket释放；真实localhost回归；透明不可聚焦QA入口 |
| tools/assets/build/tests | SWF提取/缓存指纹、schema/解码器、原版参考工具、生产构建→仓库外打包→asar代码/版本核验 | 工具严格类型检查、解析/资源/goldens用例；只更新manifest源指纹；不提交二进制 |

## 已确认并修复的差异

| 问题 | 修复前 | 修复后及定位 |
| --- | --- | --- |
| 协作预测牵引 | 模拟已独立移动，显示预测仍受旧19×13牵引约束 | 预测与模拟一致，仅改显示层；33d28ff |
| 暂停失步 | 暂停早退拦住失步返回 | 暂停不再阻止desync teardown；979df4a |
| 手柄徽章点击 | cssText清除pointer-events，stage capture吞DOM click | 原生按钮保留点击与清理；572d2ac |
| 双键位闩锁 | OR短路留下第二布局按下事件 | 每次采样均消费两套键位；5896773 |
| 长局内存 | 非回滚逐拍metadata及校验表持续增长 | metadata=0，600拍两端校验和各≤3，dispose瞬态清空；60ebdb2 |
| 暂停/DM resize | 偏移/位图/分屏纵向位置残留旧尺寸 | 动态对齐，暂停只复制冻结画面，不推进tick；14d53e6 |
| LAN模式切换控件 | authored遮罩深度遮住新增文字/难度 | 独立控制层，像素和真实点击保护；50e5a25 |
| LAN异步退出 | 迟到加入/发现/地址结果恢复已退出状态 | 操作代次与阶段保护；218ba68 |
| LAN待完成资源 | shutdown后仍能建立peer/监听，未握手socket残留 | bind/connect取消、握手超时、socket所有权清理；a8e1d79 |
| 主机房间文案 | 客机已加入仍提示等待加入 | 按加入/准备状态刷新；434ed2b |

原版已登记行为（如原版类空Dispose/无用参数、默认不预测的回滚实验（LAN协调仍启用））继续保留，不伪装成新Bug。新发现均用失败回归或真实截图/点击复现后处理，没有删除断言或增加跳过项。

## 功能核对矩阵

| 功能组 | 入口→操作→状态/持久化检查 | 主要门禁 | 状态 |
| --- | --- | --- | --- |
| 原版三模式 | 主菜单→角色/18图→难度/击杀→射击升级→暂停→结算→重试；声音/画质 | sim规则/soak、browser三模式、UI/audio | 浏览器、开发Electron、打包Electron三模式及音频均通过 |
| 存档进度 | SAVE & QUIT→CONTINUE、波次检查点/失败重试、最高波次、排行榜、改键/设置重启、旧snapshot | resume/startWave/ui_save、UI persistence、v012/v020/v024、saveCompatibility | 模拟、浏览器、便携版保存继续及实际v0.2.5存档跨版本读取通过 |
| 输入窗口 | 键鼠真实文本、IME、假手柄映射/分配/虚拟光标、全屏、动态视口、高DPI | UI 188项、inputBadge、viewportPause、Electron smoke | 浏览器、开发版46/46、打包版6/6及实际便携启动器通过 |
| LAN | 建房发现/IP加入→准备→设置镜像→开局→同步暂停→重连/续局/重试→判负/超时/失步返回 | protocol/bridge/netlockstep、受控发现UI、真实双实例net/netretry/netsmooth | 真实UDP/TCP、双实例重连/续局/重试/判负/失步、30/60/100ms延迟全部通过 |
| 其他扩展 | 死亡武器箱含弹药/持有武器、说明实时键位、徽章、网络提示、回滚设施 | weaponCrate、v019/v023、UI、rollback | 模拟、浏览器、打包v019/v023/v024扩展均通过 |

## 性能方法与结果

浏览器对照使用同机器、生产构建、Chrome155.0.8059.84/Intel ANGLE/D3D11、1280×960、DPR1、位图scale2、默认GL后端。v0.2.5基线生产文件保存在ignored baseline/dist，独立端口5312；候选5311。固定初始化seed182026与输入脚本，预热后交替各3轮，测量期间不运行其他测试或构建。LAN另用相同Electron44.7.0运行时及两版asar、相同原生默认窗口/渲染设置/屏外参数，不把浏览器视口参数套用于原生窗口。

- 调度热点：v0.2.5与当前真实FrameScheduler代码，240000个30/60/144Hz、抖动/重复/长间隔/重置采样逐项比较，调度EF序列、间隔与上限相同。三轮耗时中位数71.59→7.44ms，约9.6倍，仅代表调度路径；每次有效rAF消除一个临时排序数组。
- LAN内存：600拍回归中非回滚metadata从每拍一项变为0，校验表各≤3，dispose帧/校验/快照上下文清空。检查点与startOpts保留用于续局。
- 字体覆盖热点：CPU采样定位到FlashType位图已缓存仍逐字符查字体。新增WeakMap按不可变layout及Library身份缓存覆盖，文本/格式/password/embed变化自动失效。20000次变更等价，240000调用三轮中位65.67→3.65ms，约18倍，仅此路径。

三轮生产构建中位数（毫秒）：

| 场景 | 基线p50 | 候选p50 | 基线p95 | 候选p95 |
| --- | ---: | ---: | ---: | ---: |
| 主菜单静止 | 0.5 | 0.6 | 0.9 | 0.9 |
| 菜单悬停 | 1.2 | 1.1 | 2.1 | 2.1 |
| 菜单→选图 | 0.6 | 0.4 | 6.6 | 7.0 |
| 房间加载 | 0.4 | 0.4 | 14.0 | 11.6 |
| 普通对局 | 0.6 | 0.6 | 1.7 | 1.7 |
| 高负载（60次刷怪） | 0.6 | 0.5 | 1.8 | 1.7 |
| 暂停/完整升级表 | 1.6 | 1.3 | 2.7 | 2.2 |

暂停p95约改善19%，解决最初采样发现的小幅上浮。菜单→选图的p95范围基线6.0–10.9、候选5.4–8.8ms，样本分布相交，未发现稳定退化。房间加载Task总量167.3→183.5ms，但渲染帧数基线32–35、候选35且CPU范围相交，不能把总量当作相同帧数的稳定退化或加速。

采样分配中位691.5→665.4MB，GC总时长93.9→79.0ms（全探针含相同仪器开销）；固定时刻的heap差受GC时机影响，不据此宣称固定内存占用减少。CPU为CDP renderer Task/Script时间，heap是JS heap，不是GPU/整机总内存。滤镜scratch池为页面级固定容量缓存，文本/遮罩缓存使用WeakMap；全部阶段附着已dispose位图引用数为0。

LAN三轮中位数（真实localhost TCP，固定初始随机源0.424242/host seed1822105515）：

| 场景/端 | 基线p50/p95 ms | 候选p50/p95 ms | renderer Task ms基线→候选 |
| --- | ---: | ---: | ---: |
| 30ms单向延迟、20秒稳态host | 0.4/1.8 | 0.5/1.7 | 1552→1499 |
| 同场景client | 0.5/1.8 | 0.5/1.9 | 1554→1559 |
| 断开至恢复host | 0.4/1.0 | 0.4/1.0 | 1367→1373 |

LAN分布相交，不宣称整体加速。重连阶段时长中位约21.8→21.9秒，包含断开等待/恢复，不能把CPU总量当相同持续时间的独立模拟成本。所有采样挂接的已释放位图数0；稳态滤镜缓存双端均6、重连host均7。三组重连全部完成检查点、分数、输入延迟、判负、续局及30秒超时验证。额外60/100ms单向延迟档位通过；100ms显示反馈25/6ms、模拟跟进183/165ms，不宣称模拟立即响应。

可复核原始数据与方法：[docs/verification/v0.2.6](docs/verification/v0.2.6/README.md)。LAN采集帧/CPU/heap/缓存与资源状态，分配/GC由统一生产浏览器探针测量。

## 视觉与环境边界

直接审阅截图，并结合像素、几何、真实鼠标/键盘路径；本次用户已明确批准此方式。覆盖640×480、960×720、1280×720、640×889竖窗及DPR1.5/2。受控发现数据仅用于补足空/可加入/满员/进行中状态，真实网络另跑双实例。未宣称实物手柄或两台物理主机已测。

所有浏览器headless。普通打包playtest出生即屏外、showInactive；原生尺寸/全屏smoke使用透明且不可聚焦的窗口，防止Windows全屏自动show导致抢焦点。透明原生全屏截图可能挂起，保留真实窗口状态/尺寸/快捷键断言，像素由浏览器视口门禁覆盖。用户存档完全隔离在generated路径。

完整Vitest最终1266通过、71既有skip（91个文件通过、2个文件既有skip）；没有新增跳过项。两个既有skip文件及oracle条件保持，没有新增skip。网络沙箱EACCES在允许localhost的环境重跑，不删断言。

## 最终门禁与发布对象

| 门禁 | 结果 | 本机证据（generated/reports/） |
| --- | --- | --- |
| 三套TypeScript检查、动态依赖/移植边界 | 通过；117个移植文件零修改 | v026/typecheck-final.log、code-inventory.json |
| 完整Vitest | 1266通过，71既有skip；91文件通过、2既有skip | v026/vitest-final.log |
| 浏览器UI、音频 | 188/188、28/28 | x1/ui_report.json、audio/audio_report.json |
| 新增表面视觉/交互 | 9表面×5尺寸/DPR配置=45截图，全部通过 | v026/ui、final-added-ui.browser.log |
| 三模式玩法 | 浏览器、开发Electron、打包Electron均通过 | v026/playtest-browser.log、playtest--electron.log、playtest--packaged.log |
| 全部历史专项playtest | v012、v019、v020、v023、v024、typing、lanui、netretry通过 | v026/playtest-*.log |
| LAN稳态、重连、延迟 | 基线/候选各3轮稳态与3轮完整重连；候选另60/100ms通过 | v026/{baseline,candidate}/{steady,reconnect}-*.json、candidate/delay-*.json |
| Electron窗口/输入/全屏/协议 | 开发46/46、打包6/6 | v026/electron-smoke-final.log、packaged-smoke-final.log |
| 最终单文件便携exe | 实际启动器→解包版本→玩法/保存继续/31声音通过 | v026/portable-final.log、portable/launch-0.2.6.json |
| 真实旧存档 | v0.2.5生成→v0.2.6继续；房间/1234分/137血/17弹药/最高波次7/改键70通过 | [持久结果](docs/verification/v0.2.6/save-compatibility.json) |
| 包内代码与版本 | 应用/锁文件根/asar均0.2.6，renderer和Electron包内字节与最终构建一致 | [哈希清单](docs/verification/v0.2.6/artifact.json) |

最终构建先完成renderer与Electron，再在 `C:/Users/royxg/boxhead-build` 打包并暂存release；便携exe为 `Boxhead 2Play Rooms-0.2.6-portable.exe`，101612312字节，SHA256 `e501c19a41f5e9010fa63c7675f1a998370ce56105980cb8dc7768e6083a0680`。另归档于 `C:/Users/royxg/boxhead-exe-archive/`，不纳入Git。

正式发布对象：[v0.2.6](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.2.6)，使用annotated tag、英文Release Notes与exe附件。[中文变更记录](PARITY.md)及[分步提交](docs/verification/v0.2.6/commits.md)可逐项追溯；完整日志/截图保留本机generated，公开数值证据随tag保存。保存格式与wire消息未改；LAN仍沿用原有同构建身份校验，不承诺跨版本联机。
