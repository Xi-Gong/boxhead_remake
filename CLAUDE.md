# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A 1:1 remake of **Boxhead: 2Play Rooms** (Flash 8 / AS2, 2007) in TypeScript + Canvas2D + Electron. Before changing anything, read `CONVENTIONS.md` (porting rules, lane ownership, tooling constraints) and the relevant section of `PARITY.md` (the deviation registry and de-facto version history). `README.md` covers the user-facing feature set.

## Commands

```bash
npm run typecheck          # 3 tsc passes (base / strict for src/engine+src/shared / tools)
npm test                   # full vitest suite (tests/unit + tests/sim, node env)
npx vitest run tests/sim/netlockstep.test.ts -t 'retry'   # one file / one test
npm run extract            # regenerate public/assets from the SWF (only when the extractor changes)
```

**Build (dist):** `dist` runs in-repo but `electron-builder` inside this repo hits EPERM/EBUSY — the ChatGPT.exe desktop app mmaps new asars. The working flow:

```bash
NODE_USE_ENV_PROXY=1 npm run build                       # ALWAYS build first — builder alone ships a STALE renderer
npx electron-builder --win dir|x64 --config.directories.output=/c/Users/royxg/boxhead-build   # outside the repo
cp -r /c/Users/royxg/boxhead-build/win-unpacked release/  # playtests run release/win-unpacked
```

Verify a packaged build actually contains new code: `node -e "console.log(require('fs').readFileSync('release/win-unpacked/resources/app.asar').toString('latin1').includes('<new string>'))"` (node needs Windows-style paths, not `/c/...`).

**Browser e2e / playtests** (build a dist then serve it, `GAME_URL` selects the port):
```bash
npx vite build --outDir generated/x1-dist --emptyOutDir && npx vite preview --outDir generated/x1-dist --port 5311 &
node tests/e2e/ui.browser.mjs                       # ui groups; audio.browser.mjs needs GAME_URL=http://localhost:5316/
node tests/sim/playtest.browser.mjs                 # + v012/v019/v020 against port 5198 (see file headers)
```

**Packaged playtests** (require the staged `release/win-unpacked`): `tests/sim/playtest.{lanui,typing,v012,net,netretry,netsmooth}.mjs`. netsmooth takes a one-way delay arg: `node tests/sim/playtest.netsmooth.mjs 30`.

**LAN tests need ports 47630 + 47631-40 free** — check `netstat -ano` and `taskkill //F //PID <pid>` leftover game exes before debugging "random" net failures.

## Machine facts (this Windows box)

- `NODE_USE_ENV_PROXY=1` for any Node download (electron-builder, etc.).
- Packaged off-screen playtests: screen-transition screenshots need ~700 ms settle, and debrief/menu buttons often miss the FIRST click — verify state moved, retry the click once.
- `vite preview` survives killing the npm wrapper: kill by PID from netstat.

## Architecture

**The port contract (see CONVENTIONS.md for the full rules).** `src/game/**` is a mechanical AS2→TS port: one `.ts` per `.as`, same names, same statement order, `// Port of ...` header, `proto(Class, {...})` for AS2 prototype vars. Cross-class references use the exact AS2 dotted spelling through generated namespaces (`src/game/packages.ts`: `World.Map.CMap_Cell.mCollide_Solid`, `new Thing.Object.CThing_Object_Barrel(p)`) — never direct ES imports (except `extends`), which mirrors AS2's `_global` lookup and makes import cycles impossible. Ported files must stay 1:1: **no fixes, no refactors inside them.**

**Deviations via wrappers, never in-place.** Every intentional behavior difference (gamepad, save/quit, LAN, IME input, cursor hide, …) is a prototype wrapper installed at boot — the hub is `src/game/scope.ts`; LAN's live in `src/game/local/Net/NetScope.ts`. Each deviation gets an id in `src/game/deviations.ts` and an audit entry in `PARITY.md`. Wrapper ordering matters (documented in NetScope.ts headers).

**Engine vs game.** `src/engine/flash/**` emulates the Flash runtime: display list, 50 Hz virtual-clock enterFrames (`clock.ts` `frameTime()` = scheduled EF time), the process-global seeded RNG singleton (`rng.ts` — two live games in one process share the stream; tests run games sequentially), input, Sound. `src/game/CMain.ts` drives 25 fps sim ticks (`ProcessFrames`, `mFrameCap=1`) with Draw tied to executed ticks (no interpolation — original parity).

**Determinism is the invariant.** The sim is byte-identical between machines (LAN lockstep depends on it): seeded RNG with no draw-side consumption, wall-clock reads quantised where the sim sees them. When touching net code, the pinned canaries are: ordered `PlaySound` identity between peers (audio canary), world-hash comparisons, and the checksum (score/thing-counts/player pos+life only — render state like camera fields is exempt).

**LAN stack** (`src/game/local/Net/`): `protocol.ts` (pure wire math: `computeInputDelay` p90, `netStallRewind`, message union), `NetSession.ts` (lockstep frames, checkpoints, phases), `NetScope.ts` (tick gate wrappers, stall catch-up, prediction draw hooks), `bridge.ts` (UI phase machine, retry coordination), `Predict.ts` (local-player display prediction: draw-layer only, RNG/sim-neutral by construction), `electron/lan.ts` (TCP transport + `--boxhead-net-delay=<ms>` one-way delay hook for QA).

**Assets.** `public/assets/**` is committed (~6.6 MB) and manifest-gated; standard builds never read the SWF. Re-extraction (`npm run extract`) needs the SWF under `assets/` and only runs when the extractor version changes. `assets/flash_player/` holds the oracle projectors (FP28 for visual goldens; FP32 debug self-disables).

## Testing & verification culture

- `tests/sim/harness.ts` boots the REAL game headless (pixel-less bitmaps, virtual clock) — sim tests drive actual ported code, not mocks. `tests/sim/netlockstep.test.ts` is the net canary suite.
- **User mandate: every user-facing surface must be visually verified with the zai vision MCP before shipping** (screenshots from playtests feed it); pixelmatch numbers remain ground truth. Vision can misread small HUD text — verify geometrically/code-level before trusting a vision claim.
- Gates before any release: typecheck, full vitest, e2e ui + audio, the playtest set (browser / v012 / typing / lanui / net / netretry / netsmooth), `npm run test:electron` (+ `:packaged`).

## Releases

Version bump (`package.json`) → gates → portable exe (build flow above; artifact `Boxhead 2Play Rooms-<v>-portable.exe` into `release/`) → commit → annotated tag `v<v>` → push → **GitHub Release on the tag with the exe as its asset** (never force-add an exe into git; the exe lives only in `release/`, which is gitignored, plus `C:\Users\royxg\boxhead-exe-archive\`). gh CLI is at `"C:\Program Files\GitHub CLI\gh.exe"` (not on PATH). Release notes use the established formatted style: themed `##` heading + tagline, emoji ✨/🐛 bullets sourced from the matching `PARITY.md` section, a PARITY link, and a Full-Changelog compare link. See `PARITY.md` for what shipped in each version.

Git: work happens on `main`; commit at milestones and push after. `origin` = `Xi-Gong/boxhead_remake` (clean history, no binaries); `archive` = the old `boxhead_res` repo — never push to it.
