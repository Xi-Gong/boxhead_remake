# v0.3.1 release verification

Development is on `codex/feature-v0.3.1-gameplay-art`, with each independent commit pushed to its matching remote branch. **The authorized streamlined full release gate passed.** v0.3.1 includes the changes since stable v0.2.9, including work previously published in v0.3.0-rc1/rc2. The stage-specific candidate history below is retained; the final [release gate manifest](release.json) identifies the shipping bytes and current results.

## Authorized lightweight checks

| Area | Evidence |
|---|---|
| Map durations, continuous arrivals, cleanup and old-save migration | [Timed waves](timed-waves.json) |
| Per-player drafts, held-fire guard, cumulative bonuses and confirmation | [Wave drafts](wave-draft.json) |
| Every-fifth-wave Bosses, skills, save/rollback and doubled rewards | [Boss waves](boss-waves.json) |
| Map-duration reference growth and bounded high-wave calculation | [Timed growth](timed-growth.json) |
| Five guns, four skins, original muzzle/hand anchors and frame sequences | [Weapon art](weapon-art.json) |
| Ordinary/enchanted tracers, rockets, muzzle effects and unchanged simulation | [Projectile art](projectile-art.json) |
| Four enemy/Boss models, all directions/actions, classic fixtures and LOW warnings | [Enemy art](enemy-art.json) |
| First-cast visibility before movement; failed reproduction then fix | [Timed arrival](timed-arrival.json) |
| Earlier numeric Boss health candidate (superseded by compact bars) | [Historical Boss health](boss-health.json) |
| Progressive 1–3 Bosses, per-member compact bars, DEVIL counts and WAVE clock | [Current Boss encounters](boss-encounters.json) |

Per-stage test sets overlap; their counts must not be added as a unique-test total. All three TypeScript configurations and production builds passed at the recorded stages. Mechanical AS2 ports and original assets remain unchanged. The latest targeted Boss/variant/save/negotiation batch has 124 tests in six files; it is not the complete Vitest suite.

Browser checks were short, serial, one headless Chrome game at 640×480, with real mouse/keyboard input. Gun and enemy art were checked at 1× and 2×. Direct screenshot review, pixel regions, geometry and frame/anchor assertions were used; zai was not used. Action WebMs were recorded and contact sheets reviewed directly. The enemy comparison tool uses the current Vite source server to import the retained classic fixture; other recorded checks use production builds.

The actual **0.3.1 portable candidate passed** its short single-instance 640×480 check: startup, save/continue, 31 decoded sounds with running audio, real movement/fire, a normal-wave draft, preserved wave-two timer/bonus, a five-minute medium-map Boss encounter and one doubled reward. The EXE's extracted asar matches the staged archive and every current runtime file; source XSI/library assets also match. See [candidate identity and acceptance](candidate.json). Production-browser first-cast visibility and portable draft/Boss screenshots were reviewed directly. The separate candidate staging directory avoids replacing older unpacked artifacts.

The historical candidate from `4307226` used a numeric overhead HP plate. It is superseded by the compact numeric-free bars, progressive encounters and integrated WAVE clock from `069d865`, renderer `main-L0mwFj92.js`. [candidate.json](candidate.json) identifies the current EXE and hashes. Earlier candidates and evidence remain preserved.

Initial failures and subsequent corrections are retained under `generated/reports/v031/` and described in each evidence manifest. The art scene's explicit stationary placement did not substitute for a behavior test: the discovered invisible first cast received a separate failing regression, fix and production-browser check.

The candidate EXE and 271 evidence files (screenshots, motion clips, logs, manifests and reproduction scripts) are archived outside the checkout at `C:/Users/royxg/boxhead-exe-archive/v0.3.1-candidate-f6ace3e`. Every archived entry was checked against its source SHA256; browser profile caches are excluded. The archive captures source commit `f6ace3e`, before this receipt/index addition. See [archive receipt and checksums](archive.json). All owned game/GPU processes and preview services were stopped after acceptance.

The refreshed Boss-health candidate and accumulated evidence have a separate [archive receipt](archive-boss-health.json) under `C:/Users/royxg/boxhead-exe-archive/v0.3.1-candidate-4307226`.

The current candidate from `069d865` passed the short actual-portable scenario again: compact bar, DEVIL `1`, WAVE clock `5:00`, ordinary draft, continued timer/bonus and one doubled Boss reward. Its entire extracted asar and current runtime files match the inspected build. Three-Boss layout/counts were checked in the production browser; source tests cover real roster spawning, partial defeats, saves and rollback. See [current archive receipt](archive-encounters.json). These are lightweight results, not live two-peer LAN acceptance.

## Completed full release gate

The user authorized the streamlined gate on 2026-10-20. Complete Vitest passed 1,719 tests in 133 files, with 71 existing conditional skips unchanged. The final build passed all three TypeScript configurations; all 117 mechanical ports remain unchanged. Browser UI passed 188/188 and audio 49/49 checks.

A serial 640×480 packaged pair with 30 ms one-way delay passed confirmed gameplay/sound/decal equality, bounded rollback, multiple Boss bars/DEVIL counts, partial defeat, real TCP history recovery, one doubled reward per player, natural death and client checkpoint retry. V2 partial-Boss save/downgrade checks are covered by the full simulation suite; the live pair verifies history recovery and the next-wave checkpoint. Three initial harness failures are retained: native-family count versus HUD count, wave-start checkpoint time versus a later paused observation, and clicking before the confirmed draft UI rendered. No production change or removed assertion was needed.

Seven packaged native checks passed, including real input, hidden native fullscreen and cross-process persistence. The actual portable EXE independently passed startup, complete asar/current-runtime equality, tiered/clearable rules, save/continue, draft, numeric-free Boss health, doubled reward and 31 decoded/running sounds. Direct screenshots were reviewed alongside pixel/geometry and real-input checks; zai was not used. All owned game processes and test listeners were cleaned up.

The [streamlined gate](release-gates.md) records the coverage and omitted historical scripts. It avoids duplicate builds and version-by-version launch matrices, with no rendered stress/performance benchmark or foreground-window test. All 70 final built runtime files and the 402-input fingerprint match the already packaged candidate, so the verified EXE is reused without repacking identical bytes. See the [final archive receipt](archive-release.json), [English release notes](RELEASE_NOTES.md) and [stable Release](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.3.1).
