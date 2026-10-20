# v0.3.1 candidate verification

Development is on `codex/feature-v0.3.1-gameplay-art`, with each independent commit pushed to its matching remote branch. **This is candidate evidence, not a completed formal-release gate.** The latest stable release remains v0.2.9; the changes below also include work previously published in v0.3.0-rc1/rc2.

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

## Pending full gates

Fresh authorization is still required for the proposed release gate: full Vitest, current browser UI/audio coverage, live two-peer LAN correctness, Electron/native and portable artifact checks. Long-duration behavior in lightweight tests used controlled simulation clocks, not multi-minute unattended sessions. No multi-instance benchmark, extreme stress, foreground-window test or performance claim is included.

The user has requested a shorter release process. The proposed [streamlined gate](release-gates.md) merges duplicate build/startup/scenario work and replaces the blanket historical-script matrix with explicit current risk coverage. It retains full Vitest, UI/audio, actual LAN correctness and native/portable artifact checks; execution still awaits authorization. Omitted historical scripts will be recorded as not executed.

Only after the complete authorized gate passes will the final build be repackaged, the annotated `v0.3.1` tag pushed, and a formal GitHub Release published with its verified portable EXE. [English release-note draft](RELEASE_NOTES.md).
