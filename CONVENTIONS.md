# Remake conventions (read before changing anything)

1:1 remake of **Boxhead: 2Play Rooms** (Sean Cooper, 2007, Flash 8 / AS2) in TypeScript + Canvas2D + Electron.
Approved plan (Chinese): `C:\Users\royxg\.claude\plans\shiny-nibbling-river.md` — read its 附录 (appendices) for the
verified game facts.

## Sources of truth
| What | Where |
|---|---|
| Original SWF (input of the extractor; the ultimate oracle) | `../boxhead_2play_rooms.swf` (sha256 `34ff145d…`, see `tools/paths.ts`) |
| Extracted assets (committed since v0.2.0 — builds never touch the SWF) | `../../public/assets/**` (manifest-gated; `npm run extract` regenerates from the SWF) |
| Decompiled AS2 classes — **deleted v0.2.0** (regenerable via ffdec, see `assets/README.md`) | was `../../projects/boxhead4/**/*.as`; the TS port (`src/game/**`) is the living source of truth |
| FLA export (frame scripts, symbol XML) — **deleted v0.2.0** (regenerable via ffdec) | was `../../projects/boxhead4/boxhead2play.fla`; cross-check tests skip while absent |
| Reference audio — **deleted v0.2.0** (regenerable via ffdec) | was `../../ClassicResources/Audios/boxhead4/` |
| Real Flash Player (oracle) | `../../flash_player/flashplayer_32_sa_debug.exe` (probes), `FlashPlayer28.exe` (visual goldens), `FlashPlayer8.exe` |

## Layout & lane ownership
Each lane only writes inside its own paths. Shared contract files are owned by the coordinator; if you need a change
there, make the smallest additive change and list it in your final report.

| Lane | Owns |
|---|---|
| coordinator | `package.json`, tsconfigs, `src/shared/assetSchema.ts`, `src/engine/runtime.ts`, `CONVENTIONS.md`, `tools/paths.ts`, `tools/swf/ByteReader.ts`, `tools/swf/SwfFile.ts` |
| A extractor | `tools/swf/**` (other files), `tools/extract.ts`, `tools/rooms/**`, `tests/unit/swf/**`, output `public/assets/**`, `generated/reports/{inventory,rooms,actions}*` |
| B avm1/xsi | `tools/avm1/**`, `tools/xsi/**`, `tools/disasm.ts`, `tests/unit/avm1/**`, output `generated/disasm/**`, `generated/reports/hotspots.md`, `public/assets/xsi.json` |
| C engine core | `src/engine/flash/**` except `input.ts`, `Sound.ts`, `SharedObject.ts`; `tests/unit/engine/**` |
| D platform | `src/engine/flash/{input,Sound,SharedObject}.ts`, `src/engine/platform/**`, `electron/**`, `tools/build-electron.ts`, `electron-builder.yml`, `tests/unit/platform/**` |
| E display list | `src/engine/swf/**`, `gallery.html`, `src/dev/gallery.ts`, `tests/unit/swf-runtime/**` |
| F1..F4 game port | `src/game/**` (by folder, see plan M5), `tests/unit/game/**`, `tests/sim/**` |

## Tooling rules
- Node 24 runs `tools/*.ts` directly (type stripping): **erasable TS only** (no `enum`, `namespace`, parameter
  properties), import with explicit `.ts` extensions, `import type` for types. Check with `npx tsc -p tsconfig.tools.json`.
- App code (`src/`) is bundled by Vite; also import with `.ts` extensions for consistency.
- `src/engine/**` and `src/shared/**` must pass `tsconfig.strict.json`; everything passes `tsconfig.json` (loose for the
  AS2 port). Run `npm run typecheck` (whole project) — at minimum your own files must be clean.
- Tests: vitest, `tests/unit/<area>/*.test.ts`, run `npx vitest run tests/unit/<area>`. Node environment (no DOM/canvas);
  keep pixel maths testable on raw buffers. Browser checks: `playwright-core` is installed (use the installed Chrome:
  `chromium.launch({ channel: 'chrome' })`) — do not download browsers.
- Do not add npm dependencies or edit package.json; ask the coordinator in your report. No git commits.
- Downloads from Node need `NODE_USE_ENV_PROXY=1` on this machine.
- Generated files go to `public/assets/` (shipped) or `generated/` (reports, disasm). Both are gitignored.

## AS2 → TypeScript porting rules (src/game)
1. **One `.ts` per `.as`**, same relative path under `src/game/` (e.g. `Thing/Creature/CThing_Creature_Player.as` →
   `src/game/Thing/Creature/CThing_Creature_Player.ts`). First line: `// Port of projects/boxhead4/<path>.as`.
   Same class names, member names, state-name strings, constants, statement order. No refactoring, no "fixes".
