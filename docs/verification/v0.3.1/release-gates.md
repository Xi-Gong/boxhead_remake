# v0.3.1 streamlined release gate

Authorized by the user's 2026-10-20 instruction to execute the streamlined full gate, fix failures and publish v0.3.1 with its Windows portable EXE after all gates pass. This replaces repeated historical end-to-end passes with current risk coverage; historical scripts/assertions remain available and are not reported as passing without execution.

## Required coverage

| Gate | Run once against the final code/art inputs | Evidence |
|---|---|---|
| Source and simulation | Complete Vitest; all three TypeScript configs through `npm run build`; mechanical-port audit | Full-suite output including original/classic assertions, build log and unchanged-port report |
| Browser/UI/audio | One serial browser session covering Single/Coop/DeathMatch entry, real keyboard/text input and pause, UI bounds, audio unlock/recovery; current timed/draft/Boss/art evidence tied to the final renderer hash | Screenshots, geometry/pixel checks, real-input assertions and error logs |
| Actual network | One isolated packaged pair covering capability negotiation, common-confirmed-tick checksums/event identities, multiple Bosses and per-member bars/counts, partial defeat/checkpoint save, disconnect/rejoin and natural-end/retry | Confirmed state comparisons, reward deduplication, recovered per-member HP and transport/error logs |
| Electron/artifact | One packaged native smoke for window/input/fullscreen/protocol/persistence and one actual portable EXE launch for extraction/hash/version, saves, audio and current gameplay | Asar/runtime file equality, hidden-window native assertions, portable report and SHA256 |

Run game checks serially at low resolution. The actual-network leg uses at most two simultaneous game processes, isolated saves/ports and the existing main-process error guard. It is the only two-instance leg. Headless simulation clocks cover long wave durations.

## Remove repeated work

- Typechecking is part of `npm run build`; do not immediately run the identical three configurations again for the same inputs. Run the complete Vitest suite once, rather than full suite plus repeated identical subsets afterward.
- Use one immutable renderer/main/preload/assets fingerprint across browser, unpacked and portable checks. Existing art contact sheets/geometry checks can be reused only when their relevant resources and final output remain identical; verify changed behavior on the current build.
- Browser UI/audio and packaged gameplay should share scenario helpers. A save/continue or draft/Boss scenario already completed in the actual portable need not be repeated in another Electron launch solely because an old version-specific script also contained it.
- Retire the blanket requirement to execute every historical `v012/v019/v020/v023/v024` script in both browser and packaged environments. Retain their important risk coverage in the table: save/continue, wave selection and retry, supplies, real typing, viewport/pause, native persistence, common-tick LAN synchronization and reconnect. Record omitted script names explicitly; never describe them as executed or delete their assertions.
- Do not include the full 30/60/100 ms legacy-and-modern smoothness/performance matrix, multi-instance performance benchmarks, extreme explosion/crate stress, or foreground-window QA in this release gate. Those are separate checks triggered by scheduler/transport/render changes or a performance claim. A short delayed-input rollback correctness case remains necessary for multi-Boss synchronization.
- Build/package once after the final runtime changes. The verified candidate may become the release asset if package/version, renderer/main/preload, assets and dependency/config inputs remain identical and every required gate passes. Documentation-only updates do not require repacking the same bytes. Any runtime/asset/dependency/config change invalidates affected evidence and requires a fresh build/package and affected checks.

## Release decision

Keep failures and interrupted runs. Fix the cause and rerun the affected gate; a change to shared behavior may invalidate more than one gate. Full Vitest failures must be resolved without skips or removing classic assertions. Do not reduce a gate in response to a failing assertion.

No runtime performance claim follows from this smaller QA matrix. The saved time comes from avoiding duplicate launch/build/test work, not from measured gameplay improvements. After these gates pass, record the final input/artifact identity, update English release notes and Chinese PARITY, push the annotated tag, publish the formal Release and verify the uploaded EXE.

## Final results (2026-10-20)

All required gates passed. [release.json](release.json) records the final artifact identity and report paths.

| Gate | Result |
|---|---|
| Source/simulation | 133 files / 1,719 Vitest tests passed; 71 existing conditional skips unchanged; no unhandled errors. All three TypeScript configurations and production build passed. 117 mechanical ports unchanged. |
| Browser UI/audio | 188/188 UI and 49/49 audio checks passed against `main-CTNg9n_N.js`; direct screenshot review plus real inputs, geometry/pixel checks and real audio waveform recovery. |
| Actual LAN | `lan-4`: one hidden 640×480 pair, 30 ms one-way delay, common confirmed full digests and ordered sound/decal identities; two 64×7 bars, DEVIL counts, partial defeat, actual TCP history recovery, doubled reward once per player, natural death and checkpoint retry. V2 partial-Boss save coverage comes from Vitest; the live pair covers history recovery and the next-wave checkpoint. |
| Native/portable | Seven packaged native checks passed, including hidden native fullscreen and process-restart persistence. Actual portable launch passed complete asar/runtime identity, new gameplay, save/continue, Boss reward and 31 decoded/running sounds. |

Failure records are retained: first full-suite sandbox EACCES and classic-fixture assumptions, plus `lan-1`/`lan-2`/`lan-3` harness failures (family/HUD identity, checkpoint observation time, confirmed-HUD rendering race). Fixes preserve assertions and production behavior. The final LAN and native script changes are test-only, so they do not invalidate the runtime fingerprint.

Standalone historical scripts **not executed** for this final candidate: `tests/sim/playtest.browser.mjs`, `playtest.v012.mjs`, `playtest.v019.mjs`, `playtest.v020.mjs`, `playtest.v023.mjs`, `playtest.v024.mjs`, `playtest.typing.mjs`, `playtest.lanui.mjs`, `playtest.net.mjs`, `playtest.netretry.mjs`; their important risks are covered by the current UI/audio, native, portable and combined LAN checks. The old standalone `electron-smoke.run.ts` fixture/production passes were replaced by `release-native.electron.mjs` plus actual portable launch. Their scripts and assertions remain intact. `playtest.netsmooth.mjs` ran in functional release mode only, not its response/performance/stress mode. Full Vitest retains its original headless burst fixtures; no rendered stress or multi-instance performance matrix was run.

The freshly built 70 runtime files, version and 402-input fingerprint match the verified candidate, permitting reuse of the exact EXE. All owned game/GPU processes and QA listeners were cleaned up; only this run's preview PID 33552 was stopped. Final screenshots, motion clips, logs, failed attempts and SHA256 are archived as recorded in [archive-release.json](archive-release.json).
