# Shared project instructions

Boxhead: 2Play Rooms is a faithful TypeScript + Canvas2D + Electron remake of the 2007 Flash game. Read CONVENTIONS.md for the AS2 port contract and relevant PARITY.md sections before changing behavior. README.md / README_zh_cn.md describe supported features. Codex and Claude Code share these instructions; keep durable discoveries here and release history in PARITY.md.

## Behavior and architecture

- Preserve all features, reachable entry points, save compatibility, graphics, sound and input support. Fix confirmed defects with reproduction and regression evidence; distinguish defects from documented original quirks and environment failures.
- Files headed `// Port of` are mechanical AS2 ports: preserve names, statement order, prototype defaults (`proto`), package lookups and registration. Do not refactor/fix them in place. Use src/game/scope.ts / src/game/local wrappers, register deviations in deviations.ts and explain them in PARITY.md. Respect wrapper ordering, especially NetScope.ts.
- Cross-class runtime references in ports use packages.ts; only base classes use direct runtime imports. allClasses.ts, strings, linkage/class registration, callbacks and prototype wrappers are LIVE dependencies. Static unreferenced-symbol reports alone do not prove dead code. Retain original unused classes and default-disabled rollback infrastructure/tests.
- Flash runs at 50 enterFrames/s; game simulation at 25 ticks/s. Preserve scheduling, seeded RNG call order, enumeration order and simulation-visible time. Never substitute native random or wall-clock calls. RNG is a process-global singleton: headless games in one process run sequentially.
- LAN invariants: world/checksum equality and ordered PlaySound identity between peers. Display prediction/cameras stay render-only. Preserve the wire and stored-snapshot formats.
- Node 24 runs erasable TS directly: explicit .ts imports, import type, no enum/namespace/parameter properties. Engine/shared code passes strict checking; the AS2 port has looser checks.
- Display objects use Object.create: initialize registered screens in ctor(), not field initializers. Attach original art before added controls. Sibling names AND depths must be unique; collisions replace objects.
- Screen transitions remove clips without calling CScreen.Dispose(). Release screen-owned DOM, timers and subscriptions in onUnload; cleanup must be idempotent.
- Flash Graphics alpha is 0..100; filter alpha is 0..1. Use embedded original fonts and UiStyle for additions.
- Menus use authored 640x480 content centered on a larger logical stage. Map DOM/clicks through Presenter contentToClient / stage transforms and track resize. Plain division by 640/480 misclicks wide/tall windows.
- public/assets is committed, manifest-gated and sufficient for standard builds without the SWF. Regenerate only for extractor changes. Assets, fixtures, tools/gallery entry points and experimental code are not dead merely because gameplay does not directly import them.

## Commands and testing

```powershell
npm run typecheck
npm test
npx vitest run tests/sim/netlockstep.test.ts
npm run build
npm run test:electron
npm run test:electron:packaged
```

- Run relevant checks per change; before release run all typechecks/Vitest, browser UI+audio, browser/packaged playtests (browser, v012, v019, v020, v023, v024, typing, lanui, net, netretry, netsmooth), Electron and packaged smoke. Preserve assertions; never add skips to hide failures.
- Browser tests use installed Chrome through playwright-core (channel chrome), headless; do not download browsers. Serve a current build and pass GAME_URL explicitly: UI/audio usually 5311, old browser playtests 5198; inspect headers.
- Test text input with real mouse clicks + page.keyboard.type; fill() bypasses focus/keyboard bugs. Wait for mNormal and the LOADED! gate; allow ~700ms for transition screenshots. Offscreen first clicks can miss: verify state transition and retry once.
- Never flash test windows over the user's work or steal focus. Packaged tests launch BORN offscreen (--window-position=-32000,0; showInactive) with background throttling disabled. Use isolated BOXHEAD_USER_DATA under generated, never the player's %USERPROFILE%\.boxhead. Native sizing/fullscreen smoke uses --boxhead-hidden: normal display placement, opacity 0 and focusable false from creation, showInactive for unthrottled rAF. Windows reports incorrect content bounds far offscreen and can show a hidden window on fullscreen; hide() alone is insufficient. capturePage(undefined, {stayHidden:true, stayAwake:true}) captures ordinary hidden/transparent surfaces; native fullscreen capture can stall, so verify native state/canvas/shortcuts separately. Foreground-only tests require explicit user approval.
- LAN uses UDP 47630 and TCP 47631..47640. Check ownership; only stop this run's leftover test processes, never the user's game indiscriminately. Sandbox localhost EACCES is an environment restriction: rerun with permitted networking, preserving assertions.
- Same-machine instances cannot both bind discovery port 47630: use controlled room data for row visuals and real transport tests separately. Archive netsmooth evidence per delay (30/60/100ms); legacy scripts reuse names.
- Every user-facing surface needs screenshot review plus pixel/geometry/real-click checks. Historical preference: zai vision MCP. For v0.2.6 the user explicitly permits direct screenshot review plus these checks when zai is unavailable; record the method honestly. Tiny HUD/cursor claims need geometry/code confirmation. Fake pads verify mappings, not physical hardware.
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
- Machine facts: gh is C:/Program Files/GitHub CLI/gh.exe; Node downloads need NODE_USE_ENV_PROXY=1. These are not portable dependencies. Stop only owned Vite processes; npm wrapper exit does not stop Vite.
