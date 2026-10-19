# Shared project instructions

Boxhead: 2Play Rooms is a faithful TypeScript + Canvas2D + Electron remake of the 2007 Flash game. Read docs/CONVENTIONS.md for the AS2 port contract and relevant PARITY.md sections before changing behavior. README.md / README_zh_cn.md describe supported features. Codex and Claude Code share these instructions; keep durable discoveries here and release history in PARITY.md.

## Behavior and architecture

- Preserve all features, reachable entry points, save compatibility, graphics, sound and input support. Fix confirmed defects with reproduction and regression evidence; distinguish defects from documented original quirks and environment failures.
- Files headed `// Port of` are mechanical AS2 ports: preserve names, statement order, prototype defaults (`proto`), package lookups and registration. Do not refactor/fix them in place. Use src/game/scope.ts / src/game/local wrappers, register deviations in deviations.ts and explain them in PARITY.md. Respect wrapper ordering, especially NetScope.ts.
- Cross-class runtime references in ports use packages.ts; only base classes use direct runtime imports. allClasses.ts, strings, linkage/class registration, callbacks and prototype wrappers are LIVE dependencies. Static unreferenced-symbol reports alone do not prove dead code. Retain original unused classes and rollback infrastructure/tests. Capable LAN peers negotiate rollback-v2 (zero extra input delay, approximately 240ms prediction window); the retained legacy path has prediction depth 0.
- Flash runs at 50 enterFrames/s; game simulation at 25 ticks/s. Preserve scheduling, seeded RNG call order, enumeration order and simulation-visible time. Never substitute native random or wall-clock calls. RNG is a process-global singleton: headless games in one process run sequentially.
- Async LAN work needs two lifetimes: renderer operation generations reject stale promises, and main-process transport shutdown cancels pending binds/connects/handshakes. Check both when changing leave/rejoin behavior.
- Wrapper order in applyScope: local/menu/save/start-wave wrappers first, then LAN overlay/screens, then installNetScope(), and installViewport() last. Viewport Process_Tracking stays outermost around the net camera/prediction wrapper. Chain existing __set__mLevel/wave hooks rather than replacing them.
- Armor wrappers install before the local resume wrappers and growth fatal-hit observer: establish immutable per-world supply rules before resume, and absorb damage before lethal ownership is recorded. Keep original health regeneration untouched. Armor is optional in v2 player saves. Legacy armor-ammo-v1 Devil crates remain transient with their original 20/20/60 roll. Modern supply-crates-v2 additionally requires survival-v1 and personal growth: one equal three-way Devil roll, permanent identity-bearing special crates, simulation-owned delivery timers and expiring random red boxes. Preserve new crate processing order across save reconstruction; never count-clear permanent boxes. Peers without the original armor capability gain no armor fields or RNG calls; do not redefine older capability names.
- Balance modifies derived wave tables in a local InitLists wrapper; retain the existing wave/checkpoint wrapper chain. LAN pve-balance-v1 requires both growth and supply support. Preserve original curve assertions with explicit classicWaves fixtures and verify the tuned path separately; do not remove legacy assertions. Personal XP denominators come from xpRequired, including save/restore and the HUD. Fresh selected-wave levels use the earned-wave model plus the original difficulty floor.
- LAN invariants: complete gameplay/checksum equality at common confirmed ticks and ordered confirmed sound/decal identities between peers. Local speculative weapon audio may play earlier and cannot be unheard; deduplicate it across replay. Display interpolation/cameras stay render-only. Preserve existing wire fields and stored-snapshot formats; negotiate optional extensions.
- Rollback snapshots are pre-input and preserve own-property insertion order, empty-cell navigation and per-slot shared references. Simulation reads tick time. Permanent decals, checkpoints, unlocks and terminal routing commit only after confirmation. Never compare different predicted heads as a determinism gate. RNG remains process-global: independent live peers need separate processes in tests.
- Node 24 runs erasable TS directly: explicit .ts imports, import type, no enum/namespace/parameter properties. Engine/shared code passes strict checking; the AS2 port has looser checks.
- Key control/depth map: main mcContinue/mcLanGame use _Contents and Register_Button; local pause mcScreenPause._Quit / _SaveQuit stay inside the 65.75px header. LAN mcSubScreen occupies depth 10; _SetupControls occupies depth 100 above authored masks. Options/highscore _Button_Close uses authored depth 136. Allocate unique child names and getNextHighestDepth inside each added layer.
- Text coverage eligibility may be cached by immutable TextLayout identity plus Library identity; preserve CJK/device-font fallback and invalidate on text, format, password or embedding changes. Use WeakMap for object-owned renderer caches.
- Display objects use Object.create: initialize registered screens in ctor(), not field initializers. Attach original art before added controls. Sibling names AND depths must be unique; collisions replace objects.
- Screen transitions remove clips without calling CScreen.Dispose(). Release screen-owned DOM, timers and subscriptions in onUnload; cleanup must be idempotent.
- Flash Graphics alpha is 0..100; filter alpha is 0..1. Use embedded original fonts and UiStyle for additions.
- Menus use authored 640x480 content centered on a larger logical stage. Map DOM/clicks through Presenter contentToClient / stage transforms and track resize. Plain division by 640/480 misclicks wide/tall windows.
- public/assets is committed, manifest-gated and sufficient for standard builds without the SWF. Regenerate only for extractor changes. Assets, fixtures, tools/gallery entry points and experimental code are not dead merely because gameplay does not directly import them.

