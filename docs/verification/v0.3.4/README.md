# v0.3.4 release verification

Runtime source freeze: `6aeadf3`. Subsequent changes concern verification, screenshots and documentation. Package and lockfile root versions are **0.3.4**. The production renderer is `main-D4wQZS34.js`.

## Code and compatibility review

The review covered wrapper ordering, modern capability negotiation, old-peer semantics, save migration, deterministic loot, one-shot command transport/repair/replay, confirmed LAN displays and render-only input state. The final static inventory covers **616 modules and 117 unchanged mechanical ports**. The five optional modern capabilities are `fragile-armor-v1`, `empty-weapons-v1`, `weapon-bindings-v1`, `enchant-durability-v1` and `native-bosses-v1`; old capability names and fixtures retain their behavior.

Review repairs include canceling holds during the LAN pause/reconnect freeze, loading old v3 charger art after negotiation rather than during combat, reading the new armor strip from confirmed LAN metadata, and showing both A/Y shortcut slots in the attribute sheet. New saves keep optional bindings/durability; old armor and enchantments migrate once without repeated refills. Original armor reaction/lethal handling, RNG order and historical assertions remain.

## Functional and visual acceptance

The complete functional baseline passed all **25 required gate groups** on source `2013922`: UI (188 checks), audio (54), three-size draft stats, candidate UI, native balance, browser/Electron/packaged play, historical v012/v019/v020/v023/v024/typing/LAN UI/retry/network entries, isolated packaged LAN at 30/60/100 ms, Electron and packaged smoke, native window controls, actual old-save migration and actual portable launch. Raw results are retained in `generated/reports/v034/ship-gates/`.

Final pixel review then found a genuine HUD defect: the purple durability strip overlapped the lower part of the original green health bar. The final runtime delta changes only `Enchantment.ts` and `WeaponBindings.ts`, moving weapon text and hold progress into separate rows while leaving the authored health position intact. Six new tests first reproduced the overlap, then passed at full/half/critical HP with empty/partial armor. All 22 relevant geometry, armor, enchantment and binding/network tests passed, followed by the six final caption geometry checks and a fresh complete build/typecheck. Final-package delta acceptance and screenshot identities are recorded in `evidence.json`; the 25-group baseline is not represented as a full rerun on this later archive.

All five final delta groups passed: three-size draft interaction, candidate HUD/pad mapping, packaged LAN including reliable binds and reconnect, native window/fullscreen/save controls, and actual portable gameplay/save/audio. The portable's complete extracted asar equals the final unpacked archive. The final paired LAN run independently exercised normal menu-selected wave-3 growth, host READY and client-only inspection with blocked confirmation; it also supplied the README LAN image. Both peers closed before reports were finalized.

All eight README images were recaptured from the final production renderer or final package and reviewed at 640 pixels. They include the menu, empty enchanted UZI with a visible A label and separate purple/green/cyan rows, upgrade cards, both local stat sheets, native devil Bosses, a persistent corpse weapon crate, four supplies and the independent LAN sheet with partner READY. The actual portable additionally reproduced the hold-progress, gameplay and stats views. The source/packaged renderer bytes match. Prepared positions, supplies and end-of-wave staging are disclosed in capture reports; no debug overlay, infinite-life switch or extreme build appears in these documentation scenes. Images link to their original PNGs in both READMEs.

