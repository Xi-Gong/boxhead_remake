# v0.3.2 implementation and verification

Approved on 2026-10-20. Work stays on `codex/feature-v0.3.1-gameplay-art`; each independent fix/feature is checked, committed and immediately pushed before the next completed item.

## Approved work

1. Fix P2 draft input, with keyboard, pad mapping and entry-held input regression coverage.
2. Negotiated unlimited drafts: no automatic choice; both participants explicitly ready before advancing.
3. Original light-grey/red UI, independent stats panels (P1 Tab / P2 R / gamepad Y), configurable keys, card previews and explicit ready actions.
4. Diminishing capacity/speed growth, finite special-weapon ammunition, per-weapon rate ceilings, 15% rocket self damage, shotgun damage/falloff; broader offense/defense/utility choices.
5. 40% of v0.3.1 zombie objectives/concurrency, authored entrances only, full-map reachability, map/path-dependent ordinary 75–105s and Boss +30s. Both may end by survival; no passive kill rewards.
6. Fast/flanking and bloated/melee zombies; random player-skin pistol/UZI/shotgun zombie; armored butcher and ranged hunter devils with Boss forms. Existing enemy HP increases and consumable devil/Boss armor.
7. Old saves finish their current combat under old rules and migrate at the next wave, preserving earned progress and clamping excess vitals/ammo without free refills. All new simulation fields persist through save/checkpoint/rollback and negotiated compatibility.
8. Actual input-driven single-instance play of early progression, later Nightmare, Bosses, local Coop and drafting. Fix unreasonable behavior, replay it and record evidence; do not describe state-injected fixtures as normal play.

## Authorization and release boundary

The user's 2026-10-20 instruction supersedes the initial lightweight-only boundary: run the complete streamlined release gates, fix failures, then publish v0.3.2 and its portable EXE. Coverage is recorded in [release-gates.md](release-gates.md). Games remain serial, hidden and low-resolution except the one isolated functional LAN pair. No performance/stress matrix, foreground windows or subagents are authorized. Earlier evidence retains its actual limited scope.

## Completed items

### Entirely new visible enemy meshes (latest user requirement)

Final fresh ordinary/Boss demon check passed in `generated/reports/v032/demons-1792509661824`; directly reviewed details, in-world warnings and full hunter-Boss action sheet. This verifies final meshes and unchanged telegraphs/64×7 bars with pixels and geometry. No previous derived-model screenshot is used as final appearance evidence.

The user explicitly rejected repetitive reuse of the original zombie model. EnemyMesh now rebuilds every visible head/torso/arm/hand/boot face with new beveled/prismatic silhouettes and materials; source rigs, XSI metadata and functional foot/muzzle anchors remain. Runner respirator/back tanks, asymmetric bloated brute, masked armored butcher/blade, antlered hunter and four player-cue gunner identities have distinct meshes. Earlier derived-art assertions remain in explicit legacy oracles.

Four targeted suites passed all 22 tests, including >10,000 rebuilt-part checks, source metadata and every gun anchor. The first anchor test compared Alternate1 player feet against the base rig; it now follows the same authored remap. Production review exposed reverse face painting hiding equipment and gaps around retained joints; both were repaired before final build `main-CpivMMMS.js`. Original 117 mechanical ports remain unchanged.

Final production runner/brute art and warning passed in `generated/reports/v032/combat-roster-1792509542948`, directly reviewed. All four fresh gunner skins × three guns × 16 directions passed in `generated/reports/v032/gunner-1792509601788`, directly reviewed. Prior derived-model images are historical evidence and no longer represent the final appearance.

### Butcher/hunter devils and Boss forms

Wave-12/18 replacements add armored melee butchers and fan-firing hunters, one ordinary active each, 2600/2100 base HP, 30% armor, 14/12 XP. Wave-15/20 Boss forms join the four-family rotation and existing 1–3-member encounters. Locked 1s cleaves and .9s fans recover after firing; each Boss follow-up gets a fresh .7s warning, with rotated cleaves/interleaved fan gaps. Boss armor remains 40%; new Boss kill XP 70, party kill rewards remain once and doubled only after all Bosses die.

