# v0.2.8 acceptance evidence

## PvE balance

`balance.json` records all 100 waves at four difficulties, three kill-share growth models, actual upgraded weapon stats and 24 serial input-bot runs (Single/Coop × four difficulties × seeds 11/31/71). Reproduce with `node --experimental-transform-types tools/balance-audit.mjs`. The bots press normal keys and have no infinite life; their aim and tactics are imperfect. Their results are diagnostics, not human win-rate or enjoyment measurements.

Enemy health remains 100 for zombies and 1000 for devils, with original 50-damage attacks and original attack patterns. Each wave retains its original total kill budget. Profiles change pacing and active caps; LOW quality still caps zombies at 40. Devil concurrency never exceeds its wave budget. No player healing, regeneration or weapon damage formula is changed by balance tuning. Armor remains 100 and Devil loot remains an exclusive 20% armor / 20% ammunition / 60% original supply roll.

| Difficulty | Zombie / devil active ceiling | Minimum zombie spawn ticks at 25 Hz | Zombie / devil speed multiplier ceiling |
|---|---:|---:|---:|
| Beginner | 40 / 2 | 4 | 4.0 / 3.2 |
| Intermediate | 44 / 3 | 3 | 4.3 / 3.6 |
| Expert | 48 / 4 | 2 | 4.6 / 4.0 |
| Nightmare | 56 / 5 | 1 | 4.8 / 4.5 |

Spawn intervals shorten gradually and devil intervals shorten with difficulty. These ceilings are not immediate starting populations. Local Single/Coop retain original kill-multiplier growth. LAN personal growth uses `5 × (1 + floor((level − 1) / 10))` XP per level, capped at level 125. Zombies award 1 XP and devils 5 XP. Fresh selected-wave baselines model cleared previous waves with equal kill share, bank no score or XP, and preserve the difficulty head-start floor. Retry restores the saved checkpoint, including partial XP and armor.

| Wave start | 1 | 10 | 20 | 35 | 50 | 100 |
|---|---:|---:|---:|---:|---:|---:|
| Equal-share personal baseline | 1 | 22 | 46 | 84 | 122 | 125 |

In the discrete 50% kill-share model, the old five-XP rule caps during wave 19; the new curve caps during wave 50. At 30% / 70% share, the new cap points are wave 65 / 43. These are model outcomes, not promises of player performance. Disabling devils also removes their XP from the selected-wave model. Actual weapon stats retain tangible improvements: pistol body hits against a zombie fall from 4 at level 1 to 2 at level 8; UZI reaches one body hit at its late damage upgrade. This ignores misses, movement and obstructions.

New LAN rules require the negotiated `pve-balance-v1`, `personal-growth-v1` and `armor-ammo-v1` capabilities. Older peers retain the original wave/five-XP rules. Exact original curve assertions remain in explicit classic fixtures; separate tests check the new actual spawn caps, health, damage, optional save fields and all four independent-process correction/recovery paths.

## Visual checks

Headless installed Chrome uses real menu clicks, keyboard pickup movement, Canvas pixels and geometry at 640×480, 960×720, 1280×720 and 640×889. Screenshots are reviewed directly; zai is not used. The armor overlay retains the original life-bar outline and fill direction. Full armor covers health; partial armor exposes actual health, with checks at both 60% and 20%. The growth HUD also checks a 39/65 XP bar, MAX, large scores, enemy counters and both paused upgrade columns. The ping readout uses Presenter mapping and stays 8 CSS pixels below the scaled HUD during resize without waiting for another heartbeat (`ping-layout.json` records the failed fixed-position case and the passing four-size checks). Raw local screenshots/reports are under `generated/reports/v028/{supplies-ui,balance-ui,growth-ui}`.

## Matched packaged performance comparison

`performance.json` contains all six per-run scalar measurements and the three-run medians. The raw frame, allocation and event reports remain locally under `generated/reports/v028/performance-release`. The same Windows 11 / Intel Core 5 220H machine ran baseline v0.2.7 and candidate v0.2.8 serially, alternating three rounds with isolated fresh saves, the same seeded input and default 2× rendering. Screenshots are 1624×1258 pixels; measured presentation is approximately 120 Hz. Each run warms up for 3 seconds, then measures 20 seconds with 256 mixed explosive roots at maximum upgrades every 100 ticks and 30 ms one-way transport delay. Both performance fixtures enable infinite life to keep the workload running; this is separate from the normal-life balance bots above. Allocation sampling uses a sparse 4 MiB interval. Both peers stop sampling before either performs the post-window forced GC.