## Commands and testing

```powershell
npm run dev
npm run extract -- --if-stale
node tools/audit-code.mjs
npm run typecheck
npm test
npx vitest run tests/sim/netlockstep.test.ts
npm run build
npm run test:electron
npm run test:electron:packaged
```

- Actual portable launch: node tests/e2e/portable.electron.mjs connects through a unique CDP port. NSIS does not forward inspector stderr, so _electron.launch on the single-file launcher times out; this is separate from the unpacked app gate. Verify extracted asar and isolate saves.
- Run relevant checks per change; before release run all typechecks/Vitest, browser UI+audio, browser/packaged playtests (browser, v012, v019, v020, v023, v024, typing, lanui, net, netretry, netsmooth), Electron and packaged smoke. Preserve assertions; never add skips to hide failures.
- Browser tests use installed Chrome through playwright-core (channel chrome), headless; do not download browsers. Serve a current build and pass GAME_URL explicitly: UI/audio usually 5311, old browser playtests 5198; inspect headers.
- Test text input with real mouse clicks + page.keyboard.type; fill() bypasses focus/keyboard bugs. Wait for mNormal and the LOADED! gate; allow ~700ms for transition screenshots. Offscreen first clicks can miss: verify state transition and retry once.
- Never flash test windows over the user's work or steal focus. Packaged tests launch BORN offscreen (--window-position=-32000,0; showInactive) with background throttling disabled. Use isolated BOXHEAD_USER_DATA under generated, never the player's %USERPROFILE%\.boxhead. Native sizing/fullscreen smoke uses --boxhead-hidden: normal display placement, opacity 0 and focusable false from creation, showInactive for unthrottled rAF. Windows reports incorrect content bounds far offscreen and can show a hidden window on fullscreen; hide() alone is insufficient. capturePage(undefined, {stayHidden:true, stayAwake:true}) captures ordinary hidden/transparent surfaces; native fullscreen capture can stall, so verify native state/canvas/shortcuts separately. Foreground-only tests require explicit user approval.
- LAN uses UDP 47630 and TCP 47631..47640. Check ownership; only stop this run's leftover test processes, never the user's game indiscriminately. Sandbox localhost EACCES is an environment restriction: rerun with permitted networking, preserving assertions.
- LAN QA installs its main-process error guard before opening rooms: unexpected Electron error boxes must become logged nonzero failures, and reports are written after process cleanup. Never hide an exception while reporting a passing test.
- Packaged LAN QA installs tests/e2e/lan-isolation.mjs before opening a lobby: only its owned main processes map discovery/TCP to 48630/48631..48640. Player ports stay untouched, including scan/reconnect and broadcast discovery. Check those test ports too; port isolation does not eliminate CPU/GPU contention, so respect user requests to pause tests.
- Same-machine instances cannot both bind discovery port 47630: use controlled room data for row visuals and real transport tests separately. Archive netsmooth evidence per delay (30/60/100ms); legacy scripts reuse names.
- Every user-facing surface needs screenshot review plus pixel/geometry/real-click checks. Historical preference: zai vision MCP. For v0.2.6 the user explicitly permits direct screenshot review plus these checks when zai is unavailable; record the method honestly. Tiny HUD/cursor claims need geometry/code confirmation. Fake pads verify mappings, not physical hardware.
- User working-hours constraint (2026-10-19): no multi-instance performance benchmarks or extreme explosion/crate stress in the background. Default to lightweight serial checks; game checks must be short, single-instance and low resolution. Heavy QA requires fresh explicit authorization. Hidden windows and isolated ports do not prevent CPU/GPU contention. On cancellation stop the owned coordinator and all owned game/GPU children; retain incomplete runs as interrupted, never passing evidence.
- Performance claims require matching machine/build/seed/input/resolution/render settings and warm-up; baseline/candidate at least three runs, raw data and medians. Measure frame p50/p95, allocations/GC, memory/resources and LAN cadence. Fewer lines/smaller bundle alone are not runtime improvement.
- FlashPlayer28/8 in assets/flash_player run references; FP30/32 self-disable here (FP32 debug still runs synchronous frame-1 probes). Original goldens remain the oracle.
- No more than two authorized subagents/independent background work tasks at once. Do not spawn agents without authorization.

