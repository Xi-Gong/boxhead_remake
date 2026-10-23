# v0.3.6 verification

All **32 serial functional gates passed** against the same packaged artifact. The user authorized short hidden two-process LAN/recovery checks at 30/60/100ms, with isolated saves and ports. Performance benchmarks and extreme stress were excluded.

## Artifact identity

The artifact was built at f842b55 (runtime changes through 3e7ca65), after a complete production build and all three typechecks. Package, lockfile, extracted asar and Windows PE versions are 0.3.6. All 70 packaged build files match the current build byte for byte; renderer: `main-CRfh27bI.js`.

- Portable EXE: **101681426 bytes**
- EXE SHA256: `2aabaec4b78b52c17758b8a8377f6fefdcb20f6a46c78071aef7c20316ecd8c2`
- Entire asar SHA256: `f6d13ab862cb46c020cc909349f778d99f4558d63ddb2d380171aa88f61bf267`
- Static audit: 643 modules; all 117 mechanical AS2 ports unchanged.

Later acceptance-script and documentation commits do not change packaged code. The broad input fingerprint includes tools; its original and final values are recorded separately in [evidence.json](evidence.json). Earlier candidates, including [b7da358](superseded-candidate.json), are superseded and supply no acceptance evidence for this artifact.

## Functional coverage

- Four real-menu opening cases: normal base pistol emissions kill an ordinary first-wave zombie in two hits on every difficulty. The room-1 single-player objectives are 9/11/14/18, with concurrency 2; other maps use their actual deadlines. Prepared positions and disabled further random spawns isolate the hit check without changing health, damage, cooldown or collision.
- Six percentage UI and six early-clear UI cases, single/co-op at 640×480, 960×540 and 480×720: real cards, READY, independent stat controls, exact capped previews and visible geometry/pixels. Dodge caps at 50%.
- Ten exact-wave menu cases: all four difficulties in single/co-op, wide co-op wave 7 and portrait Nightmare wave 1. Real typing, invalid input, arrow wrapping, map selection, save and continue were checked.
- UI **188/188**, audio **54/54**, held fire, injected controller layouts, draft inspection, bindings, empty-weapon feedback, percentage/enchantment cards and four Boss bars. Audio includes nonzero output and recovery checks, beyond decoding 31 samples.
- Twelve controlled Boss cases: four difficulties × waves 5/15/25, ordinary armor pickup, fireball shield break/overflow and short real-key combat. These are not win-rate estimates.
- Browser, unpackaged Electron and packaged Single/Coop/DeathMatch playtests; historical v012/v019/v020/v023/v024, typing, lobby, retry and transport entry points.
- Independent packaged TCP/UDP peers at injected 30/60/100ms one-way delay, compared at common confirmed ticks with full gameplay digests and ordered sound/decal identities. The extended 30ms case covers exact Nightmare wave 1, all Boss members, partial defeat, history recovery, independent stats, one-ready waiting, doubled rewards, client retry and early-clear percentage cards.
- Native hidden window, resizing and fullscreen shortcuts; Electron and packaged smoke; a real v0.2.5 save continued and resaved without duplicate migration; actual portable launcher startup, save/continue and extracted-asar identity.

All game checks ran serially, hidden or headless, with isolated saves. After the user requested silence, the owned coordinator/game tree was stopped; subsequent launches use the verified startup-time mute switch, retaining internal WebAudio signals without speaker output. System volume and player settings were untouched. LAN QA used its owned 48630/48631–48640 ports. Two-process localhost checks do not claim physical-network coverage. Injected pads verify mappings, not hardware.

## Vitest provenance and retained failures

**1921 passed, 0 unresolved failures, 75 conditional/excluded, 1996 total** after merging by file, full name and duplicate occurrence. This is a full invocation plus scoped corrections, **not one clean invocation**. Raw reports are retained:

| Run | Passed | Failed | Conditional/excluded |
|---|---:|---:|---:|
| Full revised run | 1905 | 9 | 75 |
| First scoped fixture correction | 40 | 2 | 0 |
| Final scoped correction | 42 | 0 | 0 |

The 75 consist of 71 existing optional/source conditions and four expressly excluded extreme mixed-explosion cases. No skips were added to hide failures. The independent-process suite passed 32 functional scenarios; its four excluded stress scenarios are already part of these counts, not extra passes.

Six old opening tests expected combat at 60 seconds although the new sparse objective had already been cleared. Original assertions remain in explicit legacy fixtures; modern cases require actual emitted/killed goals, early outcome and double reward. An old all-map budget assertion now has explicit old/new cases and all-member arrival checks. Two high-wave bot failures were wall-bound strafe trajectories: an opt-in bot detour preserves historical default inputs and the unchanged kill assertions. The first global detour attempt changed two old trajectories; the final opt-in 42-case rerun passed. Game HP, collision and RNG were not changed by that correction.

The first real-pistol UI probe assumed the default map was room 1; it now selects that map through real arrows. The v019 selector gate initially expected the earlier level-61 reference and three Bosses: room 9 now yields 1804 reference XP/level 57 and four Bosses. Explicit old 61/85-level and three-member branches remain; the corrected selector and natural-death/retry gates passed. A Boss gate interrupted by desktop turn cancellation and a desktop-play gate stopped for the user's silence request are recorded as interrupted and rerun. The mute harness itself was verified after correcting quoted Windows-command interception; its initial diagnostic attempts are retained. Forced follow-ups preserve every attempt and only the latest result can satisfy a gate. Legacy floating-point arithmetic was separately corrected before building this artifact; superseded binaries were not reused.

The full portable chain exposed test-fixture interactions: a name-spacing scene left A→UZI bound, and the final Boss photograph left the simulation frozen. Helpers now restore incoming bindings, pad sampling and simulation processing; the empty-binding probe explicitly establishes its initial state. After processing resumed, the long input test reached a terminal world: its intended original infinite-life switch had been set after initialization, where it cannot change the player's affect mask. It now runs before initializing the input-test player and asserts the original line-of-sight-only mask (128). The fifth complete portable attempt passed keyboard/Nintendo/Xbox sustained fire, release and last-UZI-round fallback at the exact eight-tick pistol cadence. The four earlier failures and subreports remain archived. No damage assertion or normal-life balance case was removed, and no packaged runtime change was needed.

## Screenshot and publication records

Eight production README scenes, normal packaged LAN growth, and Nightmare options/wave-one images were refreshed from this build. Review combines direct screenshot inspection with geometry, pixels and real input; zai and physical hardware were not used. Prepared normal-value scenes illustrate features, not natural win rates.

Machine-readable results and all attempts: [evidence.json](evidence.json). Local raw evidence is under `generated/reports/v036/`, including the complete gate report and screenshots. Published as [v0.3.6](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.3.6). The [publication receipt](publication.json) records matching remote digests and a successful independent-download portable smoke. The local raw-evidence archive has a separate [manifest receipt](archive.json). Existing v0.3.5 history is preserved.
