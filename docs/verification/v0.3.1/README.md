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
| Boss overhead current/maximum health, large numbers and camera/confirmed-state tracking | [Boss health](boss-health.json) |

Per-stage test sets overlap; their counts must not be added as a unique-test total. All three TypeScript configurations and production builds passed at the recorded stages. Mechanical AS2 ports and original assets remain unchanged. The latest targeted behavior/art batch has 62 tests in five files; it is not the complete Vitest suite.

Browser checks were short, serial, one headless Chrome game at 640×480, with real mouse/keyboard input. Gun and enemy art were checked at 1× and 2×. Direct screenshot review, pixel regions, geometry and frame/anchor assertions were used; zai was not used. Action WebMs were recorded and contact sheets reviewed directly. The enemy comparison tool uses the current Vite source server to import the retained classic fixture; other recorded checks use production builds.

The actual **0.3.1 portable candidate passed** its short single-instance 640×480 check: startup, save/continue, 31 decoded sounds with running audio, real movement/fire, a normal-wave draft, preserved wave-two timer/bonus, a five-minute medium-map Boss encounter and one doubled reward. The EXE's extracted asar matches the staged archive and every current runtime file; source XSI/library assets also match. See [candidate identity and acceptance](candidate.json). Production-browser first-cast visibility and portable draft/Boss screenshots were reviewed directly. The separate candidate staging directory avoids replacing older unpacked artifacts.

Initial failures and subsequent corrections are retained under `generated/reports/v031/` and described in each evidence manifest. The art scene's explicit stationary placement did not substitute for a behavior test: the discovered invisible first cast received a separate failing regression, fix and production-browser check.

The candidate EXE and 271 evidence files (screenshots, motion clips, logs, manifests and reproduction scripts) are archived outside the checkout at `C:/Users/royxg/boxhead-exe-archive/v0.3.1-candidate-f6ace3e`. Every archived entry was checked against its source SHA256; browser profile caches are excluded. The archive captures source commit `f6ace3e`, before this receipt/index addition. See [archive receipt and checksums](archive.json). All owned game/GPU processes and preview services were stopped after acceptance.

## Pending full gates

Fresh authorization is still required for the full Vitest, browser UI/audio, existing browser and packaged playtests, live two-peer LAN, Electron and complete portable gates. Long-duration behavior in lightweight tests used controlled simulation clocks, not multi-minute unattended sessions. No multi-instance benchmark, extreme stress, foreground-window test or performance claim is included.

Only after the complete authorized gate passes will the final build be repackaged, the annotated `v0.3.1` tag pushed, and a formal GitHub Release published with its verified portable EXE. [English release-note draft](RELEASE_NOTES.md).