## Git, build and release

- Work on main, preserve unrelated user changes. Complete ONE independent feature or bugfix, run relevant checks, stage only its changes, commit clearly and immediately push origin main BEFORE starting the next completed item. Follow-up corrections are separate commits. Never accumulate all features in one final commit.
- origin is Xi-Gong/boxhead_remake; never push to old boxhead_res/archive. Keep package and lockfile root versions consistent.
- ALWAYS npm run build before packaging: builder alone ships stale renderer code under a new version. In-repo packaging can hit EPERM/EBUSY when the desktop app maps asars: output outside the checkout, then stage release/win-unpacked for tests.

```powershell
$env:NODE_USE_ENV_PROXY = '1'
npm run build
npx electron-builder --win dir --x64 --config.directories.output=C:/Users/royxg/boxhead-build
# Portable target uses the same freshly built inputs:
npx electron-builder --win portable --x64 --config.directories.output=C:/Users/royxg/boxhead-build
```

- Verify staged asar package version AND new code before trusting packaged tests. Node needs native Windows paths. Copy exe to ignored release/ and C:/Users/royxg/boxhead-exe-archive/; never commit/force-add binaries.
- All gates pass, then annotated v<X.Y.Z> tag, push tag, publish GitHub Release on that tag, upload Boxhead 2Play Rooms-<version>-portable.exe and verify the asset/version. Every version ships its exe.
- GitHub Release Notes ALWAYS English; PARITY.md Chinese. Established format: themed heading/tagline, highlights/fixes, PARITY link, full-changelog compare. Report measured benefits and coverage honestly.
- Machine facts: gh is C:/Program Files/GitHub CLI/gh.exe; Node downloads need NODE_USE_ENV_PROXY=1. If the machine SSH ProxyCommand fails, use an explicit HTTPS URL with gh auth git-credential for this push/fetch; do not rewrite the user's remote or SSH configuration. These are not portable dependencies. Stop only owned Vite processes; npm wrapper exit does not stop Vite.

- v0.2.9 local Single/Coop now share permanent personal growth with modern LAN. Initialize local growth after old resume restoration; never run the original multiplier-climbing loop while lanGrowth is present. Old v2 conversion retains current health/armor/ammo/inventory and total score. Explicit classicGrowth fixtures preserve original multiplier/oracle assertions; do not disable new growth globally in tests. Local HUD reads simulation; LAN HUD reads confirmed state.
- survival-v1 is an independent modern PvE capability requiring growth and supplies. Initialize immutable survival rules before resume, settle new maxima after growth restoration without healing, and use armorMaximum(player) for every live/save/HUD armor operation. Shield reaction guards exist only during ProcessAffects; protected lethal hits must still reach normal death. Old armor-ammo-v1 peers retain 100 armor and original reactions.
- endless-pve-v1 retains the 1–125 weapon table and uses closed-form earned-wave XP; never grow caches per high level or replay high waves. enemy-variants-v1 depends on endless PvE and includes the priest's 30% purple enchantment / 70% one three-way supply drop. Variants retain family IDs and replace successful ordinal slots without extra subtype RNG. Install enchantment after growth's weapon decrement wrappers so finite capacity 999999 still consumes enchanted stock. Scale damage once at weapon emission; children and placed explosives inherit it. Enchanted stock, skill phases and zones are snapshot-owned; immutable derived XSI/bitmap caches and HUD message motion remain render-only.