Six related suites passed 52 tests; final persistence/art affected four suites passed 42, including no modern fields on old-capability resume. First failures were fixture enumeration, missing affect setup/shot position; assertions retained. Production `demons-1792508409524` failed pixels because the prepared scene did not update camera tracking; corrected fixture `generated/reports/v032/demons-1792508530048` passed all four forms/actions/16 directions, 64×7 Boss bar geometry, armor and warning pixels. Directly reviewed details, full butcher actions and warnings. Review also moved the blade from an undrawn hand node to its animated forearm. All typechecks/build passed; 117 mechanical ports unchanged. These are prepared art/behavior checks, not normal combat acceptance.

### Player-skin gunner zombies

Wave-8 replacement uses four seeded injured player skins and pistol/UZI/shotgun views, no extra subtype RNG. A locked .6s warning precedes one shot/three-shot burst/three-pellet fan and recovery. New .22-cell/tick bullets sweep at <=.08-cell steps, hit players only, stop at walls and can be dodged. Skin/gun/pending aim persist; in-flight bullet rollback roundtrips exactly. Four suites passed 38 tests; typechecks/build `main-C34_1AJU.js` passed and 117 ports remain unchanged.

Production single-instance art/aim/projectile check passed `generated/reports/v032/gunner-1792507918163`; four skins × three guns × 16 directions and aim-lines images directly reviewed. This fixture is not an ordinary progression or physical multiplayer acceptance claim.

### Runner and heavy melee zombies

Wave 3/6 ordinal replacements add flanking runners and telegraphed heavy brutes, at most two active of each. No extra subtype RNG, quotas unchanged. Brute .8s warning locks a 2.2-cell cone, followed by 1.2s recovery; escape and walls prevent damage. New save identities/skill state and rollback are covered. Derived loading-time art preserves all source feet, XSI metadata and return frames; classic collections remain.

Four targeted suites passed 34 tests; all typechecks/build passed (`main-9S_PNEEg.js`), 117 ports unchanged. Production single-instance contact sheets cover all actions and 16 directions; geometry/pixel checks passed in `generated/reports/v032/combat-roster-1792507566256`. Directly reviewed details, full brute action sheet and in-world warning. Prepared visual scenes are not ordinary combat play evidence.

### Tougher enemies and consumable armor

Prepared production scene `generated/reports/v032/combat-enemies-1792507233344` passed current Boss 12000 HP / 4800 armor, devil 2000 / 600, cyan pixels and real pause/unpause. `armor.png` directly reviewed; this is visual/behavior fixture evidence, not normal combat balance or a live LAN test. The 117 mechanical port files remain unchanged.

Ordinary/charger HP ×2.5, devil/priest/Boss ×2; ordinary movement ×1.2, devil ×1.12, variants ×1.1. Devil armor 30% HP, Boss 40%, no regeneration. Ordinary armored devils now save current armor alongside variants. Small cyan armor strips read confirmed LAN metadata; original Boss HP bars remain. Real kills award 2/4/10/12 XP for ordinary/charger/devil/priest and 50 for Boss, with reference growth using conservative family XP and no assumed Boss kill.

First targeted run retained four failures of implicit old HP/XP assumptions; exact assertions remain in explicit classic fixtures. It passed 73 others, final affected four-suite set passed all 36. Modern tests cover actual fatal attribution after armor, ordinary/priest save depletion, deterministic replay and Boss HP/armor. Typechecks/build passed (`main-DiuD5wS0.js`).

### Population, authored entrances and map deadlines

Production real menu click/move/fire passed in `generated/reports/v032/combat-pacing-1792506966835`; menu and combat screenshots directly reviewed. Initial first-map objective 60 and cap 4, 2000 ticks, zero ground warnings. This short functional play does not establish final enemy balance, which remains pending.

Modern zombie objectives/caps are floored 40% of the original v0.3.1 values, including LOW's 40-enemy limit (now at most 16); Nightmare HIGH tops at 22. Full-map BFS selects reachable original entrances, cycles similarly close exits, waits when blocked/too near and never falls back to ground. Nine-second arrival periods alternate with three-second recovery gaps; Boss ordinary adds cap at one with 3s checks. Distant cell movement accelerates toward the active area, smoothly returning to combat speed near the player.