| Metric (three-run median unless specified) | Baseline host / client | Candidate host / client |
|---|---:|---:|
| Frame work p95 | 11.1 / 12.0 ms | 9.4 / 9.1 ms |
| Largest frame work per run | 136.9 / 140.0 ms | 84.6 / 86.5 ms |
| Largest frame interval per run | 216.1 / 237.8 ms | 94.1 / 94.0 ms |
| Estimated allocation rate | 117.29 / 116.73 MB/s | 89.32 / 82.46 MB/s |
| JS heap after GC | 36.95 / 36.59 MB | 33.13 / 32.92 MB |
| Worst input response across all three runs | 32 / 109 ms | 46 / 40 ms |

All final candidate gates pass under the practical latency criteria requested by the user: ordinary play remains limited to 60 ms, while the artificial 256-root explosive workload permits an occasional response up to 100 ms. Frame p95, burst-tail, CPU, allocation, heap and live-bitmap gates retain their previous limits. The old baseline's original 60 ms failures (109 and 70 ms) remain verbatim. CPU busy ratios are approximately host 0.385→0.402 and client 0.396→0.387; this is not an overall CPU reduction claim. New HUD objects and retained filter-cache area increase modestly. Peak frame intervals still exceed a refresh period. These measurements do not establish zero stutter or guarantee other hardware/network conditions. All six runs preserve common-confirmed gameplay and event equality.

The initial relative input rule rejected the host's 46 ms against three baseline free-phase samples topping at 32 ms; [the original failed summary](performance-strict-history.json) is preserved. An additional free/0/10/20/30 ms phase pair recorded 65 ms on the candidate and failed its original 60 ms limit ([raw probe history](input-phase-history.json)). It meets the revised 100 ms stress limit. CPU-profiled diagnostic runs are excluded from the matched measurements. Existing raw reports were re-evaluated without changing them or repeating successful measurements.

## Real transport, recovery and sustained explosions

[network.json](network.json) records the final artifact `08d0c020f540ca30a5e9e462d7377ffcfe56c61ab031e5e3f87eec2ae5a4fb27`. Its runtime bytes and complete asar hash are identical before and after the final directory/configuration rebuild, so the passing ten-minute run is reused.

| Scenario | Injected one-way delay | Input host / client | Late-half waits host / client |
|---|---:|---:|---:|
| Ordinary combat | 60 ms | 14 / 29 ms | 0 / 0 |
| 256 mixed roots | 30 ms | 9 / 29 ms | 0 / 0 |
| 256 mixed roots | 100 ms | 6 / 21 ms | 3 / 0 |
| 256 roots every 100 ticks, ten minutes | 60 ms | 22 / 20 ms | 1 / 0 |

Every row verifies real TCP interruption/history recovery while retaining both original worlds, healthy audio, and complete gameplay/event equality at a common confirmed pause. The ten-minute run peaks at 1072 active explosions and confirms 408192 sound identities in the same order at common tick 14963. Burst execution counters include speculative replays and can differ; equality is checked at a common confirmed tick. Independent-process tests also compare ordered decal identities. Stress fixtures use infinite life solely to sustain combat. The older failed ten-minute candidate (30 late-half client waits) remains archived locally; the bounded scheduler fix has a failing-before/passing-after independent-process reproduction.

## Release status

All 27 final release gates pass ([gates.json](gates.json)): 1389 Vitest tests passed, with 71 pre-existing skips; bitmap/mask pixel checks, browser UI/audio, growth and supply layouts, three-mode browser/Electron/packaged play, historical regressions, typing, LAN UI/retry/full lifecycle, native Electron/packaged smoke and actual v0.2.5 save continuity. No skips were added.

The actual NSIS single-file portable passes gameplay, save/continue and audio. Its extracted version and runtime bytes match the current build, and its extracted asar has the same SHA256 as the validated unpacked app. [artifact.json](artifact.json) records the 101626157-byte executable, SHA256 and runtime-file verification. The audit reports 457 modules, 117 original port modules and no changed ports. Visual review uses direct screenshots, pixels, geometry and real clicks; fake-pad checks cover mappings, not physical hardware. README desktop/mobile previews are offline Markdown renderings ([readme-layout.json](readme-layout.json)), not GitHub screenshots.

Earlier failed/cancelled measurements remain under `generated/reports/v028`; they are not counted as passing acceptance. Release notes remain brief and English: [RELEASE_NOTES.md](RELEASE_NOTES.md).
