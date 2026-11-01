# v0.3.7 verification

Nine confirmed baseline defects are fixed: **five P1 and four P2**, with no confirmed P0. The [Chinese prioritized audit](audit_zh_cn.md) gives triggers, fixes, screenshots and three P3 follow-up suggestions. The final candidate passed **one clean invocation with2068passing tests, zero failures**, with eight existing conditional skips.

## Artifact identity

Fresh production build, three typechecks and external Windows packaging at a17a82a6750192aaa2f8154dd8bdb3b86d99193b. Package, lockfile, extracted asar and Windows PE versions are 0.3.7. All **70 non-map build files** match the package byte for byte.

| Item | Identity |
|---|---|
| Portable EXE | 101685040 bytes |
| EXE SHA256 | a7c0997593ccfeffe9edc1b4d9a0fd5de690c766bd0bf6c75a06387eeb51b473 |
| Entire asar SHA256 | 1c4e36c8a135d754a1dadd6d674ede9f23d555a592c168db2281aa48ef46d0d6 |
| Renderer | dist/bundle/main-DGtBVX1E.js |
| Runtime/build input fingerprint | ca5be7590626a7008d4e5f9dd1c3cbb01a2b1d90f999e3950c56a19666b83619 (432 files) |

The final documentation/tag commit adds no runtime changes. The [publication receipt on main](https://github.com/Xi-Gong/boxhead_remake/blob/main/docs/verification/v0.3.7/publication.json) records the remote tag, uploaded digest and an actual independent-download portable launch after publication.

## Coverage and scope

| Layer | Result and provenance |
|---|---|
| Current clean Vitest | **2068 passed / 0 failed / 8 existing conditional**, 2076 total; 174 files passed and one existing zero-test conditional file skipped. Includes all37 independent-process scenarios, four explosion sizes, 63 opt-in6000-tick long cases and16new pad-entry cases with disconnect/reconnect. No new skips. |
| Current engine/render checks | Source-engine browser **265/265**, bitmap1568 comparisons and masked-copy3074 comparisons; all seven supplementary entry points pass. |
| Current simulation matrix | **216/216**, 18maps × four difficulties × three modes, seeded normal-vitals input bots, up to750ticks each. |
| Current functional gates | **13 passed**, including exact waves, held fire, letters, draft stats, binding/empty/enchantment scenes, UI188/188, audio54/54, actual portable and30/100ms LAN. |
| Scoped historical coverage | **19 prior gates reused**, distinct from current-artifact reruns. The preceding85fcef2 artifact passed32/32; the later runtime diff is confined to Gamepad.ts and its deviation description. Current affected pad/input paths were rerun. Historical native/window, actualv0.2.5-save and unchanged transport/menu coverage remains identified in evidence.json. |
| Current targeted regressions | Real-menu room16 Single/Coop; fourth Boss death/off-camera/smaller-encounter bar cleanup with pixels136→0; original real-input draft-entry script including14-second no-default wait. |
| Current packaged recovery | **600 permanent supplies**, real client renderer restart, typed-IP rejoin and three checkpoint fragments; common-confirmed gameplay, identities and ordered events agree.30ms extended partial-Boss recovery/bindings/rewards and100ms gameplay/event checks pass. |
| Earlier exploration |216initial simulations and75real-browser menu/input/save/continue cases, including all18maps/three modes, higher waves and a million-wave Coop start. Browser exploration used the earlier version0.3.6 production build with the first four repairs; it is exploration evidence, not final-artifact acceptance. |

The user requested faster completion after the clean full invocation and affected UI/input gates passed. Repeated unchanged historical gates, a separate ordinary-performance comparison, six local Chrome probes, five extra pacing samples and the extra jitter/start-order matrix were omitted. No omitted invocation is marked as passed. The retained stress comparison includes client-first startup in round2.

The eight conditional assertions require removed original references: registerClass1, media5 and text2. Committed assets and Flash goldens have separate passing checks. The original PATCHY solid-cell spawn oracle is documented separately and preserved. **657modules** were inventoried; all **117mechanical AS2 ports remain unchanged**.

## Matched performance

Actual v0.3.6 release versus this candidate, three alternating baseline/candidate rounds: **six separate two-peer sessions** on Intel(R) Core(TM) 5 220H, Windows 11 Home, Nodev24.14.1. Each uses the same seed, keyboard schedule and render settings;960×720 CSS, DPR1.5,1440×1080 backing,30ms injected one-way delay,3-second warm-up and20-second sample. The combined workload repeats256explosive roots every100ticks and keeps200permanent supplies. All six sessions passed confirmed-state/events and response gates; baseline failures:0.

Three-round medians below are **baseline → candidate**. Frame work is separate from frame intervals; allocation is sampled at4MiB, and heap figures are JS heap rather than process/GPU resident memory.

| Role | Frame work p50 ms | Frame work p95 ms | Estimated allocation MiB/s | JS heap after collection MiB |
|---|---:|---:|---:|---:|
| host | 3.4 → 3.3 | 11.0 → 11.2 | 106.20 → 112.45 | 38.66 → 38.59 |
| client | 3.4 → 3.3 | 11.4 → 10.6 | 101.76 → 114.46 | 38.72 → 39.43 |

Candidate input probes were at most55ms, below the100ms stress limit. Both builds' late network-wait counts were0, display-object medians306 and disposed-bitmap references0. Frame-interval p95 medians were17.1/16.8ms →16.0/16.0ms (host/client), with median per-run maxima89.4/86.6ms →103.2/96.6ms. Allocation estimates rose about5.9%/12.5%; post-collection live heaps stayed close. These measurements retain a **P3 allocation/long-frame optimization opportunity** and support no general speedup claim. Collection-request elapsed time includes CDP/IPC, not direct GC pauses. OS cache/background load and exact wall-clock-to-tick input alignment are uncontrolled. Full raw round metrics, heap before/after, resources and cadence traces remain in [evidence.json](evidence.json) and the private archive.

## Normal-input sample and visual review

The current normal-vitals Expert Coop Wave2/room1/seed7307 sample completed the wave early in **46.2seconds**, using actual keyboard input. The position-aware automated controller sends keys without rewriting health, ammunition, damage, spawns or clocks. This single outcome is not a human win-rate estimate. Prepared lethal-hit, crate and explosion scenes remain separate functional/pressure evidence.

Direct original screenshot review, contact sheets, geometry/pixels and real clicks were used; no zai. Current proof images cover [room16](room16-entry.png), [fourth Boss](boss-fourth-defeated.png) and [draft entry](draft-entry.png). Tiny labels also have geometry checks. Injected pads prove mappings; physical controllers, two-computer networks and multi-hour natural sessions remain separate coverage limits. Oversized checkpoint reassembly is intentionally capped at8MiB and requires both peers' capabilities.

## Retained attempts

Earlier candidates and interruptions remain raw evidence, never final-artifact passes: attempt1 rejected a legitimate omitted enemy frame; attempt2 had2036pass/3fail/8conditional (guest fixture and real room16 deadlock); attempt3 had2046pass/1fail/8conditional (a wall-strafe controller trace, corrected while retaining original prior-entry assertions); attempt4 had2048clean plus25gates before the unreleased fragment-control gap was fixed; attempt5 had2052clean and32gates before the real held-A draft defect appeared; attempt6 passed early checks before absent-pad reference cleanup. Details and before/after regressions are in the Chinese audit and PARITY section30. The final full coordinator was intentionally stopped after10current functional gates at the user's acceleration request; selected acceptance then completed against the same immutable artifact.

Machine-readable acceptance: [evidence.json](evidence.json). Raw logs, JSON, original screenshots and exact helper sources remain under generated/reports/audit-20261101 and the private archive. The [archive manifest receipt on main](https://github.com/Xi-Gong/boxhead_remake/blob/main/docs/verification/v0.3.7/archive-receipt.json) is committed after publication; private LAN addresses are not published in raw logs.