The 18 primary-start path/area profiles produce 80/85/90/90/85/95/85/90/95/105/95/100/100/95/105/105/105/105 seconds, Boss +30. Profile metrics and entrance cursor persist; reference growth uses reduced objectives and bounded sums. Seven related suites passed 71 tests, encounter set 33 and post-fix affected set 13; classic deadline/fallback assertions remain explicit. First profile test exposed early caching of empty geometry; production browser then exposed the constructor's pre-marker initial deadline. Refresh now runs at loading completion before resume/growth. Failed browser evidence remains; no pass was inferred from headless-only results. Final typechecks/build `main-41p_ietm.js` passed.

### Consecutive draft taps

Current production browser keyboard/pad mapping and both-player ready flow passed in `generated/reports/v032/draft-input-1792506455083`; `p2-choice.png` directly reviewed. Real two-peer transport remains pending.

Reproduced two P2 down taps each shorter than a tick: the second remained on card 1 instead of card 2. New ready rounds encode physical navigation edges as reserved 104/105 commands, so adjacent taps survive sampling and rollback without requiring an empty tick. Held directions do not repeat unexpectedly; ordinary gameplay and old draft packets retain their interpretation. Four suites passed 24 tests, including both LAN-client keyboard sets and held-input coverage; final input suite passed again after extending client coverage. Typechecks/build passed (`main-CA9iVdWU.js`).

### Broader builds and recovery choices

Modern drafts offer one offense, defense and utility choice, with ten total rewards and useful capacity/cadence/healing filters. Movement, cadence, armor penetration and supply efficacy diminish; starting-wave builds distribute eight permanent stats in bounded work. Permanent modern supplies restore 40% plus efficacy, draft recovery 35%; legacy transient crates and classic saves retain full-refill behavior. Armor penetration is captured by each emission and saved on placed explosives.

Final related six suites passed 44 tests; enchantment, armor, supply-ammo and weapon checks also passed during this feature. Existing exact full-refill assertions remain in explicit classic fixtures. All typechecks/build passed (`main-CQIlV71F.js`). Single-instance real card clicks, Tab/R, actual derived values and save/continue passed in `generated/reports/v032/build-choices-1792506039103`; both cards and independent sheets directly reviewed at 640×480. The prepared cards test input and behavior, not ordinary progression. No live two-peer LAN or hardware pad claim.

### Hidden gamepad draft click

`tests/sim/waveDraftInput.test.ts` first reproduced two virtual mouse events from held-A gameplay across draft entry, where no mouse events were expected. The virtual cursor now only operates outside an active unpaused world. Fire/confirm still uses each player's normal key slots. A client-role test covers both keyboard sets and swapped pad assignment without moving P1's choice.

Four targeted suites: 27 passing tests. Production build (all three TypeScript configurations) passed, renderer `main-D9jhRN5d.js`. First patch verification also exposed an incorrect main-state field and missing optional package guard; both were repaired before the passing checks. Browser attempts blocked by sandbox network access/timeouts are environment failures, not product passes. Real TCP peers and physical controllers have not been tested.

The narrow fix closes a verified accidental-confirmation path; it does not establish that every reported keyboard-navigation failure has the same cause. The unlimited-draft/explicit-ready work also removes the current 12-second lockout/default behavior.

Browser verification passed against the current production build: `generated/reports/v032/draft-input-1792502785409/report.json`. Real W/S and injected pad up/down navigated P2, held-A release did not mark ready, each player confirmed independently. Screenshot `p2-choice.png` directly reviewed at 640×480. This is local Coop UI plus a separate simulated LAN-client input test, not a live two-peer transport claim.

### Unlimited ready drafts

Optional `draft-ready-v1` requires the old timed/draft capabilities. Local new runs wait indefinitely; old LAN peers keep their original semantics. Saves preserve ready flags/offers, rollback awards once, unsupported worlds reject the new pending round before mutation. An old pending round converts without changing offers or already-ready players.

