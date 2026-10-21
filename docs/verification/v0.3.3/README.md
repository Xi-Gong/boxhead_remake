# v0.3.3 release verification

Gameplay source freeze: `69d5940`; subsequent commits update QA and release documentation. Version is consistently `0.3.3` in the package and root lockfile. The fresh external package was built from `1437fce`, with production renderer `main-aEZJ6C-F.js`. The final runtime-source fingerprint and every built byte match the tested package.

## Candidate code review

The manual diff/call-chain review covered configuration and old-peer negotiation, wrapper order, seeded loot, emission scaling, vitals, finite spawning/reference XP, snapshot ownership/order, immediate migration, confirmed HUD data and render-cache lifetime. The final static inventory covers **600 modules and 117 unchanged mechanical ports**. Dynamic registrations, original assets, historical fixtures and older capability paths remain.

Review findings were repaired before the freeze:

- Skip retired enemy baking in v3, but queue complete legacy art during world loading after negotiation.
- Bypass three retired warning renderers' per-frame entity scans in v3.
- Remove unused piercing previews and share the live/migration enchantment multiplier constants.
- Reuse unchanged Boss bar paths through a clip-keyed WeakMap; position still updates independently and simulation snapshots gain no cache state.
- Preserve larger legacy ammunition stocks after the first live weapon update, resupply and death-crate recovery. A real 820-round legacy magazine previously fell to 201 rounds two ticks after loading. The new refill capacity stays bounded, surplus remains finite, and the old v2 clamp is isolated in its historical fixture.

Targeted follow-up checks passed, including 39 Boss/display/combat tests and 48 ammunition/save/supply/crate checks. The added regression covers processing, red/partial/full/draft supplies, crate recovery, repeated loads and finite consumption of a 999999-round stock with the original firing-rate ceiling. No benchmark or measured performance gain is claimed. Raw review records: `generated/reports/v033/candidate-code-review.json`, `code-inventory-final.json` and `ammo-regression-{before,incomplete,after}.json`.

## Input-only balance acceptance

Installed Chrome, headless **640×480**, one game at a time, real-time normal-speed simulation and HIGH detail. Controllers read visible positions/weapon stats, then send actual keyboard events. Combat health, ammo, XP, kills, spawn budgets and clocks are never rewritten. Menu history unlocks and boot RNG seeds are confined to fresh QA contexts. These automated results are **not human win rates**.

| Difficulty | Selected wave / room | Boot seed | Natural completion | Time remaining |
|---|---|---:|---|---:|
| Beginner | 1 / 1 | 4242 | All 27 zombies | 14.44 s |
| Beginner | 5 / 1 | 4242 | Charger Boss defeated | 14.52 s |
| Intermediate | 2 / 1 | 4242 | All 33 zombies + 2 devils | 11.64 s |
| Intermediate | 5 / 1 | 4242 | Charger Boss defeated | 32.44 s |
| Expert | 2 / 1 | 4242 | All 41 zombies + 2 devils | 32.36 s |
| Expert | 5 / 1 | 4242 | Charger Boss defeated | 41.52 s |
| Nightmare | 2 / 1 | 1337 | All 52 zombies + 3 devils | 4.60 s |
| Nightmare | 5 / 1 | 9001 | Charger Boss defeated | 64.64 s |
| Nightmare | 10 / 10 | 4242 | Native fireball-devil Boss defeated | 92.36 s |

All four difficulties have ordinary/Boss early-clear evidence, and Nightmare covers three boot seeds. The versioned build also repeated Beginner ordinary/Boss input play; ordinary wave 1 cleared with 3.56 s remaining. Representative earlier plays used `main-CS2fE_UR.js`, with later Beginner checks on `main-1zov2wvB.js`. Subsequent changes reuse render-only Boss paths and preserve legacy over-cap stock; for ordinary new-game stock at/below capacity, the ammunition arithmetic and all confirmed balance values are unchanged.

Additional Nightmare wave-35 three-Boss and wave-36 ordinary samples remain challenging: one wave-35 run defeated both chargers and survived to timeout with the final devil at 2014 HP out of the original 90000 combined HP. Another input policy also timed out; wave-36 samples died. These are retained as timeout/death evidence, never early clears. No claim is made that every wave/map/seed can be cleared by this controller.

Earlier deaths exposed controller limitations: muzzle offsets, charge/fireball avoidance, damage-dependent rocket blast radius, lazy weapon upgrades, real upgraded range and resupply routes. Start-wave value 1 preserves the original difficulty start (1/10/20/35); a mistaken high-difficulty wave-1 fixture is excluded and actual opening-wave assertions now prevent that error. Later cases archive each controller source/hash and input/event history. Grenade arcs and the full set of placed-explosive/rail-piercing tactics are not modeled.

Reports record deaths, timeouts, damage, shield breaks (including zero observed), nearby crate removals and weapon choices. Proximity-based crate removal is an observation, not proof that every disappearing crate was consumed. Actual armor pickups appear in Expert/Nightmare ordinary cases; shield-break/overflow/lethal behavior is additionally covered by explicit simulation regressions. Full raw history: `generated/reports/v033/pacing/`; strict coverage summary: `pacing-summary.json`.

## Visual acceptance