2. Import the Flash environment only from `src/engine/runtime.ts` (`flash`, `MovieClip`, `_root`, `_global`,
   `getTimer`, `random`, `mathRandom`, `int`, `forIn`, `AsDict`, `proto`, `sortOn`, `Key`, `Sound`, `SharedObject`, …).
   **Cross-class references keep the exact AS2 dotted spelling** through the generated package namespaces in
   `src/game/packages.ts` (`import { CMain, CSound, Thing, World } from '../packages.ts'` then
   `World.Map.CMap_Cell.mCollide_Solid`, `CMain.mFPS`, `new Thing.Object.CThing_Object_Barrel(p)`). This mirrors AS2's
   runtime `_global` lookup and makes ES-module import cycles impossible. The ONLY runtime import of another game
   module is the base class used in `extends`; use `import type` for type annotations. Every class module ends with
   `registerGameClass('<dotted.path>', Class);` (also from packages.ts). `src/game/allClasses.ts` imports all modules.
   Never read package members at module-evaluation time (static initializers) — only inside methods/constructors.
   Regenerate both files with `node tools/gen-packages.ts` (coordinator) if the class list ever changes.
3. **Class-body instance `var x = v;` → `declare x: T;` in the class + `proto(Class, { x: v })` right after the class**
   (AS2 puts them on the prototype; arrays/objects are shared — preserve that). `static var` → `static`. If a static
   initializer needs another game class, initialize it lazily (cyclic imports) and comment why.
4. **Plain classes** keep a JS constructor (`super(...)` as in AS2). **MovieClip subclasses** (AS2 `extends MovieClip`,
   instantiated from the library) have **no JS constructor**: the AS2 constructor body goes into `ctor()` which starts
   with `super.ctor()`. Register linkages in `src/game/registerClasses.ts` (map from `library.json` `classes`).
5. `addProperty`/`__get__x` getters → TS `get x()`/`set x()`.
6. `for (k in o)` → `for (const k of forIn(o))`. Objects used as hash maps whose keys may be integer-like or whose
   enumeration order matters → `AsDict` (and `.get/.set/.delete`). `Array.sortOn` → `sortOn()`, `Array.sort` →
   `sortArray()` when the order of equal keys or of non-numbers matters (Flash's unstable quicksort, oracle P9).
   **An AS2 object literal that is enumerated** (by a for..in, or as an attachMovie/duplicateMovieClip initObject,
   which the engine copies with forIn) **must be written with its keys REVERSED**: Flash enumerates `{a, b, c}` in
   source order a, b, c, while forIn() (reverse creation order, correct for objects built by assignment) would give
   c, b, a. Tag it `// [ORACLE P1] literal keys reversed: AS2 {…} enumerates in source order`. Arrays filled out of
   index order that are enumerated → `AsDict` (forIn models arrays as high → low index). AS2 `>>>` → `ushr()`
   (AVM1 converts the result back to int32: `-1 >>> 0` is -1).
7. `Math.random()` → `mathRandom()`, `random(n)` → `random(n)`, `getTimer()` → `getTimer()`, `int(x)` → `int(x)`.
   Never use `Math.random`/`Date.now`/`performance.now` in game code.
8. **Decompile artifacts** — never guess silently:
   - bare numeric statements like `7120;` and literals in `7786 - this.mTimeSlice` are `getTimer()` calls;
   - `0; while(true){…[0]…; 1;}` / `while(0 < n)` are collapsed `for` loops; `§§push(x)` = keep `x`'s side effects.
   Resolve each from bytecode (`generated/disasm/<Class>.txt`, lane B) and tag the line
   `// [BC] <disasm file> @<offset>`. If the disasm is not available yet, write the best reconstruction tagged
   `// [BC?] <reason>` so it can be grep'ed and verified later. Explorer-verified facts in the plan appendices count.
9. AS2 null-safety: reading a member of `undefined` yields `undefined` in AS2 but throws in JS — use `?.` where the
   original can hit undefined. Calling an undefined function is a silent no-op in AS2 → `?.()`.
   `Number(str)`/`parseInt` → `toNumber()`; numbers shown in text → `toAS2String()`.
10. Intentional behaviour changes (scope: no URLs/sponsor/online, local highscores, instructions page; or bug
    fixes the plan calls out) are made ONLY through `src/game/deviations.ts` / `src/game/scope.ts`, each with a reason.
11. Classes that are never used by the shipped game (Devastator, SmartBomb, HomingMissile, Laser, DLaser, LaserNode,
    WallMovable, BloodPool, FireBall_Held, CMap_Math, CMap_Navigation, CThing_Navigation, CRandom, CVector3, CProfiler)
    are still ported (they are small) but need no tests.