Six targeted suites passed 115 tests, then the added old-round migration test passed in the four-test readiness suite (116 distinct covered tests). Final build/typechecks passed: `main-CUTuAiny.js`. `generated/reports/v032/draft-input-1792503055472/report.json` records a real-input 14-second wait after P2 readiness, then P1 confirmation advancing. `ready-wait.png` directly reviewed. No live two-peer run.

### Draft cards and independent stat sheets

Light original-style cards now show benefit previews and separate mouse selection from explicit ready. Local sheets use actual derived stats; LAN sheets use confirmed tick metadata. Tab/R, pad Y, saved rebinding, conflict avoidance, selection retention and release protection are covered. Original CInput's retained listeners required a current-input identity guard; the failing first regression is retained in turn output. Stat capture distinguishes finite sentinel-sized magazines from authored infinite ammunition.

Related six suites cover 28 passing tests (final stats suite 5). All typechecks/build passed, renderer `main-DCu7_ZgT.js`. Real keyboard/mouse, injected pad mapping, pause/save/continue, two-player independence and geometry at 640×480 / 960×540 / 480×720 passed in `generated/reports/v032/draft-stats-1792503830015/report.json`; cards, P1 stats and portrait sheets directly reviewed. Initial failed browser run `draft-stats-1792503664664` exposed quoted key labels; review also corrected shadow layering before the final build. This fixture forces a wave end for UI coverage; it is not the requested ordinary combat play session, which remains pending until combat changes are implemented.

### Weapon/capacity tuning and deferred migration

Optional `combat-pve-v2` is negotiated only with all modern dependencies. Finite capacity combines training/levels/draft additions before 2x/(2+x) diminishing returns; authored pistol infinity remains. Actual weapon periods cap late fire cadence, shotgun pellets are 65% with distance falloff, and snapshot-owned rocket ancestry reduces direct self-blast damage to 15% before shield absorption. Supplies/death crates cannot retain obsolete capacities in an active modern world. Old saves preserve this wave and migrate next wave without losing progress or refilling.

Seven final targeted suites passed 142 tests. The first old tiered/inherited-capacity assertions failed because their rules were implicit; those exact assertions remain under `classicCombat`, with modern bounded/actual-fire/migration cases separate. All typechecks and final build passed (`main-PYg_cxxA.js`). Single-instance real move/fire keys in a prepared level-10 scene passed in `generated/reports/v032/combat-weapons-1792504849878/report.json`; the weapon stat image was directly reviewed. Final draft/stats/save/pad/viewport checks and pause screenshot passed in `draft-stats-1792504916898`. No claim of ordinary combat play or complete game balance follows from these fixture tests.

### Actual-play arrival correction

Input-only early runs exposed a slow obscured approach. Family minimum speeds .06/.075/.08 and a distance-scaled obscured approach now retain stored speed and return to family combat pace with clear sight. The new wall/clear regression and enemy suite passed all 8 tests. Production build/typechecks passed (`main-y8bFhTHP.js`).

`pacing/cover-fire-actual-active-w1-r2-1792510111042` completed the natural 90-second deadline: 11 real kills, level 8, 129.824/228 HP, 15 emitted enemies. The 60-second image was directly reviewed. Only real inputs were sent; controller 7 permits opportunistic infinite-pistol fire. Earlier controller runs and the narrow-map defeat are retained. Differing inputs are not performance comparisons. Nightmare/Boss/Coop acceptance follows separately.

### Input-only Nightmare Boss and local Coop

`pacing/nightmare-boss-actual-active-w20-r2-1792510354788` ran the natural 120-second Nightmare wave 20: two Bosses entered, hunter fans and armor were visible; survival ended the wave without Boss kill rewards (remaining combined HP 33707/42000). Its 90-second image was directly reviewed; this was survival acceptance, not evidence of killing Bosses.

`pacing/coop-actual-active-w8-r2-1792510514902` reached the natural 90-second draft with P1 fallen and P2 at 264.91 HP. The final two-player cards were directly reviewed. Both players received actual keyboard inputs, no combat state injection. The initial report outcome incorrectly classified P1 death as party defeat; raw result.phase is draft and P2 lives. The controller classification is now corrected, with original raw evidence retained. This is scripted real-time input play, not a claim of physical gamepad testing.