`generated/reports/v033/ui-final-20261021-123412` passed real card/ready clicks, Tab/stat sheets and pause, including 160→173 health and 60→64 shield previews, +15% enchantment and no piercing row. Direct screenshot review plus pixel/geometry checks verified charger **44×5**, native devil **40×5**, a **4-pixel** crown gap and full/half/10% fills. The prepared constructors now reproduce the family counters normally owned by `CWorld.Spawn`, and HUD DEVIL=3 is asserted; the earlier prepared image's omitted native-devil count was a fixture error. Player bar styling remains authored. These are prepared UI fixtures, separate from the balance play above. Final menu, options, CJK input, wide pause and natural three-Boss screenshots were also directly reviewed.

## Final gates and artifact

All three TypeScript configurations and the fresh production build passed. Full Vitest passed **1807**, failed **0**, with **71 existing skips**, 1878 total / 148 passing suites (`full-final.json`). The unchanged skips include opt-in long soak and unavailable original-source fixtures; no skip was added. The pre-stock-fix passing run and earlier failing/interrupted runs remain archived separately.

Full browser UI passed **188/188**, audio passed **54/54**, including real nonzero recovered waveform peaks of 0.8395. Reports: `browser-ui-20261021-123412`, `browser-audio-20261021-123412` and their receipt. Historical browser Single/Coop/DeathMatch movement/fire/pause/quit/retry passed; v019 death-crate recovery and v020 passive death/real retry passed. The old wave-25 fixture initially expected level 85, ten weapons and ten ordinary enemies. V3 correctly has level 61, nine weapons, three Bosses and two reinforcements; old assertions remain isolated alongside explicit modern checks. The failed original is retained in `source-gates-20261021-124202/v019-failed-before-v3-fixture`; passing source/native smoke evidence is in that folder and `source-gates-20261021-124652`.

Electron smoke passed **46/46**, including native keyboard/mouse/audio, sizing/fullscreen without focus, persistence/default-profile migration and protocol isolation. Fresh packaged protocol smoke passed **6/6**. All **seven** hidden native groups passed, including actual mouse/keyboard/pause, transformed wide-window clicks, F11/IPC/Alt+Enter round trips and process-restart persistence. Actual portable EXE launch passed through its unique CDP port, with isolated saves, all 31 sounds, save/continue and v3 card/stats/Boss pixel/geometry assertions. Its extracted **complete** asar hash equals the validated unpacked build, and current renderer/main/preload bytes match. Native/portable screenshots were directly reviewed. Evidence: `packaged-gates-20261021-125220/{native,portable}`.

Historical packaged v012 save/continue, real typing/IME, LAN input geometry, v023 independent cameras/pause/desync cleanup, v024 history/restart/setup mirroring, TCP reconnect/countdown timeout and coordinated death/retry passed. Their preserved reports are in `packaged-gates-20261021-125542`. V012's old fixed left/right 20-second routine legitimately died before reaching SAVE; its failed report remains in the first folder. That **save-flow-only** fixture now selects the original infinite-life affect mask before player initialization, retaining all original save assertions and real input, separately from balance acceptance. Numeric offscreen coordinates also fix a caught Electron argument-conversion error. The successful save test restored identical room, score and position and cleared the ended run. No combat rule changed.

Packaged browser-playtest Single/Coop/DeathMatch also passed real input, pause/quit/retry without script/console errors. The historical controller's ordinary Single deaths are legitimate outcomes, not a balance pass; the dedicated early-clear evidence above is separate. All required historical entry scripts were rerun. Their original assertions remain.

The final v3 functional LAN scenario passed one hidden **640×480** pair at **30 ms one-way** delay, using isolated main-process ports **48630 / 48631–48640** and the error-dialog failure guard before entering a lobby. At common confirmed ticks, complete gameplay digests and ordered sound/decal identities agreed, including enchanted shots and real changing-input rollback. Negotiation selected `combat-pve-v3`; charger/native-devil Bosses had no armor and overhead bars of 44×5 / 40×5, with HUD DEVIL=2. Actual TCP disconnect/rejoin retained partial defeat, surviving member HP, bonuses and world identity. Client W/S and both arrow directions, independent Tab/R sheets and a 14-second one-ready wait passed. Synchronized defeat fixtures yielded exactly one doubled selection per player; ordinary all-dead routing and real client RETRY restored wave 16 without duplicating rewards. These synchronized fixtures are functional coverage, not input-only balance evidence. Screenshots of both Bosses, client stats and debrief were directly reviewed. Report: `packaged-gates-20261021-125542/lan-v033/net_smooth_report.json`, with zero errors; its parent receipt was written only after owned processes closed.

External `electron-builder --win dir` and `--win portable --x64` both followed the fresh build. `artifact.json` verifies package/lock/asar version, **all 70 built files / 7423582 bytes** byte-for-byte, and the 265 tracked runtime-source fingerprint `426203a45692016f910544fb05f6734afde3ded439d66c0e71cea171abc97831`. Native EXE metadata is also 0.3.3. The ignored staged folder is `release/v033-final`; the EXE was copied to the external archive.

- Portable: `Boxhead 2Play Rooms-0.3.3-portable.exe`, **101671515 bytes**.
- EXE SHA256: `405dc84d399cfbb79377e1516ffe3a4262cef054fef691b8f174f735f8e6fe67`.
- Complete asar SHA256: `c57c860055f819a34d069428fd7199c7223c63363198887f6822323c30d6e5df`.

Testing stays serial and low-resolution, except the explicitly authorized isolated functional LAN pairs and brief native resize checks; no foreground windows, performance benchmark, extreme rendered stress, physical-controller or remote-machine claim. Publication download verification is recorded separately after the release exists.

See the English [release notes](release-notes.md) and Chinese [PARITY record](../../../PARITY.md).