The final full functional Vitest run passed **1830**, failed **0**, with **75 not executed / 1905 total** across 154 passing files and two conditional files. The 75 comprise 71 existing original-source/opt-in-soak conditions and four explicitly excluded `mixed explosive burst` stress cases (32/64/128/256). No source assertion was disabled. Command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 -t '^(?!.*mixed explosive burst)'`. The last display-only saved-key hint repair subsequently passed all **19** relevant stats/gamepad/binding tests, all typechecks/build, and the complete three-size real-key/mouse draft inspection flow with an added A/Y-row assertion.

The first full functional Vitest run found one old loading assertion among 1828 passing tests. Its original failure is retained in `generated/reports/v034/vitest-functional.{json,log}`. Isolating the old roster exposed a real missing legacy preload after LAN negotiation; that was fixed in `a52068f`. The fresh-modern/explicit-legacy loading checks then passed. An earlier coordinator interruption and the prepared Boss screenshot's early frame capture are retained as non-passing attempts. The screenshot sampler now waits for normal presentation and preserves its size, crown-gap and fill-pixel assertions.

Prepared UI scenes use real running production code, actual menu/card/READY clicks and keyboard input. Injected standard gamepads validate mappings and hold timing, **not physical hardware**. Direct screenshot review is combined with pixel, geometry and real-click checks; zai is unavailable. Co-op geometry covers **640×480, 960×540 and 480×720**. Prepared screenshots are illustrations, not balance evidence.

The accepted Boss samples (`balance-1792594292824/report.json`) use one hidden **640×480**, LOW-detail game at a time, all four difficulties and selected waves **5/15/25**. Derived player maxima and enemy damage/HP remain unchanged. Positions are prepared and initial invincibility is set to zero. An actual armor crate fills the shield, then controlled native-fireball effects break it in **1–2 hits**, with exact 1:1 overflow to health. Real move/fire keys then run for 1.8 seconds with no scripted healing; original natural regeneration remains. All 12 samples survived, including cases with further combat damage. Native animation steps stay at most one frame per tick. These are controlled effect/short input samples, not input-only clears, human win rates or guaranteed wins. Simulation regressions additionally compare the independent +15%/+15%/+10% coefficients, unchanged projectile speed/range, full restoration and lethal overflow.

Earlier protected samples are excluded as real-hit evidence. The final coordinator's first Boss attempt was deliberately interrupted on finding the spawn grace; the next attempt correctly failed its armor-pickup assertion because the prepared Move had not refreshed the player's collision-cell flag. The fixture now calls the same SetCollideDirection used by a normal player tick. Assertions remain intact, and attempt 3 passed all 12. Raw attempts, interruptions and the accepted summary remain in `generated/reports/v034/ship-gates/` and `native-balance-summary.json`; natural regeneration explains recovery after the controlled probe.

## Artifact identity

Both external Windows x64 builds follow a fresh complete build. `tools/verify-release-candidate.mjs` checks **all 70 built files** byte-for-byte, package/lock/asar versions and the source fingerprint. The coordinator independently rejects a stale packaged renderer. The actual portable launch additionally verifies its extracted complete asar against this staged archive.

- Portable: `Boxhead 2Play Rooms-0.3.4-portable.exe`, **101677036 bytes**.
- EXE SHA256: `8b11275b17e8159cc9940b19c9310c11b5dd2448e6dfcf91fdeaca0a92b399dc`.
- Complete asar SHA256: `cc6a72f7b8cdf1def4c3ac1575acaac3af438fa5ad4b6f3c12120b3f08ffe39a`.
- Runtime input fingerprint: `e39d25ae66367cddb41fc9dd04cf01b5e3b012b5e8e5dcfe5893c8ef0c11e5e7`.
- External output: `C:/Users/royxg/boxhead-build/v034-hud-final`; ignored stage: `release/v034-hud-final`.
- The EXE is also copied to ignored `release/` and `C:/Users/royxg/boxhead-exe-archive/`.

The release uses serial, low-resolution functional checks with hidden windows, isolated saves and isolated LAN ports. Performance benchmarks, extreme rendered explosion/crate stress, physical-controller and remote-machine claims are outside this acceptance. Failed and interrupted runs are retained separately and are not passing evidence.

The real v0.2.5 save stores 137/200 HP. Modern migration correctly retains that fraction as 115/168 HP at the retained weapon-derived level 5; a second actual save/continue preserves its newly saved fraction without scaling again. The old absolute 137 assertion remains and was independently exercised on v0.3.2. The diagnostic failure and both passing branches are retained. This corrected the acceptance fixture, not gameplay migration.

The local verification archive contains **347 JSON/log/PNG/YAML evidence files (15,900,582 bytes)**, including failed/interrupted attempts, with a path/size/SHA256 manifest. Isolated browser/game save profiles are excluded. The compact public [evidence ledger](evidence.json) binds the complete baseline, final delta, source comparison, eight images and portable identity. The publication receipt is recorded separately after downloading the published assets.

See the English [release notes](release-notes.md) and Chinese [PARITY record](../../../PARITY.md).
